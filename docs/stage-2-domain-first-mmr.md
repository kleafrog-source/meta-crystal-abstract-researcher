# Stage 2 — domain-first retrieval and MMR

## Request flow

- AM-Stage passes its current nine-layer selection from Semantic Search through the V3 store to POST /api/rag-v3/propose-parameters as domain_layers plus a data-driven domain_layer_weights map (selected = 1, unselected = 0).
- The Vocal Matrix path POST /api/vocal-allocation/search uses the same ranking implementation and restricts the candidate set to vocal-matrix parameters before the layer quota is applied.
- Direct searchV3 callers without a layer mask retain global retrieval; MMR still diversifies their ranked candidate pool.

Stored domain_layer values win. Missing legacy values use the existing classifyDomainLayer classifier. GLOBAL_CONSENSUS_LAYER remains UI-only and is not a stored corpus layer.

## Selection and diversity

For a strict, non-empty subset of layers, the candidate pool is filled from selected layers first, with a selected quota of round(Top-K × 0.7); the remaining results come from the outside/global pool by relevance. If the selected pool is too small, available global candidates fill the shortfall. An empty or all-nine mask skips the quota and uses the global candidate pool.

MMR uses λ = 0.7 from RAG_V3_CONFIG.mmrLambda. Relevance is normalized within each selection lane. Each next candidate maximizes λ × relevance − (1 − λ) × max(0, cosine(candidate, already selected)). Stage 1's normalized composite vectors provide the novelty cosine. The final Top-K is unchanged. The mask becomes data-driven weights with a neutral default of 1.0; current on/off selection supplies 1/0 values. Future dynamic presets can multiply these weights without a new search stack.

The response includes domain_retrieval diagnostics: selected-layer candidate counts, target and returned counts, global-fill count, and selected shortfall. This makes sparse layers visible to callers without inventing corpus assignments. Results from the global-fill lane carry retrieval_group=global_fill so AM-Stage can display the requested spillover despite its layer filter.

## Checks

    node_modules/.bin/vitest run src/lib/rag-v3/domain-mmr.test.ts
    node_modules/.bin/tsc --noEmit --pretty false
    git diff --check

The fixture covers 70/30 selection, shortage fallback, mask-empty/all behavior, layer weights, and reduction of near-duplicate technical-name clusters.
