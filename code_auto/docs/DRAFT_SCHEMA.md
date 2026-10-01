# Draft Schema Reference (`draft-v1`) and `driving-data.json` mapping

`draft.json` is a **plan**. It contains everything needed to *produce* the
assets, and nothing that depends on them: no timestamps, no durations, no
existence checks. `driving-data.json` is the **realization**, produced only
after all referenced assets exist.

---

## 1. `draft/draft.json` (`schema: draft-v1`)

```jsonc
{
  "metadata": {
    "schema": "draft-v1",
    "title": "Creating Your Audio-Visual Reader",
    "source": "input/blog.txt",            // optional
    "answers": {                            // optional: wizard state
      "draft": true, "images": false, "audio": false, "js": false
    },
    "models": {                             // optional: informational
      "llm": "gemini-3.8-flash",
      "image": "gemini-3.1-flash-lite-image",
      "audio": "gemini-3.8-flash-lite-tts",
      "voice": "Kore"
    },
    "createdAt": "2026-10-01T20:15:00+00:00"
  },

  "sections": [
    {
      "id": "section-1-the-dream",          // ^[a-z0-9][a-z0-9-]*$  unique
      "type": "static",                     // "static" | "dynamic"
      "title": "The Dream",                 // optional, UI label
      "transcript": [                       // >= 1 sentence, strings
        "First sentence as spoken.",
        "Second sentence as spoken."
      ],

      // ---- static sections: image spec ------------------------------
      "visual": {
        "type": "image",                    // only "image" in v1
        "file": "section-1-the-dream.jpg",  // saved as draft/assets/image/<file>
        "prompt": "16:9 editorial photo of a laptop connected to …"
      },

      // ---- dynamic sections: script spec ----------------------------
      "script": {
        "scriptId": "PowerMathAnim",         // unique; registry key / class name
        "file": "PowerMathAnim.js",         // saved as draft/assets/js/<file>
        "spec": "Animate a USB-C power budget bar over 5 s; contract: …",
        "code": "class PowerMathAnim { … }" // optional: emitted by chat
      },

      // ---- every section: narration spec ----------------------------
      "audio": {
        "file": "01_section-1-the-dream.wav",   // NN_<sectionId>.wav (zero-padded)
        "text": "Exact text to speak — may differ from transcript wording."
      }
    }
  ]
}
```

### Rules

| Rule | Value |
|---|---|
| Sections | ≥ 1; `id` unique, kebab-case |
| `type: static` | requires `visual {type, file, prompt}`; no `script` |
| `type: dynamic` | requires `script {scriptId, file, spec}`; `code` optional; no `visual` |
| `audio` | required for **every** section (`file`, `text` non-empty) |
| File names | basename only (no `/` or `..`); image/JS names chosen by the author, audio files follow `NN_<sectionId>.wav` |
| Timestamps | **forbidden** — no `startMs`, `endMs`, `duration` anywhere |
| Asset existence | never referenced — draft validates with all folders empty |

### Validation (pipeline `validate_draft`)

Errors block draft acceptance; warnings do not:
- errors: schema mismatch, duplicate/invalid ids, missing required blocks,
  empty transcript/audio text, unsafe file names, presence of timestamps
- warnings: audio file name not `NN_<id>.wav`, image prompt shorter than
  20 chars, `scriptId` not a valid JS identifier

---

## 2. Gap detection (`check_assets`)

For each section the expected path is derived purely from the draft:

| Kind | Expected path |
|---|---|
| image | `draft/assets/image/<visual.file>` |
| js | `draft/assets/js/<script.file>` |
| audio | `draft/assets/audio/<audio.file>` |

Output: per-section present/missing per kind + totals. This table is what
the chat wizard shows before asking "generate them for you?".

---

## 3. `final/assets/driving-data.json` (realization)

```jsonc
{
  "metadata": {
    "audioUrl": "master-audio.mp3",     // relative to final/assets/
    "totalDuration": 277.219,           // seconds
    "leadInMs": 500,
    "sentencePauseMs": 250,
    "sectionPauseMs": 600,
    "generatedAt": "…"
  },
  "sections": [
    {
      "id": "section-1-the-dream",
      "type": "static",
      "startMs": 500,                   // computed from real audio
      "endMs": 51186,
      "transcript": [
        { "id": "t1_1", "text": "…", "startMs": 500, "endMs": 12075 }
      ],
      "visual": { "type": "image", "url": "image/section-1-the-dream.jpg" },
      "audioUrl": "audio/01_section-1-the-dream.wav"
    },
    {
      "id": "section-2-power-problem",
      "type": "dynamic",
      "startMs": 51786, "endMs": 85193,
      "transcript": [ … ],
      "scriptId": "PowerMathAnim",
      "scriptUrl": "js/PowerMathAnim.js",
      "audioUrl": "audio/02_section-2-power-problem.wav"
    }
  ]
}
```

### Field mapping

| draft-v1 | driving-data.json |
|---|---|
| `sections[].id / type / transcript[]` | same (+ ids `t<secIdx>_<sentIdx>`) |
| *(nothing)* | `startMs`, `endMs` per section and sentence — computed from stitched audio |
| `visual.file` | `visual.url = "image/" + file` |
| `script.scriptId / script.file` | `scriptId` / `scriptUrl = "js/" + file` |
| `audio.file` | `audioUrl = "audio/" + file` |
| *(nothing)* | `metadata.*` (pauses, total, audio file) |

### Timing model

```
t = leadInMs                                   // silence
for each section:
  sectionStart = t
  split section audio into |transcript| pieces proportional to text length
  for each sentence: start=t; t+=piece; end=t; t+=sentencePauseMs (except last)
  sectionEnd = t
  t += sectionPauseMs                          // except after the last section
```
Invariants: sentence starts chain exactly (`prev.end + sentencePauseMs`),
section start = prev section end + sectionPauseMs, last section end =
`totalDuration*1000` (± encoder padding), all boundaries monotonic.

---

## 4. Folder state machine

```
input/blog.txt  ──create_draft──►  draft/draft.json
                                      │
             check_assets (gaps)  ◄───┤
                 │                    │
   ┌─────────────┼──────────────┐     │
   ▼             ▼              ▼     │
image/         audio/          js/  ◄─┘  ensure_* (only gaps, ask first in chat)
   └─────────────┴──────────────┘
                    │
              assemble_final ──► final/assets/{driving-data.json, master-audio.*,
                    │                       image/, js/, audio/, frontend}
                    ▼
               archive ──► out/<n>/   (then input/, draft/, final/ are cleared)
```

Resumability: any step can be re-run; existing files are skipped unless
`--force`. `draft/chat_state.json` records the wizard's answers and the last
completed step so the chat app can resume.
