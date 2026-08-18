"""
Strudel RAG Semantic Search API

FastAPI server that provides semantic search for Strudel parameters.
Uses pre-computed embeddings with cosine similarity search.

Usage:
    uvicorn strudel_rag_server:app --reload --port 8001
    
Endpoints:
    POST /api/strudel/search - Search for Strudel parameters semantically
    GET /api/strudel/params - Get all available parameters
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
from typing import Optional

app = FastAPI(title="Strudel RAG Semantic Search")

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = sum(x * x for x in vec_a) ** 0.5
    mag_b = sum(x * x for x in vec_b) ** 0.5
    
    if mag_a == 0 or mag_b == 0:
        return 0.0
    
    return dot_product / (mag_a * mag_b)


# Load the embedded database
def load_params_db() -> list[dict]:
    """Load the Strudel parameters database with embeddings."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, "..", "..", "src", "lib", "strudel", "strudel-params-embedded.json")
    db_path = os.path.normpath(db_path)
    
    if not os.path.exists(db_path):
        # Fallback to non-embedded version
        db_path = db_path.replace("-embedded", "")
    
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        return []


PARAMS_DB = load_params_db()


class SearchQuery(BaseModel):
    query: str
    top_k: Optional[int] = 3
    min_score: Optional[float] = 0.0


class SearchResult(BaseModel):
    id: str
    name: str
    description: str
    category: str
    score: float
    matched_phrase: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total_matches: int


@app.get("/api/strudel/params")
async def get_params():
    """Get all available Strudel parameters."""
    return {
        "params": [
            {
                "id": p["id"],
                "name": p["name"],
                "description": p["description"],
                "category": p["category"]
            }
            for p in PARAMS_DB
        ],
        "total": len(PARAMS_DB)
    }


@app.post("/api/strudel/search", response_model=SearchResponse)
async def search_params(search_query: SearchQuery):
    """
    Perform semantic search on Strudel parameters.
    
    This endpoint expects the query to already be embedded by the client.
    For production use with Ollama/sentence-transformers, you would embed
    the query here before computing similarities.
    
    For this implementation, we use keyword matching as a fallback when
    no embedding is provided, and expect the frontend to handle embedding
    via Ollama or another service.
    """
    query = search_query.query.lower()
    top_k = search_query.top_k or 3
    min_score = search_query.min_score or 0.0
    
    results = []
    
    # Simple keyword-based scoring as fallback
    # In production, this would use query embedding + cosine similarity
    query_words = set(query.split())
    
    for param in PARAMS_DB:
        # Check name and description for keyword matches
        name_words = set(param['name'].lower().split())
        desc_words = set(param['description'].lower().split())
        category_words = set(param['category'].lower().split())
        
        all_words = name_words | desc_words | category_words
        
        # Calculate overlap score
        overlap = len(query_words & all_words)
        total_query_words = len(query_words) if query_words else 1
        
        base_score = overlap / total_query_words
        
        # Boost for exact matches
        if query in param['name'].lower():
            base_score += 0.5
        if query in param['description'].lower():
            base_score += 0.3
        
        # Add some fuzziness for partial matches
        for q_word in query_words:
            if any(q_word in word for word in all_words if len(q_word) > 2):
                base_score += 0.1
        
        if base_score >= min_score:
            results.append({
                "id": param["id"],
                "name": param["name"],
                "description": param["description"],
                "category": param["category"],
                "score": min(base_score, 1.0),
                "matched_phrase": next((w for w in all_words if w in query_words), None)
            })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    # Return top K results
    top_results = results[:top_k]
    
    return SearchResponse(
        query=query,
        results=top_results,
        total_matches=len(results)
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "params_loaded": len(PARAMS_DB)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
