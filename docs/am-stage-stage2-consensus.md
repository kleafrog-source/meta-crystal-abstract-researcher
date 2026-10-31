# AM-Stage Stage-2, Blend, and Priority Timeline

Codebase audit for `TASK-am-stage-snapshot-reverse-query.md`.

## 1. Stage-2: client smoothing vs a second vector search

AM-Stage Stage-2 is client-side post-processing. `AMStagePage` derives
`consensusFrames` with `applyConsensusSmooth`, passing the already available
V3, CLAP, and SigLIP frames. `applyConsensusSmooth` filters and truncates each
input frame, computes per-parameter numeric centroids over those frames, and
blends current values toward the centroid. It does not call an API, calculate
a query embedding, or retrieve another Top-K. See
`src/components/pages/AMStagePage.tsx` (`consensusFrames`) and
`src/lib/am-stage-blend.ts` (`applyConsensusSmooth`).

A separate server route exists at `src/app/api/cross-modal/consensus/route.ts`
(`POST`). It fuses selected immutable Journal records with `buildConsensus`;
when requested, it can add one-hop knowledge-graph neighbors with a penalty.
That route reads the parameter union for metadata and uses `loadGraph`; it does
not run a second vector search or compute a Stage-1 centroid. It is not the
AM-Stage Stage-2 operation.

## 2. Client limitation

A parameter missing from every Stage-1 input frame cannot be introduced by
AM-Stage Stage-2. The function only maps over the original frames and only
changes numeric values for names present in its retrieved-value map. A missing
stability or phase-alignment parameter needs a separate retrieval stage to
become a Stage-2 result.

## 3. Priority Timeline JSON

The writer is `buildPriorityTimeline` in
`src/lib/audio-segment-timeline.ts`. With Blend enabled, it writes
`blended_registry` and each timeline node stores indexed value pairs under
`blended`; with Blend disabled it writes `clap_registry` and `siglip_registry`
and nodes store independent `clap` / `siglip` pairs. In either case `events`
come from `stemEvents`. The event stream now receives the same CLAP blend
weight; before this change it silently used the default 50/50 weight even when
the timeline used a custom weight. The writer does not add
`GLOBAL_CONSENSUS_LAYER`, a Stage-2 flag, or Stage-2-smoothed values. The page
calls it with raw/node segments and the Blend weight in
`AMStagePage.exportTimeline`.

## 4. Roadmap status

The code supports a working client-side smoothing preview today. The UI labels
it as a post-process of retrieved frames, not a corpus layer or a new index.
The codebase does not implement an AM-Stage server-side second retrieval pass
for coherence anchors. Treat server Stage-2 retrieval as a follow-up feature,
not as an existing path or a completed guarantee; no TODO by itself establishes
that roadmap commitment.

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
