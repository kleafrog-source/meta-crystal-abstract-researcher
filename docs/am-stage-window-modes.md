# AM-Stage analysis window modes

AM-Stage and Audio-to-Parameter offer three ways to place analysis windows. **Uniform grid** remains the default and preserves the existing raw-sampling behavior. **Beat aligned** places each node at a Stage 7 beat. **Transient / onset aligned** places each node at a Stage 7 onset.

For beat and onset modes, a window keeps the configured segment duration and is centered on its event when possible. Its edges are clamped to the selected analysis range. Events are sorted and merged with a fixed **0.5 second minimum node gap**; the earliest event in each close group is retained. The current analysis time gate is respected in AM-Stage, and Audio-to-Parameter uses the full track.

The modes reuse `beat_times_seconds` and `onset_times_seconds` already present in Stage 7 side metadata. When the selected range is not covered, a single batch request loads that range and runs the same Stage 7 librosa beat/onset functions over chunks no longer than 30 seconds. This rhythm-only pass skips unrelated spectral and formant calculations. Source event windows are cached in the AM-Stage session so changing modes does not repeat extraction. Existing full Stage 7 segment metadata also satisfies the cache.

Selecting any mode regenerates the node list. A new list starts with pending CLAP/SigLIP results, so Continue processes only the current nodes and cannot reuse results at obsolete uniform-grid indices. Timeline markers, playback seeks, analysis requests, and Priority Timeline exports all use the regenerated node times. Existing saved sessions without a `window_mode` restore as Uniform.

There is no user override for the 0.5 second floor. Beat/onset mode can produce no nodes when Stage 7 finds no events in the selected range; in that case the current node list is retained and the UI reports the empty result.
