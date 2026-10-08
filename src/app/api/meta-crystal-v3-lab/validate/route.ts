import { NextResponse } from "next/server";

import { readV3ParameterUnion, validateLabParameters } from "@/lib/meta-crystal-v3-lab";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { parameters?: unknown; parent_parameters?: unknown };
    const parameters = Array.isArray(body.parameters)
      ? body.parameters.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    if (!parameters.length || parameters.length > 50) return NextResponse.json({ error: "Provide between 1 and 50 parameters." }, { status: 400 });
    const { datasetVersion, records } = await readV3ParameterUnion();
    const parents = Array.isArray(body.parent_parameters) ? body.parent_parameters.filter((item): item is string => typeof item === "string") : [];
    return NextResponse.json({ dataset_version: datasetVersion, candidates: validateLabParameters(parameters, new Set(records.keys()), parents) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

