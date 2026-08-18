#!/usr/bin/env python3
"""
Strudel RAG - Embedding Generator

Generates embeddings for Strudel parameters using BGE-m3 model.
Supports both Ollama and local sentence-transformers backends.

Usage:
    python generate_strudel_embeddings.py --output ../src/lib/strudel/strudel-params-db.json
    
Requirements:
    pip install sentence-transformers requests
"""

import json
import argparse
import os
from pathlib import Path
from typing import List, Dict, Any

# Try to import sentence-transformers, fallback to Ollama-only mode
try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False
    print("Warning: sentence-transformers not installed. Using Ollama-only mode.")

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("Error: requests library not installed. Please install: pip install requests")
    exit(1)


# Default Strudel parameters database
DEFAULT_PARAMS_DB = [
    {"id": "gain", "name": "Gain", "description": "Adjusts the amplitude/volume of the audio signal", "category": "Audio Effects"},
    {"id": "lpf", "name": "Low-Pass Filter", "description": "Removes high frequencies based on cutoff frequency, creates muffled sound", "category": "Audio Effects"},
    {"id": "hpf", "name": "High-Pass Filter", "description": "Removes low frequencies, creates thin, bright sound", "category": "Audio Effects"},
    {"id": "crush", "name": "Crush", "description": "Bit-crushing effect for retro, lo-fi digital distortion and glitchy sounds", "category": "Audio Effects"},
    {"id": "distort", "name": "Distortion", "description": "Adds harmonic distortion for aggressive, overdriven sound", "category": "Audio Effects"},
    {"id": "delay", "name": "Delay", "description": "Creates echo/repeat effects by delaying the audio signal", "category": "Audio Effects"},
    {"id": "reverb", "name": "Reverb", "description": "Simulates room/space acoustics for ambient, spacious sound", "category": "Audio Effects"},
    {"id": "pan", "name": "Pan", "description": "Positions sound in stereo field from left to right", "category": "Audio Effects"},
    {"id": "sine", "name": "Sine Wave", "description": "Pure sine wave oscillator, smooth and fundamental tone", "category": "Oscillators"},
    {"id": "sawtooth", "name": "Sawtooth Wave", "description": "Rich, bright waveform with harmonics, classic synth sound", "category": "Oscillators"},
    {"id": "square", "name": "Square Wave", "description": "Hollow, woody waveform with odd harmonics, classic chiptune sound", "category": "Oscillators"},
    {"id": "triangle", "name": "Triangle Wave", "description": "Soft, flute-like waveform with gentle harmonics", "category": "Oscillators"},
    {"id": "noise", "name": "Noise", "description": "White noise generator for percussion, wind, or texture effects", "category": "Oscillators"},
    {"id": "fm", "name": "FM Synthesis", "description": "Frequency modulation synthesis for metallic, bell-like tones", "category": "Synthesis"},
    {"id": "am", "name": "AM Synthesis", "description": "Amplitude modulation synthesis for tremolo and ring modulation effects", "category": "Synthesis"},
    {"id": "arp", "name": "Arpeggiator", "description": "Automatically plays notes in sequence, creates running patterns", "category": "Sequencing"},
    {"id": "seq", "name": "Sequencer", "description": "Programs note patterns and rhythms in steps", "category": "Sequencing"},
    {"id": "slow", "name": "Slow", "description": "Slows down the pattern by repeating each step multiple times", "category": "Time Manipulation"},
    {"id": "fast", "name": "Fast", "description": "Speeds up the pattern by dividing each step", "category": "Time Manipulation"},
    {"id": "stretch", "name": "Stretch", "description": "Stretches pattern across multiple cycles", "category": "Time Manipulation"},
    {"id": "loop", "name": "Loop", "description": "Repeats a pattern for specified number of cycles", "category": "Sequencing"},
    {"id": "rand", "name": "Random", "description": "Randomly selects values from provided options for generative patterns", "category": "Generative"},
    {"id": "euclid", "name": "Euclidean Rhythm", "description": "Generates rhythmic patterns using Euclidean algorithm for world music rhythms", "category": "Generative"},
    {"id": "mute", "name": "Mute", "description": "Silences specific steps or tracks in the pattern", "category": "Sequencing"},
    {"id": "density", "name": "Density", "description": "Increases note density by adding random notes to pattern", "category": "Generative"},
    {"id": "chunk", "name": "Chunk", "description": "Groups pattern elements into chunks for polyrhythmic effects", "category": "Sequencing"},
    {"id": "note", "name": "Note", "description": "Specifies musical notes with octave information", "category": "Music Theory"},
    {"id": "scale", "name": "Scale", "description": "Constrains notes to a specific musical scale", "category": "Music Theory"},
    {"id": "chord", "name": "Chord", "description": "Plays multiple notes simultaneously as chords", "category": "Music Theory"},
    {"id": "transp", "name": "Transpose", "description": "Shifts all notes up or down by semitones", "category": "Music Theory"},
]


def get_embedding_ollama(text: str, model: str = "bge-m3", host: str = "http://localhost:11434") -> List[float]:
    """Get embedding using Ollama API"""
    try:
        response = requests.post(
            f"{host}/api/embeddings",
            json={"model": model, "prompt": text},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        return data.get("embedding", [])
    except Exception as e:
        print(f"Ollama embedding failed: {e}")
        return []


def get_embedding_sentence_transformers(text: str, model_name: str = "BAAI/bge-m3") -> List[float]:
    """Get embedding using local sentence-transformers model"""
    if not HAS_SENTENCE_TRANSFORMERS:
        return []
    
    try:
        model = SentenceTransformer(model_name)
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()
    except Exception as e:
        print(f"Sentence-transformers embedding failed: {e}")
        return []


def generate_embeddings(
    params: List[Dict[str, Any]],
    backend: str = "ollama",
    model: str = "bge-m3",
    ollama_host: str = "http://localhost:11434"
) -> List[Dict[str, Any]]:
    """Generate embeddings for all parameters"""
    
    print(f"Generating embeddings for {len(params)} parameters using {backend} backend...")
    
    embedded_params = []
    successful = 0
    failed = 0
    
    for i, param in enumerate(params):
        # Create text for embedding (combine name and description)
        text = f"{param['name']}: {param['description']}"
        
        print(f"[{i+1}/{len(params)}] Processing: {param['id']}")
        
        # Get embedding based on backend
        if backend == "ollama":
            vector = get_embedding_ollama(text, model, ollama_host)
        elif backend == "sentence-transformers":
            vector = get_embedding_sentence_transformers(text, model)
        else:
            print(f"Unknown backend: {backend}")
            vector = []
        
        if vector and len(vector) > 0:
            successful += 1
            embedded_params.append({
                **param,
                "vector": vector
            })
            print(f"  ✓ Success (vector dim: {len(vector)})")
        else:
            failed += 1
            embedded_params.append({
                **param,
                "vector": []
            })
            print(f"  ✗ Failed")
    
    print(f"\nCompleted: {successful} successful, {failed} failed")
    return embedded_params


def load_params_db(input_path: str) -> List[Dict[str, Any]]:
    """Load parameters database from JSON file"""
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Remove existing vectors if present
            return [{k: v for k, v in p.items() if k != 'vector'} for p in data]
    except FileNotFoundError:
        print(f"Input file not found: {input_path}. Using default parameters.")
        return DEFAULT_PARAMS_DB
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in input file: {e}. Using default parameters.")
        return DEFAULT_PARAMS_DB


def save_params_db(params: List[Dict[str, Any]], output_path: str) -> None:
    """Save parameters database to JSON file"""
    # Ensure directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(params, f, indent=2, ensure_ascii=False)
    
    print(f"Saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate embeddings for Strudel parameters using BGE-m3"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        default=None,
        help="Input JSON file with parameters (default: use built-in list)"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="../src/lib/strudel/strudel-params-db.json",
        help="Output JSON file path (default: ../src/lib/strudel/strudel-params-db.json)"
    )
    parser.add_argument(
        "--backend", "-b",
        type=str,
        choices=["ollama", "sentence-transformers"],
        default="ollama",
        help="Embedding backend (default: ollama)"
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default="bge-m3",
        help="Model name (default: bge-m3)"
    )
    parser.add_argument(
        "--ollama-host",
        type=str,
        default="http://localhost:11434",
        help="Ollama API host (default: http://localhost:11434)"
    )
    
    args = parser.parse_args()
    
    # Load parameters
    if args.input:
        params = load_params_db(args.input)
    else:
        params = DEFAULT_PARAMS_DB
    
    print(f"Loaded {len(params)} parameters")
    
    # Generate embeddings
    embedded_params = generate_embeddings(
        params,
        backend=args.backend,
        model=args.model,
        ollama_host=args.ollama_host
    )
    
    # Save results
    save_params_db(embedded_params, args.output)
    
    print("\nDone! You can now use the semantic search feature in strudel-flow.")


if __name__ == "__main__":
    main()
