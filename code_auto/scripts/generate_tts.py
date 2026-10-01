#!/usr/bin/env python3
"""
Convert every section of draft.json into its own audio file using the
Google Gemini TTS model (default: gemini-3.8-flash-lite-tts).

    draft.json  ->  final/assets/audio/00_section-1-the-dream.wav ...

Requirements:
    put GEMINI_API_KEY=... into code/.env   (or export GEMINI_API_KEY=...)
    optional in code/.env: AUDIO_MODEL, AUDIO_VOICE, AUDIO_STYLE

Usage:
    python3 generate_tts.py [--dry-run] [--force] [--voice Kore]
                            [--model gemini-3.8-flash-lite-tts]
                            [--style "Say in a calm narrator voice"]
                            [--sections 1,3]
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import wave

import urllib.error
import urllib.request

from envfile import load_env

load_env()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS = os.path.join(CODE_DIR, 'final', 'assets')
AUDIO_DIR = os.path.join(ASSETS, 'audio')
DRAFT = os.path.join(ASSETS, 'draft.json')

API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
DEFAULT_MODEL = 'gemini-3.8-flash-lite-tts'
DEFAULT_VOICE = 'Kore'
LABEL_RE = re.compile(r'^\s*(?:request|response|question|answer|q|a)\s*:\s*', re.I)


def section_id(section, index):
    return section.get('sectionId') or section.get('id') or f'section-{index + 1}'


def section_text(section):
    """Flatten the transcript and drop spoken-aloud labels like 'Response:'."""
    parts = []
    for sentence in section.get('transcript', []):
        text = ' '.join(str(sentence).split())
        text = LABEL_RE.sub('', text)
        if text:
            parts.append(text)
    return ' '.join(parts)


def api_key():
    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not key:
        sys.exit('Missing API key: set GEMINI_API_KEY=... in code/.env '
                 '(or export GEMINI_API_KEY=...)')
    return key


def synthesize(text, model, voice, key, style=None):
    """Call the Gemini TTS API, return (pcm_bytes, sample_rate)."""
    prompt = f'{style.rstrip(":")}: {text}' if style else text
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {
                'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}},
            },
        },
    }
    request = urllib.request.Request(
        API_URL.format(model=model),
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
        },
        method='POST',
    )

    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = json.loads(response.read().decode('utf-8'))
            return parse_audio(body)
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:500]
            last_error = f'HTTP {e.code}: {detail}'
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** (attempt + 1))
                continue
            break
        except (urllib.error.URLError, TimeoutError) as e:
            last_error = str(e)
            time.sleep(2 ** (attempt + 1))
    sys.exit(f'TTS request failed: {last_error}')


def parse_audio(body):
    """Response -> (pcm bytes, rate)."""
    try:
        part = body['candidates'][0]['content']['parts'][0]
        inline = part.get('inlineData') or part.get('inline_data')
        data = inline['data']
        mime = inline.get('mimeType') or inline.get('mime_type') or ''
    except (KeyError, IndexError, TypeError):
        sys.exit(f'Unexpected TTS response: {json.dumps(body)[:500]}')
    rate = 24000
    match = re.search(r'rate=(\d+)', mime)
    if match:
        rate = int(match.group(1))
    return base64.b64decode(data), rate


def write_wav(path, pcm, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def main():
    parser = argparse.ArgumentParser(description='Section text -> audio via Gemini TTS')
    parser.add_argument('--model',
                        default=os.environ.get('AUDIO_MODEL')
                        or os.environ.get('TTS_MODEL') or DEFAULT_MODEL)
    parser.add_argument('--voice',
                        default=os.environ.get('AUDIO_VOICE')
                        or os.environ.get('TTS_VOICE') or DEFAULT_VOICE)
    parser.add_argument('--style',
                        default=os.environ.get('AUDIO_STYLE')
                        or os.environ.get('TTS_STYLE') or None,
                        help='speaking style prefix, e.g. "Say in a calm narrator voice"')
    parser.add_argument('--sections', default=None,
                        help='comma separated 1-based section numbers to (re)generate')
    parser.add_argument('--pause', type=float, default=0.5,
                        help='seconds to wait between API calls')
    parser.add_argument('--force', action='store_true', help='regenerate existing files')
    parser.add_argument('--dry-run', action='store_true',
                        help='show what would be generated, no API calls')
    args = parser.parse_args()

    print(f'TTS: model={args.model}  voice={args.voice}'
          + (f'  style="{args.style}"' if args.style else ''))

    if not os.path.exists(DRAFT):
        sys.exit(f'{DRAFT} not found - run extract_turn_onefile.py first.')

    with open(DRAFT, encoding='utf-8') as f:
        draft = json.load(f)

    wanted = None
    if args.sections:
        wanted = {int(n.strip()) for n in args.sections.split(',') if n.strip()}

    os.makedirs(AUDIO_DIR, exist_ok=True)
    key = None if args.dry_run else api_key()

    generated = skipped = 0
    for index, section in enumerate(draft, start=1):
        if wanted and index not in wanted:
            continue
        sid = section_id(section, index)
        text = section_text(section)
        path = os.path.join(AUDIO_DIR, f'{index:02d}_{sid}.wav')

        if not text:
            print(f'  {index:02d} {sid}: empty transcript, skipped')
            continue
        if os.path.exists(path) and not args.force:
            skipped += 1
            print(f'  {index:02d} {sid}: exists ({os.path.getsize(path)} bytes)')
            continue
        if args.dry_run:
            print(f'  {index:02d} {sid}: would synthesize {len(text)} chars -> '
                  f'{os.path.basename(path)}')
            print(f'       "{text[:90]}..."')
            continue

        pcm, rate = synthesize(text, args.model, args.voice, key, args.style)
        write_wav(path, pcm, rate)
        generated += 1
        print(f'  {index:02d} {sid}: {os.path.basename(path)} '
              f'({len(pcm) // (rate * 2):.1f}s, {rate} Hz)')
        if args.pause:
            time.sleep(args.pause)

    print(f'Section audio in {AUDIO_DIR}: {generated} generated, {skipped} reused')
    if not args.dry_run:
        print('Next: python3 stitch_audio.py')


if __name__ == '__main__':
    main()
