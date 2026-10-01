# AVReader

Automated Interactive Audio-Visual Reader Pipeline For Blogs.

Turn a plain blog post into a synchronized, interactive web reader:
proofread → sectioned draft (`draft.json`) → images + dynamic JS + per-section
TTS audio → stitched master audio with a millisecond timeline
(`driving-data.json`) → a self-contained web app you can serve with any
static file server.

The runnable pipeline lives in [`code_auto/`](code_auto/). Every step
(analysis, image generation, audio generation, JS generation) runs against the
models configured in `.env` — Google Gemini, with **OpenRouter as automatic
fallback** (or as the primary provider via `PROVIDER=openrouter`) — either
from the **local chat app** or from the **CLI**.

## Requirements

| | |
|---|---|
| Python | `>=3.11` (exact interpreter pinned to 3.11.15 in [`.python-version`](.python-version)) |
| [uv](https://docs.astral.sh/uv/) | environment + dependency manager |
| API key | `GEMINI_API_KEY` and/or `OPEN_ROUTER_API_KEY` |
| `ffmpeg` | optional — MP3 master audio; without it the pipeline falls back to WAV |

## Setup

```bash
git clone https://github.com/AbhijitKumarJ/AVReader.git
cd AVReader

uv sync                                # creates .venv, installs deps from uv.lock
                                       # (runtime + dev group; use --no-dev to skip dev tools)

cp code_auto/.env.sample code_auto/.env   # once — add GEMINI_API_KEY and/or OPEN_ROUTER_API_KEY
                                          # (.env is never edited by scripts)
```

All commands below assume you are at the repository root.

Prefer an activated shell? `source .venv/bin/activate` and drop the `uv run`
prefix below — both work.

## Quick start

```bash
uv run python code_auto/scripts/chat_app.py    # local chat app -> http://127.0.0.1:8787
#  or
uv run bash code_auto/scripts/run_auto.sh      # terminal wizard, same steps
```

Put your blog in `code_auto/input/blog.txt` (or paste it in the chat).

> Running a script through `uv run` puts `.venv/bin` on `PATH`, so the
> `python3` calls inside `run_auto.sh` use the project environment too.

## Folder contract

```
code_auto/
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

> **`out/` is never cleared by setup, `uv`, or this README's commands.**
> `archive_output.py` is the only thing that writes `out/<n>/`, and it only
> clears `input/`, `draft/` and `final/` after a successful archive.

## Two modes

**Mode 1 — external chat (AI Studio / any web LLM).**
Copy `code_auto/scripts/sys_prompt.md` as the system prompt. The chat asks the
four questions (draft? images? audio? JS?) and produces `draft.json` (+ optional
JS code blocks). Dump the outputs into `code_auto/draft/`, then run
`uv run bash code_auto/scripts/run_auto.sh` (or the chat app) — it detects what
exists and only fills the gaps.

**Mode 2 — local chat app.** `code_auto/scripts/chat_app.py` asks the same
questions, cross-checks `draft.json` against the three asset folders, shows a
present/missing table, and — after you confirm — generates whatever is missing
with the configured models. It can start the whole flow from a blog if you have
no `draft.json` yet, and at the end asks whether you want to keep verifying in
chat or finish and archive.

## Commands (CLI)

Run these from the repository root.

| Command | Purpose |
|---|---|
| `uv run python code_auto/scripts/create_draft.py` | `input/blog.txt` → `draft/draft.json` (LLM_MODEL) |
| `uv run python code_auto/scripts/check_assets.py` | gap report: draft / images / audio / JS |
| `uv run python code_auto/scripts/generate_images.py` | missing images → `draft/assets/image/` (IMAGE_MODEL) |
| `uv run python code_auto/scripts/generate_audio.py` | missing audio → `draft/assets/audio/` (AUDIO_MODEL) |
| `uv run python code_auto/scripts/generate_js.py` | missing JS → `draft/assets/js/` (`--ingest chat.md` to pull chat code blocks) |
| `uv run python code_auto/scripts/assemble_final.py` | draft + assets → `final/` (timeline, master audio, frontend) |
| `uv run python code_auto/scripts/archive_output.py` | `input+draft+final` → `out/<n>`, then clears all three |
| `uv run bash code_auto/scripts/run_auto.sh` | the whole sequence with terminal questions |
| `uv run python code_auto/scripts/chat_app.py` | local web chat + wizard (`CHAT_PORT`, default 8787) |
| `uv run python code_auto/scripts/extract_turn_onefile.py` | legacy entry: AI-Studio transcript JSON → draft (keeps old flow) |

Serve a result:

```bash
uv run python -m http.server -d code_auto/final/assets 8000   # working copy
uv run python -m http.server -d code_auto/out/1/assets 8000   # archived copy
```

## Configuration

All settings live in `code_auto/.env` (git-ignored, **read-only** for the
scripts). Documented keys: see `code_auto/.env.sample`. Never edit `.env` from
tooling — only `.env.sample` is changed when new settings appear.

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

## Project layout

```
.
├── pyproject.toml           project metadata + dependencies (managed with uv)
├── uv.lock                  locked dependency versions — commit this
├── .python-version          interpreter pinned by uv
├── main.py                  minimal entry stub
├── code_auto/
│   ├── scripts/             pipeline CLIs, llm client, chat app, wizard
│   │   ├── chat/static/     chat UI (vanilla JS + CSS)
│   │   └── frontend/        reader app copied into final/ and out/<n>/
│   ├── docs/                PRD, tech stack, schema, progress
│   ├── input/ draft/ final/ out/   pipeline state (see folder contract)
│   └── .env.sample          configuration template
└── README.md
```

### Dependencies

| | |
|---|---|
| Runtime | `aiohttp` — chat app HTTP server + async streaming |
| Dev | `ruff` — lint/format (installed by `uv sync`; skip with `--no-dev`) |

Everything else is Python stdlib (`urllib` for API calls, `wave` for PCM,
`json`/`argparse`/`asyncio` throughout). The reader frontend has no build step
and no third-party JS.

## Development

```bash
uv run ruff check              # lint
uv run ruff format .           # format
uv run ruff check --fix        # apply safe autofixes
```

## Documentation

Docs live under [`code_auto/docs/`](code_auto/docs/):

| File | Contents |
|---|---|
| [PRD.md](code_auto/docs/PRD.md) | product requirements, user stories, acceptance criteria |
| [IMPLEMENTATION_PLAN.md](code_auto/docs/IMPLEMENTATION_PLAN.md) | phases, tasks, dependencies |
| [TECH_STACK.md](code_auto/docs/TECH_STACK.md) | languages, libraries, APIs and why |
| [DRAFT_SCHEMA.md](code_auto/docs/DRAFT_SCHEMA.md) | `draft-v1` ↔ `driving-data.json` reference |
| [PROGRESS.md](code_auto/docs/PROGRESS.md) | live progress tracker |
| [README.md](code_auto/docs/README.md) | pipeline-specific readme |

## License

Apache License 2.0 — see [LICENSE](LICENSE).
