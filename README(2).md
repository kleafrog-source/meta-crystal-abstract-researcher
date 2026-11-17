<p align="center">
  <img src="docs/assets/am-core-mark.svg" alt="Abstract-Mindfreak AM-Core" width="160" height="160"/>
</p>

<h1 align="center">Abstract-Mindfreak · AM-Core</h1>

<p align="center">
  <strong>Local multimodal research bench for sound parameters</strong><br/>
  Text · audio · spectrogram → ranked controls → values → macros & timelines
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-black?style=for-the-badge"/>
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-embeddings%20%26%20LLM-violet?style=for-the-badge"/>
  <img alt="CLAP" src="https://img.shields.io/badge/CLAP-audio--RAG-blue?style=for-the-badge"/>
  <img alt="SigLIP2" src="https://img.shields.io/badge/SigLIP2-spectrogram-teal?style=for-the-badge"/>
  <img alt="Gemma" src="https://img.shields.io/badge/EmbeddingGemma-multimodal-green?style=for-the-badge"/>
</p>

---

**Abstract-Mindfreak** is a desktop-oriented web app for exploring a large **catalogue of audio-production parameters** (~7k entries): search them with language, audio, or spectrogram frames, resolve numeric and discrete values, organize hits by **nine acoustic domain layers**, and export **macros** and **priority timelines** for further creative work (including Flowmusic-oriented workflows).

Everything runs **locally**: UI on Next.js, heavy lifting in a Python sidecar, embeddings and optional LLMs via **Ollama**, audio/image towers via **CLAP** and **SigLIP2**.

> Russian overview: [README.ru.md](README.ru.md)

---

## Why it is interesting

- **Dual text spaces** — Qwen3 and EmbeddingGemma 2 indexes side by side: same catalogue, different geometries of meaning.
- **AWTD vs resolved** — *Axis / Weight / Threshold / Depth* banks keep **roles** at catalogue defaults; *resolved* banks fill **values** through anchors and modality helpers.
- **AM Tri-Modal Stage** — one workbench for Brief search, CLAP, SigLIP2, Gemma-audio, layer mask, Stage-2 passes, automation, and export.
- **Service Bay** — all index builds and coverage audits in one place; work modes only *link* when something is stale.
- **Catalogue authority** — the published library (Queue → commit) is the source of truth for parameters—not a frozen legacy snapshot.

---

## Modes at a glance

| Mode | What you use it for |
|------|---------------------|
| [**AM Tri-Modal Stage**](docs/modes/am-stage.md) | Full multimodal session: wave, banks, automation |
| [**AM-Core Engine**](docs/modes/am-core-engine.md) | Fast text retrieval + Clean Macro |
| [**Service Bay**](docs/modes/service-bay.md) | Rebuild indexes, anchors, CLAP/SigLIP status |
| [**Audio-to-Parameter**](docs/modes/audio-to-parameter.md) | Segmented CLAP/SigLIP timelines |
| [**Audio CLAP RAG**](docs/modes/audio-clap-rag.md) | Dedicated CLAP query UI |
| [**Morpho-Acoustic RAG**](docs/modes/morpho-acoustic-rag.md) | SigLIP2 image/spectrogram search |
| [**AM-Vocal Morphology Matrix**](docs/modes/am-vocal-morphology-matrix.md) | Voice-centric parameter matrix |
| [**Combinatorial Genesis**](docs/modes/combinatorial-genesis.md) | Ingest session text → parameter pipeline |
| [**Combinatorial Synthesis**](docs/modes/combinatorial-synthesis.md) | Semantic-goal synthesis from sources |
| [**Parameter Catalogue**](docs/modes/parameter-catalogue.md) | Edit, queue, complete the library |
| [**Settings**](docs/modes/settings.md) | Models, bank enables, locale, glyphs |
| [**Dashboard**](docs/modes/am-core-dashboard.md) | Hub |
| [**White Space · Knowledge Graph · Consensus**](docs/modes/research-modes.md) | Heavier research tools (open on demand) |

Structured mode map (MMSS): [`docs/mmss-modes/abstract-mindfreak-modes-catalog.mmss.json`](docs/mmss-modes/abstract-mindfreak-modes-catalog.mmss.json) · Stage detail: [`am-tri-modal-stage.mmss.json`](docs/mmss-modes/am-tri-modal-stage.mmss.json)

---

## Quick start

```bash
pnpm install
python -m pip install -r requirements.txt
pnpm run db:generate   # if applicable in your checkout
pnpm run db:push
pnpm run dev
```

Requirements: **Node.js**, **pnpm**, **Python**, **Ollama** (for text/multimodal embeddings and optional LLMs). Large weights and built indexes stay on disk and are **not** committed to Git.

Optional Hugging Face cache (example):

```bash
$env:HF_HOME = "D:\hfmodels"
$env:HF_HUB_CACHE = "D:\hfmodels\hub"
```

---

## Architecture (sketch)

```text
React pages  →  Next.js API  →  TS jobs
                    ↓
              Python sidecar
                    ↓
     Catalogue + dual embedding indexes + CLAP/SigLIP artifacts
```

---

## Development notes

UI and retrieval behavior were iterated with **ChatGPT** (implementation assistant) and structured with the **[mmss-principle-synthesis](https://github.com/Abstract-Mindfreak/mmss-principle-synthesis/tree/main)** skill — used to keep mode contracts, Service Bay policy, and Stage banks explicit and composable.

---

## Models in use (attribution)

Local stacks typically include (operator-configurable in **Settings**):

| Role | Examples |
|------|----------|
| Text embedding | `qwen3-embedding:0.6b` (Qwen / Alibaba via Ollama) |
| Multimodal embedding | `embeddinggemma-2:740m` (Google EmbeddingGemma family via Ollama) |
| Audio–text | [LAION CLAP](https://github.com/LAION-AI/CLAP) `laion/clap-htsat-fused` |
| Image–text | [SigLIP / SigLIP2](https://github.com/google-research/big_vision) class checkpoints (e.g. `google/siglip2-base-patch16-224`) |
| Optional audio LLM | LiquidAI **LFM3-Audio** via Ollama when enabled |
| Optional text LLM | Operator-chosen Ollama chat models (e.g. Hermes-class JSON helpers) |

Respect each upstream project’s license and citation requirements when you redistribute weights or papers.

---

<p align="center">
  <sub>Abstract-Mindfreak · AM-Core — local parameter intelligence for sound</sub>
</p>
