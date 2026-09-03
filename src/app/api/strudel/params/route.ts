/**
 * Strudel RAG API - Get All Parameters Endpoint
 * 
 * Returns the complete list of Strudel parameters with their metadata.
 * Used for client-side indexing and embedding generation.
 */

import { NextResponse } from "next/server";
import strudelParamsDB from "@/lib/strudel/strudel_catalog.json";
import { getStrudelPatternIndex } from "@/lib/strudel/pattern-index";
import { getStrudelRoleBlockIndex } from "@/lib/strudel/role-block-index";

export async function GET() {
  const byCategory = strudelParamsDB.reduce((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = [];
    }
    acc[param.category].push(param);
    return acc;
  }, {} as Record<string, typeof strudelParamsDB>);
  const patternIndex = getStrudelPatternIndex();
  const roleBlockIndex = getStrudelRoleBlockIndex();

  return NextResponse.json({
    ok: true,
    total: strudelParamsDB.length,
    categories: Object.keys(byCategory),
    params: strudelParamsDB,
    byCategory,
    patternIndex: patternIndex
      ? {
          ready: true,
          rows: patternIndex.manifest.rows,
          dimension: patternIndex.manifest.dimension,
          backend: patternIndex.manifest.backend,
          model: patternIndex.manifest.model,
        }
      : {
          ready: false,
          rows: 0,
          dimension: 0,
          backend: null,
          model: null,
        },
    roleBlockIndex: roleBlockIndex
      ? {
          ready: true,
          rows: roleBlockIndex.manifest.rows,
          dimension: roleBlockIndex.manifest.dimension,
          backend: roleBlockIndex.manifest.backend,
          model: roleBlockIndex.manifest.model,
        }
      : {
          ready: false,
          rows: 0,
          dimension: 0,
          backend: null,
          model: null,
        },
  });
}
