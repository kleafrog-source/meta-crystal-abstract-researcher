import { NextResponse } from "next/server";

import type {
  GenerateMacroRequest,
  GenerateMacroResponse,
} from "@/lib/rag-types";

export const dynamic = "force-dynamic";

function formatValue(value: number | string): string {
  return typeof value === "number" ? String(value) : value;
}

export async function POST(request: Request) {
  let body: GenerateMacroRequest;

  try {
    body = (await request.json()) as GenerateMacroRequest;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.parameters)) {
    return NextResponse.json(
      {
        error: "`parameters` must be an array.",
      },
      { status: 400 },
    );
  }

  const overrideLines = body.parameters
    .map((parameter) => {
      const technicalName = parameter.technical_name.trim();
      if (!technicalName) {
        return null;
      }

      const unit = parameter.unit?.trim()
        ? ` ${parameter.unit.trim()}`
        : "";

      return `- ${technicalName}: ${formatValue(parameter.current_value)}${unit}`;
    })
    .filter((line): line is string => line !== null);

  const payload: GenerateMacroResponse = {
    macro: overrideLines.join("\n"),
    parameter_count: overrideLines.length,
  };

  return NextResponse.json(payload);
}
