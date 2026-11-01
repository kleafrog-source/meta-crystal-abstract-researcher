# In-session UI state persistence

The app shell keeps previously visited work modes mounted for the lifetime of the current browser tab. This preserves React state when navigating between routes without serializing large analysis objects or audio files.

## Covered modes

- Audio-to-Parameter, Audio CLAP RAG, AM-Stage, Morpho-Acoustic RAG
- AM-Core Engine, Combinatorial Genesis, Combinatorial Synthesis
- Parameter catalogue

This includes audio `File` references and object URLs, segment results/timelines, engine controls, search state held by the page, catalogue filters and selection, and synthesis drafts. The app shell creates a hidden, inaccessible wrapper for inactive visited pages.

## Lifetime and reset behavior

- State survives client-side navigation, including an intermediate visit to Settings.
- A full reload, closing the tab, or opening another tab starts a new in-memory session. Cross-restart persistence is intentionally not included.
- Existing page Reset and clear actions remain authoritative and clear the relevant state.
- The live microphone capture buffer is ephemeral and is not persisted. In-progress browser capture should be started again after leaving its owning mode.
- Server jobs continue to use their status APIs; mounted pages retain their existing polling and status refresh behavior.

## Resource note

Visited session modes remain mounted, so their component memory and any existing job-status polling remain active until the app shell is unloaded. The set is limited to the principal analysis, catalogue, and synthesis modes rather than every app page.
