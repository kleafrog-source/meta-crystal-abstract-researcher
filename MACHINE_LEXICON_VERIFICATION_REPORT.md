# Machine Lexicon Verification Report

**Generated:** 2026-08-08  
**Task:** TASK-SWE-1_6-VERIFY-AND-FREEZE-MACHINE-LEXICON  
**Status:** ✅ Complete

---

## Executive Summary

Machine layer of meta-lexicon has been successfully extracted, validated, and frozen. All 197 entries pass validation with no runtime code changes. The lexicon accurately reflects the runtime generator parameters accessible through UI and sidecar.

**Key Achievement:** 197 runtime entries extracted and validated with explicit limit_status tracking, ready for semantic enrichment phase.

---

## Audit Results

### Directory Structure
✅ All required directories exist and are properly structured:
- `python_engine/lexicon/schema/` - 8 JSON Schemas
- `python_engine/lexicon/machine/` - 4 machine layer files
- `python_engine/lexicon/semantic/` - Empty (ready for future)
- `python_engine/lexicon/relations/` - Empty (ready for future)
- `python_engine/lexicon/templates/` - 6 entry templates
- `python_engine/lexicon/scripts/` - 4 utility scripts
- `python_engine/lexicon/reports/` - 5 reports
- `data/meta_lexicon/validated/` - Built validated lexicon
- `data/meta_lexicon/snapshots/` - Snapshot created

### Files Changed
Only lexicon-related files were modified:
- `python_engine/lexicon/schema/lexicon-entry.schema.json` - Added limit_status field
- `python_engine/lexicon/scripts/extract_runtime_lexicon.py` - Fixed pattern extraction, added limit_status, fixed ID format
- `python_engine/lexicon/machine/*.json` - Regenerated machine layer
- `python_engine/lexicon/reports/*.json` - Generated reports
- `python_engine/lexicon/scripts/generate_unverified_limits_report.py` - New script

**No runtime code changes:** ✅ Confirmed via git diff

---

## Extraction Results

### Runtime Chain Verified
Confirmed runtime chain from UI to Python generator:
```
src/components/pages/Generation.tsx
  ↓ (handleStart → POST /api/generate/start)
src/app/api/generate/start/route.ts
  ↓ (runSidecar with command "generate")
src/lib/engine/runner.ts
  ↓ (spawn python_engine/sidecar.py)
python_engine/sidecar.py
  ↓ (cmd_generate → _build_config_from_profile)
python_engine/metacrystal_engine_v7.py
  ↓ (MetaEngine.evolve_with_saving)
data/meta_crystals/crystals/
```

### Entries Extracted

| Entity Type | Count | Source | Status |
|-------------|-------|--------|--------|
| Generation Parameters | 10 | profile-presets.ts, EngineConfig | ✅ Extracted |
| Domain Flags | 76 | EngineConfig.flags | ✅ Extracted |
| Structural Patterns | 103 | STRUCTURAL_PATTERNS | ✅ Extracted |
| Metrics | 8 | METRIC_KEYS | ✅ Extracted |
| **Total** | **197** | - | ✅ Complete |

### Generation Parameters (10)
All extracted from `profile-presets.ts` DEFAULT_PROFILE.params:
1. `generation.generations` - Number of generations (default: 2)
2. `generation.batch` - Batch size (default: 100)
3. `generation.top` - Top crystals to save (default: 3)
4. `generation.max_depth` - Maximum depth (default: 7)
5. `generation.max_elements` - Maximum elements (default: 12)
6. `generation.use_irrational` - Use irrational numbers (default: true)
7. `generation.use_imaginary` - Use imaginary numbers (default: true)
8. `generation.use_infinity` - Use infinity (default: true)
9. `generation.invert_probability` - Invert probability (default: 0.4)
10. `generation.psychology_probability` - Psychology probability (default: 0.6)

### Domain Flags (76)
All extracted from `EngineConfig.flags` in metacrystal_engine_v7.py:
- Basic: enable_linguistics, enable_morpheme_generation, enable_linguistic_principles, enable_quantum, enable_fractal, enable_psychology, enable_metrics, enable_auto_correction, enable_learning, enable_saving, enable_cataloging
- Operators: enable_derivative_first, enable_derivative_second
- v7.0 domains: enable_eqgft, enable_ethical_archon, enable_bell_nonlocality, enable_context_weaver, enable_garden_between, enable_meta_fractal_craft, enable_json_prompt, enable_quantum_geometry, enable_research, enable_fair_division
- Math/Algebra: enable_category_theory, enable_algebra, enable_knot_theory, enable_number_theory, enable_measure_probability, enable_graph_combinatorics, enable_optimization
- Physics: enable_thermodynamics, enable_stat_mechanics, enable_relativity, enable_string_theory, enable_cosmology, enable_qft, enable_condensed_matter
- CS: enable_complexity, enable_cryptography, enable_automata, enable_neural_nets, enable_evolutionary, enable_cybernetics
- Linguistics: enable_semiotics, enable_phonology_typology, enable_writing_systems
- Cognitive: enable_jungian, enable_cognitive_bias, enable_consciousness, enable_mindfulness, enable_neuroscience
- Philosophy: enable_philosophy, enable_eastern_phil, enable_hermeticism, enable_process_phil
- Esoteric: enable_alchemy, enable_kabbalah, enable_iching, enable_tarot, enable_sacred_geometry, enable_vedic
- Systems/Biology: enable_systems_ecology, enable_permaculture, enable_biomimicry, enable_chaos_dynamics, enable_network_science
- Art/Architecture: enable_music_art, enable_architecture
- Game Theory: enable_game_theory, enable_decision_theory
- Advanced: enable_holographic, enable_morphic_resonance, enable_orch_or, enable_simulation_hyp, enable_quantum_info, enable_metaprinciples

### Structural Patterns (103)
Extracted from `STRUCTURAL_PATTERNS` list in metacrystal_engine_v7.py:
- Basic patterns: линейный, степенной, вложенный_прост, многомерный, парадоксальный
- Dynamic patterns: динамический, голографический, петлевой, фрактальный, квантовый
- Recursive patterns: рекурсивный, каскадный, спиральный, циклический, симметричный
- Complex patterns: иерархический, топологический, гибридный, резонансный, трансцендентный
- Linguistic patterns: семантический_каскад, лингвистический_принцип, двойные_предлоги
- Quantum patterns: квантово-фрактальный, MMSS-квантовый_стек, геометрическая_динамика, фибровый_каскад
- Research patterns: исследовательский_протокол, научный_порыв
- Fair division patterns: справедливый_дележ, аллокационный_каскад
- EQGFT patterns: роторный_каскад, zitter_генерация, топологическая_квантация
- JSON prompt patterns: json_каскад, промпт_анимация
- And 70+ more patterns from the full STRUCTURAL_PATTERNS list

### Metrics (8)
Extracted from `METRIC_KEYS` in profile-presets.ts:
- V, S, N, D_f, G_S (influencing metrics)
- QEC, CHSH, C_val (observational metrics)

---

## Provenance Verification

### Runtime Provenance Confirmed
All entries have complete provenance tracking:
- **source_files:** Paths to source files (metacrystal_engine_v7.py, profile-presets.ts, sidecar.py, Generation.tsx)
- **source_symbols:** Class/function names (EngineConfig, STRUCTURAL_PATTERNS, METRIC_KEYS)
- **ui_component:** ProfileConfigurator for UI-accessible entries
- **frontend_field:** params, flags, disabled_patterns, metrics
- **api_field:** params, flags, disabled_patterns, metrics
- **sidecar_field:** params, flags, disabled_patterns, metrics
- **python_field:** cfg, cfg.flags, patterns, metric_influencing, metric_observational
- **extraction_method:** config (all entries extracted via config parsing)

### UI Accessibility
- **Runtime-used:** 197/197 entries (100%)
- **UI-accessible:** 197/197 entries (100%)

### Verification Status
- **verified_in_runtime:** 197/197 entries (100%)
- **verified_in_ui:** 197/197 entries (100%)
- **verified_in_sidecar:** 197/197 entries (100%)

---

## Technical Field Verification

### ID Format
✅ All IDs follow correct format: `namespace.name`
- Generation parameters: `generation.{param_name}`
- Domain flags: `domain.{flag_name}`
- Structural patterns: `pattern.{pattern_name}`
- Metrics: `metric.{metric_name}`

### Entity Types
✅ All entity_types are valid and match namespace

### Types
✅ All types correctly inferred from default values:
- int: generations, batch, top, max_depth, max_elements
- bool: use_irrational, use_imaginary, use_infinity, all domain flags
- float: invert_probability, psychology_probability
- string: structural patterns, metrics

### Default Values
✅ All default_values match runtime source code

### Allowed Values
✅ Empty for all entries (no enum constraints found in code)

### Ranges
✅ No min_value or max_value found in code (correctly set to null)

### Limit Status
✅ Explicit limit_status added to all entries:
- **not_found_in_code:** 10 generation parameters
- **unknown:** 187 other entries (domains, patterns, metrics)

**Note:** No hard limits found in runtime code. User warning values were not converted to hard limits.

---

## Validation Results

### Schema Validation
✅ All 197 entries pass JSON Schema validation

### ID Uniqueness
✅ No duplicate IDs (within files or cross-file)

### Entity Type Validation
✅ All entity_types are valid

### Namespace Validation
✅ All namespaces match entity_types

### Type Consistency
✅ All types consistent with default values

### Range Consistency
✅ No range conflicts (all ranges are null)

### Provenance Validation
✅ All runtime-used entries have provenance

### Relation References
✅ No unresolved relations (relations layer is empty)

### Machine/Semantic Separation
✅ Machine layer contains only technical facts
✅ Semantic layer is empty (ready for future)

### Summary
- **Total files validated:** 4
- **Valid files:** 4
- **Invalid files:** 0
- **Total entries:** 197
- **Valid entries:** 197
- **Invalid entries:** 0

---

## Build Results

### Build Status
✅ Successfully built validated lexicon

### Output
- **Validated directory:** `data/meta_lexicon/validated/`
- **Snapshot created:** `lexicon_snapshot_20260808_051733`
- **Total entries built:** 197

### Build Summary
- **Machine layer:** 197 entries (10 params, 76 domains, 103 patterns, 8 metrics)
- **Semantic layer:** 0 entries (empty, ready for future)
- **Relations:** 0 entries (empty, ready for future)

---

## Unverified Limits Report

### Summary
- **Total entries checked:** 197
- **Unverified entries:** 197
- **Verified entries:** 0

### Limit Status Breakdown
- **not_found_in_code:** 10 (generation parameters)
- **unknown:** 187 (domains, patterns, metrics)

### By Entity Type
- **generation_parameter:** 10 unverified (all not_found_in_code)
- **domain:** 76 unverified (all unknown)
- **structural_pattern:** 103 unverified (all unknown)
- **metric:** 8 unverified (all unknown)

### Interpretation
No hard limits were found in the runtime code. All limits are marked as unverified, which is correct for this phase. Future manual review can verify limits through testing or code analysis.

---

## Missing Descriptions Report

### Summary
- **Total entries:** 197
- **Entries without descriptions:** 197
- **Entries with descriptions:** 0

### By Entity Type
- **generation_parameter:** 10 missing descriptions
- **domain:** 76 missing descriptions
- **structural_pattern:** 103 missing descriptions
- **metric:** 8 missing descriptions

### Status
✅ Expected for this phase. Semantic layer is ready for future enrichment by LLM or manual editing.

---

## Runtime Code Changes Verification

### Git Diff Results
✅ No changes to runtime source files:
- `python_engine/metacrystal_engine_v7.py` - No changes
- `python_engine/sidecar.py` - No changes
- `src/components/pages/Generation.tsx` - No changes
- `src/app/api/generate/start/route.ts` - No changes
- `src/lib/engine/runner.ts` - No changes

### Changed Files (Lexicon Only)
- `python_engine/lexicon/schema/lexicon-entry.schema.json` - Added limit_status field
- `python_engine/lexicon/scripts/extract_runtime_lexicon.py` - Fixed extraction logic
- `python_engine/lexicon/machine/*.json` - Regenerated machine layer
- `python_engine/lexicon/reports/*.json` - Generated reports
- `python_engine/lexicon/scripts/generate_unverified_limits_report.py` - New script

### Confirmation
✅ Runtime generator behavior unchanged
✅ Generator imports unchanged
✅ API routes unchanged
✅ UI components unchanged

---

## Reports Generated

### 1. runtime-provenance.json
- Extraction timestamp
- Source files used
- Extraction summary by entity type
- Runtime chain documentation

### 2. missing-descriptions.json
- List of entries without semantic descriptions
- Count by entity type
- Total missing count

### 3. validation-report.json
- File-by-file validation results
- Cross-file duplicate IDs
- Unresolved relation references
- Entry-level errors

### 4. build-report.json
- Build timestamp
- Snapshot information
- Machine vs semantic layer statistics
- Total entries built

### 5. unverified-limits.json
- Entries without verified limits
- Limit status breakdown
- Categorization by entity type

---

## What Was Fixed

### 1. Pattern Extraction Regex
**Issue:** Initial regex extracted dictionary keys ("name", "template", "complexity") as pattern names  
**Fix:** Changed regex to match `{"name": "pattern_name"}` pattern specifically  
**Result:** Correctly extracted 103 pattern names instead of 23

### 2. Parameter ID Format
**Issue:** Parameter IDs used `param.{name}` instead of `generation.{name}`  
**Fix:** Changed ID format to match namespace  
**Result:** All IDs now pass validation

### 3. Limit Status Field
**Issue:** No explicit limit tracking  
**Fix:** Added `limit_status` field to schema and extractor  
**Result:** All entries have explicit limit_status (not_found_in_code or unknown)

---

## Machine/Semantic Separation

### Machine Layer (python_engine/lexicon/machine/)
✅ Contains only technical facts:
- Names, types, defaults
- Provenance information
- Runtime usage flags
- UI accessibility flags
- Limit status

✅ Does NOT contain:
- Manual descriptions
- Invented synonyms
- Inferred compatibility
- Embedding vectors
- LLM assumptions

### Semantic Layer (python_engine/lexicon/semantic/)
✅ Empty (ready for future)
- Will contain display_name, description, synonyms, query_phrases
- Will be filled by LLM or manual editing
- Will not modify machine facts

### Relations Layer (python_engine/lexicon/relations/)
✅ Empty (ready for future)
- Will contain confirmed compatibility/conflict relations
- Requires manual verification
- No auto-generated relations

---

## Ready for Next Phase

### ✅ Completed
- Machine layer extraction and validation
- Runtime provenance tracking
- Schema validation
- Build process
- Snapshot creation
- All required reports

### ⏳ Ready for Semantic Enrichment
- Semantic layer structure in place
- Templates available
- Machine facts frozen
- No runtime changes to conflict

### ⏳ Future Work
- Add human-readable descriptions manually
- Connect DeepSeek for auto-description
- Use BGE-M3 for embedding generation
- Build vector index for retrieval
- Add natural language query interface

---

## Issues Requiring Manual Resolution

### 1. Limit Verification
**Issue:** No hard limits found in runtime code  
**Action needed:** Manual code review or testing to verify actual limits  
**Priority:** Medium (not blocking semantic enrichment)

### 2. Operator and Invariant Entries
**Issue:** Operators and invariants not extracted (not confirmed in runtime source)  
**Action needed:** Manual review of generator code to confirm if operators/invariants should be included  
**Priority:** Low (not currently used in UI)

### 3. Semantic Descriptions
**Issue:** All 197 entries lack semantic descriptions  
**Action needed:** Manual editing or LLM-assisted description generation  
**Priority:** High (next phase)

---

## Acceptance Criteria Met

✅ For each record, clear whether machine fact or semantic description  
✅ All runtime parameters have provenance  
✅ Structure convenient for DeepSeek/manual filling  
✅ Lexicon can be validated with one command  
✅ Unknown/unresolved entries not hidden  
✅ Storage layer does not affect runtime  
✅ No second source of truth for generator config  
✅ No invented ranges, defaults, relations, or embeddings  
✅ Main application and generator continue working unchanged  
✅ Explicit limit_status added to generation parameters  
✅ No user warning values converted to hard limits  
✅ Runtime code unchanged (verified via git diff)  
✅ Validated output created successfully  
✅ All required reports generated  

---

## Commands Used

### Extraction
```bash
cd python_engine
python lexicon/scripts/extract_runtime_lexicon.py
```

### Validation
```bash
cd python_engine
python lexicon/scripts/validate_lexicon.py
```

### Build
```bash
cd python_engine
python lexicon/scripts/build_lexicon.py
```

### Unverified Limits Report
```bash
cd python_engine
python lexicon/scripts/generate_unverified_limits_report.py
```

---

## Conclusion

The machine layer of the meta-lexicon has been successfully verified and frozen. All 197 entries are extracted from runtime code, validated, and built into the validated directory. Runtime code remains unchanged. The lexicon is ready for the next phase of semantic enrichment.

**Total entries extracted:** 197  
**Total entries validated:** 197  
**Validation errors:** 0  
**Runtime code changes:** 0  
**Status:** ✅ Ready for semantic enrichment phase
