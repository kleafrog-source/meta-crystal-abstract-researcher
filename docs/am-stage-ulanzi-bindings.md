# AM-Stage hotkeys for Ulanzi Creative Deck

Ulanzi path for this sprint: **Multi Action → System Hotkey**. No plugin API or fader bridge is required or claimed. Each chord is handled only while keyboard focus is inside `[data-am-stage]`; voice append/replace and Search Brief are also allowed while their query textarea is focused. Other editable fields suppress shortcuts. The implementation uses physical `KeyboardEvent.code` keys so the Latin key mapping does not change with the active keyboard layout.

| Action | Hotkey | UI control / `data-am-stage-action` | Notes |
| --- | --- | --- | --- |
| CLAP start | `Ctrl+Alt+Shift+C` | `clap-start` | Starts a fresh run when enabled. |
| Stop current batch | `Ctrl+Alt+Shift+X` | `analysis-stop` | One shared stop control for the currently running CLAP or SigLIP2 job. |
| CLAP continue | `Ctrl+Alt+Shift+R` | `clap-continue` | Uses existing Continue button and its eligibility checks. |
| SigLIP2 start | `Ctrl+Alt+Shift+S` | `siglip2-start` | Existing readiness and disabled checks apply. |
| SigLIP2 continue | `Ctrl+Alt+Shift+T` | `siglip2-continue` | Uses existing Continue button and its eligibility checks. |
| Priority Timeline export | `Ctrl+Alt+Shift+P` | `export-priority-timeline` | Downloads through the existing export handler. |
| Legacy timeline export | `Ctrl+Alt+Shift+L` | `export-legacy-timeline` | Downloads through the existing export handler. |
| Voice append / stop | `Ctrl+Alt+Shift+V` | `voice-append` | Starts or stops the existing microphone append handler; works while the Brief textarea has focus. |
| Voice replace / stop | `Ctrl+Alt+Shift+W` | `voice-replace` | Starts or stops the existing microphone replace handler; works while the Brief textarea has focus. |
| Search Brief | `Ctrl+Alt+Shift+B` | `search-a` | Opens parent disclosures and clicks the existing Search button; no-op if its query is empty or search is busy. |
| Apply test preset | `Ctrl+Alt+Shift+Q` | `test-preset` | Invokes the existing preset control; its busy guard remains active. |

For action hotkeys, the handler reveals enclosing native `<details>` sections and clicks the existing button. The `X` shortcut always stops the currently active job; CLAP/SigLIP2 do not have separate stop handlers. Voice chords click the existing append/replace control; while recording, either voice button stops the current recording through the shared handler. The browser may request microphone permission on first use.

## Stable DOM selectors

- Root: `[data-am-stage]`.
- Zones: `[data-am-stage-zone="top-row"]`, `query-a`/`query-b`, `macro-exports`, `node-seek`, `media`, `timeline`, `timeline-chart`, `cross-modal-interpolation`, `modality-banks`.
- Disclosures: `semantic-search`, `analysis-controls`, `macro-text`/`macro-audio`, `bank-clap`, `bank-siglip2`, `bank-text`.
- Actions: implemented action selectors are listed in the table, plus `macro-generate-text` / `macro-generate-audio`, and layer/timeline view toggles.
- Layers: `[data-am-stage-layer="<canonical-layer-id>"]`.
- Parameters: `[data-am-stage-parameter="<technical_name>"]` with `data-am-stage-control`; compact Range inputs also expose `data-am-stage-fader`.

Example target for Ulanzi/browser tooling:

```js
document.querySelector('[data-am-stage-action="clap-start"]')
```

Parameter selectors are discoverability hooks only. **Faders and continuous parameter writes are out of scope.** No supported Ulanzi-to-browser bridge or AM-Stage parameter-write API was found. The installed `ustudio-cli` hook reports AI tool state to a device and does not expose browser actions. No physical button mapping or connected hardware behavior is claimed; the operator can bind the chords above in Ulanzi Studio.

## QA record

- `pnpm exec tsc --noEmit`: passed (exit code 0).
- `/am-stage`: HTTP 200.
- Computer Use verified the selected Edge window `6754596` at responsive widths 400, 768 and 2048 CSS px. The 400px Search/control-row overflow was fixed and visually rechecked; tablet and desktop controls, mask, media area and side panels remained reachable without horizontal overflow.
- Shortcut execution via `sky.press_key` was inconclusive: Edge kept the address bar as its reported focus despite a page click, so no shortcut runtime success is claimed. Source inspection confirms both voice action selectors are rendered by `SpeechInputButtons` and the shortcuts call those same buttons.
- During the consensus/title/bridge task, Computer Use reported Edge window metadata but returned a screenshot from another browser/app. New controls were therefore not visually verified in that session.
- No audio analysis, microphone capture, model API or Ulanzi hardware was activated during QA.
