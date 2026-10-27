import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getActiveProvider } from "./factory";

vi.mock("@/lib/db", () => ({ db: { setting: { findUnique: vi.fn() } } }));

const storedSettings = vi.mocked(db.setting.findUnique);

describe("active text provider settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the selected Ollama model for Ollama", async () => {
    storedSettings.mockResolvedValue({ key: "llm_settings_v1", value: JSON.stringify({ provider: "ollama", chatModel: "hermes3-strict-json:latest" }) } as never);
    const { provider, settings } = await getActiveProvider();
    expect(provider.id).toBe("ollama");
    expect(settings.chatModel).toBe("hermes3-strict-json:latest");
  });

  it("uses FreeLLMAPI Auto instead of the saved Ollama model", async () => {
    storedSettings.mockResolvedValue({ key: "llm_settings_v1", value: JSON.stringify({ provider: "freellmapi", chatModel: "hermes3-strict-json:latest", freeLLMApiModel: "auto" }) } as never);
    const { provider, settings } = await getActiveProvider();
    expect(provider.id).toBe("freellmapi");
    expect(settings.chatModel).toBe("auto");
  });

  it("uses an explicitly selected FreeLLMAPI model", async () => {
    storedSettings.mockResolvedValue({ key: "llm_settings_v1", value: JSON.stringify({ provider: "freellmapi", chatModel: "hermes3-strict-json:latest", freeLLMApiModel: "gemini-2.5-flash" }) } as never);
    const { provider, settings } = await getActiveProvider();
    expect(provider.id).toBe("freellmapi");
    expect(settings.chatModel).toBe("gemini-2.5-flash");
  });
});
