# PRD — Automated Interactive Audio-Visual Reader Pipeline

**Product:** `code_auto` — an API-driven pipeline + local chat app that turns a
blog post into an interactive audio-visual web reader.
**Status:** v1 (in implementation)
**Upstream:** manual variant lives in `../code` (transcript-driven, human-run steps).

---

## 1. Problem

Building an interactive reader today requires a human to shuttle between a
web LLM chat (proofread → section → draft JSON → images → JS) and local
scripts (TTS → stitch → frontend), manually matching file names and folder
locations. Mistakes (wrong file name, missing asset, wrong folder) surface
only at stitch time or in the browser.

## 2. Goal

Make the whole sequence **drivable through API calls to configured LLMs**,
with a local chat app as the control surface and an external web-LLM chat
(AI Studio) as an equal alternative — both speaking the same system prompt
and the same `draft.json` contract.

## 3. Users & contexts

| Persona | Entry point | Wants |
|---|---|---|
| **Interactive user** | local chat app | guided Q&A, watch generation happen, tweak and re-run, decide when to archive |
| **AI Studio user** | external chat + `sys_prompt.md` | dump `draft.json`/assets into `draft/`, let scripts finish |
| **Automation / CLI user** | `run_auto.sh` | same flow without a browser, resumable |

## 4. Core concepts

- **`draft.json` (`draft-v1`)** — structure-only plan: sections, transcript,
  per-section image prompt + save name, JS id/file/spec, audio file + speak
  text. Contains **no timestamps** and **never depends on assets existing**.
- **`driving-data.json`** — realization of the draft: same sections plus
  `startMs/endMs`, resolved asset URLs, and `metadata.audioUrl`.
- **Folder-as-state** — `draft/assets/{image,js,audio}` file presence is the
  authoritative answer to "was this asset created?".
- **Three questions, one by one** — draft? / images? / audio? / JS? are asked
  explicitly (chat wizard and system prompt), then cross-checked against the
  folders and the draft contents.

## 5. Functional requirements

### FR-1 System prompt (`sys_prompt.md`)
- FR-1.1 On first contact, ask **separately**: (a) start from a blog or
  already have `draft.json` from a previous chat; (b) image assets created?;
  (c) audio segment assets created?; (d) JS assets created?
- FR-1.2 If starting from a blog: proofread → sectioning (static/dynamic) →
  emit `draft-v1` JSON only (single fenced block), with image prompt + file
  name per static section, `scriptId`/`file`/`spec` per dynamic section, and
  `audio.file` + `audio.text` per section.
- FR-1.3 No timestamps, no checks for asset existence, no asset binaries.
- FR-1.4 Asset contracts: images 16:9 (or configured aspect) and descriptive
  file names; JS implements `mount(container) / render(localTimeMs) /
  unmount(container)`; audio file name `NN_<sectionId>.wav`.
- FR-1.5 If the user already has a draft: validate it, list gaps, guide asset
  creation and stitching only.
- FR-1.6 Ends by asking whether to **verify/iterate in chat** or **finish and
  archive**.

### FR-2 Draft management
- FR-2.1 `create_draft.py`: `input/blog.txt` → validated `draft/draft.json`
  via `LLM_MODEL` (API mode of FR-1).
- FR-2.2 Validation reports precise errors (missing keys, bad types, unsafe
  file names) without modifying the file.
- FR-2.3 Drafts created elsewhere (AI Studio) are accepted after validation.

### FR-3 Asset generation
- FR-3.1 Images: for each static section missing `visual.file` → call
  `IMAGE_MODEL` with `visual.prompt`; save to `draft/assets/image/` under the
  draft's file name; skip existing unless `--force`.
- FR-3.2 Audio: for each section missing `audio.file` → TTS `audio.text` with
  `AUDIO_MODEL`/`AUDIO_VOICE`; save `draft/assets/audio/<audio.file>` (WAV,
  16-bit); skip existing unless `--force`.
- FR-3.3 JS: prefer `script.code` supplied by the chat (ingested with
  `generate_js.py --ingest`); otherwise generate from `script.spec` via
  `LLM_MODEL`; save `draft/assets/js/<script.file>`.
- FR-3.4 Every generation step reports per-section progress and failures,
  and never deletes existing files without `--force`.
- FR-3.5 `.env` is read-only; all model/aspect/voice settings come from it.

### FR-4 Assembly
- FR-4.1 `assemble_final.py`: draft + asset folders → `final/assets/` with
  `master-audio.mp3` (or `.wav` fallback), `driving-data.json`, copied
  `image/ js/ audio/`, and the frontend (`index.html`, `app.js`, `style.css`).
- FR-4.2 Timeline: lead-in, sentence pauses inside sections, section pauses —
  sentence timings allocated proportionally to text length within each
  section's audio; boundaries must be monotonic and consistent with the
  master audio duration (± encoder padding).
- FR-4.3 `visual.url` and `scriptUrl` in `driving-data.json` must resolve
  relative to `final/assets/` exactly as in the draft.
- FR-4.4 Assembly fails with actionable messages if an asset referenced by
  the draft is missing (never silently substitutes).

### FR-5 Local chat app
- FR-5.1 Serves a browser UI (default `CHAT_PORT=8787`) with a wizard that
  asks FR-1's four questions one at a time, then a gap table
  (present/missing per section and asset type).
- FR-5.2 If a question answers "no" and the draft confirms the gap, the app
  **asks before generating** with the configured models, then shows progress.
- FR-5.3 If the user has no `draft.json`, the app starts the full flow from a
  blog using `sys_prompt.md` as system prompt.
- FR-5.4 Streaming chat pane available at all times (same system prompt +
  current state appendix), so the user can give additional instructions at
  any point ("regenerate section 3 image", "shorten section 2 audio text").
- FR-5.5 After assembly, the app asks: **verify / give additional
  instructions** (stay in chat) **or finish → archive stage**.
- FR-5.6 Wizard answers persist (`draft/chat_state.json`) so a restart
  resumes at the right step.

### FR-6 Archive
- FR-6.1 `archive_output.py` copies `input/` + `draft/` + `final/` into the
  next free `out/<n>` (starting at 1), verifies the copy, then clears
  `input/`, `draft/`, `final/`.
- FR-6.2 Refuses to archive when `final/assets/driving-data.json` is missing
  (`--force` overrides); `--no-clear` copies only.

### FR-7 CLI parity
- FR-7.1 `run_auto.sh` reproduces the chat flow in the terminal (same
  questions, same skips, same final verify-or-archive question).

## 6. Non-functional requirements

- **NFR-1** No new Python dependencies beyond what is installed
  (`aiohttp`, `requests`); stdlib preferred; `ffmpeg` used when present.
- **NFR-2** `.env` is never written by any script; `.env.sample` documents
  every key.
- **NFR-3** Idempotent steps: re-running any step changes nothing unless
  `--force`.
- **NFR-4** Every API call has timeouts + bounded retries with backoff;
  failures name the model, section and remedy.
- **NFR-5** Deterministic naming: asset file names come from the draft —
  generation never invents names.
- **NFR-6** Works offline for steps whose assets already exist (no API call
  is made for present assets).

## 7. User stories

1. *As a first-time user I paste a blog and answer four questions, and the
   app tells me exactly what it will create before spending any API quota.*
2. *As an AI Studio user I generate draft.json in the portal, drop it plus my
   images into `draft/`, and the pipeline only generates what's missing.*
3. *As an iterator I stay in the chat after assembly, ask for one image to be
   regenerated, re-assemble, and only archive when I say so.*
4. *As a CLI user I run one command, answer y/n questions, and get an
   archive numbered `out/2`.*

## 8. Acceptance criteria (v1)

- [ ] `sys_prompt.md` asks the four questions separately and produces a
      valid `draft-v1` for a sample blog when used as an external system
      prompt.
- [ ] `create_draft.py` produces a valid draft for `input/blog.txt` with no
      human editing.
- [ ] All three generators fill exactly the gaps reported by
      `check_assets.py`; a second run performs zero API calls.
- [ ] `assemble_final.py` yields a timeline that passes monotonicity and
      duration checks and a headless-browser render of the frontend.
- [ ] Chat app wizard → gap table → generate → assemble → verify-or-archive
      completes in a browser session.
- [ ] Archive produces `out/<1>` containing input + draft + final and leaves
      the three folders empty.
- [ ] No script writes to `.env`.

## 9. Out of scope (v1)

- Multi-user / auth for the chat app; persistence beyond one conversation.
- Video assets, per-sentence audio files, translation.
- Editing tools (image cropping, waveform editing) — regenerate instead.
- Publishing/deploy beyond static file serving.
