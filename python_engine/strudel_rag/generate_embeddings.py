"""
Strudel RAG Embedding Generator

This script generates embeddings for Strudel parameters using a local embedding model.
It reads the strudel-params-db.json file and adds pre-computed vectors to each entry.

Usage:
    python generate_embeddings.py
    
Requirements:
    - sentence-transformers
    - ollama (optional, for bge-m3 via Ollama API)
"""

import json
import os
import sys

# Try to use Ollama first (recommended for BGE-m3)
# If Ollama is not available, fall back to sentence-transformers

def get_embedding_ollama(text: str, model: str = "bge-m3") -> list[float]:
    """Get embedding from Ollama API."""
    import urllib.request
    import json as json_lib
    
    url = "http://localhost:11434/api/embeddings"
    data = json_lib.dumps({
        "model": model,
        "prompt": text
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json_lib.loads(response.read().decode('utf-8'))
            return result.get("embedding", [])
    except Exception as e:
        print(f"Ollama error: {e}", file=sys.stderr)
        return None


def get_embedding_sentence_transformers(text: str, model_name: str = "BAAI/bge-m3") -> list[float]:
    """Get embedding from sentence-transformers library."""
    from sentence_transformers import SentenceTransformer
    
    # Cache the model globally
    if not hasattr(get_embedding_sentence_transformers, 'model'):
        print(f"Loading model {model_name}...")
        get_embedding_sentence_transformers.model = SentenceTransformer(model_name)
    
    embedding = get_embedding_sentence_transformers.model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def generate_embeddings(input_file: str, output_file: str, use_ollama: bool = True):
    """Generate embeddings for all Strudel parameters."""
    
    # Load the database
    with open(input_file, 'r', encoding='utf-8') as f:
        params_db = json.load(f)
    
    print(f"Loaded {len(params_db)} parameters from {input_file}")
    
    # Generate embeddings
    embedded_count = 0
    failed_count = 0
    
    for param in params_db:
        # Combine name and description for better semantic matching
        text_to_embed = f"{param['name']}: {param['description']}"
        
        embedding = None
        
        if use_ollama:
            embedding = get_embedding_ollama(text_to_embed)
            if embedding is None:
                print(f"Ollama failed, falling back to sentence-transformers")
                use_ollama = False
        
        if not embedding:
            try:
                embedding = get_embedding_sentence_transformers(text_to_embed)
            except ImportError:
                print("sentence-transformers not installed. Install with: pip install sentence-transformers")
                print("Using zero vectors as placeholder.")
                embedding = [0.0] * 768  # Placeholder dimension
            except Exception as e:
                print(f"Error generating embedding for {param['id']}: {e}")
                embedding = [0.0] * 768  # Placeholder
                failed_count += 1
        
        param['vector'] = embedding
        embedded_count += 1
        print(f"Embedded: {param['id']} ({param['name']})")
    
    # Save the embedded database
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(params_db, f, indent=2, ensure_ascii=False)
    
    print(f"\nCompleted: {embedded_count} embedded, {failed_count} failed")
    print(f"Output saved to: {output_file}")


if __name__ == "__main__":
    # Determine paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, "..", "..", "src", "lib", "strudel", "strudel-params-db.json")
    output_file = os.path.join(script_dir, "..", "..", "src", "lib", "strudel", "strudel-params-embedded.json")
    
    # Normalize paths
    input_file = os.path.normpath(input_file)
    output_file = os.path.normpath(output_file)
    
    print(f"Input: {input_file}")
    print(f"Output: {output_file}")
    
    # Check if input file exists
    if not os.path.exists(input_file):
        print(f"Error: Input file not found: {input_file}")
        sys.exit(1)
    
    # Try Ollama first, then fall back to sentence-transformers
    generate_embeddings(input_file, output_file, use_ollama=True)
