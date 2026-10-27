import { NextResponse } from "next/server";
import { MAX_CONCURRENT_RUNS, runSidecar, runningTaskCount } from "@/lib/engine/runner";
import { buildMmssEnv } from "@/lib/mmss";
import { loadLLMSettings } from "@/lib/llm/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (runningTaskCount() >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        { ok: false, error: `Достигнут лимит одновременных задач (${MAX_CONCURRENT_RUNS})` },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const params = {
      n_pairs: Number(body?.n_pairs ?? 120),
      epochs: Number(body?.epochs ?? 3),
      lr: Number(body?.lr ?? 0.002),
      batch: Number(body?.batch ?? 8),
      out_checkpoint:
        typeof body?.out_checkpoint === "string" && body.out_checkpoint.trim()
          ? body.out_checkpoint.trim()
          : undefined,
    };

    const llmSettings = await loadLLMSettings();
    const handle = runSidecar({
      command: "mmss_retrain",
      inputFile: params,
      taskType: "mmss_retrain",
      title: "MMSS retrain",
      timeoutMs: 60 * 60 * 1000,
      extraEnv: {
        ...buildMmssEnv(body ?? {}),
        OLLAMA_BASE_URL: llmSettings.ollamaUrl,
        MMSS_OLLAMA_CHAT_MODEL: llmSettings.provider === "freellmapi" ? llmSettings.freeLLMApiModel : llmSettings.chatModel,
        TEXT_LLM_PROVIDER: llmSettings.provider,
        FREELLMAPI_BASE_URL: llmSettings.freeLLMApiUrl,
        FREELLMAPI_MODEL: llmSettings.freeLLMApiModel,
        ...(llmSettings.provider === "freellmapi" ? { FREELLMAPI_API_KEY: process.env.FREELLMAPI_API_KEY ?? "" } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      title: handle.title,
      params,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
