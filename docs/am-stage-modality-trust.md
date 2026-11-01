# AM-Stage modality trust (Stage 3)

This is a client-side diagnostic and weighting layer over score lists and frames already retrieved by TEXT, CLAP, and SigLIP2. It makes no embedding, model, or server-search calls. Stage 2 remains client-side post-processing over retrieved data; `GLOBAL_CONSENSUS_LAYER` remains a post-process label and is not added to the corpus.

## Score-list trust

For finite similarities `s_i`, compute a stable softmax at temperature `T = 0.1`, then:

`trust = 1 - H(p) / ln(n)`, where `H(p) = -Σ p_i ln(p_i)`.

Trust is clamped to `[0, 1]`. Empty or entirely invalid lists return trust `0`; a one-result list returns `1` because dispersion cannot be estimated from one sample. AM-Stage displays TEXT, CLAP, and SigLIP2 trust for the current frame.

Defaults are low-trust threshold `0.20`, minimum weight multiplier `0.15`, and value-divergence threshold `0.35`. Below the threshold, modality multiplier is `floor + (1 - floor) × trust / threshold`; at or above it the multiplier is `1`. The configured baseline CLAP/SigLIP weights are multiplied by their trust multipliers and normalized. These controls are available in AM-Stage while blend or Stage-2 consensus is active and are stored in the session snapshot. Older snapshots use the defaults.

## Divergence and merge rule

For shared numeric Range parameters, divergence is `abs(a - b) / shared_declared_range`, clamped to `[0, 1]`. Discrete parameters use exact match (`0`) or mismatch (`1`). A CLAP/SigLIP pair above `0.35` is not numerically averaged: the value from the modality with the higher trust-adjusted weight is retained, with the configured baseline weight breaking exact ties. For Stage-2 centroid smoothing, if any pair of already-ranked numeric values for a technical name exceeds the threshold, smoothing is skipped for that name across frames. Otherwise the peer centroid is trust-weighted, and the requested centroid percentage is multiplied by the mean trust multiplier of its contributing frames. Uniformly low-trust peers therefore reduce smoothing influence while retaining the configured floor.

When values agree below the threshold, the existing configured blend and centroid behavior remains, with low-trust modalities contributing less. Clean, peaked score lists therefore retain the previous blend weights; flat score lists are attenuated relative to a more decisive modality.

Priority Timeline JSON includes `modality_trust` metadata: method, thresholds, per-segment CLAP/SigLIP2 trust, mean shared-value divergence, and names above the divergence threshold. AM-Stage exports its current TEXT trust alongside those segment metrics. No embeddings or source vectors are exported by this metadata.

## Validation scope

Fixture tests cover peaked versus flat scores, finite-safe weights, numeric/discrete divergence, trust-adjusted fusion, conflict handling, clean-list averaging, Stage-2 smoothing guard, and timeline metadata. These fixtures validate deterministic client logic; they do not calibrate the thresholds against a production audio corpus.
