import { NextResponse } from "next/server";
import type { GenerateMacroRequest } from "@/lib/rag-v3/types";

export async function POST(request: Request) {
  const body = await request.json() as GenerateMacroRequest;
  if (!Array.isArray(body.parameters)) return NextResponse.json({ error: "parameters must be an array" }, { status: 400 });
  const lines = body.parameters.flatMap((parameter) => parameter.technical_name.trim()
    ? [`${parameter.technical_name.trim()}: ${parameter.current_value}`]
    : []);
  return NextResponse.json({ macro: lines.join("\n"), parameter_count: lines.length });
}

