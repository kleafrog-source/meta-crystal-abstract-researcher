# AM-Stage Gemma value-pass banks and macros

## Bank contract

- `text.qwen.resolved`: Qwen retrieval plus its existing value anchoring.
- `text.gemma.awtd`: EmbeddingGemma 2 parameter identities with catalogue defaults.
- `text.gemma.resolved`: an explicit value pass over the Gemma AWTD names; the identity rows remain in the AWTD bank.
- `audio.gemma.awtd`: Gemma audio identities, merged by best similarity per parameter. Each retained hit records the chunk window that won.
- `audio.gemma.resolved`: explicit value pass over the audio AWTD names.
- `audio.clap.resolved` and `spec.siglip.resolved`: existing segment-level value banks.

The Gemma banks are stored independently in `am_stage_session_v1`; old snapshots remain readable. Gemma vectors are never ranked or averaged with Qwen vectors. For the Gemma value pass, the existing Qwen anchor/value path is restricted to the already selected Gemma technical names and all those names are eligible for anchoring. This uses Qwen only to resolve values; it does not replace Gemma identities or append new names. If the anchor path is unavailable or omits a name, the catalogue default is used.

For audio, value priority is: **CLAP value from an exactly matching chunk window → Qwen value anchors → catalogue default**. Window matching requires offset within 50 ms and duration within 100 ms. Nonmatching CLAP values are not borrowed across segments. The Gemma chunk that supplied each best-similarity identity is retained so this rule still works after session save and restore.

## Macro runner

Stock profiles are `full_core`, `text_gemma`, `audio_core`, and `gemma_audio_then_resolve`; `custom` stores an ordered list of bank fills in the session snapshot. `full_core` runs Gemma text AWTD, optional Gemma text resolution, CLAP, SigLIP2, and optionally Server Stage-2. `audio_core` runs CLAP then SigLIP2. `gemma_audio_then_resolve` runs chunked Gemma audio retrieval then its value pass. The queue awaits each explicit operation before starting the next, so the existing single-model slot remains the serialization boundary. Cancel aborts the active request where supported and prevents the next queued step from starting; a server-side resolver already in progress may finish and release its slot.

The header percentage and checklist use only the selected profile. Empty inputs produce 0%; completion reaches 100% when the selected profile's result banks are populated. Optional side metadata is not counted unless a later profile explicitly asks for it. The load note is a rough `segments × max(Top-K) × 2` estimate, not a memory measurement.

No Gemma audio, CLAP, SigLIP2, Qwen, or EmbeddingGemma model is loaded by the macro panel while idle. `spec.gemma.*` remains outside this change; spectrogram-to-Gemma search can display a result but is not mislabeled into the audio bank.
