# AM-Stage control bindings

This document describes the stable browser-side targets added for AM-Stage and the optional page-scoped keyboard shortcuts. It does not claim a physical Ulanzi device connection.

## Scope and behavior

The page root is `[data-am-stage]`. Shortcuts are accepted only while focus is inside that root and outside editable fields, selects, and comboboxes. The listener clicks the same enabled button rendered by the page, so normal React handlers and disabled-state rules remain authoritative.

| Chord | Stable action | Result |
| --- | --- | --- |
| `Ctrl+Alt+Shift+C` | `[data-am-stage-action="clap-start"]` | Start a fresh CLAP run |
| `Ctrl+Alt+Shift+X` | `[data-am-stage-action="analysis-stop"]` | Request stop for the currently running batch |
| `Ctrl+Alt+Shift+S` | `[data-am-stage-action="siglip2-start"]` | Start a fresh SigLIP2 run |
| `Ctrl+Alt+Shift+P` | `[data-am-stage-action="export-priority-timeline"]` | Export the Priority Timeline |
| `Ctrl+Alt+Shift+L` | `[data-am-stage-action="export-legacy-timeline"]` | Export the legacy timeline |
| `Ctrl+Alt+Shift+V` | `[data-am-stage-action="voice-append"]` | Open Semantic Search if needed and focus the voice-append button; press Space/Enter to start recording |

Shortcuts intentionally do nothing while a text field is being edited. The voice shortcut focuses the control instead of starting microphone capture, preserving the browser's explicit user-gesture and permission flow. SigLIP2 availability and all button disabled states continue to follow the existing UI.

## DOM targets

Stable `data-am-stage-*` attributes identify the page, zones, collapsible sections, actions, acoustic-layer toggles, parameter cards and compact numeric controls:

- `data-am-stage-zone`: `top-row`, `query-a`/`query-b`, `macro-exports`, `node-seek`, `media`, `timeline`, `timeline-chart`, `modality-banks`.
- `data-am-stage-disclosure`: `semantic-search`, `analysis-controls`, the macro outputs, and `bank-clap` / `bank-siglip2` / `bank-text`.
- `data-am-stage-action`: named actions such as `clap-start`, `siglip2-start`, `analysis-stop`, `macro-generate-text` / `macro-generate-audio`, `export-priority-timeline`, `export-legacy-timeline`, `voice-append` and `voice-replace`.
- `data-am-stage-layer`: the canonical layer ID on each mask option, including the UI-only consensus option.
- `data-am-stage-parameter` and `data-am-stage-control`: a parameter's stable technical name and control kind. Compact Range inputs also expose `data-am-stage-fader` with that technical name.

For example, an integration can find the current CLAP start button with:

```js
document.querySelector('[data-am-stage-action="clap-start"]')
```

## Ulanzi bridge and fader status

No installed browser-to-AM-Stage bridge, Ulanzi action module, or parameter-write API was found in the project. Ulanzi Studio is installed, but the available bundled `ustudio-cli` hook is for reporting AI tool state to a device; it does not expose browser selectors or AM-Stage parameter controls. The model, firmware and action set for the user's deck are also not established. Therefore no physical button or fader mapping is claimed, and no fader write mechanism was added. The stable DOM identifiers and keyboard path are ready for a compatible bridge once one is identified.

## Validation status

- Source-level zone order, layer IDs/colors, action targets and key-handler reuse were reviewed.
- Keyboard actions were not fired in a browser; the key map and delegated button clicks were source-reviewed only.
- `http://localhost:3000/am-stage` returned HTTP 200 during implementation.
- The requested TypeScript check passed for the workspace (`pnpm exec tsc --noEmit`).
- Responsive visual checks at 390, 768 and 2K CSS pixels remain unverified. An isolated headless Edge launch was rejected by the local process-launch policy; no existing browser window was automated. The repaired MMSS contract records this limitation rather than treating static inspection as screenshot QA.
