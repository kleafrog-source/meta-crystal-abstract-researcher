# Strudel RAG - Semantic Parameter Search

## Overview

This module provides **semantic search** functionality for Strudel parameters using RAG (Retrieval-Augmented Generation) with BGE-m3 embeddings. Users can search for Strudel audio synthesis parameters using natural language queries in both Russian and English.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User Query    │────▶│  Embedding       │────▶│  Cosine         │
│ "ретро-звук с   │     │  Generation      │     │  Similarity     │
│  арпеджио"      │     │  (Ollama/BGE-m3) │     │  Search         │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐     ┌────────▼────────┐
│  React Flow     │◀────│  Zustand Store   │◀────│  Top-K Results  │
│  Node Addition  │     │  Integration     │     │  (score > 0.1)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Components

### Frontend (`src/components/strudel-flow/`)

- **`SemanticStrudelSuggester.tsx`**: Main React component with UI for semantic search
- **`types.ts`**: TypeScript type definitions

### Backend API (`src/app/api/strudel/`)

- **`/api/strudel/search`**: POST endpoint for semantic search
- **`/api/strudel/params`**: GET endpoint to retrieve all parameters

### Store (`src/lib/strudel/`)

- **`strudel-flow-store.ts`**: Zustand store for managing React Flow state
- **`strudel-params-db.json`**: Parameter database with pre-computed embeddings

### Python Tools (`python_engine/strudel_rag/`)

- **`generate_strudel_embeddings.py`**: Script to generate embeddings using BGE-m3

## Installation & Setup

### 1. Install Dependencies

```bash
# For embedding generation (optional, if not using Ollama)
pip install sentence-transformers requests

# Or use Ollama (recommended)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull bge-m3
```

### 2. Generate Embeddings

Using Ollama (recommended):
```bash
cd python_engine/strudel_rag
python generate_strudel_embeddings.py --backend ollama --output ../../src/lib/strudel/strudel-params-db.json
```

Using sentence-transformers:
```bash
cd python_engine/strudel_rag
pip install sentence-transformers
python generate_strudel_embeddings.py --backend sentence-transformers --output ../../src/lib/strudel/strudel-params-db.json
```

### 3. Start the Development Server

```bash
npm run dev
# or
bun run dev
```

## Usage

### Component Integration

```tsx
import { SemanticStrudelSuggester } from "@/components/strudel-flow/SemanticStrudelSuggester";

// In your page/component
<SemanticStrudelSuggester 
  compact={false} 
  onAddNode={(result) => {
    console.log("Added node:", result);
  }}
/>
```

### API Endpoints

#### Search Parameters
```bash
POST http://localhost:3000/api/strudel/search
Content-Type: application/json

{
  "query": "retro sound with arpeggio",
  "top_k": 5,
  "min_score": 0.1
}
```

Response:
```json
{
  "query": "retro sound with arpeggio",
  "results": [
    {
      "id": "crush",
      "name": "Crush",
      "description": "Bit-crushing effect for retro, lo-fi digital distortion",
      "category": "Audio Effects",
      "score": 0.87,
      "matched_phrase": null
    },
    {
      "id": "arp",
      "name": "Arpeggiator",
      "description": "Automatically plays notes in sequence",
      "category": "Sequencing",
      "score": 0.82,
      "matched_phrase": null
    }
  ],
  "count": 2,
  "search_type": "keyword"
}
```

#### With Pre-computed Embedding
```bash
POST http://localhost:3000/api/strudel/search
Content-Type: application/json

{
  "query": "ретро-звук",
  "embedding": [0.023, -0.045, ...],  // BGE-m3 vector (1024 dims)
  "top_k": 5,
  "min_score": 0.1
}
```

#### Get All Parameters
```bash
GET http://localhost:3000/api/strudel/params
```

## Features

### ✅ Implemented
- [x] Semantic search with BGE-m3 embeddings
- [x] Keyword-based fallback search
- [x] Multilingual support (Russian/English)
- [x] React Flow integration via Zustand
- [x] Compact and full UI modes
- [x] Confidence scoring
- [x] Category filtering
- [x] REST API endpoints

### 🚧 Future Enhancements
- [ ] Browser-based ONNX runtime for client-side embeddings
- [ ] Pattern generation from semantic queries
- [ ] Strudel code snippet generation
- [ ] History/favorites tracking
- [ ] Advanced filtering by category/type

## Configuration

### Environment Variables (Optional)

```env
# Ollama configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=bge-m3

# Search defaults
STRUDEL_SEARCH_TOP_K=5
STRUDEL_SEARCH_MIN_SCORE=0.1
```

## Performance

- **Embedding Generation**: ~50-100ms per parameter (Ollama)
- **Search Latency**: <10ms (client-side cosine similarity)
- **Database Size**: ~30 parameters × 1024 dims = ~120KB JSON

## Troubleshooting

### Ollama Connection Failed
```bash
# Check if Ollama is running
ollama list

# Pull bge-m3 model if not present
ollama pull bge-m3

# Test embedding endpoint
curl http://localhost:11434/api/embeddings \
  -d '{"model":"bge-m3","prompt":"test"}'
```

### No Results Returned
- Lower `min_score` threshold (default: 0.1)
- Try keywords from parameter names/descriptions
- Check that embeddings are present in `strudel-params-db.json`

## License

MIT
