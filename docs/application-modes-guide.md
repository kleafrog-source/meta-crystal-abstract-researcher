# MMSS Meta Crystal: Application Modes Guide

## Overview

MMSS Meta Crystal implements five distinct parameter generation and retrieval systems, each designed for specific use cases in audio control parameter management. This guide explains the architecture, operating principles, methods, and objectives of each mode.

---

## 1. Flowmusic Genesis V3

### Purpose

Flowmusic Genesis V3 is a composite index builder that creates a unified vector search index from multiple parameter sources. It enables efficient semantic retrieval across the entire parameter catalog by combining embeddings from the autonomous library and frozen combinatorial datasets.

### Architecture

```
Flowmusic Genesis V3 Index Build Pipeline
├── Script Entry Point
│   └── main() execution
│       └── build() invocation
│           ├── Load Data Sources
│           │   ├── Read library parameters
│           │   └── Read frozen dataset
│           ├── Vector Cache Management
│           │   └── Load cached vectors
│           ├── Embedding Generation
│           │   └── Batch embed via Ollama
│           └── Persist Index
│               ├── Write binary vectors
│               └── Write manifest JSON
```

### Operating Principles

1. **Data Integration**: Merges parameters from two sources:
   - **Library**: The autonomous V3 parameter library (`data/combinatorial-genesis/library/parameters.json`)
   - **Frozen Dataset**: The latest immutable combinatorial dataset version (`data/combinatorial-genesis/datasets/latest.json`)

2. **Vector Caching**: Implements intelligent caching to avoid redundant embedding generation:
   - Reuses existing embeddings from previous runs
   - Integrates with Flowmusic semantic cache
   - Only generates embeddings for new or changed parameters

3. **Embedding Generation**: Uses Ollama to generate text embeddings:
   - Default model: `qwen3-embedding:4b` (configurable via `OLLAMA_EMBED_MODEL`)
   - Batch processing with configurable batch size (default: 64)
   - Normalizes all vectors to unit length for cosine similarity

4. **Index Persistence**: Stores two files:
   - `embeddings.f32`: Binary file with normalized float32 vectors (header: count, dimensions)
   - `manifest.json`: Metadata including model info, cache hash, and file references

### Methods

**Retrieval Scope Classification**: Parameters are automatically classified into one of five scopes:
- `sound`: Audio synthesis and processing parameters (default)
- `structure`: Arrangement, sequencing, timing, rhythm
- `metadata`: Descriptive and classification metadata
- `provenance`: Ownership and provenance tracking
- `administrative`: Contract and administrative controls

**Embedding Text Construction**: Two distinct text representations:
- `retrieval_text`: Technical fields for search (technical_name, category, sub_category, quantity_kind, semantic_keywords, lyria_prompt_tags)
- `semantic_text`: Natural language description for semantic search (name_ru, descriptions, tags, keywords)

### Objectives

- **Unified Search**: Provide a single semantic search interface across all parameter sources
- **Incremental Updates**: Minimize computational cost by reusing existing embeddings
- **Model Portability**: Support different embedding models through Ollama
- **Fast Retrieval**: Binary format for efficient vector operations at runtime

### Usage

```bash
python python_engine/build-genesis-v3-composite-index.py \
  --model qwen3-embedding:4b \
  --endpoint http://localhost:11434 \
  --batch-size 64
```

The composite index is automatically built as the final step of the Combinatorial Genesis pipeline.

---

## 2. Audio CLAP RAG

### Purpose

Audio CLAP RAG enables cross-modal audio-to-parameter retrieval. Users can select an audio fragment, and the system analyzes its acoustic characteristics to find semantically similar audio control parameters using the LAION-CLAP model.

### Architecture

```
Audio CLAP RAG: Cross-Modal Search Flow
├── Frontend (React Component)
│   └── searchAudio() button click
│       └── POST /api/audio/search
│
├── Next.js API Route
│   ├── POST handler receives FormData
│   ├── Write audio to temp file
│   └── callSidecar("audio_search")
│       └── Spawns Python process
│
└── Python Backend (audio_clap_rag.py)
    ├── search_audio() entry point
    │   ├── build_index() ensures index
    │   │   ├── Load V3 parameters
    │   │   ├── Batch encode text with CLAP
    │   │   └── Save index.json
    │   ├── librosa.load() audio segment
    │   ├── Split into 10s chunks
    │   ├── model.get_audio_features()
    │   ├── np.mean() average chunks
    │   ├── np.dot() cosine similarity
    │   └── _active_parameter() format
    └── Return results to API
```

### Operating Principles

1. **Cross-Modal Embeddings**: LAION-CLAP model encodes both audio and text into a shared embedding space:
   - Model: `laion/clap-htsat-fused` (configurable via `CLAP_MODEL`)
   - Device: CPU by default (configurable via `CLAP_DEVICE`)
   - Audio processed at 48kHz mono

2. **Incremental Index Building**: The text index is built incrementally:
   - Loads V3 parameters from library and frozen dataset
   - Computes content hash for each parameter
   - Reuses existing embeddings if parameter content hasn't changed
   - Only encodes new or modified parameters

3. **Audio Processing Pipeline**:
   - Loads selected audio fragment at specified offset and duration
   - Splits long fragments into 10-second chunks
   - Encodes each chunk through CLAP model
   - Averages chunk embeddings into a single query vector
   - Normalizes vector for cosine similarity

4. **Similarity Search**: Computes cosine similarity between audio vector and all parameter text vectors:
   - Dot product of normalized vectors
   - Ranks results by similarity score
   - Normalizes scores to 0-1 range for UI display

5. **Active Parameter Generation**: Converts top matches to active parameters:
   - Suggested values based on normalized similarity strength
   - Technical_name, category, unit, range, and default value
   - Ready for macro generation and audio export

### Methods

**Text Chunking**: Parameter metadata is structured into priority fields:
1. technical_name, name_ru, description_en, description_ru
2. category, sub_category, semantic_keywords, lyria_prompt_tags
3. domain, axes, quantity_kind
4. All other fields

**Canonical Hashing**: SHA-256 hash of canonical JSON representation for change detection:
- Sorted keys, no whitespace
- Used to determine if parameter needs re-encoding

**Audio Chunking**: Long audio segments are processed in 10-second windows:
- Supports fragments from 1 to 800 seconds
- Each chunk independently encoded
- Final vector is mean of all chunk vectors

### Objectives

- **Intuitive Discovery**: Find parameters by describing sound with audio examples
- **Cross-Modal Search**: Bridge the gap between acoustic intuition and technical parameters
- **Incremental Updates**: Efficiently maintain index as parameter catalog grows
- **Real-Time Feedback**: Enable interactive audio-based parameter exploration

### Usage

**Frontend** (`/audio-clap-rag`):
1. Upload or select audio file
2. Select fragment on waveform (offset and duration)
3. Set top-K (number of results, 3-100)
4. Click "Find parameters"
5. Review matched parameters and export macro

**CLI** (for index management):
```bash
# Build or update CLAP text index
python python_engine/audio_clap_rag.py
```

### Dependencies

- `torch`: PyTorch for CLAP model inference
- `transformers`: Hugging Face transformers library
- `librosa`: Audio loading and processing
- `numpy`: Vector operations

---

## 3. Combinatorial Genesis

### Purpose

Combinatorial Genesis is an automated pipeline that processes new parameter proposals from Flowmusic inbox files through quality gating, semantic analysis, and dataset freezing. It transforms raw LLM outputs into a curated, immutable parameter dataset ready for synthesis.

### Architecture

```
Combinatorial Genesis Pipeline
├── Frontend trigger
│   └── API route handler
│       └── run-combinatorial-pipeline.py
│           ├── acquire_lock()
│           ├── subprocess.run() for each step
│           │   ├── collect-json-from-folder.py
│           │   ├── prepare-combinatorial-corpus.py
│           │   │   ├── build_quality_gate()
│           │   │   ├── load_or_create_embeddings()
│           │   │   │   └── embed_batch() → Ollama
│           │   │   ├── build_semantic_review()
│           │   │   │   ├── signatures()
│           │   │   │   └── approximate_neighbor_pairs()
│           │   │   ├── build_auto_triage()
│           │   │   └── build_semantic_groups()
│           │   │       └── union-find merge
│           │   ├── freeze-combinatorial-dataset.py
│           │   │   └── version_dir.mkdir()
│           │   ├── build-combinatorial-runtime-index.py
│           │   │   └── embedder() → Ollama
│           │   └── build-genesis-v3-composite-index.py
│           └── write_report()
```

### Operating Principles

1. **Collection** (`collect-json-from-folder.py`):
   - Reads Flowmusic inbox files (`.txt`, `.md`)
   - Parses JSON batches from LLM conversations
   - Extracts parameter occurrences with provenance
   - Performs exact-name deduplication
   - Normalizes technical_name to English snake_case where safe
   - Separates valid parameters from quarantine

2. **Quality Gate** (`prepare-combinatorial-corpus.py`):
   - Excludes parameters with repeated tokens
   - Filters excessive length parameters
   - Removes parameters with quality issues
   - Builds atom corpus from eligible parameters
   - Generates quality report with explanations

3. **Semantic Embeddings**:
   - Embeds eligible parameters using Ollama
   - Caches embeddings for incremental updates
   - Supports batch processing with configurable size
   - Stores embeddings in binary format with metadata

4. **Semantic Review**:
   - Uses sparse hyperplane signatures for approximate nearest neighbors
   - Ranks candidates by exact cosine similarity
   - Generates review queue for manual inspection
   - Computes BGE scores for same/related/distinct classification

5. **Auto Triage**:
   - Automatically classifies parameter pairs as:
     - `same`: Semantically equivalent (merge candidates)
     - `related`: Similar but distinct (keep separate)
     - `distinct`: Unrelated (keep separate)
   - Applies conservative thresholds to avoid false merges
   - Stores decisions for manual override

6. **Semantic Groups**:
   - Applies union-find algorithm to merge `same` parameters
   - Creates canonical groups with representative parameter
   - Generates semantic draft with deduplicated records
   - Preserves provenance for all merged parameters

7. **Freezing** (`freeze-combinatorial-dataset.py`):
   - Creates content-addressed dataset version
   - Version ID: `cg-v1-{content-sha256}`
   - Immutable: same content produces same version ID
   - Stores: parameters.json, atoms.json, semantic_groups.json
   - Updates `latest.json` pointer to new version

8. **Runtime Index** (`build-combinatorial-runtime-index.py`):
   - Embeds atom corpus from frozen dataset
   - Uses Ollama for text embeddings
   - Stores in binary format for fast search
   - Enables atom-based parameter generation in synthesis

9. **Composite Index** (`build-genesis-v3-composite-index.py`):
   - Builds final V3 composite index
   - Combines library and frozen dataset
   - Enables unified semantic search across all sources

### Methods

**Quality Gate Filtering**:
- Token repetition detection
- Length thresholds (technical_name, descriptions)
- Pattern validation (technical_name must be snake_case)
- Unit and quantity_kind validation

**Semantic Signatures**:
- Sparse hyperplane projections for fast approximate search
- Configurable number of hyperplanes
- Used to find candidate pairs before exact cosine comparison

**Union-Find Merging**:
- Disjoint-set data structure for grouping
- Path compression for efficiency
- Union by rank for balanced trees
- Groups parameters classified as `same`

**Content Addressing**:
- SHA-256 hash of canonical JSON representation
- Version ID derived from hash
- Prevents duplicate versions
- Enables content-based caching

### Objectives

- **Automated Curation**: Transform raw LLM outputs into high-quality parameter catalog
- **Semantic Deduplication**: Identify and merge semantically equivalent parameters
- **Immutable History**: Maintain versioned dataset with content addressing
- **Incremental Processing**: Efficiently process new inbox without full rebuild
- **Quality Control**: Multi-stage filtering ensures only valid parameters enter catalog

### Usage

**Frontend** (`/combinatorial-genesis`):
1. Place new Flowmusic exports in `flowmusic-inbox/`
2. Click "Process inbox"
3. Monitor pipeline progress with live logs
4. Review semantic decisions and override if needed
5. Review frozen version and runtime index status

**CLI**:
```bash
# Run full pipeline
python python_engine/run-combinatorial-pipeline.py

# Run individual steps
python python_engine/collect-json-from-folder.py flowmusic-inbox/
python python_engine/prepare-combinatorial-corpus.py
python python_engine/freeze-combinatorial-dataset.py
python python_engine/build-combinatorial-runtime-index.py
python python_engine/build-genesis-v3-composite-index.py
```

### Output Files

**Collection Stage** (`flowmusic-output/`):
- `flowmusic_batches.json`: Raw batches with errors and provenance
- `flowmusic_occurrences.json`: Valid occurrences
- `flowmusic_rejected_occurrences.json`: Quarantine with validation errors
- `unified_parameters_lexical.json`: Exact-name canonical records
- `collection_report.json`: Statistics and metrics

**Corpus Stage**:
- `eligible_parameters.json`: Quality-gated parameters
- `quality_report.json`: Explanations for quarantined parameters
- `atom_corpus.json`: English atoms with frequencies
- `semantic_review_queue.json`: BGE-scored pairs for review
- `semantic_auto_triage.json`: Automatic same/related/distinct decisions
- `semantic_groups.json`: Merged semantic groups
- `unified_parameters_semantic_draft.json`: Semantic-deduplicated draft
- `semantic_embeddings.f32`: Cached embeddings

**Frozen Dataset** (`datasets/cg-v1-{hash}/`):
- `parameters.json`: Final parameter records
- `atoms.json`: Atom corpus
- `semantic_groups.json`: Semantic group assignments
- `manifest.json`: Version metadata and SHA-256

**Runtime Index** (`indexes/{version-id}/`):
- Binary atom embeddings for fast search

---

## 4. Combinatorial Synthesis

### Purpose

Combinatorial Synthesis is a user-facing parameter generation workflow. Users provide structural sources (existing parameters to recombine) and semantic goals (desired characteristics), and the system generates new parameter candidates through atom recombination and BGE ranking.

### Architecture

```
Combinatorial Synthesis: Parameter Generation Flow
├── User Interface (CombinatorialSynthesisPage)
│   └── generate() button click
│
├── API Route (preview/route.ts)
│   ├── embedText(query)
│   ├── rankRuntimeAtoms(queryEmbedding)
│   │   └── runtime-index.ts
│   │       └── cosine similarity computation
│   ├── CombinatorialGenerator.generate()
│   │   └── core.ts
│   │       └── join tokens → technical_name
│   ├── embedTexts(candidates)
│   ├── sort by normalizedCosine()
│   └── inferCandidateValues()
│
└── Optional LLM Enhancement
    └── normalize-metadata API call
```

### Operating Principles

1. **Semantic Query Embedding**:
   - User provides natural language description of desired parameters
   - Query embedded using Ollama embedding model
   - Used to rank atoms and candidates

2. **Atom Ranking**:
   - Searches frozen atom index for atoms similar to semantic query
   - Computes cosine similarity between query and all atom embeddings
   - Returns top-K atoms (default: 180) for candidate generation

3. **Candidate Generation**:
   - Combines atoms using deterministic templates
   - Template patterns: descriptor-concept-property structures
   - Seed-based generation for reproducibility
   - Bounds candidate count (default: 300, configurable)
   - Enforces exact stop-list (library + frozen dataset)

4. **BGE Reranking**:
   - Batch-embeds all generated technical_names
   - Sorts candidates by cosine similarity to semantic query
   - Filters to requested limit (default: 30)
   - Preserves structural diversity in top results

5. **Value Inference**:
   - Extrapolates UI element, unit, min/max/step/default from semantically similar donor parameters
   - Donors are ranked by BGE similarity to full candidate name
   - Requires consensus among multiple donors for auto-resolution
   - Conflicting donors mark candidate as `needs_review`

6. **LLM Normalization** (Optional):
   - Sends candidates to chat model for description generation
   - Model reads immutable control schema, tags, keywords, and donor metadata
   - Returns: name_ru, description_en, description_ru, and selection recommendation
   - Candidates processed one-by-one to keep model loaded
   - Supports cancellation and retry on error

7. **Package Management**:
   - Save draft: content-addressed package in `drafts/`
   - Dry-run: simulate publication and check for collisions
   - Publish: add to autonomous library with backup in `library/history/`
   - Idempotent: same package ID only publishes once

### Methods

**Atom Selection**:
- Atoms ranked by semantic similarity to query
- Role-based filtering (descriptor, concept, property)
- Frequency weighting from atom corpus

**Template Generation**:
- Deterministic seed for reproducibility
- Pattern-based combination: descriptor + concept + property
- Exact-name stop-list enforcement
- Collision detection with existing parameters

**Value Inference Rules**:
- Only infer from compatible donors (same quantity_kind, ui_element)
- Donors must agree on unit, range, and options
- Confidence score based on donor consensus
- `needs_review` if donors disagree or insufficient data

**LLM Normalization**:
- Uses chat model from global settings
- Reads donor metadata for context
- Validates output against schema
- Truncates overly long text at sentence/word boundary
- Retry on JSON or validation errors

### Objectives

- **User-Driven Creation**: Enable users to generate parameters based on their goals
- **Semantic Alignment**: Match generated parameters to user intent
- **Structural Consistency**: Ensure generated names follow naming conventions
- **Value Reliability**: Infer control values from similar existing parameters
- **Quality Control**: Manual review before publication to library

### Usage

**Frontend** (`/combinatorial-synthesis`):
1. Enter semantic query (e.g., "bass filter with resonance")
2. Select source parameters (macro) or leave empty for full atom search
3. Set generation parameters (seed, limit, source count)
4. Click "Generate preview"
5. Review candidates with inferred values
6. Edit JSON manually if needed
7. Approve candidates with valid control schema
8. Optional: "Normalize descriptions" with LLM
9. Save package
10. Dry-run to check collisions
11. Publish to autonomous library

**API**:
```bash
POST /api/combinatorial-genesis/preview
{
  "query": "semantic description",
  "macro": ["source_param_1", "source_param_2"],
  "seed": 0,
  "limit": 30,
  "source_count": 3
}
```

### Output

**Preview Response**:
- Ranked candidates with technical_name
- Parent parameters (structural sources)
- Query similarity score
- Inferred control values (status: auto_resolved or needs_review)
- Metadata (name_ru, descriptions, tags, keywords)

**Package**:
- Content-addressed package ID
- Summary (candidate_count, publishable_count, needs_review_count)
- Draft saved in `drafts/{package-id}/`

**Publication**:
- Added to `library/parameters.json`
- Backup in `library/history/{timestamp}.json`
- Diff and hash computed for verification

---

## 5. Meta-Crystal V3 Lab

### Purpose

Meta-Crystal V3 Lab is an LLM-assisted parameter proposal system. It uses RAG to retrieve relevant Meta-Crystal configurations and existing V3 parameters, then instructs a local LLM to generate new parameter proposals following the Flowmusic collection protocol. All proposals require manual review before publication.

### Architecture

```
Meta-Crystal V3 Lab Flow
├── User Interface (MetaCrystalV3LabPage)
│   └── propose() button
│       └── POST /api/meta-crystal-v3-lab/propose
│
├── API Route (propose/route.ts)
│   ├── buildRAGContext(query)
│   ├── embedText(query)
│   ├── rankCompositeNames(queryEmbedding)
│   ├── load embedding settings
│   ├── load collection protocol
│   ├── chat with LLM (JSON schema)
│   ├── validateLabParameters()
│   ├── optional retry on validation error
│   └── return candidates with context
│
├── Validation Route (validate/route.ts)
│   ├── validateLabParameters()
│   └── return errors/warnings
│
└── Rating Route (rating/route.ts)
    └── log up/down feedback
```

### Operating Principles

1. **RAG Context Building**:
   - Searches Meta-Crystal database for relevant configurations
   - Retrieves crystal names, scores, and snippets
   - Provides LLM with evidence from existing crystal designs

2. **V3 Collision Context**:
   - Embeds user query using Ollama
   - Searches composite V3 index for nearest parameters
   - Returns top-K nearest neighbors (default: 18)
   - Hides exact parameter names from LLM to prevent imitation
   - Server performs collision checking after generation

3. **Collection Protocol**:
   - LLM instructed to follow Flowmusic collection protocol
   - Protocol loaded from `docs/prompts/FLOWMUSIC_COLLECTION_PROMPT_V1.md`
   - Enforces JSON schema with all required fields
   - Specifies batch size override (requested count vs. fixed 10)

4. **JSON Schema Enforcement**:
   - Strict schema with regex patterns for technical_name, quantity_kind
   - UI element variants: Range, Select, Toggle, Text, String, Array
   - Required fields: technical_name, name_ru, descriptions, category, unit, tags, keywords
   - Validates Russian keywords contain Cyrillic
   - Validates English keywords are ASCII-only

5. **Validation Pipeline**:
   - Checks technical_name collisions with existing V3 parameters
   - Validates JSON schema compliance
   - Checks required fields presence
   - Validates regex patterns
   - Returns errors and warnings for manual correction

6. **Automatic Retry**:
   - If validation fails, sends correction to LLM
   - LLM instructed to fix specific errors without changing valid fields
   - Preserves first attempt if retry also fails
   - Exposes both raw attempts for debugging

7. **Manual Review**:
   - JSON can be edited manually in UI
   - "Check schema" re-validates after edits
   - Candidates must be approved individually
   - Only error-free candidates can be packaged

8. **Package and Publish**:
   - Approved candidates saved as package
   - Dry-run checks for collisions and schema errors
   - Publish adds to autonomous library
   - Requires managed rebuild V3 for search participation

9. **Rating Feedback**:
   - Users can rate candidates as up/down
   - Ratings logged to `data/combinatorial-genesis/meta-crystal-v3-lab/ratings.jsonl`
   - Used for future improvement of proposal quality

### Methods

**RAG Retrieval**:
- Uses existing RAG pipeline from `/api/llm/chat`
- Searches crystal descriptions and configurations
- Returns context with kind, name, score, and snippet

**Composite Index Search**:
- Uses V3 composite index for nearest neighbor search
- Cosine similarity between query and parameter embeddings
- Returns parameter names and similarity scores
- Hidden from LLM to prevent name imitation

**Schema Validation**:
- Regex pattern: `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` for technical_name
- Regex pattern: `^[A-Za-z0-9][A-Za-z0-9 _/().,+%'-]*$` for tags and keywords
- Array length validation (3 tags, 3+4 keywords)
- UI element-specific field validation (min/max/step for Range, options for Select)

**Collision Detection**:
- Checks technical_name against all V3 parameters
- Prevents duplicate names
- Requires LLM to generate genuinely different names on retry

### Objectives

- **Leverage Existing Knowledge**: Use Meta-Crystal designs as inspiration for new parameters
- **Semantic Alignment**: Generate parameters that match user's curation goal
- **Prevent Imitation**: Hide existing V3 names to encourage originality
- **Quality Assurance**: Multi-stage validation ensures high-quality proposals
- **Human-in-the-Loop**: Manual review and editing before publication
- **Feedback Loop**: Rating system for continuous improvement

### Usage

**Frontend** (`/meta-crystal-v3-lab`):
1. Enter curation goal (e.g., "find ideas for unstable resonant microdynamics")
2. Set candidate count (1-8)
3. Click "Find and propose"
4. Review raw LLM response (expandable for debugging)
5. Review retrieved context (Meta-Crystals and V3 neighbors)
6. Edit JSON manually if needed
7. Click "Check schema" to validate
8. Approve error-free candidates
9. Select approved candidates for package
10. Click "Save package"
11. Dry-run to check publication readiness
12. Publish to autonomous library
13. Run Managed Rebuild V3 to include in search

**API**:
```bash
POST /api/meta-crystal-v3-lab/propose
{
  "query": "curation goal description",
  "count": 3
}

POST /api/meta-crystal-v3-lab/validate
{
  "parameters": [...],
  "parent_parameters": ["crystal_1", "crystal_2"]
}

POST /api/meta-crystal-v3-lab/rating
{
  "technical_name": "parameter_name",
  "rating": "up" | "down",
  "query": "original query"
}
```

### Output

**Proposal Response**:
- Query and dataset version
- Embedding model and chat model used
- Candidates with:
  - parameter (JSON schema)
  - package_candidate (with metadata and review_status)
  - errors (validation failures)
  - warnings (non-blocking issues)
- Meta-Crystal context (retrieved RAG results)
- V3 neighbors (nearest parameters for collision context)
- Raw LLM reply (for debugging)

**Package**:
- Uses combinatorial-genesis package system
- Content-addressed package ID
- Summary of publishable vs. needs_review candidates

**Publication**:
- Same as Combinatorial Synthesis
- Adds to autonomous library
- Requires managed rebuild for search participation

---

## Integration Between Modes

The five application modes work together in a parameter lifecycle:

1. **Meta-Crystal V3 Lab**: Proposes new parameters based on Meta-Crystal designs
2. **Combinatorial Synthesis**: Generates parameters through atom recombination
3. **Combinatorial Genesis**: Processes raw proposals into frozen dataset
4. **Flowmusic Genesis V3**: Builds composite index from library + frozen dataset
5. **Audio CLAP RAG**: Enables audio-based discovery of all parameters

### Data Flow

```
Meta-Crystal V3 Lab → proposals → Combinatorial Genesis → frozen dataset
                                                            ↓
Combinatorial Synthesis → candidates → Combinatorial Genesis → frozen dataset
                                                            ↓
                                              Flowmusic Genesis V3 → composite index
                                                            ↓
                                              Audio CLAP RAG → audio search
```

### Shared Components

- **Ollama**: Shared embedding and chat model backend
- **Autonomous Library**: V3 parameter library used by all modes
- **Composite Index**: Unified search index for V3 parameters
- **Package System**: Content-addressed package management for synthesis and lab

---

## Configuration

### Ollama Settings

All modes use the shared Ollama configuration from `/api/settings`:

- **Embedding Model**: Default `qwen3-embedding:4b` (configurable)
- **Chat Model**: Default `hermes3:3b` or `qwen2.5-3b` (configurable)
- **Endpoint**: Default `http://localhost:11434` (configurable)
- **Temperature**: Default 0.7 (lowered to 0.1 for structured generation)
- **Max Tokens**: Default 4096

### Environment Variables

- `OLLAMA_BASE_URL`: Ollama API endpoint
- `OLLAMA_EMBED_MODEL`: Default embedding model
- `CLAP_MODEL`: LAION-CLAP model name (default: `laion/clap-htsat-fused`)
- `CLAP_DEVICE`: CLAP device (default: `cpu`)

### Model Compatibility

When changing Ollama models, you must rebuild:
- Runtime atom index (Combinatorial Synthesis)
- Composite V3 index (Flowmusic Genesis V3)
- CLAP text index (Audio CLAP RAG - if model changed)

Vectors from different models are not compatible.

---

## Troubleshooting

### Index Not Ready

**Symptom**: Search returns "index not built" error

**Solution**:
- Run the appropriate index build command for the mode
- For Audio CLAP RAG: Click "Update CLAP index" in UI
- For Combinatorial Synthesis: Ensure runtime index is built via pipeline
- For Flowmusic Genesis V3: Run pipeline or standalone script

### Model Changed But Index Not Rebuilt

**Symptom**: Search returns low-quality results or errors

**Solution**:
- Rebuild all indexes after changing Ollama model
- Delete old index files to force rebuild
- Verify model in index manifest matches current settings

### Parameter Not Found in Search

**Symptom**: Newly published parameter doesn't appear in search results

**Solution**:
- Run Managed Rebuild V3 for composite index
- Rebuild CLAP text index for audio search
- Verify parameter is in library/parameters.json

### LLM Generation Fails

**Symptom**: Lab or synthesis returns validation errors

**Solution**:
- Review raw LLM response in UI (expandable section)
- Edit JSON manually to fix errors
- Try lower temperature for more deterministic output
- Check chat model is loaded in Ollama

### Audio Search Returns No Results

**Symptom**: Audio CLAP RAG returns empty results

**Solution**:
- Verify CLAP index is built
- Check audio fragment is valid (not empty, correct format)
- Try longer duration (minimum 1 second)
- Increase top-K to see more results

---

## Performance Considerations

### Embedding Generation

- **Batch Size**: Larger batches reduce API overhead but use more memory
- **Caching**: All modes implement incremental caching to avoid redundant embeddings
- **Parallelism**: Local Ollama typically configured for `OLLAMA_NUM_PARALLEL=1`

### Index Size

- **Composite Index**: Grows with parameter count (library + frozen dataset)
- **Runtime Index**: Depends on atom corpus size (typically smaller than full dataset)
- **CLAP Index**: One vector per parameter with text metadata

### Search Performance

- **Cosine Similarity**: O(n) for naive search, acceptable for current catalog size
- **Binary Format**: Vectors stored as float32 for efficient loading
- **Incremental Updates**: Only new/changed parameters require re-encoding

---

## Future Enhancements

Potential improvements to the application modes:

1. **HNSW Index**: Replace naive cosine search with HNSW for faster retrieval
2. **Multi-Model Support**: Allow different models for different modes
3. **Parallel Embedding**: Increase Ollama parallelism for faster index builds
4. **GPU CLAP**: Use GPU for CLAP model inference (currently CPU-only)
5. **Semantic Diff**: Show parameter changes between frozen versions
6. **Auto-Publish**: Optional auto-publish for high-confidence candidates
7. **Cross-Mode Search**: Unified search across all parameter sources
8. **Parameter Relationships**: Track and visualize parameter dependencies

---

## White Space Discovery

Route: `/white-space-discovery`.

This read-only V3 analysis uses the active canonical snapshot and the existing composite index. It reports taxonomy coverage gaps, rare or source-less atoms, low local semantic density, and isolated knowledge-graph parameters. Every result includes deterministic evidence and a suggested query that can be opened in Meta-Crystal V3 Lab or Combinatorial Synthesis. Building and stopping the report does not call Ollama, publish parameters, or modify the V3 dataset.

Runtime artifacts are stored under `data/combinatorial-genesis/white-space/` and are excluded from Git. A dataset, exclusion registry, composite-index, or graph change marks the report stale.

## Parameter Knowledge Graph

Route: `/knowledge-graph`.

The graph is a read-only derivative of the active V3 snapshot. It contains parameter, atom, category, sub-category, quantity-kind, and UI-element nodes. Taxonomy/atom edges come directly from dataset fields; semantic edges are mutual bounded k-nearest-neighbor relationships reproduced from the active composite vectors. The interface only requests a bounded ego graph, never the full graph.

The page supports build, stop, refresh, exact `technical_name` lookup, depth 1–2, edge filtering, a tabular subgraph, and edge provenance. Runtime artifacts live under `data/combinatorial-genesis/knowledge-graph/` and are excluded from Git. Building is CPU-only and does not call Ollama.

## Morpho-Acoustic RAG

Route: `/morpho-acoustic-rag`.

This mode maps an uploaded image to relevant sound/structure parameters from the active V3 snapshot through the shared text/image space of `google/siglip2-base-patch16-224`. The model is loaded locally from `MMSS_SIGLIP_MODEL`, runs in float32 on CPU, and does not use Ollama or the GPU. Image similarity controls retrieval; the selected value mode independently controls automatic Range, Select, and Toggle values. Every returned control remains editable in the reused V3 control bank and can be exported through Clean Macro Output.

The text index is built in batches, reuses content-addressed row vectors, activates through a staging directory, and is marked stale when the V3 source or exclusion registry changes. Index and search operations both have explicit stop controls. Runtime vectors and row cache under `data/combinatorial-genesis/morpho-siglip*` are excluded from Git.

Parameter values are inferred in the same SigLIP2 image/text space from the existing V3 Range anchors, Select option texts, semantic axes, polarity matrix, and relation anchors. `Expressive` is the default: it selects the strongest Range anchor, interpolates only inside its local neighboring interval, and accepts the highest-scoring Select/Toggle option without a conservative margin. `Conservative` uses a soft weighted position, moves 35% from the stored default toward it, and requires a larger Select/Toggle margin. `Default only` disables value inference while preserving image-based retrieval. Value vectors are generated lazily for the current Top-K and stored in the ignored `morpho-siglip-value-cache`.

## Cross-Modal Consensus

Route: `/cross-modal-consensus`.

Iterations 1–3 provide the Cross-Modal Journal, Cycle Verification and Lingua Franca Bridge. Audio CLAP, Morpho-Acoustic and Semantic V3 results can be saved explicitly as immutable content-addressed snapshots. Image assets and selected audio fragments are retained locally by SHA-256; text sessions remain asset-free. Repeating the same save is idempotent. Records preserve the active V3 dataset identity, model metadata, retrieval ranks, normalized within-source scores, chosen values and provenance.

The Journal index and manifest are updated atomically. Deleting a record removes its media asset only when no other record references the same asset. Runtime records and user media live under `data/cross-modal-consensus/` and are excluded from Git.

The **Verify cycle** action asks the active chat model for a strict structured EN/RU reverse query, then calls `searchV3` directly with an empty current-value state and the original Top-K. The chat model receives a compact set of up to 12 human-readable acoustic descriptions and selected values; technical names and administrative metadata are deliberately omitted so a small local model does not mistake reverse synthesis for a request to explain controls. For Semantic V3 the original query is primary evidence. Replay uses one reverse-query language matching the original query (English by default for media), preventing translated duplicates from becoming competing multi-vector concepts. It compares the original and replayed parameter sets using weighted rank overlap, Jaccard, value agreement and retrieval-scope agreement. The calibrated `cycle-v2` score is `0.50 overlap + 0.25 Jaccard + 0.20 values + 0.05 scopes`; scores at or above `0.55` are `verified`, `0.20–0.55` are `review`, and lower scores are `rejected`. Raw model output is retained when structured parsing fails. Every retry is a separate immutable verification artifact, while the source Journal record remains unchanged. A human `approved/rejected` verdict is stored as a separate immutable artifact and never overwrites machine metrics. Manual approval makes a record eligible for Bridge; manual rejection remains visible as an explicit reviewer decision. The UI can stop the active chat request and repeat verification after model or dataset changes.

The **Lingua Franca Bridge** embeds `query_en + query_ru + key_concepts` from eligible cycle artifacts with the currently configured Ollama embedding model. It never compares or combines raw CLAP, SigLIP2 and Ollama vectors. The local `text-index` stores metadata in `rows.json`, normalized vectors in `embeddings.f32`, and model/dimension/journal identity in `manifest.json`. Rebuilding is incremental while the model is unchanged; matching verification/text hashes reuse their existing vectors. A model change marks the index stale and requires a rebuild. Search is strictly cross-modal (`audio → image` or `image → audio`), excludes the source record and duplicate asset hashes, uses only `verified` records by default, and includes `review` only through the explicit UI switch. `rejected` records are never indexed. Similarity shown in the UI is cosine similarity of reverse-query texts, not probability or CLAP/SigLIP2 similarity.

The **Consensus Engine** accepts explicitly selected Journal snapshots with independent user weights in `[0,1]`. Parameter votes use deterministic noisy-OR over within-source normalized scores plus a bounded agreement bonus. Range values are converted to normalized positions and resolved by weighted median before clamping and step snapping. Select and Toggle values use weighted categorical voting with the stored default as the deterministic tie-break. Text, String and Array values are retained only when sources agree exactly; otherwise the stored default is used and the row is marked as a conflict. Optional Knowledge Graph expansion is depth=1, limited to the two strongest semantic neighbours per directly selected parameter, multiplied by a visible fixed graph penalty, and never adds a second vote to a parameter already supported directly. The UI exposes source weights, graph toggle, provenance and conflicts, then reuses the V3 `VirtualizedParamList` and controlled `MacroGenerator` for manual adjustment and export.

The **Transitional Query** selects two different Journal records as A and B. The server performs one lightweight preparation step that joins their parameter snapshots to current V3 metadata; moving the slider afterwards is entirely local and does not call CLAP, SigLIP2, Ollama or an API. Parameter score is `(1-t) * scoreA + t * scoreB`, with an absent endpoint contributing score `0`. Range values interpolate through normalized `[0,1]` positions and are clamped/snapped to the current V3 range. Select and Toggle values use score-weighted voting with an `0.08` hysteresis band around the switch, preventing jitter. Text/String/Array use an endpoint value at `t=0/1`, exact agreement inside the interval, or default when the endpoints conflict. Top-K is re-ranked deterministically by interpolated score and `technical_name`. A transition point reuses the V3 control bank and macro export and can be stored as `modality: transition`; running Cycle Verification on that Journal record provides the optional LLM description and V3 replay.
