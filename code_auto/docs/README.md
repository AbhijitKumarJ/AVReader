# Interactive Audio-Visual Reader — Automated Pipeline (`code_auto`)

Turn a plain blog post into a synchronized, interactive web reader:
proofread → sectioned draft (`draft.json`) → images + dynamic JS + per-section
TTS audio → stitched master audio with a millisecond timeline
(`driving-data.json`) → a self-contained web app you can serve with any
static file server.

`code_auto` is the API-driven variant of `../code`: every step (analysis,
image generation, audio generation, JS generation) runs against the models
configured in `.env` — Google Gemini, with **OpenRouter as automatic
fallback** (or as the primary provider via `PROVIDER=openrouter`) — either
from the **local chat app** or from the **CLI**.

## Quick start

```bash
cd code_auto
cp .env.sample .env          # once — add GEMINI_API_KEY and/or OPEN_ROUTER_API_KEY
                             # (.env is never edited by scripts)

python3 scripts/chat_app.py  # local chat app  -> http://127.0.0.1:8787
#  or
./scripts/run_auto.sh        # terminal wizard, same steps
```

Put your blog in `input/blog.txt` (or paste it in the chat).

## Folder contract

```
input/blog.txt                    source text
draft/draft.json                  structure-only plan (no timestamps, no assets needed)
draft/chat_state.json             wizard answers + last completed step (resume)
draft/assets/image/               static section images     (visual.file)
draft/assets/js/                  dynamic section scripts   (script.file)
draft/assets/audio/               per-section TTS audio     (audio.file, NN_<sectionId>.wav)
final/assets/                     assembled app: master-audio.mp3, driving-data.json,
                                  image/ js/ audio/ + frontend (index.html, app.js, style.css)
out/<n>/                          archives: input + draft + final, numbered 1, 2, 3 …
```

Folders are the state machine: presence of the files named in `draft.json`
is the single source of truth for "did I already create X?".

## Two modes

**Mode 1 — external chat (AI Studio / any web LLM).**
Copy `scripts/sys_prompt.md` as the system prompt. The chat asks the four
questions (draft? images? audio? JS?) and produces `draft.json` (+ optional
JS code blocks). Dump the outputs into `draft/`, then run
`./scripts/run_auto.sh` (or the chat app) — it detects what exists and only
fills the gaps.

**Mode 2 — local chat app.** `scripts/chat_app.py` asks the same questions,
cross-checks `draft.json` against the three asset folders, shows a
present/missing table, and — after you confirm — generates whatever is
missing with the configured models. It can start the whole flow from a blog
if you have no `draft.json` yet, and at the end asks whether you want to
keep verifying in chat or finish and archive.

## Commands (CLI)

| Command | Purpose |
|---|---|
| `python3 scripts/create_draft.py` | `input/blog.txt` → `draft/draft.json` (LLM_MODEL) |
| `python3 scripts/check_assets.py` | gap report: draft / images / audio / JS |
| `python3 scripts/generate_images.py` | missing images → `draft/assets/image/` (IMAGE_MODEL) |
| `python3 scripts/generate_audio.py` | missing audio → `draft/assets/audio/` (AUDIO_MODEL) |
| `python3 scripts/generate_js.py` | missing JS → `draft/assets/js/` (`--ingest chat.md` to pull chat code blocks) |
| `python3 scripts/assemble_final.py` | draft + assets → `final/` (timeline, master audio, frontend) |
| `python3 scripts/archive_output.py` | `input+draft+final` → `out/<n>`, then clears all three |
| `./scripts/run_auto.sh` | the whole sequence with terminal questions |
| `python3 scripts/chat_app.py` | local web chat + wizard (`CHAT_PORT`, default 8787) |
| `python3 scripts/extract_turn_onefile.py` | legacy entry: AI-Studio transcript JSON → draft (keeps old flow) |

Serve a result:

```bash
python3 -m http.server -d final/assets 8000     # working copy
python3 -m http.server -d out/1/assets 8000     # archived copy
```

## Configuration

All settings live in `.env` (git-ignored, **read-only** for the scripts).
Documented keys: see `.env.sample`. Never edit `.env` from tooling — only
`.env.sample` is changed when new settings appear.

| Key | Used by | Default |
|---|---|---|
| `PROVIDER` | primary provider | `google` (`google`/`openrouter`/`auto`) |
| `FALLBACK_PROVIDER` | secondary provider | the other one, if keyed (`…/none` disables) |
| `LLM_MODEL_FALLBACKS` | extra text models after both providers | `gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest` |
| `GEMINI_API_KEY` | Google API calls | — (one key set required) |
| `OPEN_ROUTER_API_KEY` | OpenRouter API calls | — |
| `LLM_MODEL` / `OPEN_ROUTER_LLM_MODEL` | draft, JS, chat | `gemini-3.8-flash` / `google/gemini-3.8-flash` |
| `IMAGE_MODEL` / `OPEN_ROUTER_IMAGE_MODEL` | static section images | `gemini-3.1-flash-lite-image` / `google/gemini-3.1-flash-lite-image` |
| `AUDIO_MODEL` / `OPEN_ROUTER_AUDIO_MODEL` | section TTS | `gemini-3.8-flash-lite-tts` / `google/gemini-3.8-flash-lite-tts` |
| `AUDIO_VOICE`, `AUDIO_STYLE` | TTS | `Kore`, — |
| `SENTENCE_PAUSE_MS`, `SECTION_PAUSE_MS`, `LEAD_IN_MS` | timeline | 250 / 600 / 500 |
| `IMAGE_ASPECT` | image generation | `16:9` |
| `GENERATE_PAUSE_S` | delay between generation calls | see `.env.sample` |
| `CHAT_PORT` | chat app | `8787` |
| `OUT_DIR` | archive target | `out/` |

## Documentation

| File | Contents |
|---|---|
| [PRD.md](PRD.md) | product requirements, user stories, acceptance criteria |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | phases, tasks, dependencies |
| [TECH_STACK.md](TECH_STACK.md) | languages, libraries, APIs and why |
| [DRAFT_SCHEMA.md](DRAFT_SCHEMA.md) | `draft-v1` ↔ `driving-data.json` reference |
| [PROGRESS.md](PROGRESS.md) | live progress tracker |
