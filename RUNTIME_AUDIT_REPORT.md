# Runtime Audit Report: Meta-Crystal Generator

**Generated:** 2026-08-08  
**Purpose:** Identify the actual runtime chain used by the UI for generation and classify all similar directories.

---

## Runtime Chain Map

### 1. UI Entry Point
**Path:** `src/components/pages/Generation.tsx`  
**Component:** `Generation()`  
**Evidence:** Main generation page component with profile management and generation controls.

### 2. Frontend Handler
**Path:** `src/components/pages/Generation.tsx`  
**Function:** `handleStart()` (lines 110-129)  
**Evidence:** 
- Calls `apiPost<{ taskId: string }>("/api/generate/start", {...})`
- Sends profile object with `params`, `flags`, `disabled_patterns`
- Receives `taskId` and subscribes to EventSource for streaming events

### 3. API Route
**Path:** `src/app/api/generate/start/route.ts`  
**Function:** `POST()` (lines 14-65)  
**Evidence:**
- Receives `Profile` object from request body
- Calls `runSidecar({ command: "generate", inputFile: profile, ... })`
- Returns `taskId` and status
- After completion, calls `syncCrystalsFromIndex()` to sync to database

### 4. Sidecar Endpoint/Process
**Path:** `src/lib/engine/runner.ts`  
**Function:** `runSidecar()` (lines 132-331)  
**Evidence:**
- Spawns Python subprocess: `python python_engine/sidecar.py generate <temp_profile.json>`
- Streams JSON events from stdout
- Uses `PROJECT_ROOT` to locate sidecar.py
- Environment: `PYTHONIOENCODING=utf-8`, `PYTHONUNBUFFERED=1`

### 5. Sidecar Implementation
**Path:** `python_engine/sidecar.py`  
**Function:** `cmd_generate(profile_path)` (lines 373-442)  
**Evidence:**
- Reads profile from temp JSON file
- Calls `get_engine()` to import `metacrystal_engine_v7`
- Calls `_build_config_from_profile()` to create EngineConfig
- Instantiates `eng.MetaEngine(cfg)`
- Calls `engine.evolve_with_saving(generations, batch_size, save_top)`
- Emits progress events via stdout JSON protocol

### 6. Python Generator Entry Point
**Path:** `python_engine/metacrystal_engine_v7.py`  
**Class:** `MetaEngine`  
**Method:** `evolve_with_saving(generations, batch_size, save_top)` (lines 4728-4796)  
**Evidence:**
- Main generation loop
- Calls `generate_and_save_batch()` for each generation
- Filters to emeralds, creates diamond from top-10
- Merges index with storage

### 7. Config Schema
**Path:** `python_engine/metacrystal_engine_v7.py`  
**Class:** `EngineConfig` (lines 45-142+)  
**Evidence:**
- Dataclass with fields: `max_depth`, `max_elements`, `use_irrational`, `use_imaginary`, `use_infinity`, `invert_probability`, `psychology_probability`
- `flags: Dict[str, bool]` with 76 domain flags
- `metric_influencing: List[str]`, `metric_observational: List[str]`
- `save_config: Dict` with `output_dir`

### 8. Result Storage
**Path:** `data/meta_crystals/crystals/`  
**Index:** `data/meta_crystals/meta/index.json`  
**Evidence:**
- `CRYSTALS_DIR = DATA_DIR / "meta_crystals" / "crystals"` (sidecar.py line 62)
- `INDEX_FILE = META_DIR / "index.json"` (sidecar.py line 64)
- Storage merges index and syncs to SQLite database via `syncCrystalsFromIndex()`

---

## Directory Inventory

### Canonical Runtime (ACTIVELY USED BY UI)

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| `python_engine/` | canonical_runtime | Referenced by `src/lib/engine/runner.ts` line 32: `join(candidate, "python_engine", "sidecar.py")` | **NO** | Contains sidecar.py and metacrystal_engine_v7.py used by UI |
| `src/` | canonical_runtime | Next.js frontend source | **NO** | Contains UI components and API routes |
| `data/` | canonical_runtime | Referenced by sidecar.py: `DATA_DIR = PROJECT_ROOT / "data"` | **NO** | Contains generated crystals, profiles, pipelines |
| `prisma/` | canonical_runtime | Database schema and migrations | **NO** | SQLite database used by application |

### Sidecar Runtime

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| `python_engine/sidecar.py` | sidecar_runtime | Spawns process from runner.ts | **NO** | Main sidecar entry point |

### Legacy / Demo / Archive

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| `z-ai-reference-crystal-pool-demo/` | archive | Separate project with own package.json, .git, scripts | **MAYBE** | Reference crystal pool with patches and scripts - not imported by main project |
| `metis-torus-atlas-demo/` | demo | Separate Next.js project with own package.json, no engine files | **MAYBE** | Demo project, not referenced by main app |
| `metis-torus-atlas-demo-v2/` | demo | Separate Next.js project with own package.json, no engine files | **MAYBE** | Demo project v2, not referenced by main app |
| `python_engine/import_engine.py` | legacy | Not called by sidecar.py or runner.ts | **MAYBE** | Standalone import script, not used in runtime |
| `python_engine/pipeline_engine.py` | legacy | Not called by sidecar.py for generation | **MAYBE** | Pipeline engine, may be used by pipelines but not main generation |
| `python_engine/delete_imported_crystals.py` | legacy | Temporary script created during session | **MAYBE** | One-time cleanup script |
| `python_engine/check_flags.py` | legacy | Temporary script created during session | **MAYBE** | One-time audit script |
| `python_engine/get_lexicon_categories.py` | legacy | Temporary script created during session | **MAYBE** | One-time audit script |
| `python_engine/create_backup_snapshot.py` | legacy | Temporary script created during session | **MAYBE** | One-time backup script |
| `python_engine/import_lexicon_enrichment.py` | legacy | Temporary script created during session | **MAYBE** | One-time import script |
| `python_engine/import_crystals_enrichment.py` | legacy | Temporary script created during session | **MAYBE** | One-time import script |
| `python_engine/IMPORT_ENRICHMENT_README.md` | legacy | Documentation for temporary scripts | **MAYBE** | Documentation for import scripts |

### Duplicate Candidates

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| None found | - | - | - | No obvious duplicates found |

### Test Fixtures

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| None found | - | - | - | No obvious test fixtures found |

### Unused or Unknown

| Path | Classification | Evidence | Safe to Remove | Notes |
|------|----------------|----------|----------------|-------|
| `.agents/` | unknown | Not referenced in code | **UNKNOWN** | Agent-related directory, needs manual review |
| `.zscripts/` | unknown | Not referenced in code | **UNKNOWN** | Scripts directory, needs manual review |
| `examples/` | unknown | Empty in main project | **UNKNOWN** | Empty examples directory |
| `extracted/` | unknown | Not referenced in code | **UNKNOWN** | Extracted files, needs manual review |
| `upload/` | unknown | Not referenced in code | **UNKNOWN** | Upload directory, needs manual review |
| `download/` | unknown | Not referenced in code | **UNKNOWN** | Download directory, needs manual review |
| `mini-services/` | unknown | Not referenced in code | **UNKNOWN** | Mini-services directory, needs manual review |

---

## UI-Accessible Parameters

### Generation Parameters (Profile.params)

| Parameter ID | UI Control | Frontend Field | API Field | Sidecar Field | Python Field | Type | Default | Range/Limit |
|--------------|------------|----------------|-----------|--------------|--------------|------|---------|-------------|
| generations | ProfileConfigurator | params.generations | params.generations | params["generations"] | generations | int | 2 | No explicit limit |
| batch | ProfileConfigurator | params.batch | params.batch | params["batch"] | batch_size | int | 100 | No explicit limit |
| top | ProfileConfigurator | params.top | params.top | params["top"] | save_top | int | 3 | No explicit limit |
| max_depth | ProfileConfigurator | params.max_depth | params.max_depth | params["max_depth"] | cfg.max_depth | int | 7 | No explicit limit |
| max_elements | ProfileConfigurator | params.max_elements | params.max_elements | params["max_elements"] | cfg.max_elements | int | 12 | No explicit limit |
| use_irrational | ProfileConfigurator | params.use_irrational | params.use_irrational | params["use_irrational"] | cfg.use_irrational | bool | true | - |
| use_imaginary | ProfileConfigurator | params.use_imaginary | params.use_imaginary | params["use_imaginary"] | cfg.use_imaginary | bool | true | - |
| use_infinity | ProfileConfigurator | params.use_infinity | params.use_infinity | params["use_infinity"] | cfg.use_infinity | bool | true | - |
| invert_probability | ProfileConfigurator | params.invert_probability | params.invert_probability | params["invert_probability"] | cfg.invert_probability | float | 0.4 | 0.0-1.0 |
| psychology_probability | ProfileConfigurator | params.psychology_probability | params.psychology_probability | params["psychology_probability"] | cfg.psychology_probability | float | 0.6 | 0.0-1.0 |

### Domain Flags (Profile.flags)

76 flags from `EngineConfig.flags`, grouped in UI by `FLAG_GROUPS` in `src/lib/profile-presets.ts`:

- **Базовые** (11 flags): enable_linguistics, enable_morpheme_generation, enable_linguistic_principles, enable_quantum, enable_fractal, enable_psychology, enable_metrics, enable_auto_correction, enable_learning, enable_saving, enable_cataloging
- **Операторы** (2 flags): enable_derivative_first, enable_derivative_second
- **v7.0 домены** (10 flags): enable_eqgft, enable_ethical_archon, enable_bell_nonlocality, enable_context_weaver, enable_garden_between, enable_meta_fractal_craft, enable_json_prompt, enable_quantum_geometry, enable_research, enable_fair_division
- **Математика/Алгебра** (7 flags): enable_category_theory, enable_algebra, enable_knot_theory, enable_number_theory, enable_measure_probability, enable_graph_combinatorics, enable_optimization
- **Физика** (7 flags): enable_thermodynamics, enable_stat_mechanics, enable_relativity, enable_string_theory, enable_cosmology, enable_qft, enable_condensed_matter
- **Информатика** (6 flags): enable_complexity, enable_cryptography, enable_automata, enable_neural_nets, enable_evolutionary, enable_cybernetics
- **Лингвистика/Семиотика** (3 flags): enable_semiotics, enable_phonology_typology, enable_writing_systems
- **Когнитивное** (5 flags): enable_jungian, enable_cognitive_bias, enable_consciousness, enable_mindfulness, enable_neuroscience
- **Философия** (4 flags): enable_philosophy, enable_eastern_phil, enable_hermeticism, enable_process_phil
- **Эзотерика** (6 flags): enable_alchemy, enable_kabbalah, enable_iching, enable_tarot, enable_sacred_geometry, enable_vedic
- **Системы/Биология** (5 flags): enable_systems_ecology, enable_permaculture, enable_biomimicry, enable_chaos_dynamics, enable_network_science
- **Искусство/Архитектура** (2 flags): enable_music_art, enable_architecture
- **Теория игр/Решений** (2 flags): enable_game_theory, enable_decision_theory
- **Передовые теории** (6 flags): enable_holographic, enable_morphic_resonance, enable_orch_or, enable_simulation_hyp, enable_quantum_info, enable_metaprinciples

### Metrics Parameters (Profile.metrics)

| Parameter ID | UI Control | Frontend Field | API Field | Sidecar Field | Python Field | Type | Default |
|--------------|------------|----------------|-----------|--------------|--------------|------|---------|
| enabled | ProfileConfigurator | metrics.enabled | metrics.enabled | metrics["enabled"] | cfg.flags["enable_metrics"] | bool | true |
| influencing | ProfileConfigurator | metrics.influencing | metrics.influencing | metrics["influencing"] | cfg.metric_influencing | string[] | ["V", "S", "N", "D_f", "G_S"] |
| observational | ProfileConfigurator | metrics.observational | metrics.observational | metrics["observational"] | cfg.metric_observational | string[] | ["QEC", "CHSH", "C_val"] |

### Structural Patterns (Profile.disabled_patterns)

| Parameter ID | UI Control | Frontend Field | API Field | Sidecar Field | Python Field | Type |
|--------------|------------|----------------|-----------|--------------|--------------|------|
| disabled_patterns | ProfileConfigurator | disabled_patterns | disabled_patterns | disabled_patterns | engine.patterns (filtered) | string[] |

Available patterns from `STRUCTURAL_PATTERNS` in metacrystal_engine_v7.py (100+ patterns including: линейный, степенной, вложенный_прост, многомерный, парадоксальный, динамический, голографический, петлевой, фрактальный, квантовый, рефлексивный, etc.)

---

## Parameter Provenance Summary

### Verified Runtime Parameters
All parameters listed above are verified to flow through the complete chain:
1. **UI Control:** ProfileConfigurator in Generation.tsx
2. **Frontend Request:** POST to /api/generate/start with Profile object
3. **API Route:** Passes profile to runSidecar() as inputFile
4. **Sidecar:** Reads profile JSON, calls _build_config_from_profile()
5. **Python:** EngineConfig fields set from profile

### Present But Not Runtime Verified
None found - all parameters in EngineConfig are accessible through UI flags.

---

## Uncertainties Requiring Manual Review

1. **`.agents/`** - Purpose unknown, not referenced in code
2. **`.zscripts/`** - Purpose unknown, not referenced in code
3. **`examples/`** - Empty, purpose unknown
4. **`extracted/`** - Purpose unknown, not referenced in code
5. **`upload/`** - Purpose unknown, not referenced in code
6. **`download/`** - Purpose unknown, not referenced in code
7. **`mini-services/`** - Purpose unknown, not referenced in code
8. **`python_engine/pipeline_engine.py`** - May be used by pipeline feature, not main generation
9. **`z-ai-reference-crystal-pool-demo/`** - Contains patches and scripts, relationship to main project unclear
10. **`metis-torus-atlas-demo/` and `metis-torus-atlas-demo-v2/`** - Demo projects, relationship to main project unclear

---

## Recommendations

### Safe to Consider for Cleanup (After Manual Verification)
- `python_engine/delete_imported_crystals.py` - One-time script, can be archived
- `python_engine/check_flags.py` - One-time script, can be archived
- `python_engine/get_lexicon_categories.py` - One-time script, can be archived
- `python_engine/create_backup_snapshot.py` - One-time script, can be archived
- `python_engine/import_lexicon_enrichment.py` - One-time script, can be archived
- `python_engine/import_crystals_enrichment.py` - One-time script, can be archived
- `python_engine/IMPORT_ENRICHMENT_README.md` - Documentation for one-time scripts, can be archived

### Requires Investigation Before Cleanup
- `z-ai-reference-crystal-pool-demo/` - Determine if patches are still needed
- `metis-torus-atlas-demo/` and `metis-torus-atlas-demo-v2/` - Determine if these are active demos or obsolete
- `.agents/`, `.zscripts/`, `examples/`, `extracted/`, `upload/`, `download/`, `mini-services/` - Determine purpose and usage

### Do Not Remove
- `python_engine/` - Canonical runtime
- `python_engine/sidecar.py` - Sidecar entry point
- `python_engine/metacrystal_engine_v7.py` - Main generator
- `src/` - Frontend source
- `data/` - Runtime data directory
- `prisma/` - Database schema
