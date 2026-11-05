# AM-Stage automation presets

The Automation panel now offers eight built-in start/goal presets and a browser-wide custom-chain library. Custom chains are stored in `localStorage` under `am-stage-automation-library-v1`; they survive reloads and can be created, renamed, duplicated, deleted, and reordered. This persistence is per browser profile and origin.

Before running a selected chain, the panel shows the session audio, Brief, analysis nodes, required index artifacts, and Settings capability states. Index state is refreshed only by **Check indexes**. That action calls the read-only Service Bay audit endpoint; Automation never rebuilds an index. Stale or missing artifacts link to Service Bay, and disabled capabilities link to Settings.

Implemented presets:

- `multi-source-stage2` — Qwen text, CLAP, SigLIP2, server Stage-2.
- `gemma-full-values` — Gemma text and session-audio value resolution.
- `whole-track-gemma` — session audio searched as sequential WAV chunks capped at 20 seconds.
- `vocal-focused` — retrieval with the Vocal Morphology layer mask.
- `instrument-focused` — retrieval with the Vocal Morphology layer excluded.
- `bounded-beat-segments` — prepares beat-aligned windows when Stage 7 events exist and targets at most 15 nodes; it blocks if preparation cannot meet the bound.

Partially wired goals stay visible and disabled rather than reporting false success:

- `two-cycle-stage2` is unavailable until the runner can retain independent outputs for each retrieval cycle.
- `priority-timeline-export` is unavailable until Priority Timeline export is exposed as an automation step.

With neither audio nor Brief, the UI asks the operator to load audio or enter a Brief. Brief-only custom chains can use text retrieval and server Stage-2 without an audio prerequisite; audio-only chains use the existing CLAP, SigLIP2, or Gemma audio steps.
