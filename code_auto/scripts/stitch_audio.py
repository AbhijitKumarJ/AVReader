#!/usr/bin/env python3
"""
Stitch the per-section audio files into one master track, compute the
millisecond timeline and write driving-data.json for the frontend app.
Finally copies the frontend (index.html/app.js/style.css) into the
assets folder so the whole app can be served from there.

    <audio_dir>/NN_<section>.wav  ->  <out_dir>/master-audio.mp3
                                      <out_dir>/driving-data.json
                                      <out_dir>/index.html (+app.js, style.css)

Sentence timings inside a section are estimated proportionally to the
text length of each sentence (the TTS is generated per section).

Usage (legacy transcript flow, defaults shown):
    python3 stitch_audio.py [--draft final/assets/draft.json]
                            [--audio-dir final/assets/audio]
                            [--visual-map final/assets/visual-map.json]
                            [--out-dir final/assets]
                            [--sentence-pause 250] [--section-pause 600]
                            [--lead-in 500] [--format auto|wav|mp3] [--no-frontend]

The pipeline (pipeline.py) imports stitch() directly with draft-v1 paths.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import wave

from envfile import load_env

load_env()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS = os.path.join(CODE_DIR, 'final', 'assets')
AUDIO_DIR = os.path.join(ASSETS, 'audio')
DRAFT = os.path.join(ASSETS, 'draft.json')
VISUAL_MAP = os.path.join(ASSETS, 'visual-map.json')
DRIVING = os.path.join(ASSETS, 'driving-data.json')
FRONTEND_DIR = os.path.join(SCRIPT_DIR, 'frontend')

FFMPEG = shutil.which('ffmpeg')


def section_id(section, index):
    return section.get('sectionId') or section.get('id') or f'section-{index + 1}'


def weight(text):
    return max(len(' '.join(str(text).split())), 1)


def silence(frames_per_ms, ms):
    return b'\x00' * int(round(frames_per_ms * ms))


def find_section_audio(index, sid, audio_dir=AUDIO_DIR):
    """audio/00_section-1-the-dream.wav for section-1-the-dream."""
    if not os.path.isdir(audio_dir):
        return None
    exact = f'{index:02d}_{sid}'
    for name in sorted(os.listdir(audio_dir)):
        if os.path.splitext(name)[0] == exact:
            return os.path.join(audio_dir, name)
    for name in sorted(os.listdir(audio_dir)):
        stem = os.path.splitext(name)[0]
        if stem.endswith('_' + sid) or stem == sid:
            return os.path.join(audio_dir, name)
    return None


def read_audio(path, params):
    """Return (frames, params). params: (rate, channels, sampwidth)."""
    if path.lower().endswith('.wav'):
        with wave.open(path, 'rb') as w:
            got = (w.getframerate(), w.getnchannels(), w.getsampwidth())
            frames = w.readframes(w.getnframes())
    elif FFMPEG:
        rate, channels, sampwidth = params
        out = subprocess.run(
            [FFMPEG, '-nostdin', '-v', 'error', '-i', path, '-f', 's16le',
             '-acodec', 'pcm_s16le', '-ac', str(channels), '-ar', str(rate), '-'],
            capture_output=True, check=True)
        return out.stdout, params
    else:
        sys.exit(f'Cannot read {os.path.basename(path)} without ffmpeg '
                 f'(install ffmpeg or provide .wav section audio).')

    if got == params:
        return frames, params

    # different format: re-encode to the master format when ffmpeg is around
    if FFMPEG:
        rate, channels, _ = params
        out = subprocess.run(
            [FFMPEG, '-nostdin', '-v', 'error', '-i', path, '-f', 's16le',
             '-acodec', 'pcm_s16le', '-ac', str(channels), '-ar', str(rate), '-'],
            capture_output=True, check=True)
        return out.stdout, params
    sys.exit(f'{os.path.basename(path)} has format {got}, master is {params} '
             f'and ffmpeg is not installed to convert it.')


def probe_first_audio(audio_dir=AUDIO_DIR):
    """Master format = format of the first section audio file."""
    if not os.path.isdir(audio_dir):
        return (24000, 1, 2)
    for name in sorted(os.listdir(audio_dir)):
        path = os.path.join(audio_dir, name)
        if name.lower().endswith('.wav'):
            try:
                with wave.open(path, 'rb') as w:
                    return (w.getframerate(), w.getnchannels(), w.getsampwidth())
            except wave.Error:
                continue
        if FFMPEG:
            return (24000, 1, 2)
    return (24000, 1, 2)


def split_frames(frames, weights, frame_size):
    """Split byte frames proportionally to weights (sample accurate)."""
    total = len(frames) // frame_size
    total_weight = sum(weights) or 1
    pieces = []
    start = 0
    cumulative = 0
    for w in weights[:-1]:
        cumulative += w
        cut = min(total, max(start, int(round(total * cumulative / total_weight))))
        pieces.append(frames[start * frame_size:cut * frame_size])
        start = cut
    pieces.append(frames[start * frame_size:])
    return pieces


def copy_frontend(frontend_dir=FRONTEND_DIR, out_dir=ASSETS):
    if not os.path.isdir(frontend_dir):
        return []
    copied = []
    for name in sorted(os.listdir(frontend_dir)):
        src = os.path.join(frontend_dir, name)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(out_dir, name))
            copied.append(name)
    return copied


def load_sections(path):
    """Read a draft file: a list (legacy) or an object with 'sections'."""
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get('sections')
    if not isinstance(data, list):
        sys.exit(f'{path}: expected a section list or an object with "sections".')
    return data


def stitch(draft, audio_dir=AUDIO_DIR, visual_map=None, out_dir=ASSETS,
           lead_in_ms=None, sentence_pause_ms=None, section_pause_ms=None,
           fmt='auto', frontend_dir=FRONTEND_DIR, extra_metadata=None,
           allow_missing_audio=True, log=print):
    """Build master audio + driving-data.json from section audio.

    draft:      list of section dicts (legacy shape or draft-v1 sections)
    visual_map: {'sections': {sid: {'visual': {...}}},
                 'scripts':  {scriptId: 'js/foo.js'}}
    Returns the driving dict (also written to out_dir/driving-data.json).
    """
    lead_in_ms = lead_in_ms if lead_in_ms is not None else int(
        os.environ.get('LEAD_IN_MS', 500))
    sentence_pause_ms = sentence_pause_ms if sentence_pause_ms is not None else int(
        os.environ.get('SENTENCE_PAUSE_MS', 250))
    section_pause_ms = section_pause_ms if section_pause_ms is not None else int(
        os.environ.get('SECTION_PAUSE_MS', 600))
    visual_map = visual_map or {}
    map_sections = visual_map.get('sections', {})
    map_scripts = visual_map.get('scripts', {})
    os.makedirs(out_dir, exist_ok=True)

    params = probe_first_audio(audio_dir)
    rate, channels, sampwidth = params
    frame_size = channels * sampwidth
    frames_per_ms = rate * frame_size / 1000.0

    want_mp3 = fmt == 'mp3' or (fmt == 'auto' and FFMPEG)
    if want_mp3 and not FFMPEG:
        log('  ! ffmpeg not found - falling back to WAV master audio')
        want_mp3 = False

    cursor = 0  # ms
    master = [silence(frames_per_ms, lead_in_ms)]
    cursor += lead_in_ms

    sections_out = []
    missing_audio = 0

    for index, section in enumerate(draft, start=1):
        sid = section_id(section, index)
        sentences = section.get('transcript', [])
        audio_path = find_section_audio(index, sid, audio_dir)

        if audio_path:
            frames, _ = read_audio(audio_path, params)
        else:
            missing_audio += 1
            if not allow_missing_audio:
                raise FileNotFoundError(
                    f'{sid}: no section audio in {audio_dir} '
                    f'(expected {index:02d}_{sid}.wav)')
            words = sum(len(str(s).split()) for s in sentences)
            estimate_ms = max(1500, words * 400)
            frames = silence(frames_per_ms, estimate_ms)
            log(f'  ! {sid}: no audio file, using {estimate_ms} ms of silence')

        weights = [weight(s) for s in sentences] or [1]
        pieces = split_frames(frames, weights, frame_size)

        section_start = cursor
        transcript_out = []
        for pos, sentence in enumerate(sentences):
            duration_ms = len(pieces[pos]) / frame_size / rate * 1000.0
            start_ms = cursor
            cursor += duration_ms
            master.append(pieces[pos])
            transcript_out.append({
                'id': f't{index}_{pos + 1}',
                'text': sentence,
                'startMs': round(start_ms),
                'endMs': round(cursor),
            })
            if pos != len(sentences) - 1:
                master.append(silence(frames_per_ms, sentence_pause_ms))
                cursor += sentence_pause_ms

        section_out = {
            'id': sid,
            'type': section.get('type', 'static'),
            'startMs': round(section_start),
            'endMs': round(cursor),
            'transcript': transcript_out,
        }
        if audio_path:
            section_out['audioUrl'] = 'audio/' + os.path.basename(audio_path)
        script_id = section.get('scriptId') \
            or (section.get('script') or {}).get('scriptId')
        if section.get('type') == 'dynamic' and script_id:
            section_out['scriptId'] = script_id
            script_url = map_scripts.get(script_id)
            if script_url:
                section_out['scriptUrl'] = script_url
        elif sid in map_sections and map_sections[sid].get('visual'):
            section_out['visual'] = map_sections[sid]['visual']

        sections_out.append(section_out)

        if index != len(draft):
            master.append(silence(frames_per_ms, section_pause_ms))
            cursor += section_pause_ms

    frames = b''.join(master)

    wav_path = os.path.join(out_dir, 'master-audio.wav')
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(sampwidth)
        w.setframerate(rate)
        w.writeframes(frames)

    audio_url = 'master-audio.wav'
    if want_mp3:
        mp3_path = os.path.join(out_dir, 'master-audio.mp3')
        subprocess.run([FFMPEG, '-nostdin', '-v', 'error', '-y', '-i', wav_path,
                        '-codec:a', 'libmp3lame', '-q:a', '2', mp3_path],
                       check=True)
        os.remove(wav_path)
        audio_url = 'master-audio.mp3'

    total_duration = cursor / 1000.0
    metadata = {
        'audioUrl': audio_url,
        'totalDuration': round(total_duration, 3),
        'leadInMs': lead_in_ms,
        'sentencePauseMs': sentence_pause_ms,
        'sectionPauseMs': section_pause_ms,
        'generatedAt': datetime.datetime.now(datetime.timezone.utc)
                               .isoformat(timespec='seconds'),
    }
    if extra_metadata:
        metadata.update(extra_metadata)
    driving = {'metadata': metadata, 'sections': sections_out}
    with open(os.path.join(out_dir, 'driving-data.json'), 'w',
              encoding='utf-8') as f:
        json.dump(driving, f, indent=2, ensure_ascii=False)

    copied = []
    if frontend_dir:
        copied = copy_frontend(frontend_dir, out_dir)

    log(f'Master audio: {audio_url} ({total_duration:.1f}s, '
        f'{len(sections_out)} sections)')
    log(f'Timeline:     {os.path.join(out_dir, "driving-data.json")}')
    if missing_audio:
        log(f'  ! {missing_audio} section(s) had no audio - ran generate_audio?')
    if copied:
        log(f'Frontend:     {", ".join(copied)}')
    return driving


def main():
    parser = argparse.ArgumentParser(description='Stitch section audio -> master + driving JSON')
    parser.add_argument('--draft', default=DRAFT, help='draft JSON (list or draft-v1 object)')
    parser.add_argument('--audio-dir', default=AUDIO_DIR, help='folder with NN_<section>.wav files')
    parser.add_argument('--visual-map', default=VISUAL_MAP, help='legacy visual-map.json')
    parser.add_argument('--out-dir', default=ASSETS, help='where master audio + driving-data.json go')
    parser.add_argument('--sentence-pause', type=int,
                        default=int(os.environ.get('SENTENCE_PAUSE_MS', 250)), metavar='MS')
    parser.add_argument('--section-pause', type=int,
                        default=int(os.environ.get('SECTION_PAUSE_MS', 600)), metavar='MS')
    parser.add_argument('--lead-in', type=int,
                        default=int(os.environ.get('LEAD_IN_MS', 500)), metavar='MS')
    parser.add_argument('--format', choices=['auto', 'wav', 'mp3'], default='auto')
    parser.add_argument('--no-frontend', action='store_true',
                        help='skip copying the frontend into the assets folder')
    args = parser.parse_args()

    if not os.path.exists(args.draft):
        sys.exit(f'{args.draft} not found - run extract_turn_onefile.py first.')
    draft = load_sections(args.draft)

    visual_map = {}
    if os.path.exists(args.visual_map):
        with open(args.visual_map, encoding='utf-8') as f:
            visual_map = json.load(f)

    try:
        stitch(draft,
               audio_dir=args.audio_dir,
               visual_map=visual_map,
               out_dir=args.out_dir,
               lead_in_ms=args.lead_in,
               sentence_pause_ms=args.sentence_pause,
               section_pause_ms=args.section_pause,
               fmt=args.format,
               frontend_dir=None if args.no_frontend else FRONTEND_DIR)
    except FileNotFoundError as e:
        sys.exit(str(e))

    print(f'Serve with:   python3 -m http.server -d "{args.out_dir}" 8000')


if __name__ == '__main__':
    main()
