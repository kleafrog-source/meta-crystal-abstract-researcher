# Strudel Flow - Semantic Parameter Suggester (RAG)

## Overview

This implementation adds a **Semantic Parameter Suggester** mode to the strudel-flow project, enabling users to discover and add Strudel parameters using natural language queries. The system uses RAG (Retrieval-Augmented Generation) with BGE-m3 embeddings for multilingual semantic search.

## Architecture

### Components

1. **Frontend Component** (`src/components/strudel-flow/SemanticStrudelSuggester.tsx`)
   - React component with natural language query input
   - Supports both compact and full modes
   - Integrates with Zustand store for adding nodes to React Flow
   - Multilingual support (Russian & English)

2. **Zustand Store** (`src/lib/strudel/strudel-flow-store.ts`)
   - Manages React Flow state (nodes and edges)
   - Provides `addNode`, `removeNode`, `updateNode` actions
   - Maps Strudel parameters to node types

3. **Parameter Database** (`src/lib/strudel/strudel-params-db.json`)
   - Static JSON with 30+ Strudel parameters
   - Includes id, name, description, category for each parameter
   - Ready for embedding vector storage

4. **Python Backend** (`python_engine/strudel_rag/`)
   - `generate_embeddings.py`: Script to generate BGE-m3 embeddings
   - `strudel_rag_server.py`: FastAPI server for semantic search API

## Features

### Semantic Search
- Natural language queries: "retro game sound with fast arpeggio"
- Multilingual support via BGE-m3 model
- Cosine similarity matching against pre-computed embeddings
- Fallback to keyword search if embedding service unavailable

### Integration with React Flow
- One-click "Add to Flow" button on search results
- Automatic node type detection (oscillator, effect, sequencer, modifier)
- Random position generation for new nodes
- Zustand store integration for state management

### UI Modes
- **Full Mode**: Detailed view with descriptions, scores, and badges
- **Compact Mode**: Minimal view for sidebars or popups

## Setup

### 1. Install Dependencies

```bash
# Python dependencies for embedding generation
pip install sentence-transformers fastapi uvicorn pydantic

# Or use Ollama for embeddings (recommended)
# Download Ollama: https://ollama.ai
ollama pull bge-m3
```

### 2. Generate Embeddings (Optional)

For full semantic search with embeddings:

```bash
cd /workspace/python_engine/strudel_rag
python generate_embeddings.py
```

This creates `strudel-params-embedded.json` with pre-computed vectors.

### 3. Start the RAG Server (Optional)

For server-side semantic search:

```bash
cd /workspace/python_engine/strudel_rag
uvicorn strudel_rag_server:app --reload --port 8001
```

### 4. Use the Component

```tsx
import { SemanticStrudelSuggester } from "@/components/strudel-flow/SemanticStrudelSuggester";

// Full mode
<SemanticStrudelSuggester />

// Compact mode with custom handler
<SemanticStrudelSuggester 
  compact 
  onAddNode={(result) => {
    // Custom handling
    console.log("Adding:", result.name);
  }}
/>
```

## API Endpoints

If running the RAG server:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/strudel/params` | GET | Get all available parameters |
| `/api/strudel/search` | POST | Semantic search (body: `{query, top_k, min_score}`) |
| `/health` | GET | Health check |

## Usage Examples

### Query Examples (English)
- "retro lo-fi distortion" → suggests `crush`, `distort`
- "fast arpeggio pattern" → suggests `arp`, `fast`
- "ambient spacious reverb" → suggests `reverb`, `delay`

### Query Examples (Russian)
- "ретро звук с дисторшном" → suggests `crush`, `distort`
- "быстрое арпеджио" → suggests `arp`, `fast`
- "эмбиент реверберация" → suggests `reverb`, `delay`

## File Structure

```
/workspace
├── src/
│   ├── components/
│   │   └── strudel-flow/
│   │       ├── SemanticStrudelSuggester.tsx  # Main component
│   │       └── types.ts                       # TypeScript types
│   └── lib/
│       └── strudel/
│           ├── strudel-params-db.json        # Parameter database
│           └── strudel-flow-store.ts         # Zustand store
└── python_engine/
    └── strudel_rag/
        ├── generate_embeddings.py            # Embedding generator
        └── strudel_rag_server.py             # FastAPI server
```

## Future Enhancements

1. **Full Embedding Support**: Complete the BGE-m3 embedding generation for all parameters
2. **Edge Creation**: Auto-connect nodes based on signal flow logic
3. **Pattern Generation**: Generate complete Strudel patterns from queries
4. **Browser-based Embeddings**: Use ONNX Runtime Web for client-side embeddings
5. **Command Palette Integration**: Add to existing command palette UI
6. **History & Favorites**: Track frequently used parameters

## Troubleshooting

### Ollama Connection Failed
- Ensure Ollama is running: `ollama serve`
- Pull the model: `ollama pull bge-m3`
- Check CORS settings if running on different port

### RAG Server Unavailable
- The component falls back to client-side keyword search automatically
- No error will be shown to the user

### Empty Results
- Try simpler queries (1-3 words)
- Check if parameter database is loaded correctly
- Verify the search score threshold (default: 0.1)
