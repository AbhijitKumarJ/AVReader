#!/usr/bin/env bash
# Terminal mirror of the chat-app wizard: the same four questions, the same
# gap check, the same verify-or-archive ending - using the CLI scripts.
#
#   ./scripts/run_auto.sh
#
# Prerequisites: input/blog.txt (or an existing draft/draft.json) and an
# API key in code_auto/.env.  Chat alternative: python3 scripts/chat_app.py
set -uo pipefail
cd "$(dirname "$0")"

ask() {
    read -r -p "$1 [y/n] " answer || exit 130
    case "$answer" in
        [Yy]*) return 0 ;;
        *)     return 1 ;;
    esac
}

echo '==> Question 1/4: draft.json'
if ask "Do you already have a draft.json from a previous session?"; then
    python3 check_assets.py; rc=$?
    if [ "$rc" -eq 1 ]; then
        # draft missing or invalid (errors printed above)
        if [ ! -f ../draft/draft.json ]; then
            if ! ask "No draft on disk - create one from input/blog.txt now?"; then
                exit 1
            fi
            python3 create_draft.py || exit 1
        else
            exit 1
        fi
    fi
    # rc=2: draft valid, some assets missing -> the gap check below handles it
else
    if [ ! -f ../input/blog.txt ]; then
        read -r -p "Paste the path to your blog text: " blog_path
        [ -f "$blog_path" ] || { echo "not found: $blog_path"; exit 1; }
        mkdir -p ../input
        cp "$blog_path" ../input/blog.txt
        echo "  saved input/blog.txt"
    fi
    python3 create_draft.py || exit 1
fi

echo
echo '==> Question 2/4: image assets'
if ! ask "Have you already created the image assets?"; then
    python3 generate_images.py || true
fi

echo
echo '==> Question 3/4: audio assets'
if ! ask "Have you already created the audio segment files?"; then
    python3 generate_audio.py || true
fi

echo
echo '==> Question 4/4: JavaScript assets'
if ! ask "Have you already created the JavaScript assets?"; then
    python3 generate_js.py || true
fi

echo
echo '==> Gap check'
python3 check_assets.py; rc=$?
if [ "$rc" -eq 1 ]; then
    echo "No usable draft - cannot continue."
    exit 1
fi
if [ "$rc" -eq 2 ]; then
    echo
    echo "Assets are still missing (see above). Generate them now?"
    if ask "  run the generators for whatever is missing?"; then
        python3 generate_images.py || true
        python3 generate_audio.py || true
        python3 generate_js.py || true
        python3 check_assets.py || exit 1
    else
        echo "Stopped - rerun ./scripts/run_auto.sh when the assets are in place."
        exit 2
    fi
fi

echo
echo '==> Assemble'
if ask "Assemble the reader (master audio + timeline + frontend)?"; then
    python3 assemble_final.py || exit 1
fi

echo
echo "Reader is at ../final/assets - verify it first, e.g.:"
echo "  python3 -m http.server -d ../final/assets 8000"
echo "  (browser: http://127.0.0.1:8000/)"
read -r -p "Press Enter after you have verified the reader... " || exit 130

echo
if ask "Finish and archive input + draft + final to out/<n>?"; then
    python3 archive_output.py || exit 1
else
    echo "Kept input/, draft/ and final/ - rerun this script or use"
    echo "  python3 scripts/chat_app.py  for further instructions."
fi
