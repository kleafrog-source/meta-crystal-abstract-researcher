# AM-Stage layer timeline

Implemented on `/am-stage` as the **By layer** timeline view. It projects the already-computed CLAP and SigLIP2 segment values plus numeric active TEXT brief parameters into the nine acoustic lanes defined by `src/lib/domain-layers.ts`. Explicit acoustic `domain_layer` values take precedence; otherwise the existing classifier is used, with unresolved legacy values retained in an Unclassified lane. `GLOBAL_CONSENSUS_LAYER` is excluded because it remains UI-only.

The graph keeps the shared audio time axis and playhead. A lane displays up to 12 series, ranked by normalized movement, and reports the displayed/total count. Switching timeline views only re-projects client-side data and does not start another model run. The layer mask remains a retrieval-result filter and does not hide timeline lanes.
