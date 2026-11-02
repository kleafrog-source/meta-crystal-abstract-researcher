# AM-Stage Stage-2, Blend, and Priority Timeline

Codebase audit for `TASK-am-stage-snapshot-reverse-query.md`.

## 1. Stage-2 paths

**Client Stage-2 smoothing** remains client-side post-processing. `AMStagePage` derives
`consensusFrames` with `applyConsensusSmooth`, passing the already available
V3, CLAP, and SigLIP frames. `applyConsensusSmooth` filters and truncates each
input frame, computes per-parameter numeric centroids over those frames, and
blends current values toward the centroid. It does not call an API, calculate
a query embedding, or retrieve another Top-K. See
`src/components/pages/AMStagePage.tsx` (`consensusFrames`) and
`src/lib/am-stage-blend.ts` (`applyConsensusSmooth`).

**Server Stage-2 retrieval** is a separate explicit action in the Layer Matrix.
It takes the current Stage-1 V3 hit names and scores, reads their vectors from
the selected Qwen3 or EmbeddingGemma 2 text index, and builds a similarity-
weighted centroid from up to 32 highest-scoring seeds. It searches that same
index for new names, excluding every Stage-1 name, then applies the normal V3
scope, selected-layer, and domain-first MMR handling. It uses stored vectors
and does not call an embedding model. The current implementation is text-only;
cross-modal Stage-3 trust does not apply to this single-modality query. The
route is `POST /api/rag-v3/stage2-retrieval`.

| Path | Retrieval | New names beyond Stage-1? | Trigger |
| --- | --- | --- | --- |
| Client Stage-2 smoothing | Existing V3/CLAP/SigLIP frames only | No | Local visibility toggle |
| Server Stage-2 retrieval | Second search in selected text index; excludes Stage-1 names | Yes | Explicit **Run retrieval** button |
| Journal consensus | Journal source records plus optional graph neighbors | Separate workflow | Journal action |

A separate Journal route exists at `src/app/api/cross-modal/consensus/route.ts`
(`POST`). It fuses selected immutable Journal records with `buildConsensus`;
when requested, it can add one-hop knowledge-graph neighbors with a penalty.
That route reads the parameter union for metadata and uses `loadGraph`; it does
not run the AM-Stage text-index second pass.

## 2. Provenance and client limitation

A parameter missing from every Stage-1 input frame cannot be introduced by the
client smoothing path. Only explicit server retrieval can introduce a new name.
Server hits remain in a distinct Stage-2 results list. The optional macro-output
checkbox adds them to the current macro projection without mutating or replacing
Stage-1 results. Priority Timeline JSON records them separately at
`server_stage2.results`, each marked `source: "stage2"`; they are not silently
inserted into audio-node frames or stored as `GLOBAL_CONSENSUS_LAYER`.

## 3. Priority Timeline JSON

The writer is `buildPriorityTimeline` in
`src/lib/audio-segment-timeline.ts`. With Blend enabled, it writes
`blended_registry` and each timeline node stores indexed value pairs under
`blended`; with Blend disabled it writes `clap_registry` and `siglip_registry`
and nodes store independent `clap` / `siglip` pairs. In either case `events`
come from `stemEvents`. The event stream now receives the same CLAP blend
weight; before this change it silently used the default 50/50 weight even when
the timeline used a custom weight. Client smoothing is not written to the
Priority Timeline. When server Stage-2 results exist, `AMStagePage.exportTimeline`
adds their names, scores, current values, selected index, query method, and
explicit source to the root `server_stage2` object. Node frames remain the
existing CLAP/SigLIP audio timeline contract. Stage-2 parameters retain their
catalogue acoustic layer; `GLOBAL_CONSENSUS_LAYER` remains UI-only.

## 4. Roadmap status

Both paths are implemented: client smoothing previews current frames; server
Stage-2 is an explicit second text-vector retrieval that can introduce new
parameter names. Server results are a separate collection, not a corpus shard
or a replacement for the client preview.

## 5. Blend CLAP & SigLIP and the interpolation bridge

The `Blend CLAP & SigLIP` toggle controls `macroParameters` and the Priority
Timeline export. When enabled, `blendParameterFrames` merges matching names,
normalizes scores independently within each modality, applies the CLAP/SigLIP
weight, interpolates numeric values, and picks the nearest source for discrete
values. With the toggle off, the macro output merges without score fusion.

The Cross-Modal Interpolation Bridge is independent: it uses `blendPair`,
`blendPercent`, and `blendCurve`, and computes a client preview without a model
rerun. Its CLAP↔SigLIP pair uses the visible modality frames; Tri-Modal Blend
first averages those frames and then interpolates against the text result.
Changing the Blend toggle does not change the bridge's selected pair or ratio.

Priority Timeline can therefore reflect Blend while the UI still shows separate
CLAP and SigLIP banks: the banks are intentionally modality-specific displays;
fusion is applied in macro/export projections. The existing Clean Macro Output
already exposes the fused set when enabled, so no new merged bank is necessary
for correctness. A future UX enhancement could label that output “Blended
CLAP + SigLIP” while Blend is active.
