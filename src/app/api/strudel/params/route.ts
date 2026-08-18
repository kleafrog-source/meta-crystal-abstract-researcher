/**
 * Strudel RAG API - Get All Parameters Endpoint
 * 
 * Returns the complete list of Strudel parameters with their metadata.
 * Used for client-side indexing and embedding generation.
 */

import { NextResponse } from "next/server";
import strudelParamsDB from "@/lib/strudel/strudel-params-db.json";

export async function GET() {
  // Group parameters by category
  const byCategory = strudelParamsDB.reduce((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = [];
    }
    acc[param.category].push(param);
    return acc;
  }, {} as Record<string, typeof strudelParamsDB>);

  return NextResponse.json({
    total: strudelParamsDB.length,
    categories: Object.keys(byCategory),
    params: strudelParamsDB,
    byCategory
  });
}
