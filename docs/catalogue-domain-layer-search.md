# Catalogue domain layer search

The catalogue's **Слои / Layer search** mode reads the current composite index and applies Semantic Search v3's `buildEffectiveQuery` instruction-slot semantics to the query embedding. It does not call index builders, anchor/axis builders, or the V3 anchoring bridge. Search therefore reflects the index revision currently on disk.

Layer labels, A/B/C query templates, Top-K hints, and key-ID prefixes live in `src/lib/am-parameters-catalogue/domain-layer-config.ts`. `domain_layer` is a published parameter field and is preserved by the shared TypeScript and Python allowlists. A later explicit composite-index rebuild can include it in retrieval text; tagging never starts that job automatically.

Regex classification follows a nine-layer first-match order: compositional, vocal, spatial, temporal, dynamics, spectral DSP, synthesis physics, modulation/performance, then generative chaos. This protects specific vocal/spatial names from broad chaos tokens. System/UI/metrics namespaces are excluded. Regex updates and search-result selections create ordinary catalogue queue updates. They are persisted only by the existing queue commit flow, which makes a backup and marks indexes dirty.

The current weighted score for a selected layer is `1.5 * regex_match + similarity + 0.3 * key_id_prefix_hits`. It is a per-layer evidence score, not a cross-layer winner: cross-layer comparison requires searches for each layer against the same index revision. C retains the supplied core query and is presented as a broad boundary check; regex overrides are shown in the table. A mode-weight preset is omitted until authoritative weights are supplied.

## Future RAG reference only

Generative modes: `VOCAL_ALLOCATION_MATRIX`, `EXPERIMENTAL_STOCHASTIC`, `AMBIENT_SPATIAL`, `PHYSICAL_RESONANCE`, `RHYTHMIC_ENTRAINMENT`, `SPECTRAL_DESTRUCTION`, `COMPOSITIONAL_ARCHITECT`, `DYNAMIC_DENSITY_MAX`, `NEURAL_EXPRESSION`, `GRANULAR_MICROSTRUCTURE`, `PSYCHOACOUSTIC_HYPNOSIS`, `SUB_KINETIC_DRIVE`, `GLOSSOLALIA_COLLAPSE`, `FULL_VECTOR_INTEGRATION`, `STRICT_CANONICAL`.

Conceptual stages: sanitize → weights → embed → parallel layer retrieve → dedupe → in-memory centroid over retrieved vectors → global consensus retrieve → entropy balance → vocal meta tags → serialize. Retrieval stages query existing indexes. Centroid calculation is in-memory only. These modes and stages are documentation, not implemented runtime behavior.
