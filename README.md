# <img src="docs/assets/readme-icons/am-core.svg" width="128" height="128" alt="AM-Core" /> Abstract-Mindfreak · AM-Core

AM-Core is a local workbench for finding published audio-production parameters, reviewing their values, and carrying retrieval results into session and macro workflows. Audio, text, and spectrogram-oriented modes use separate retrieval paths and indexes; results can be reviewed and adjusted in the UI.

The published parameter library in **Parameter Catalogue** is the product’s parameter authority. **Service Bay** reports and rebuilds indexes derived from that library. **AM-Stage** is the session workbench that consumes those indexes. A generated corpus or index is not the catalogue itself.

## Modes

| Mode | What it does |
|---|---|
| <img src="docs/assets/readme-icons/dashboard.svg" alt="" width="64" height="64" /> [AM-Core Dashboard](docs/modes/am-core-dashboard.md) | Entry point and navigation to the main work areas. |
| <img src="docs/assets/readme-icons/am-stage.svg" alt="" width="64" height="64" /> [AM Tri-Modal Stage](docs/modes/am-stage.md) | Work with a session audio file, text search, segmented analysis, parameter banks, timeline and exports. |
| <img src="docs/assets/readme-icons/am-core-engine.svg" alt="" width="64" height="64" /> [AM-Core Engine](docs/modes/am-core-engine.md) | Search parameters by text or transition, adjust retrieved controls and prepare macro output. |
| <img src="docs/assets/readme-icons/service-bay.svg" alt="" width="64" height="64" /> [Service Bay](docs/modes/service-bay.md) | Inspect index coverage and run manual index maintenance. |
| <img src="docs/assets/readme-icons/audio-to-parameter.svg" alt="" width="64" height="64" /> [Audio-to-Parameter](docs/modes/audio-to-parameter.md) | Create time-based nodes and inspect audio-derived parameter results. |
| <img src="docs/assets/readme-icons/audio-clap-rag.svg" alt="" width="64" height="64" /> [Audio CLAP RAG](docs/modes/audio-clap-rag.md) | Retrieve parameter candidates from an audio query with CLAP. |
| <img src="docs/assets/readme-icons/morpho-acoustic-rag.svg" alt="" width="64" height="64" /> [Morpho-Acoustic RAG](docs/modes/morpho-acoustic-rag.md) | Retrieve parameter candidates from an image or spectrogram with SigLIP2. |
| <img src="docs/assets/readme-icons/am-vocal-morphology-matrix.svg" alt="" width="64" height="64" /> [AM-Vocal Morphology Matrix](docs/modes/am-vocal-morphology-matrix.md) | Search and review vocal-related parameters from a structured description. |
| <img src="docs/assets/readme-icons/combinatorial-genesis.svg" alt="" width="64" height="64" /> [Combinatorial Genesis](docs/modes/combinatorial-genesis.md) | Inspect and process candidate material and runtime atoms. |
| <img src="docs/assets/readme-icons/combinatorial-synthesis.svg" alt="" width="64" height="64" /> [Combinatorial Synthesis](docs/modes/combinatorial-synthesis.md) | Propose, review and publish parameter combinations from selected sources and a semantic goal. |
| <img src="docs/assets/readme-icons/parameter-catalogue.svg" alt="" width="64" height="64" /> [Parameter Catalogue](docs/modes/parameter-catalogue.md) | Browse, maintain, import and export the published parameter library. |
| <img src="docs/assets/readme-icons/settings.svg" alt="" width="64" height="64" /> [Settings](docs/modes/settings.md) | Configure language, appearance, model slots and feature/bank availability. |
| <img src="docs/assets/readme-icons/white-space-discovery.svg" alt="" width="64" height="64" /> [White Space Discovery](docs/modes/research-modes.md#white-space-discovery) | Explore sparse regions of the published catalogue. |
| <img src="docs/assets/readme-icons/knowledge-graph.svg" alt="" width="64" height="64" /> [Knowledge Graph](docs/modes/research-modes.md#knowledge-graph) | Build and inspect parameter relations and neighbors. |
| <img src="docs/assets/readme-icons/cross-modal-consensus.svg" alt="" width="64" height="64" /> [Cross-Modal Consensus](docs/modes/research-modes.md#cross-modal-consensus) | Review cross-modal journal records and run consensus/transition operations. |

The sidebar also groups legacy tools under **Archive / Legacy & Research**; their individual SVG icons are shown on the [legacy mode card](docs/modes/legacy-research.md).

| Legacy mode | |
|---|---|
| <img src="docs/assets/readme-icons/am-crystal-library.svg" alt="" width="64" height="64" /> AM-Crystal Library · <img src="docs/assets/readme-icons/semantic-plane.svg" alt="" width="64" height="64" /> Semantic Plane · <img src="docs/assets/readme-icons/ire.svg" alt="" width="64" height="64" /> IRE | <img src="docs/assets/readme-icons/metis-lab.svg" alt="" width="64" height="64" /> Metis Lab · <img src="docs/assets/readme-icons/metis-research.svg" alt="" width="64" height="64" /> Metis Research |
| <img src="docs/assets/readme-icons/gw-collapser.svg" alt="" width="64" height="64" /> GW-Collapser · <img src="docs/assets/readme-icons/gw-crystal-pool.svg" alt="" width="64" height="64" /> GW Crystal Pool · <img src="docs/assets/readme-icons/torus-atlas.svg" alt="" width="64" height="64" /> Torus Atlas | <img src="docs/assets/readme-icons/crystal-umap.svg" alt="" width="64" height="64" /> Map · Crystal UMAP · <img src="docs/assets/readme-icons/meta-crystal-lab.svg" alt="" width="64" height="64" /> Meta-Crystal V3 Lab |

## AM-Stage banks

Text retrieval keeps separate Qwen and EmbeddingGemma 2 banks so results from different encoders are not merged into one bank. The visible bank IDs are `text.qwen.resolved` and `text.gemma.awtd`; Gemma text value-pass results use `text.gemma.resolved`. Audio banks include `audio.clap.resolved`, `audio.gemma.awtd` and `audio.gemma.resolved`. SigLIP2 spectrogram results use `spec.siglip.resolved`. The `spec.gemma.*` capability is disabled by default.

In Stage terminology, **AWTD** expands to *Axis / Weight / Threshold / Depth* and denotes the parameter identity/role pass that retains catalogue defaults. **Resolved** denotes a later value pass; actual values may come from a retrieval/anchor result or a catalogue fallback. These names describe distinct banks and should not be treated as interchangeable.

## Quick start

Requirements: Node.js compatible with the repository’s Next.js version, pnpm, Python, and a running Ollama service for enabled Ollama-backed features. Model weights, local CLAP/SigLIP2 assets and generated indexes are not bundled.

```powershell
pnpm install
python -m pip install -r requirements.txt
pnpm run db:generate
pnpm run db:push
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). Select model IDs and enable the required capabilities in **Settings**. The default embedding slots are Qwen `qwen3-embedding:0.6b` and EmbeddingGemma 2 `embeddinggemma-2:740m`; settings can override them. Install the selected Ollama models separately and ensure the configured local CLAP/SigLIP2 assets are available before using those modes. Python jobs are started by the application as needed; there is no separate Python sidecar service to launch.

## Architecture

```text
Next.js / React UI → Next.js API routes and TypeScript jobs → Python sidecar / local model runtimes → catalogue-derived indexes and analysis artifacts
```

The application uses Ollama for configured embedding and language-model slots and local runtimes for CLAP, SigLIP2 and acoustic feature processing. Indexes are built from catalogue data in **Service Bay**; sessions and work modes consume the indexes relevant to their configured model and modality.

## Models and licenses

Configured model families include Qwen embeddings, EmbeddingGemma 2, LAION-CLAP, SigLIP2, optional LFM3 audio, and Ollama language models. Exact IDs, providers and enablement are configurable in Settings. Respect the license and usage terms of each upstream model and dataset.

## Documentation

- [Mode cards](docs/modes/)
- [MMSS mode catalog](docs/mmss-modes/abstract-mindfreak-modes-catalog.mmss.json)
- [AM-Stage MMSS contract](docs/mmss-modes/am-tri-modal-stage.mmss.json)
- [Service Bay index matrix](docs/service-bay-index-matrix.md)
