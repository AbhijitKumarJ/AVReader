#!/usr/bin/env bash
# Full pipeline: extract -> TTS -> stitch + frontend -> archive + reset.
# Prerequisite: paste the transcript JSON into ../input/ and set
# GEMINI_API_KEY in ../.env (or the environment).
set -euo pipefail
cd "$(dirname "$0")"

echo '==> 1/4 extract turns, assets, draft.json'
python3 extract_turn_onefile.py "$@"

echo
echo '==> 2/4 section audio via Gemini TTS'
if ! python3 generate_tts.py; then
    echo '    TTS step failed - continuing with silence so the app still builds.'
    echo '    Fix the error, then rerun: python3 generate_tts.py && python3 stitch_audio.py'
fi

echo
echo '==> 3/4 stitch master audio + driving-data.json + frontend'
python3 stitch_audio.py

echo
echo '==> 4/4 archive to out/<n> and reset for the next blog'
python3 archive_output.py
