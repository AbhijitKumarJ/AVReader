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

## The end-to-end flow

Two stages: **generate the draft and assets in AI Studio, then finish
locally.** Nothing is thrown away between them — the folders are the handoff.

### Stage 1 — generate draft + assets in AI Studio

1. Paste [`System_Prompts/sys_prompt_aistudio.md`](System_Prompts/sys_prompt_aistudio.md)
   into AI Studio's **System instructions** field.
2. It runs a 5-step process: proofread → section the article → emit
   `draft.json` in the `draft-v1` shape → generate images (Imagen / Nano
   Banana), the `mount`/`render`/`unmount` JavaScript and the narration audio
   → point you at the local assembler.
3. Download whatever it produced and save it into the repository:

   | what | where |
   |---|---|
   | corrected blog | `code_auto/input/blog.txt` |
   | draft | `code_auto/draft/draft.json` |
   | section images | `code_auto/draft/assets/image/<visual.file>` |
   | section JavaScript | `code_auto/draft/assets/js/<scriptId>.js` |
   | section narration | `code_auto/draft/assets/audio/NN_<section-id>.wav` |

   Every name comes **verbatim from `draft.json`** — for a web download the
   only thing you normally have to do is rename `image.png` → the name the
   draft asks for.

### Stage 2 — finish in the local web chat

```bash
uv run python code_auto/scripts/chat_app.py     # http://127.0.0.1:8787
```

The wizard on the left is a state machine driven by what is actually on disk:

| Situation | What the chat does |
|---|---|
| `draft/draft.json` exists and is valid | **detects it on load and verifies it** against the `draft-v1` contract, shows the per-section present/missing table, and offers *Yes — use this draft* / *No — start from a blog* |
| `draft/draft.json` exists but is invalid | lists the validation errors and asks you to paste a corrected one in the chat, or hand over the blog to rebuild it |
| no `draft/draft.json`, you answer *Yes* | asks you to paste it into the chat — it is parsed, validated and written to `draft/draft.json` |
| no `draft/draft.json`, you answer *No* | asks for the blog: type it in the box (saved as `input/blog.txt`) or drop the file into `code_auto/input/` yourself, then *Create draft* |
| draft settled | asks **one question at a time** whether you already have the images, the audio and the JavaScript — each answer cross-checked against `draft/assets/` and shown as `on disk: N/M` |
| anything missing | shows the gap table and offers to generate only what is missing |
| everything present | assembles, serves the reader at `/reader/`, then offers *Finish → archive* → `out/<n>` |

Answers live in `draft/chat_state.json`, so the wizard resumes where you left
off. The same four questions are asked by the terminal wizard
(`uv run bash code_auto/scripts/run_auto.sh`) if you prefer the CLI.

## System prompts

Two prompts, identical `draft-v1` contracts — pick the one that matches the
stage you are in:

| File | Use when |
|---|---|
| [`System_Prompts/sys_prompt_aistudio.md`](System_Prompts/sys_prompt_aistudio.md) | **Stage 1** — generating `draft.json` + assets from a blog post inside AI Studio |
| [`code_auto/scripts/sys_prompt.md`](code_auto/scripts/sys_prompt.md) | cold-start / generic use — this is also the prompt the local chat app loads |

Assets you produced in another web tool (ChatGPT images, a browser TTS) fit
the same handoff: rename them onto the paths above, save them in
`code_auto/draft/assets/`, and the chat will find them.

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
├── System_Prompts/
│   └── sys_prompt_aistudio.md   Stage 1: generate draft.json + assets in AI Studio
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

## Pending tasks

Known gaps — none of them block the flow above, but they are not implemented
yet:

- **No file upload in the chat UI.** `input/blog.txt` and `draft/draft.json`
  can only be pasted as text (`POST /api/blog`, `POST /api/draft-ingest` both
  take `{text}`) or saved with a file manager — there is no drag-and-drop and
  no file picker.
- **Images and audio cannot be added through the UI.** They must be copied
  into `code_auto/draft/assets/{image,audio}/` by hand. Only JavaScript has an
  in-chat ingest (`POST /api/ingest` → `pipeline.ingest_js`), and that accepts
  pasted text, not a file.
- **JS ingest needs a matchable prefix.** `ingest_js` looks for the section
  `id`, the `scriptId` or `script.file` in the ~400 characters *before* the
  fence (`code_auto/scripts/llm.py:703`); blocks without it come back as
  "unmatched" instead of being saved.
- **The terminal wizard does not auto-detect a saved draft.**
  `run_auto.sh` only inspects `draft/` after you answer *yes* to its first
  question, whereas the web chat now detects and verifies an on-disk
  `draft/draft.json` on load.
- **The next-blog loop exists only in the AI Studio prompt.** The prompt offers
  to start the next blog once you confirm a blog is done, but archiving is
  still a manual command and `draft/chat_state.json` is only reset by
  `archive_output.py` or the *reset answers* button.
- **No automated tests in the repository.** `uv run ruff check` is the only
  gate; the wizard state machine has no in-repo coverage.
- **27 pre-existing `ruff` findings** (8 auto-fixable) — none introduced by
  the setup work, not cleaned up yet.
- **Documentation drift:** `code_auto/docs/TECH_STACK.md` lists `requests` as
  used (it is not — only `urllib` and `aiohttp`), and
  `code_auto/scripts/sys_prompt.md` never mentions `check_assets.py`.
- **`main.py` is still the `uv init` hello-world stub.**

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
