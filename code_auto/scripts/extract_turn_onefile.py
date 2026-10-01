#!/usr/bin/env python3
"""
Extract request and response from every turn (without thinking parts)
consolidated as a single markdown file.

Embedded assets (inline images, html/css/js/... code blocks) are written
to code/final/assets, each file named "<turn>_<name>" (e.g.
6_image_0.png, 12_PowerMathAnim.js).  The section draft JSON found in the
transcript is saved as draft.json plus a visual-map.json that maps static
sections to images and dynamic sections to their script files.

Layout (relative to the code/ folder):
    input/                      paste the transcript JSON here
    scripts/                    this script and the rest of the pipeline
    final/<name>_consolidated.md
    final/assets/               extracted assets + generated audio + app

Usage:
    python3 extract_turn_onefile.py                        # reads code/input/*.json
    python3 extract_turn_onefile.py path/to/transcript.json
"""

import base64
import glob
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_DIR = os.path.join(CODE_DIR, 'input')
FINAL_DIR = os.path.join(CODE_DIR, 'final')
ASSETS = os.path.join(FINAL_DIR, 'assets')

LANG_EXT = {
    'html': 'html', 'htm': 'html', 'css': 'css', 'scss': 'scss', 'sass': 'sass',
    'javascript': 'js', 'js': 'js', 'jsx': 'jsx', 'typescript': 'ts', 'ts': 'ts',
    'tsx': 'tsx', 'json': 'json', 'jsonc': 'json', 'python': 'py', 'py': 'py',
    'bash': 'sh', 'sh': 'sh', 'shell': 'sh', 'zsh': 'sh', 'svg': 'svg',
    'xml': 'xml', 'yaml': 'yaml', 'yml': 'yml', 'markdown': 'md', 'md': 'md',
    'text': 'txt', 'txt': 'txt', 'php': 'php', 'rb': 'rb', 'ruby': 'rb',
    'go': 'go', 'rust': 'rs', 'java': 'java', 'c': 'c', 'cpp': 'cpp',
    'sql': 'sql', 'csv': 'csv', 'toml': 'toml', 'ini': 'ini', 'diff': 'diff',
    'wasm': 'wasm', 'wat': 'wat',
}

MIME_EXT = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
    'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
}

IMAGE_EXT_RE = r'[\w.-]+\.(?:png|jpe?g|gif|webp|bmp|svg|ico)'
FENCE_RE = re.compile(r'^[ \t]*```([^\n`]*)\n(.*?)^[ \t]*```[ \t]*$', re.M | re.S)
JSON_FENCE_RE = re.compile(r'^[ \t]*```json[ \t]*\r?\n(.*?)^[ \t]*```[ \t]*$', re.M | re.S)

# files this script writes (and may safely delete on a re-run)
MANAGED_ASSETS = {'draft.json', 'visual-map.json', 'driving-data.json'}
MANAGED_RE = re.compile(r'^\d+_[\w.-]+$')
MASTER_RE = re.compile(r'^master-audio\.(wav|mp3|m4a|ogg)$')


def find_source():
    """The transcript JSON: explicit argument, else the single file in input/."""
    if len(sys.argv) > 1:
        return sys.argv[1]
    os.makedirs(INPUT_DIR, exist_ok=True)
    candidates = sorted(glob.glob(os.path.join(INPUT_DIR, '*.json')))
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        sys.exit(f'No .json found in {INPUT_DIR} - paste your transcript file there '
                 f'(or pass a path as argument).')
    sys.exit(f'Multiple .json files in {INPUT_DIR} - pass one explicitly:\n  '
             + '\n  '.join(candidates))


def chunk_text(c):
    """Return display text for a chunk, handling non-text payloads."""
    if 'text' in c and c['text']:
        return c['text']
    if 'driveDocument' in c:
        return f"[Drive Document: {c['driveDocument'].get('id', 'unknown')}]"
    if 'inlineImage' in c or any('inlineData' in p for p in c.get('parts', [])):
        return '[Inline Image]'
    return '[Unknown chunk]'


def sanitize(name, fallback):
    """Basename + safe characters only."""
    name = os.path.basename(str(name).strip().strip('`"\''))
    name = re.sub(r'[^\w.-]+', '_', name).strip('._')
    return name or fallback


def unique(filename, used):
    """Avoid collisions inside the assets folder."""
    stem, ext = os.path.splitext(filename)
    candidate, n = filename, 2
    while candidate in used:
        candidate = f'{stem}_{n}{ext}'
        n += 1
    used.add(candidate)
    return candidate


def response_text(turn):
    texts = [''.join(p.get('text', '') for p in c.get('parts', []))
             for c in turn['response']]
    return '\n\n'.join(t for t in texts if t)


def turn_text(turn):
    request_text = '\n\n'.join(chunk_text(c) for c in turn['request'])
    return request_text + '\n\n' + response_text(turn)


def collect_inline_images(turn):
    """All base64 payloads attached in this turn, in order."""
    images = []
    for c in turn['request'] + turn['response']:
        found = False
        for p in c.get('parts', []):
            d = p.get('inlineData')
            if isinstance(d, dict) and d.get('data'):
                images.append(d)
                found = True
        if not found:
            d = c.get('inlineImage')
            if isinstance(d, dict) and d.get('data'):
                images.append(d)
    return images


def image_names(text, count):
    """Names suggested by the turn text: [IMAGE: x.png], then any image file name."""
    names = re.findall(r'\[IMAGE:\s*([^\]]+?)\s*\]', text, re.I)
    names += [m for m in re.findall(IMAGE_EXT_RE, text, re.I)
              if m not in names]
    names = [os.path.basename(n) for n in names][:count]
    while len(names) < count:
        names.append(f'image{len(names)}')
    return names


def code_blocks(text):
    """Yield dicts for every fenced block tagged with a usable language."""
    for m in FENCE_RE.finditer(text):
        info = m.group(1).strip()
        lang = info.split()[0].lower() if info else ''
        ext = LANG_EXT.get(lang)
        if ext is None:
            if lang and re.fullmatch(r'[a-z0-9]{1,5}', lang):
                ext = lang
            else:
                continue  # no (or unusable) language tag -> not an asset
        yield {
            'lang': lang,
            'ext': ext,
            'body': m.group(2),
            'info': info,
            'before': text[max(0, m.start() - 400):m.start()],
        }


def code_name(block):
    """Pick a file name declared near the fence, e.g. `PowerMathAnim.js`."""
    info_names = re.findall(r'[\w-]+(?:/[\w.-]+)*\.[A-Za-z0-9]{1,5}', block['info'])
    backticked = re.findall(r'`([\w./-]+\.[A-Za-z0-9]{1,5})`', block['before'])
    bare = re.findall(r'(?<![\w/`])([\w-]+(?:/[\w.-]+)*\.[A-Za-z0-9]{1,5})',
                      block['before'][-200:])

    def matches(names):
        return [n for n in names
                if os.path.splitext(n)[1].lstrip('.').lower() == block['ext']]

    for pool in (backticked, info_names, bare):
        hit = matches(pool)
        if hit:
            return hit[-1]
    return block['lang']


def clean_assets():
    """Remove only what this script generates; audio/ and the app stay."""
    if not os.path.isdir(ASSETS):
        return
    for name in os.listdir(ASSETS):
        path = os.path.join(ASSETS, name)
        if not os.path.isfile(path):
            continue
        if name in MANAGED_ASSETS or MANAGED_RE.match(name) or MASTER_RE.match(name):
            os.remove(path)


def find_draft(turns):
    """The sections draft JSON (list of {sectionId, type, transcript})."""
    for turn in turns:
        text = response_text(turn)
        for m in JSON_FENCE_RE.finditer(text):
            try:
                data = json.loads(m.group(1))
            except ValueError:
                continue
            if (isinstance(data, list) and data
                    and all(isinstance(s, dict) and 'transcript' in s for s in data)):
                return data
    return None


def find_script_file(script_id, js_files):
    """Locate the extracted .js implementing a dynamic section."""
    exact = re.compile(rf'^\d+_{re.escape(script_id)}\.js$', re.I)
    for name in js_files:
        if exact.match(name):
            return name
    for name in js_files:
        stem = re.sub(r'^\d+_', '', name).rsplit('.', 1)[0]
        if stem.lower() == script_id.lower():
            return name
    markers = (f'DynamicScripts["{script_id}"]', f"DynamicScripts['{script_id}']",
               f'class {script_id}', f'window.{script_id}')
    for name in js_files:
        try:
            with open(os.path.join(ASSETS, name), encoding='utf-8', errors='ignore') as f:
                body = f.read()
        except OSError:
            continue
        if any(m in body for m in markers):
            return name
    return None


def build_visual_map(draft, image_files, js_files):
    """Static sections get images (in order), dynamic sections get their script."""
    sections = {}
    static = [s for s in draft if s.get('type') == 'static']
    for sec, img in zip(static, image_files):
        sections[sec.get('sectionId') or sec.get('id')] = {
            'visual': {'type': 'image', 'url': img},
        }

    scripts = {}
    for sec in draft:
        script_id = sec.get('scriptId')
        if sec.get('type') == 'dynamic' and script_id:
            hit = find_script_file(script_id, js_files)
            if hit:
                scripts[script_id] = hit
            else:
                scripts[script_id] = None

    return {'sections': sections, 'scripts': scripts}


SRC = find_source()
with open(SRC) as f:
    data = json.load(f)

chunks = data['chunkedPrompt']['chunks']

# Group chunks into turns: each model (non-thought) response ends a turn.
turns = []
current_req_chunks = []
current_response = []

for c in chunks:
    if c['role'] == 'user':
        if current_response:
            turns.append({
                'request': current_req_chunks,
                'response': current_response,
            })
            current_req_chunks = []
            current_response = []
        current_req_chunks.append(c)
    elif c['role'] == 'model' and c.get('isThought'):
        continue  # skip thinking chunks entirely
    elif c['role'] == 'model':
        current_response.append(c)

if current_req_chunks or current_response:
    turns.append({
        'request': current_req_chunks,
        'response': current_response,
    })

clean_assets()
os.makedirs(ASSETS, exist_ok=True)

lines = [
    '# Consolidated Turns',
    '',
    f'Total turns: {len(turns)}',
    '',
]

used = set()
asset_count = 0
image_files = []
js_files = []

for i, turn in enumerate(turns):
    text = turn_text(turn)

    lines.append(f'---')
    lines.append(f'## Turn {i}')
    lines.append('')
    lines.append(f'### Request')
    lines.append('')
    lines.append('\n\n'.join(chunk_text(c) for c in turn['request']))
    lines.append('')
    lines.append(f'### Response')
    lines.append('')
    lines.append(response_text(turn))
    lines.append('')

    # --- images -------------------------------------------------------
    images = collect_inline_images(turn)
    for payload, name in zip(images, image_names(text, len(images))):
        mime = payload.get('mimeType', '')
        ext = MIME_EXT.get(mime) or os.path.splitext(name)[1].lstrip('.').lower()
        if not ext:
            ext = 'bin'
        name = sanitize(os.path.splitext(name)[0], 'image') + '.' + ext
        filename = unique(f'{i}_{name}', used)
        try:
            raw = base64.b64decode(payload['data'])
        except Exception as e:
            print(f'  ! turn {i}: could not decode image ({e})')
            continue
        with open(os.path.join(ASSETS, filename), 'wb') as f:
            f.write(raw)
        asset_count += 1
        image_files.append(filename)
        print(f'  turn {i}: {filename} ({len(raw)} bytes, {mime})')

    # --- code / markup blocks ----------------------------------------
    for block in code_blocks(text):
        name = sanitize(code_name(block), block['lang'] or 'snippet')
        if os.path.splitext(name)[1].lstrip('.').lower() != block['ext']:
            name = os.path.splitext(name)[0] + '.' + block['ext']
        filename = unique(f'{i}_{name}', used)
        with open(os.path.join(ASSETS, filename), 'w') as f:
            f.write(block['body'])
        asset_count += 1
        if block['ext'] == 'js':
            js_files.append(filename)
        print(f'  turn {i}: {filename} ({len(block["body"])} chars, {block["lang"]})')

os.makedirs(FINAL_DIR, exist_ok=True)
OUT = os.path.join(FINAL_DIR, os.path.splitext(os.path.basename(SRC))[0]
                   + '_consolidated.md')

with open(OUT, 'w') as f:
    f.write('\n'.join(lines) + '\n')

draft = find_draft(turns)
if draft:
    with open(os.path.join(ASSETS, 'draft.json'), 'w') as f:
        json.dump(draft, f, indent=2, ensure_ascii=False)
    visual_map = build_visual_map(draft, image_files, js_files)
    with open(os.path.join(ASSETS, 'visual-map.json'), 'w') as f:
        json.dump(visual_map, f, indent=2, ensure_ascii=False)
    missing = [k for k, v in visual_map['scripts'].items() if not v]
    print(f'  draft.json ({len(draft)} sections), visual-map.json '
          f'({len(visual_map["sections"])} images mapped)'
          + (f', script not found: {", ".join(missing)}' if missing else ''))
else:
    print('  ! no sections draft JSON found in the transcript '
          '(generate_tts.py / stitch_audio.py will not work)')

print(f'Consolidated {len(turns)} turns into {OUT}')
print(f'Extracted {asset_count} assets into {ASSETS}/')
print('Next: python3 generate_tts.py   then   python3 stitch_audio.py')
