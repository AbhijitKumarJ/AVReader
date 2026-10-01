#!/usr/bin/env python3
"""Domain core for the automated pipeline.

Everything the CLI wrappers and the chat app do lives here:

    folders + paths            prepare_folders, paths()
    draft                      load_draft, save_draft, validate_draft, create_draft
    gap detection              check_assets
    asset generation           ensure_images, ensure_audio, ensure_js, ingest_js
    assembly                   assemble          (timeline via stitch_audio.stitch)
    archive                    archive
    chat state                 load_state, save_state, state_summary

Paths are the state machine:

    input/blog.txt
    draft/draft.json           structure only - no timestamps, no assets needed
    draft/assets/{image,js,audio}
    final/assets/              assembled app (master audio, driving-data, frontend)
    out/<n>/                   archives
"""

import datetime
import json
import os
import re
import shutil
import sys
import time
import wave

from envfile import load_env

load_env()

import llm
import stitch_audio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_DIR = os.path.join(CODE_DIR, 'input')
DRAFT_DIR = os.path.join(CODE_DIR, 'draft')
DRAFT_FILE = os.path.join(DRAFT_DIR, 'draft.json')
STATE_FILE = os.path.join(DRAFT_DIR, 'chat_state.json')
HISTORY_FILE = os.path.join(DRAFT_DIR, 'chat_history.json')
JS_SOURCE_FILE = os.path.join(DRAFT_DIR, 'js_source.md')
ASSET_DIRS = {
    'image': os.path.join(DRAFT_DIR, 'assets', 'image'),
    'js': os.path.join(DRAFT_DIR, 'assets', 'js'),
    'audio': os.path.join(DRAFT_DIR, 'assets', 'audio'),
}
FINAL_DIR = os.path.join(CODE_DIR, 'final')
FINAL_ASSETS = os.path.join(FINAL_DIR, 'assets')
DEFAULT_OUT_DIR = os.path.join(CODE_DIR, 'out')
FRONTEND_DIR = os.path.join(SCRIPT_DIR, 'frontend')
SYS_PROMPT_FILE = os.path.join(SCRIPT_DIR, 'sys_prompt.md')

ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
JS_ID_RE = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')
AUDIO_FILE_RE = re.compile(r'^\d{2}_[a-z0-9-]+\.wav$')
FORBIDDEN_TIME_KEYS = {'startms', 'endms', 'durationms', 'duration', 'start', 'end'}
BLOG_NAME = 'blog.txt'


class PipelineError(RuntimeError):
    """User-facing pipeline failure with an actionable message."""


# ------------------------------------------------------------------ folders

def prepare_folders():
    for folder in (INPUT_DIR, DRAFT_DIR, FINAL_DIR, *ASSET_DIRS.values()):
        os.makedirs(folder, exist_ok=True)


def find_blog():
    """input/blog.txt, else the single (largest) text file in input/."""
    preferred = os.path.join(INPUT_DIR, BLOG_NAME)
    if os.path.isfile(preferred):
        return preferred
    if not os.path.isdir(INPUT_DIR):
        return None
    candidates = [os.path.join(INPUT_DIR, n) for n in os.listdir(INPUT_DIR)
                  if os.path.isfile(os.path.join(INPUT_DIR, n))
                  and n.lower().endswith(('.txt', '.md'))
                  and not n.startswith('.')]
    if not candidates:
        return None
    return max(candidates, key=os.path.getsize)


def read_blog(text=None):
    if text:
        return text, 'inline'
    blog = find_blog()
    if not blog:
        raise PipelineError('No blog found: put your text in input/blog.txt '
                            'or paste it in the chat.')
    with open(blog, encoding='utf-8') as f:
        content = f.read()
    if not content.strip():
        raise PipelineError(f'{blog} is empty.')
    return content, os.path.relpath(blog, CODE_DIR)


# -------------------------------------------------------------------- draft

def _basename_ok(name):
    return (isinstance(name, str) and name and '/' not in name
            and '\\' not in name and '..' not in name)


def validate_draft(draft):
    """Return (errors, warnings) for a draft-v1 object."""
    errors, warnings = [], []
    if not isinstance(draft, dict):
        return (['draft must be a JSON object like '
                 '{"schema": "draft-v1", "sections": [...]}'], [])
    if draft.get('schema') != 'draft-v1':
        errors.append(f'metadata schema must be "draft-v1", got '
                      f'{draft.get("schema")!r}')
    if not isinstance(draft.get('metadata'), dict):
        errors.append('missing "metadata" object')
    sections = draft.get('sections')
    if not isinstance(sections, list) or not sections:
        errors.append('"sections" must be a non-empty array')
        return errors, warnings

    seen_ids = set()
    seen_scripts = set()
    for index, section in enumerate(sections, start=1):
        tag = f'section {index}'
        if not isinstance(section, dict):
            errors.append(f'{tag}: must be an object')
            continue
        sid = section.get('id')
        if not isinstance(sid, str) or not ID_RE.match(sid):
            errors.append(f'{tag}: "id" must match ^[a-z0-9][a-z0-9-]*$ '
                          f'(got {sid!r})')
        else:
            tag = f'section {index} ({sid})'
            if sid in seen_ids:
                errors.append(f'{tag}: duplicate id')
            seen_ids.add(sid)

        stype = section.get('type')
        if stype not in ('static', 'dynamic'):
            errors.append(f'{tag}: "type" must be "static" or "dynamic"')

        transcript = section.get('transcript')
        if not isinstance(transcript, list) or not transcript:
            errors.append(f'{tag}: "transcript" must be a non-empty array')
        elif not all(isinstance(s, str) and s.strip() for s in transcript):
            errors.append(f'{tag}: transcript entries must be non-empty strings')

        # timestamps are forbidden in a draft
        def walk(node, path):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key.lower() in FORBIDDEN_TIME_KEYS:
                        errors.append(f'{tag}: timestamp "{key}" at {path} is '
                                      f'forbidden in draft.json')
                    walk(value, f'{path}.{key}')
            elif isinstance(node, list):
                for i, value in enumerate(node):
                    walk(value, f'{path}[{i}]')
        walk(section, f'sections[{index - 1}]')

        if stype == 'static':
            visual = section.get('visual')
            if not isinstance(visual, dict):
                errors.append(f'{tag}: static section needs "visual" '
                              f'{{"type": "image", "file": ..., "prompt": ...}}')
            else:
                if visual.get('type') != 'image':
                    errors.append(f'{tag}: visual.type must be "image"')
                if not _basename_ok(visual.get('file')):
                    errors.append(f'{tag}: visual.file must be a plain file name '
                                  f'(got {visual.get("file")!r})')
                prompt = visual.get('prompt')
                if not isinstance(prompt, str) or not prompt.strip():
                    errors.append(f'{tag}: visual.prompt must be a non-empty '
                                  f'string')
                elif len(prompt.strip()) < 20:
                    warnings.append(f'{tag}: visual.prompt is very short '
                                    f'({len(prompt.strip())} chars)')

        if stype == 'dynamic':
            script = section.get('script')
            if not isinstance(script, dict):
                errors.append(f'{tag}: dynamic section needs "script" '
                              f'{{"scriptId": ..., "file": ..., "spec": ...}}')
            else:
                script_id = script.get('scriptId')
                if not isinstance(script_id, str) or not JS_ID_RE.match(script_id):
                    errors.append(f'{tag}: script.scriptId must be a valid JS '
                                  f'identifier (got {script_id!r})')
                elif script_id in seen_scripts:
                    errors.append(f'{tag}: duplicate scriptId {script_id!r}')
                else:
                    seen_scripts.add(script_id)
                if not _basename_ok(script.get('file')):
                    errors.append(f'{tag}: script.file must be a plain file name '
                                  f'(got {script.get("file")!r})')
                elif not script.get('file', '').endswith('.js'):
                    warnings.append(f'{tag}: script.file should end with .js')
                if not isinstance(script.get('spec'), str) or not script['spec'].strip():
                    errors.append(f'{tag}: script.spec must describe the animation')
                code = script.get('code')
                if code is not None and not isinstance(code, str):
                    errors.append(f'{tag}: script.code must be a string when present')

        audio = section.get('audio')
        if not isinstance(audio, dict):
            errors.append(f'{tag}: every section needs "audio" '
                          f'{{"file": "NN_<id>.wav", "text": ...}}')
        else:
            if not _basename_ok(audio.get('file')):
                errors.append(f'{tag}: audio.file must be a plain file name '
                              f'(got {audio.get("file")!r})')
            elif not AUDIO_FILE_RE.match(audio['file']):
                warnings.append(f'{tag}: audio.file {audio["file"]!r} does not '
                                f'follow NN_<section-id>.wav')
            if not isinstance(audio.get('text'), str) or not audio['text'].strip():
                errors.append(f'{tag}: audio.text must be the sentence(s) to speak')

    return errors, warnings


def normalize_draft(draft):
    """Fill derivable defaults (file names, metadata) in place, return draft."""
    if isinstance(draft, list):                      # tolerate legacy list
        draft = {'metadata': {'schema': 'draft-v1'}, 'sections': draft}
    metadata = draft.setdefault('metadata', {})
    metadata.setdefault('schema', 'draft-v1')
    metadata.setdefault('title', 'Interactive Reader')
    metadata['createdAt'] = metadata.get(
        'createdAt',
        datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
    metadata.setdefault('models', {
        'llm': llm.model_for('llm'),
        'image': llm.model_for('image'),
        'audio': llm.model_for('audio'),
        'voice': os.environ.get('AUDIO_VOICE') or llm.DEFAULTS['voice'],
    })
    for index, section in enumerate(draft.get('sections') or [], start=1):
        if not isinstance(section, dict):
            continue
        section.setdefault('id', f'section-{index}')
        section.setdefault('type', 'static')
        sid = section['id']
        transcript = section.get('transcript') or []
        if section.get('type') == 'static':
            visual = section.setdefault('visual', {'type': 'image'})
            visual.setdefault('type', 'image')
            visual.setdefault('file', f'{sid}.jpg')
        else:
            script = section.setdefault('script', {})
            script.setdefault('scriptId',
                              ''.join(part.capitalize() for part in sid.split('-')))
            script.setdefault('file', script['scriptId'] + '.js')
            script.setdefault('spec', '')
        audio = section.setdefault('audio', {})
        audio.setdefault('file', f'{index:02d}_{sid}.wav')
        audio.setdefault('text', ' '.join(str(s) for s in transcript))
    return draft


def load_draft(required=True, soft=False):
    """Load + validate draft/draft.json.

    required: raise when the file is missing.
    soft:     return None for any problem (used by the chat state endpoint).
    """
    if not os.path.isfile(DRAFT_FILE):
        if required and not soft:
            raise PipelineError(f'{DRAFT_FILE} not found - create a draft first '
                                f'(create_draft.py or the chat).')
        return None
    try:
        with open(DRAFT_FILE, encoding='utf-8') as f:
            draft = json.load(f)
    except ValueError as e:
        if soft:
            return None
        raise PipelineError(f'{DRAFT_FILE} is not valid JSON: {e}')
    errors, _ = validate_draft(draft)
    if errors:
        if soft:
            return None
        raise PipelineError('draft.json is invalid:\n  - ' + '\n  - '.join(errors))
    return draft


def save_draft(draft):
    draft = normalize_draft(draft)
    errors, _ = validate_draft(draft)
    if errors:
        raise PipelineError('refusing to save an invalid draft:\n  - '
                            + '\n  - '.join(errors))
    prepare_folders()
    with open(DRAFT_FILE, 'w', encoding='utf-8') as f:
        json.dump(draft, f, indent=2, ensure_ascii=False)
    return draft


# ------------------------------------------------------------ draft via LLM

def sys_prompt():
    if not os.path.isfile(SYS_PROMPT_FILE):
        raise PipelineError(f'{SYS_PROMPT_FILE} not found.')
    with open(SYS_PROMPT_FILE, encoding='utf-8') as f:
        return f.read()


def create_draft(text=None, source=None, log=print, model=None):
    """Blog text -> validated draft/draft.json. Returns (draft, warnings)."""
    content, detected = read_blog(text)
    source = source or detected
    log(f'Analyzing {source} with {model or llm.model_for("llm")} ...')

    prompt = (
        'Create the interactive audio-visual reader draft for the article '
        'below. Reply with ONLY the draft-v1 JSON object in one ```json '
        'fenced block - no commentary.\n\n<article>\n'
        f'{content}\n</article>')
    errors = None
    for attempt in (1, 2):
        raw = llm.generate_text(prompt, system=sys_prompt(), model=model)
        try:
            draft = llm.extract_json(raw)
        except llm.LLMError as e:
            if attempt == 2:
                raise PipelineError(f'the model did not return JSON: {e}')
            log(f'  ! no JSON in reply, retrying once ...')
            continue
        draft = normalize_draft(draft)
        errors, warnings = validate_draft(draft)
        if not errors:
            draft['metadata']['source'] = source
            save_draft(draft)
            log(f'Draft saved: {DRAFT_FILE} '
                f'({len(draft["sections"])} sections)')
            for warning in warnings:
                log(f'  ~ {warning}')
            return draft, warnings
        log(f'  ! draft failed validation (attempt {attempt}):')
        for error in errors:
            log(f'    - {error}')
        prompt = (
            'Your previous draft failed validation:\n- '
            + '\n- '.join(errors)
            + '\nFix these problems and reply with ONLY the corrected '
              'draft-v1 JSON object in one ```json fenced block.\n\n<article>\n'
            + content + '\n</article>')
    raise PipelineError('draft validation failed after retry:\n  - '
                        + '\n  - '.join(errors))


# ------------------------------------------------------------- gap detection

def _expected_assets(section, index=None):
    """{kind: {'file':..., 'path':..., 'present': bool}} for one section."""
    out = {}
    if section.get('type') == 'static':
        file = section.get('visual', {}).get('file')
        path = os.path.join(ASSET_DIRS['image'], file) if file else None
        out['image'] = {'file': file, 'path': path,
                        'present': bool(path and os.path.isfile(path))}
    else:
        file = section.get('script', {}).get('file')
        path = os.path.join(ASSET_DIRS['js'], file) if file else None
        out['js'] = {'file': file, 'path': path,
                     'present': bool(path and os.path.isfile(path))}
    file = section.get('audio', {}).get('file')
    path = os.path.join(ASSET_DIRS['audio'], file) if file else None
    out['audio'] = {'file': file, 'path': path,
                    'present': bool(path and os.path.isfile(path))}
    return out


def check_assets(draft=None):
    """Gap report: what the draft expects vs what exists on disk."""
    if draft is None:
        draft = load_draft(required=False, soft=True)
    draft_errors = []
    if draft is None and os.path.isfile(DRAFT_FILE):
        try:
            with open(DRAFT_FILE, encoding='utf-8') as f:
                broken = json.load(f)
            draft_errors = validate_draft(broken)[0] or ['invalid draft']
        except ValueError as e:
            draft_errors = [f'not valid JSON: {e}']
    report = {
        'draft': {'exists': os.path.isfile(DRAFT_FILE),
                  'valid': draft is not None,
                  'errors': draft_errors,
                  'path': DRAFT_FILE,
                  'sections': len(draft.get('sections', [])) if draft else 0,
                  'title': (draft.get('metadata') or {}).get('title')
                           if draft else None},
        'sections': [],
        'totals': {},
        'missing': {'image': [], 'js': [], 'audio': []},
        'have': {'image': 0, 'js': 0, 'audio': 0},
        'need': {'image': 0, 'js': 0, 'audio': 0},
    }
    if not draft:
        return report
    for index, section in enumerate(draft['sections'], start=1):
        assets = _expected_assets(section, index)
        entry = {'index': index, 'id': section.get('id'),
                 'type': section.get('type'), 'assets': {}}
        for kind, info in assets.items():
            entry['assets'][kind] = info
            report['need'][kind] += 1
            if info['present']:
                report['have'][kind] += 1
            else:
                report['missing'][kind].append(section.get('id'))
        report['sections'].append(entry)
    report['totals'] = {kind: f"{report['have'][kind]}/{report['need'][kind]}"
                        for kind in ('image', 'js', 'audio')}
    return report


def missing_count(report=None):
    report = report or check_assets()
    return sum(len(v) for v in report['missing'].values())


# ------------------------------------------------------------ asset generation

def _section_label(index, section):
    return f'{index:02d} {section.get("id")}'


def ensure_images(draft=None, force=False, log=print, pause=None):
    """Generate missing static-section images into draft/assets/image/."""
    draft = draft or load_draft()
    pause = float(os.environ.get('GENERATE_PAUSE_S', 1.0)
                  if pause is None else pause)
    os.makedirs(ASSET_DIRS['image'], exist_ok=True)
    generated = skipped = failed = 0
    for index, section in enumerate(draft['sections'], start=1):
        if section.get('type') != 'static':
            continue
        file = section['visual']['file']
        path = os.path.join(ASSET_DIRS['image'], file)
        label = _section_label(index, section)
        if os.path.isfile(path) and not force:
            skipped += 1
            log(f'  {label}: image exists ({os.path.getsize(path)} bytes)')
            continue
        prompt = section['visual']['prompt']
        log(f'  {label}: generating {file} ...')
        try:
            data, mime = llm.generate_image(prompt)
        except llm.LLMError as e:
            failed += 1
            log(f'  {label}: FAILED - {e}')
            continue
        with open(path, 'wb') as f:
            f.write(data)
        generated += 1
        log(f'  {label}: {file} ({len(data)} bytes'
            f'{", " + mime if mime else ""})')
        if pause:
            time.sleep(pause)
    log(f'Images: {generated} generated, {skipped} reused, {failed} failed')
    return {'generated': generated, 'skipped': skipped, 'failed': failed}


def _write_wav(path, pcm, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def ensure_audio(draft=None, force=False, log=print, pause=None):
    """Generate missing per-section narration into draft/assets/audio/."""
    draft = draft or load_draft()
    pause = float(os.environ.get('GENERATE_PAUSE_S', 0.5)
                  if pause is None else pause)
    os.makedirs(ASSET_DIRS['audio'], exist_ok=True)
    generated = skipped = failed = 0
    for index, section in enumerate(draft['sections'], start=1):
        file = section['audio']['file']
        path = os.path.join(ASSET_DIRS['audio'], file)
        label = _section_label(index, section)
        if os.path.isfile(path) and not force:
            skipped += 1
            log(f'  {label}: audio exists ({os.path.getsize(path)} bytes)')
            continue
        text = section['audio']['text']
        if not text.strip():
            failed += 1
            log(f'  {label}: empty audio.text')
            continue
        log(f'  {label}: synthesizing {file} ({len(text)} chars) ...')
        try:
            pcm, rate = llm.tts(text)
        except llm.LLMError as e:
            failed += 1
            log(f'  {label}: FAILED - {e}')
            continue
        _write_wav(path, pcm, rate)
        generated += 1
        log(f'  {label}: {file} ({len(pcm) // (rate * 2):.1f}s @ {rate} Hz)')
        if pause:
            time.sleep(pause)
    log(f'Audio: {generated} generated, {skipped} reused, {failed} failed')
    return {'generated': generated, 'skipped': skipped, 'failed': failed}


JS_CONTRACT = """\
Write ONE self-contained JavaScript file implementing a timed visual for an
interactive reader. Requirements:
- Exactly one of: `class <scriptId> { ... }` at top level OR
  `window.DynamicScripts = window.DynamicScripts || {}; window.DynamicScripts["<scriptId>"] = ...`
- Methods: `mount(container)` prepares the DOM inside container (no shadow
  root needed, avoid HTML escaping issues by building nodes),
  `render(localTimeMs)` updates state for the current time within this
  section (0 .. section duration), `unmount(container)` cleans up.
- No external libraries, no network, no external CSS files or images - use
  inline styles; must work on a dark background (#0d1117).
- Idempotent mount/unmount, must not leave timers running after unmount.
- Reply with ONLY the file content inside one ```javascript fenced block."""


def ensure_js(draft=None, force=False, log=print, pause=None):
    """Write script.code files; generate the rest from script.spec."""
    draft = draft or load_draft()
    pause = float(os.environ.get('GENERATE_PAUSE_S', 1.0)
                  if pause is None else pause)
    os.makedirs(ASSET_DIRS['js'], exist_ok=True)
    written = generated = skipped = failed = 0
    for index, section in enumerate(draft['sections'], start=1):
        if section.get('type') != 'dynamic':
            continue
        script = section['script']
        path = os.path.join(ASSET_DIRS['js'], script['file'])
        label = _section_label(index, section)
        if os.path.isfile(path) and not force:
            skipped += 1
            log(f'  {label}: js exists ({os.path.getsize(path)} bytes)')
            continue
        code = script.get('code')
        if isinstance(code, str) and code.strip():
            body = llm.strip_fence(code) if '```' in code else code
            with open(path, 'w', encoding='utf-8') as f:
                f.write(body.rstrip() + '\n')
            written += 1
            log(f'  {label}: {script["file"]} (from draft script.code)')
            continue
        if not script.get('spec', '').strip():
            failed += 1
            log(f'  {label}: empty script.spec')
            continue
        prompt = (
            f'{JS_CONTRACT}\n\nscriptId: {script["scriptId"]}\n'
            f'section: {section.get("id")}\n'
            f'specification:\n{script["spec"]}')
        log(f'  {label}: generating {script["file"]} ...')
        try:
            raw = llm.generate_text(prompt, temperature=0.4)
            blocks = llm.fenced_blocks(raw, langs=('javascript', 'js', ''))
            body = blocks[0][1] if blocks else llm.strip_fence(raw)
        except llm.LLMError as e:
            failed += 1
            log(f'  {label}: FAILED - {e}')
            continue
        if 'mount' not in body or 'render' not in body:
            log(f'  {label}: warning - generated code may be missing '
                f'mount()/render()')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body.rstrip() + '\n')
        generated += 1
        log(f'  {label}: {script["file"]} ({len(body)} chars)')
        if pause:
            time.sleep(pause)
    log(f'JS: {generated} generated, {written} written from draft, '
        f'{skipped} reused, {failed} failed')
    return {'generated': generated, 'written': written,
            'skipped': skipped, 'failed': failed}


def ingest_js(text, draft=None, log=print):
    """Pull fenced JS blocks out of a chat reply into draft/assets/js/.

    A block belongs to a section when the scriptId / section id / file name
    appears in the preceding text or in the code itself; otherwise the
    blocks are matched to missing dynamic sections in order.
    Returns {'saved': [files], 'unmatched': n}.
    """
    draft = draft or load_draft()
    dynamic = [(i, s) for i, s in enumerate(draft['sections'], start=1)
               if s.get('type') == 'dynamic']
    if not dynamic:
        raise PipelineError('the draft has no dynamic sections to ingest JS for.')
    targets = {s['script']['file']: s for _, s in dynamic}
    by_script_id = {s['script']['scriptId']: s for _, s in dynamic}
    by_section_id = {s['id']: s for _, s in dynamic}

    os.makedirs(ASSET_DIRS['js'], exist_ok=True)
    saved, unmatched = [], []
    used = set()
    for lang, body, before in llm.fenced_blocks(text, langs=('javascript', 'js', '')):
        subject = None
        lowered = before.lower()
        for sid, sec in by_section_id.items():
            if sid in lowered or sid in body[:400]:
                subject = sec
                break
        if subject is None:
            for script_id, sec in by_script_id.items():
                if (script_id in before or script_id in body
                        or sec['script']['file'] in before):
                    subject = sec
                    break
        if subject is None and len(targets) == 1:
            subject = next(iter(targets.values()))
        if subject is None:
            unmatched.append(body)
            continue
        file = subject['script']['file']
        if file in used:
            unmatched.append(body)
            continue
        used.add(file)
        path = os.path.join(ASSET_DIRS['js'], file)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body.rstrip() + '\n')
        saved.append(file)
        log(f'  ingested {file} ({len(body)} chars)')
    if unmatched:
        log(f'  {len(unmatched)} JS block(s) could not be matched to a section')
    return {'saved': saved, 'unmatched': len(unmatched)}


# ------------------------------------------------------------------ assembly

def assemble(draft=None, log=print, fmt='auto'):
    """draft + asset folders -> final/ (master audio, timeline, frontend)."""
    draft = draft or load_draft()
    report = check_assets(draft)
    gaps = [f'{kind}: {", ".join(ids)}'
            for kind, ids in report['missing'].items() if ids]
    if gaps:
        raise PipelineError(
            'cannot assemble - assets missing from draft/assets:\n  - '
            + '\n  - '.join(gaps)
            + '\nRun generate_images.py / generate_audio.py / generate_js.py first.')

    # rebuild final/ from scratch
    if os.path.isdir(FINAL_ASSETS):
        shutil.rmtree(FINAL_ASSETS)
    os.makedirs(FINAL_ASSETS, exist_ok=True)

    # copy only the assets the draft references (defensive against strays)
    copied = {'image': 0, 'js': 0, 'audio': 0}
    for section in draft['sections']:
        for kind, info in _expected_assets(section).items():
            dest = os.path.join(FINAL_ASSETS, kind, info['file'])
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(info['path'], dest)
            copied[kind] += 1
    log(f'Assets: {copied["image"]} images, {copied["js"]} scripts, '
        f'{copied["audio"]} audio files -> {FINAL_ASSETS}')

    visual_map = {'sections': {}, 'scripts': {}}
    for section in draft['sections']:
        sid = section['id']
        if section.get('type') == 'static':
            visual_map['sections'][sid] = {
                'visual': {'type': 'image',
                           'url': 'image/' + section['visual']['file']}}
        else:
            visual_map['scripts'][section['script']['scriptId']] = \
                'js/' + section['script']['file']

    metadata = {'title': draft['metadata'].get('title')}
    try:
        driving = stitch_audio.stitch(
            draft['sections'],
            audio_dir=os.path.join(FINAL_ASSETS, 'audio'),
            visual_map=visual_map,
            out_dir=FINAL_ASSETS,
            fmt=fmt,
            frontend_dir=FRONTEND_DIR,
            extra_metadata=metadata,
            allow_missing_audio=False,
            log=log)
    except FileNotFoundError as e:
        raise PipelineError(str(e))

    violations = check_timeline(driving)
    if violations:
        raise PipelineError('timeline invariants failed:\n  - '
                            + '\n  - '.join(violations))
    log(f'Timeline OK: {len(driving["sections"])} sections, '
        f'{driving["metadata"]["totalDuration"]}s')
    log(f'Serve with: python3 -m http.server -d "{FINAL_ASSETS}" 8000')
    return driving


def check_timeline(driving):
    """Monotonicity / boundary invariants for driving-data.json."""
    problems = []
    meta = driving.get('metadata', {})
    prev_end = None
    for i, section in enumerate(driving.get('sections', [])):
        if section['endMs'] <= section['startMs']:
            problems.append(f'{section["id"]}: endMs <= startMs')
        prev_sentence_end = None
        for sentence in section.get('transcript', []):
            if sentence['endMs'] <= sentence['startMs']:
                problems.append(f'{section["id"]}/{sentence["id"]}: '
                                f'endMs <= startMs')
            if prev_sentence_end is not None and sentence['startMs'] < prev_sentence_end:
                problems.append(f'{section["id"]}/{sentence["id"]}: '
                                f'start before previous sentence end')
            prev_sentence_end = sentence['endMs']
        if prev_sentence_end is not None and prev_sentence_end > section['endMs'] + 1:
            problems.append(f'{section["id"]}: sentences extend past endMs')
        if prev_end is not None and section['startMs'] < prev_end:
            problems.append(f'{section["id"]}: starts before previous section ends')
        prev_end = section['endMs']
    total_ms = round((meta.get('totalDuration') or 0) * 1000)
    if prev_end is not None and total_ms and abs(prev_end - total_ms) > 1500:
        problems.append(f'last section ends at {prev_end}ms but totalDuration '
                        f'is {total_ms}ms (delta {abs(prev_end - total_ms)}ms)')
    return problems


# ------------------------------------------------------------------- archive

def archive(out_dir=None, clear=True, force=False, log=print):
    """input/ + draft/ + final/ -> out/<n>/, then clear the three folders."""
    inputs = _entries(INPUT_DIR)
    finals = _entries(FINAL_DIR)
    drafts = _entries(DRAFT_DIR)
    if not finals:
        raise PipelineError(f'nothing to archive: {FINAL_DIR} is empty.')
    driving = os.path.join(FINAL_ASSETS, 'driving-data.json')
    if not os.path.exists(driving) and not force:
        raise PipelineError('final/assets/driving-data.json missing - run '
                            'assemble_final.py first (or pass --force).')
    if not inputs and not drafts:
        raise PipelineError('nothing to archive: both input/ and draft/ are '
                            'empty (pass --force to archive final/ only).')

    out_root = os.path.abspath(os.path.expanduser(
        out_dir or os.environ.get('OUT_DIR') or DEFAULT_OUT_DIR))
    os.makedirs(out_root, exist_ok=True)
    used = [int(n) for n in _entries(out_root)
            if n.isdigit() and os.path.isdir(os.path.join(out_root, n))]
    dest = os.path.join(out_root, str(max(used, default=0) + 1))
    os.makedirs(dest)

    for name in inputs:
        shutil.copy2(os.path.join(INPUT_DIR, name), os.path.join(dest, name))
    if drafts:
        shutil.copytree(DRAFT_DIR, os.path.join(dest, 'draft'),
                        dirs_exist_ok=True)
    shutil.copytree(FINAL_DIR, dest, dirs_exist_ok=True)

    if not os.path.isdir(os.path.join(dest, 'assets')):
        shutil.rmtree(dest, ignore_errors=True)
        raise PipelineError('archive copy failed - nothing was cleared.')

    count = len(inputs)
    log(f'Archived to {dest}  ({count} input file(s), draft/, final/)')
    log(f'  serve it with: python3 -m http.server -d '
        f'"{os.path.join(dest, "assets")}" 8000')

    if not clear:
        log(f'Kept input/, draft/ and final/ (--no-clear)')
        return dest
    for folder in (INPUT_DIR, DRAFT_DIR, FINAL_DIR):
        _clear(folder)
    log(f'Cleared input/, draft/, final/ - ready for the next blog')
    return dest


def _entries(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(n for n in os.listdir(folder) if not n.startswith('.'))


def _clear(folder):
    for name in _entries(folder):
        path = os.path.join(folder, name)
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)


# ---------------------------------------------------------------- chat state

def load_state():
    if os.path.isfile(STATE_FILE):
        try:
            with open(STATE_FILE, encoding='utf-8') as f:
                return json.load(f)
        except ValueError:
            pass
    return {'step': 'start',
            'answers': {'draft': None, 'images': None, 'audio': None, 'js': None},
            'blog_pasted': False,
            'assembled': False,
            'archived': False,
            'generated': {}}


def save_state(state):
    os.makedirs(DRAFT_DIR, exist_ok=True)
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    return state


def state_summary():
    """Everything the chat UI / state endpoint needs in one dict."""
    prepare_folders()
    draft = load_draft(required=False, soft=True)
    report = check_assets(draft)
    state = load_state()
    blog = find_blog()
    return {
        'paths': {'input': INPUT_DIR, 'draft': DRAFT_FILE,
                  'final': FINAL_ASSETS, 'out': DEFAULT_OUT_DIR},
        'blog': {'exists': blog is not None, 'path': blog},
        'draft': report['draft'],
        'sections': [{'index': s['index'], 'id': s['id'], 'type': s['type'],
                      'assets': {kind: {'file': info['file'],
                                        'present': info['present']}
                                 for kind, info in s['assets'].items()}}
                     for s in report['sections']],
        'totals': report['totals'],
        'missing': report['missing'],
        'missingCount': missing_count(report),
        'wizard': state,
        'assembled': os.path.isfile(
            os.path.join(FINAL_ASSETS, 'driving-data.json')),
        'models': {'llm': llm.model_for('llm'),
                   'image': llm.model_for('image'),
                   'audio': llm.model_for('audio'),
                   'voice': os.environ.get('AUDIO_VOICE') or llm.DEFAULTS['voice'],
                   'providers': llm.describe_providers()},
        'warnings': validate_draft(draft)[1] if draft else [],
    }


def state_appendix():
    """Short plain-text summary appended to the chat system prompt."""
    summary = state_summary()
    lines = ['[WORKSPACE STATE - informational, do not ignore the four '
             'questions because of it]']
    lines.append(f"draft.json: {'present' if summary['draft']['exists'] else 'MISSING'}"
                 + (f", {summary['draft']['sections']} sections, "
                    f"\"{summary['draft']['title']}\""
                    if summary['draft']['exists'] else ''))
    lines.append('input/blog.txt: '
                 + ('present' if summary['blog']['exists'] else 'missing'))
    if summary['draft']['exists']:
        for kind in ('image', 'js', 'audio'):
            lines.append(f'{kind} assets: {summary["totals"][kind]} present')
        for kind, ids in summary['missing'].items():
            if ids:
                lines.append(f'missing {kind}: {", ".join(ids)}')
    lines.append(f'final/ assembled: {"yes" if summary["assembled"] else "no"}')
    wizard = summary['wizard']['answers']
    lines.append('wizard answers: '
                 + ', '.join(f'{k}={v}' for k, v in wizard.items()))
    lines.append(f'providers: {summary["models"]["providers"]}')
    lines.append(f'models: llm={summary["models"]["llm"]}, '
                 f'image={summary["models"]["image"]}, '
                 f'audio={summary["models"]["audio"]} '
                 f'(voice {summary["models"]["voice"]})')
    return '\n'.join(lines)


ACTIONS = {
    'create_draft': lambda force, log: create_draft(log=log),
    'ensure_images': lambda force, log: ensure_images(force=force, log=log),
    'ensure_audio': lambda force, log: ensure_audio(force=force, log=log),
    'ensure_js': lambda force, log: ensure_js(force=force, log=log),
    'assemble': lambda force, log: assemble(log=log),
    'archive': lambda force, log: archive(log=log),
}


def run_action(action, force=False, log=print):
    """Dispatch a named pipeline action (used by the chat app and CLIs)."""
    if action not in ACTIONS:
        raise PipelineError(f'unknown action: {action}')
    prepare_folders()
    return ACTIONS[action](force, log)


if __name__ == '__main__':
    print(json.dumps(state_summary(), indent=2, ensure_ascii=False))
