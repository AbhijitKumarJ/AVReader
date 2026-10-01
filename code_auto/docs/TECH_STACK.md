# Tech Stack — `code_auto`

## Principles

1. **No new dependencies.** Everything runs on the Python 3.12 already
   installed; only `aiohttp` and `requests` (both present) are used, stdlib
   elsewhere. No `pip install` required for the user.
2. **`.env` is read-only.** `scripts/envfile.py` parses `KEY=VALUE`; scripts
   only ever read settings. `.env.sample` documents keys.
3. **REST over SDKs.** Gemini APIs are called with plain HTTP
   (`urllib`/`requests`) so the model list in `.env` drives everything and
   no client library version drift can break the pipeline.
4. **Folders are state.** JSON files + directories are the database; any
   step can be re-run safely.

## Language & runtime

| Layer | Choice | Why |
|---|---|---|
| Pipeline scripts | Python 3.12, stdlib + `requests` | available everywhere, zero install, easy JSON/file work |
| Chat app server | `aiohttp` | installed; gives HTTP + async streaming + static files in one dependency |
| Chat streaming | chunked `text/plain` (`web.StreamResponse`) | one-directional token/log streaming over plain fetch; no SSE parsing needed on either side |
| Frontend (reader) | Vanilla JS + CSS, no build step | the artifact itself must be dependency-free and serveable by any static server |
| Chat UI | Single-page vanilla JS + CSS | no bundler, matches reader aesthetic, trivial to audit |
| Media processing | `wave` (stdlib) for WAV, `ffmpeg` when present for MP3/transcode | silent degradation: without ffmpeg the pipeline emits `master-audio.wav` |
| Headless verification | Chrome `--headless --dump-dom` | end-to-end check of the served app without extra test frameworks |

## External services (configured in `.env`)

Two providers are supported. **Provider scheme:**

| Setting | Values | Default | Meaning |
|---|---|---|---|
| `PROVIDER` | `google` / `openrouter` / `auto` | `google` | primary provider (`auto` = Google primary) |
| `FALLBACK_PROVIDER` | `google` / `openrouter` / `none` | the other provider, if its key exists | secondary provider tried when the primary fails |
| `LLM_MODEL_FALLBACKS` | comma list or `none` | `gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest` | extra Google text models tried before giving up |
| explicit `model=` arg | contains `/` → OpenRouter, else Google | — | per-call provider override (chat mode) |

Candidate order for text: primary → other provider → extra Google models.
Free-tier Google image models may be quota-blocked (429); the OpenRouter
image fallback keeps generation working.

### Google (Gemini)

| Setting | Model role | API shape | Used by |
|---|---|---|---|
| `GEMINI_API_KEY` | auth | `x-goog-api-key` header | all |
| `LLM_MODEL` (default `gemini-3.8-flash`) | analysis / drafting / JS / chat | `:generateContent`, `:streamGenerateContent?alt=sse` (text) | `create_draft.py`, `generate_js.py`, chat |
| `IMAGE_MODEL` (default `gemini-3.1-flash-lite-image`) | static section images | `:generateContent` with `responseModalities:["IMAGE"]` → `inlineData` bytes | `generate_images.py` |
| `AUDIO_MODEL` (default `gemini-3.8-flash-lite-tts`) | section narration | `:generateContent` with `responseModalities:["AUDIO"]` + `speechConfig.voiceConfig` → PCM `inlineData` | `generate_audio.py` |

Endpoint base: `https://generativelanguage.googleapis.com/v1beta/models/{model}:…`

### OpenRouter (fallback / alternative default)

| Setting | Model role | API shape |
|---|---|---|
| `OPEN_ROUTER_API_KEY` | auth | `Authorization: Bearer` header |
| `OPEN_ROUTER_LLM_MODEL` (default `google/gemini-3.8-flash`) | text | `POST https://openrouter.ai/api/v1/chat/completions` (+ `choices[0].delta.content` SSE) |
| `OPEN_ROUTER_IMAGE_MODEL` (default `google/gemini-3.1-flash-lite-image`) | images | same endpoint, `modalities:["image","text"]` → `message.images[0].image_url.url` (`data:image/jpeg;base64,…`) |
| `OPEN_ROUTER_AUDIO_MODEL` (default `google/gemini-3.8-flash-lite-tts`) | narration | `POST …/audio/speech` `{model,input,voice,response_format:"pcm"}` → `audio/pcm;rate=24000` |

All calls: timeout + up to 3 retries with exponential backoff on 429/5xx;
`LLMError(msg, code)` carries the HTTP status so callers can chain fallbacks.

## Key modules

```
scripts/
  envfile.py          .env loader (read-only, repo/.env fallback)
  llm.py              dual-provider client (Google + OpenRouter): text (stream +
                      fallback chain), image, TTS; JSON extraction
  pipeline.py         domain core: paths, draft load/validate, gap detection,
                      ensure_{images,audio,js}, create_draft, assemble, archive
  chat_app.py         aiohttp app: /api/state, /api/wizard, streaming /api/run, /api/chat
  chat/static/        chat UI (index.html, app.js, style.css)
  create_draft.py     CLI → pipeline.create_draft
  check_assets.py     CLI → pipeline.check_assets
  generate_images.py  CLI → pipeline.ensure_images
  generate_audio.py   CLI → pipeline.ensure_audio
  generate_js.py      CLI → pipeline.ensure_js (+ --ingest)
  assemble_final.py   CLI → pipeline.assemble
  archive_output.py   CLI → pipeline.archive
  stitch_audio.py     legacy timeline engine (kept for transcript flow),
                      shared helpers imported by pipeline.assemble
  extract_turn_onefile.py   legacy transcript → draft entry point
  run_auto.sh         terminal mirror of the chat wizard
  sys_prompt.md       system prompt for both chat modes
  frontend/           reader app copied into final/out
```

## Data contracts

- **`draft-v1`** (see [DRAFT_SCHEMA.md](DRAFT_SCHEMA.md)) — plan only:
  no timestamps, no dependency on assets.
- **`driving-data.json`** — realized timeline consumed by the reader.
- **`draft/chat_state.json`** — wizard answers + last completed step.

## Conventions

- Section ids: kebab-case slugs (`section-1-the-dream`), stable across
  draft → audio file → driving data.
- Audio file: `NN_<sectionId>.wav`, 16-bit PCM, sample rate from the API
  (24 kHz), silence/pauses generated in-process.
- Image/JS file names come verbatim from the draft (`visual.file`,
  `script.file`); generation never invents names.
- Timeline units: milliseconds in JSON, floats internally, rounded on write;
  `metadata.totalDuration` in seconds.
