# Progress Tracker — `code_auto`

Legend: ⬜ not started · 🟦 in progress · ✅ done · ⛔ blocked
Task ids follow [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

*Last updated: 2026-10-02 (all phases complete, e2e verified)*

---

## Phase 0 — Documentation
| ID | Task | Status | Notes |
|---|---|---|---|
| P0.1 | docs/README.md | ✅ | quick start, folder contract, commands, config table incl. provider keys |
| P0.2 | docs/PRD.md | ✅ | |
| P0.3 | docs/IMPLEMENTATION_PLAN.md | ✅ | |
| P0.4 | docs/TECH_STACK.md | ✅ | Google + OpenRouter sections, chunked streaming |
| P0.5 | docs/DRAFT_SCHEMA.md | ✅ | draft-v1 ↔ driving-data.json reference |
| P0.6 | docs/PROGRESS.md | ✅ | this file |

## Phase 1 — Core library
| ID | Task | Status | Notes |
|---|---|---|---|
| P1.1 | llm.py client | ✅ | dual-provider (Google + OpenRouter): `provider_chain`, fallbacks, `LLMError` |
| P1.2 | pipeline paths / prepare_folders | ✅ | |
| P1.3 | draft load/save/validate | ✅ | `normalize_draft`, soft-load |
| P1.4 | check_assets gap detection | ✅ | exit codes 0/1/2, `--json` |
| P1.5 | API probes (image/audio/llm) | ✅ | text/image/tts verified on both providers |

## Phase 2 — Generators (CLI)
| ID | Task | Status | Notes |
|---|---|---|---|
| P2.1 | create_draft.py | ✅ | 2-attempt validation retry; sys_prompt as system |
| P2.2 | generate_images.py | ✅ | Google quota-blocked → OpenRouter fallback verified |
| P2.3 | generate_audio.py | ✅ | `--dry-run/--force/--sections`; 24 kHz WAV |
| P2.4 | generate_js.py (+ --ingest) | ✅ | fenced-block ingest + `script.spec` API fallback |
| P2.5 | CLI wrappers / flags | ✅ | |

## Phase 3 — Assembly & archive
| ID | Task | Status | Notes |
|---|---|---|---|
| P3.1 | pipeline.assemble timeline | ✅ | gap-gated, invariants checked (`check_timeline`) |
| P3.2 | assemble_final.py | ✅ | 72.3 s mp3, `scriptUrl` from `script.scriptId` |
| P3.3 | archive_output.py (clear draft too) | ✅ | delegates to `pipeline.archive` |
| P3.4 | stitch_audio.py --draft/--audio-dir | ✅ | `stitch()` importable; `-nostdin` on all ffmpeg calls |
| P3.5 | headless render verification | ✅ | chrome `--dump-dom`: 3 titles, 10 sentences, 0 console errors |

## Phase 4 — System prompt
| ID | Task | Status | Notes |
|---|---|---|---|
| P4.1 | four separate questions | ✅ | |
| P4.2 | draft-v1 emission rules | ✅ | `<article>` auto-draft special case |
| P4.3 | asset contracts + gap guidance | ✅ | `// file: <scriptId>.js` marker |
| P4.4 | automated-mode state section | ✅ | `[WORKSPACE STATE]` handling |
| P4.5 | verify-vs-archive closing | ✅ | |

## Phase 5 — Local chat app
| ID | Task | Status | Notes |
|---|---|---|---|
| P5.1 | aiohttp server + /api/state | ✅ | |
| P5.2 | wizard API + chat_state.json | ✅ | 4 questions → gap → assemble → done phases |
| P5.3 | streaming /api/run | ✅ | chunked `text/plain`; `JOB` lock → 409 when busy |
| P5.4 | streaming /api/chat | ✅ | sys_prompt + state appendix; history last 16 turns |
| P5.5 | gap table + generate confirmation | ✅ | confirm before generation |
| P5.6 | verify-or-archive question | ✅ | |
| P5.7 | chat UI static files | ✅ | `chat/static/{index.html,style.css,app.js}`, `node --check` OK |

## Phase 6 — Orchestration & polish
| ID | Task | Status | Notes |
|---|---|---|---|
| P6.1 | run_auto.sh wizard mirror | ✅ | piped-input run verified end to end (rc=0 → out/2) |
| P6.2 | .env.sample additions (never .env) | ✅ | `PROVIDER`, `FALLBACK_PROVIDER`, `LLM_MODEL_FALLBACKS`, `OPEN_ROUTER_*`, `IMAGE_ASPECT`, `GENERATE_PAUSE_S`, `CHAT_PORT` |
| P6.3 | end-to-end test + cleanup | ✅ | clean slate → blog → draft → 6 assets → assemble → render → archive; test archives removed |
| P6.4 | docs sync | ✅ | this file |

---

## Acceptance criteria (PRD §8)
| # | Criterion | Status |
|---|---|---|
| A1 | sys_prompt asks 4 questions separately and emits valid draft-v1 | ✅ |
| A2 | create_draft.py produces valid draft from input/blog.txt | ✅ | 
| A3 | generators fill exactly the gaps; second run = 0 API calls | ✅ | idempotent rerun = 16 ms, 0 API |
| A4 | assemble timeline passes invariants + headless render | ✅ |
| A5 | chat wizard → gaps → generate → assemble → verify/archive in browser | ✅ |
| A6 | archive → out/<1> with input+draft+final; folders empty | ✅ | 11/11 integrity checks passed |
| A7 | no script writes to .env | ✅ | |

---

## Log
| Date | Entry |
|---|---|
| 2026-10-01 | Tracker created; docs phase started. |
| 2026-10-01 | Docs complete (6 files); llm.py + pipeline.py + generator CLIs written and probe-tested. |
| 2026-10-02 | OpenRouter support added: `PROVIDER`/`FALLBACK_PROVIDER`/`LLM_MODEL_FALLBACKS` scheme, OpenRouter text/image/TTS endpoints verified live; image fallback unblocks Google free-tier quota block (429). |
| 2026-10-02 | sys_prompt.md rewritten (4 questions, draft-v1, both modes); chat app (chat_app.py + static UI) written; streaming routes verified. |
| 2026-10-02 | E2E via chat API: blog → draft (3 sections) → gap answers → images/audio/JS generated (6/6) → assemble (72.3 s) → headless render PASS (0 console errors) → archive out/1 (11/11 checks) → state reset. |
| 2026-10-02 | Fixed: ffmpeg drained piped stdin in run_auto.sh (missing `-nostdin`) — added to all 3 call sites in stitch_audio.py; piped run_auto.sh now completes rc=0 through archive. |
| 2026-10-02 | Docs synced (README config table, TECH_STACK providers, PROGRESS); test archives removed, workspace clean, chat server stopped. |
