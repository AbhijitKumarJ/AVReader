# Implementation Plan — `code_auto`

Phases are ordered by dependency; each phase ends with a verifiable outcome.
Task ids are referenced from [PROGRESS.md](PROGRESS.md).

---

## Phase 0 — Documentation  ✅ (this folder)

| ID | Task | Outcome |
|---|---|---|
| P0.1 | `docs/README.md` | quickstart, folder contract, commands |
| P0.2 | `docs/PRD.md` | requirements + acceptance criteria |
| P0.3 | `docs/IMPLEMENTATION_PLAN.md` | this file |
| P0.4 | `docs/TECH_STACK.md` | stack + rationale |
| P0.5 | `docs/DRAFT_SCHEMA.md` | draft-v1 ↔ driving-data mapping |
| P0.6 | `docs/PROGRESS.md` | live tracker |

## Phase 1 — Core library

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P1.1 | `llm.py` — text (stream + buffered), image, TTS clients, retries, JSON extraction | — | importable; probe call works for text/image/audio |
| P1.2 | `pipeline.py` — paths, `prepare_folders` | P1.1 | folder contract created |
| P1.3 | `pipeline.py` — `load_draft` / `save_draft` / `validate_draft` | P1.2 | validator reports precise errors |
| P1.4 | `pipeline.py` — `check_assets` gap detection | P1.3 | per-section present/missing report |
| P1.5 | API probes: `IMAGE_MODEL` response shape (aspect config), `AUDIO_MODEL`, `LLM_MODEL` | P1.1 | confirmed shapes documented in PROGRESS |

**Gate:** `check_assets.py` on an empty workspace reports "no draft" cleanly;
probes return real bytes.

## Phase 2 — Generators (CLI)

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P2.1 | `create_draft.py` — blog → validated `draft/draft.json` | P1.3 | sample blog produces valid draft |
| P2.2 | `generate_images.py` → `draft/assets/image/` | P1.4, P1.5 | gaps filled; second run = 0 calls |
| P2.3 | `generate_audio.py` → `draft/assets/audio/` (`NN_<id>.wav`) | P1.4 | speech WAVs per section |
| P2.4 | `generate_js.py` — `--ingest` chat blocks + LLM fallback from `spec` | P1.4 | `draft/assets/js/<file>` valid JS |
| P2.5 | thin argparse wrappers, consistent `--force`/`--json` flags | P2.1–2.4 | uniform CLI surface |

**Gate:** a draft with empty asset folders reaches 100% coverage via
`check_assets.py`, idempotent on re-run.

## Phase 3 — Assembly & archive

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P3.1 | `pipeline.assemble` — timeline math (shared with `stitch_audio.py`) | P1.3, P2.3 | monotonic timeline, master audio |
| P3.2 | `assemble_final.py` — write `final/assets/` (timeline + assets + frontend) | P3.1 | serves in browser |
| P3.3 | `archive_output.py` — extend to clear `input/ draft/ final/` | P3.2 | `out/<n>` verified |
| P3.4 | `stitch_audio.py` refactor: `--draft`/`--audio-dir`, legacy mode intact | P3.1 | old transcript flow still works |
| P3.5 | headless Chrome verification of the assembled app | P3.2 | render + timeline checks |

**Gate:** blog → draft → assets → assemble → headless render passes; archive
round-trip leaves workspace empty.

## Phase 4 — System prompt

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P4.1 | Rewrite `sys_prompt.md`: four separate questions (draft/images/audio/JS) | P1.3 | prompt asks them in order |
| P4.2 | draft-v1 emission rules (no timestamps, no asset dependency, naming) | P4.1 | external chat emits valid draft |
| P4.3 | asset contracts (16:9 prompt style, JS contract, audio naming) + gap guidance | P4.2 | consistent with pipeline |
| P4.4 | automated-mode section (state injected by local app; skip questions) | P4.1 | one prompt serves both modes |
| P4.5 | verify-vs-archive closing instruction | P4.4 | required closing question |

**Gate:** using `sys_prompt.md` in an external chat, a sample blog yields a
draft that passes `validate_draft`.

## Phase 5 — Local chat app

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P5.1 | `chat_app.py` aiohttp server: static + `/api/state` | P1.4 | UI loads, shows workspace state |
| P5.2 | wizard API: four questions one-by-one → `draft/chat_state.json` | P5.1 | restart resumes |
| P5.3 | streaming `/api/run` for pipeline actions (create draft, ensure images/audio/js, assemble, archive) with live log | P2, P3 | buttons drive the pipeline |
| P5.4 | streaming `/api/chat`: `sys_prompt.md` + state appendix, token streaming, history persisted per session | P4, P5.1 | conversational control |
| P5.5 | gap table + "generate missing?" confirmation flow | P5.1, P5.3 | ask-then-generate |
| P5.6 | post-assembly question: verify/instruct vs finish→archive | P3.3, P5.3 | required closing UX |
| P5.7 | chat UI (`chat/static/`) — wizard panel + chat pane, dark theme | P5.1–5.6 | complete browser flow |

**Gate:** fresh browser session: blog → questions → draft → confirm generate
→ assemble → verify-or-archive, without touching the terminal.

## Phase 6 — Orchestration, config, polish

| ID | Task | Depends | Outcome |
|---|---|---|---|
| P6.1 | `run_auto.sh` terminal mirror of the wizard flow | P2, P3 | CLI parity |
| P6.2 | `.env.sample` additions (`PROVIDER`, `FALLBACK_PROVIDER`, `LLM_MODEL_FALLBACKS`, `OPEN_ROUTER_*`, `IMAGE_ASPECT`, `GENERATE_PAUSE_S`, `CHAT_PORT`) — never `.env` | P1.5 | documented keys |
| P6.3 | end-to-end test on a sample blog incl. archive; cleanup | all | results in PROGRESS |
| P6.4 | docs sync: PROGRESS, README command list, acceptance checklist | all | docs match reality |

**Gate:** acceptance criteria in PRD §8 all checked.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `IMAGE_MODEL` response/aspect API shape differs | probe first (P1.5); `imageConfig` sent best-effort, retried without it on 400 |
| Model refuses JSON-only drafting | strict "single fenced json block" instruction + robust extraction + validation errors fed back once |
| Long-running actions block chat UI | all actions stream progress over chunked responses; UI stays interactive |
| Timeline drift vs master audio | shared timing implementation + automated invariants check in assemble |
| Accidental `.env` writes | `envfile.load_env()` only reads; code review rule + no write APIs |
| API cost on repeated runs | idempotent skips; explicit confirmation before any generation in chat; `--force` required to redo |

## Definition of done

Every PRD acceptance criterion checked in [PROGRESS.md](PROGRESS.md),
end-to-end test evidence recorded, and the workspace left in a clean,
resumable state (folders empty or mid-step with `chat_state.json`).
