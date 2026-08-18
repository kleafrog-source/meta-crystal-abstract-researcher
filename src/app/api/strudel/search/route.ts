/**
 * Strudel RAG API - Semantic Search Endpoint
 * 
 * Provides semantic search for Strudel parameters using pre-computed embeddings.
 * Supports both Russian and English queries thanks to BGE-m3 multilingual embeddings.
 * 
 * Usage:
 *   POST /api/strudel/search
 *   {
 *     "query": "ретро-звук с арпеджио",
 *     "top_k": 5,
 *     "min_score": 0.1
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import strudelParamsDB from "@/lib/strudel/strudel-params-db.json";
import type { StrudelSearchResult } from "@/components/strudel-flow/types";

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

/**
 * Perform keyword-based fallback search when embeddings are not available
 * or semantic search is disabled
 */
function keywordSearch(
  query: string,
  topK: number = 5
): StrudelSearchResult[] {
  const queryLower = query.toLowerCase();
  const queryWords = new Set(queryLower.split(/\s+/).filter(w => w.length > 2));
  
  const results: StrudelSearchResult[] = [];
  
  for (const param of strudelParamsDB) {
    const nameWords = new Set(param.name.toLowerCase().split(/\s+/));
    const descWords = new Set(param.description.toLowerCase().split(/\s+/));
    const categoryWords = new Set(param.category.toLowerCase().split(/\s+/));
    
    const allWords = new Set([...nameWords, ...descWords, ...categoryWords]);
    
    // Calculate overlap score
    let overlap = 0;
    for (const qWord of queryWords) {
      if (allWords.has(qWord)) overlap++;
      else if (Array.from(allWords).some(w => w.includes(qWord) && qWord.length > 2)) {
        overlap += 0.5;
      }
    }
    
    const totalWords = queryWords.size || 1;
    let score = overlap / totalWords;
    
    // Boost for exact matches
    if (param.name.toLowerCase().includes(queryLower)) score += 0.5;
    if (param.description.toLowerCase().includes(queryLower)) score += 0.3;
    
    if (score > 0.1) {
      results.push({
        id: param.id,
        name: param.name,
        description: param.description,
        category: param.category,
        score: Math.min(score, 1.0),
        matched_phrase: Array.from(queryWords).find(w => allWords.has(w)) || null
      });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Perform semantic search using pre-computed embeddings
 */
function semanticSearch(
  queryEmbedding: number[],
  topK: number = 5,
  minScore: number = 0.1
): StrudelSearchResult[] {
  const results: StrudelSearchResult[] = [];
  
  for (const param of strudelParamsDB) {
    if (!param.vector || param.vector.length === 0) continue;
    
    const score = cosineSimilarity(queryEmbedding, param.vector);
    
    if (score >= minScore) {
      results.push({
        id: param.id,
        name: param.name,
        description: param.description,
        category: param.category,
        score,
        matched_phrase: null
      });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 5, min_score = 0.1, embedding } = body;
    
    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }
    
    let results: StrudelSearchResult[];
    
    // If embedding is provided (from Ollama or other source), use semantic search
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      results = semanticSearch(embedding, top_k, min_score);
    } else {
      // Fallback to keyword search
      results = keywordSearch(query, top_k);
    }
    
    return NextResponse.json({
      query,
      results,
      count: results.length,
      search_type: embedding ? "semantic" : "keyword"
    });
  } catch (error) {
    console.error("Error in strudel search API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return basic info about the API
  return NextResponse.json({
    name: "Strudel RAG Search API",
    version: "1.0.0",
    description: "Semantic search for Strudel parameters",
    endpoints: {
      search: "POST /api/strudel/search",
      params: "GET /api/strudel/params"
    },
    total_params: strudelParamsDB.length,
    categories: Array.from(new Set(strudelParamsDB.map(p => p.category)))
  });
}
