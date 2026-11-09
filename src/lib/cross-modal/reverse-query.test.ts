import { describe, expect, it, vi } from "vitest";
import { generateReverseQuery, parseReverseQueryOutput, ReverseQueryOutputError } from "./reverse-query";

const valid = { query_en: "A dark evolving synth texture", query_ru: "Тёмная развивающаяся синтезаторная текстура", key_concepts: ["darkness", "evolution", "synth texture"], uncertainties: [] };

describe("parseReverseQueryOutput", () => {
  it("accepts a plain JSON response and preserves it as raw evidence", () => {
    const raw = JSON.stringify(valid);
    expect(parseReverseQueryOutput(raw)).toMatchObject({ reverse_query: { ...valid, text: valid.query_en, textSourceField: "query_en", missingFields: [] }, raw_response: raw });
  });
  it("accepts a JSON object wrapped in Markdown while preserving the original response", () => {
    const raw = `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(parseReverseQueryOutput(raw)).toMatchObject({ reverse_query: valid, raw_response: raw });
  });
  it.each(["A useful but unstructured description", "{\"query_en\":\"truncated"]) ("classifies useful plain text and malformed JSON separately", (raw) => {
    if (!raw.startsWith("{")) {
      expect(parseReverseQueryOutput(raw)).toMatchObject({ reverse_query: { text: raw, textSourceField: "plain_text" } });
      return;
    }
    expect(() => parseReverseQueryOutput(raw)).toThrow(ReverseQueryOutputError);
    try { parseReverseQueryOutput(raw); } catch (error) { expect(error).toMatchObject({ category: "format" }); }
  });
  it("keeps the saved model sound_description as useful text without inventing translations or concepts", () => {
    const raw = JSON.stringify({ sound_description: "A deep, resonant industrial hum with rhythmic auto-pan and glitch-like stutters." });
    expect(parseReverseQueryOutput(raw)).toMatchObject({ reverse_query: {
      text: "A deep, resonant industrial hum with rhythmic auto-pan and glitch-like stutters.",
      textSourceField: "sound_description", missingFields: ["query_en", "query_ru", "key_concepts", "uncertainties"],
    }, raw_response: raw });
  });
  it("unwraps an OpenAI-compatible transport envelope before parsing model content", () => {
    const content = JSON.stringify({ sound_description: "A resonant metallic drone that slowly shifts in space." });
    const raw = JSON.stringify({ choices: [{ message: { content } }], model: "mistral-code-latest" });
    expect(parseReverseQueryOutput(raw)).toMatchObject({
      extracted_model_text: content,
      reverse_query: { textSourceField: "sound_description", missingFields: ["query_en", "query_ru", "key_concepts", "uncertainties"] },
      raw_response: raw,
    });
  });
  it("accepts a provider result wrapper while retaining its original transport response", () => {
    const raw = JSON.stringify({ result: { sound_description: "A low sustained drone with a slowly shifting metallic resonance." }, request_id: "provider-response-id" });
    expect(parseReverseQueryOutput(raw)).toMatchObject({
      raw_response: raw,
      reverse_query: { textSourceField: "sound_description", missingFields: ["query_en", "query_ru", "key_concepts", "uncertainties"] },
    });
  });
  it("allows a different concept count, absent uncertainties, extra fields, and short useful query text", () => {
    expect(parseReverseQueryOutput(JSON.stringify({ query_en: "Dark hum", key_concepts: ["hum"], confidence: 0.8 }))).toMatchObject({
      reverse_query: { query_en: "Dark hum", key_concepts: ["hum"], missingFields: ["query_ru", "uncertainties"] },
    });
  });
  it("reports field-specific invalid content and rejects empty/error/HTML payloads", () => {
    for (const raw of ["", "<html><body>502 Bad Gateway</body></html>", "Unauthorized: invalid API key", "{\"sound_description\":\" \"}"]) {
      expect(() => parseReverseQueryOutput(raw)).toThrow(ReverseQueryOutputError);
    }
    try { parseReverseQueryOutput("{\"sound_description\":\" \"}"); } catch (error) { expect(error).toMatchObject({ category: "invalid", message: expect.stringContaining("sound_description") }); }
  });
  it("does not label authentication/configuration messages as retryable format failures", () => {
    try { parseReverseQueryOutput("Unauthorized: invalid API key"); } catch (error) { expect(error).toMatchObject({ category: "invalid" }); }
  });
});

describe("generateReverseQuery request provenance", () => {
  const context = (chat: ReturnType<typeof vi.fn>) => ({
    provider: { id: "freellmapi", chat },
    settings: { chatModel: "auto", temperature: 0.7, topP: 0.9, maxTokens: 1024 },
  });

  it("sends node-specific evidence and returns safe message hashes with provider/model", async () => {
    const chat = vi.fn().mockResolvedValue({ text: JSON.stringify(valid), provider: "freellmapi", model: "provider-route/model-x", requestedModel: "auto" });
    const providerContext = context(chat) as never;
    const first = await generateReverseQuery(providerContext, { source_modality: "audio", primary_original_request: "Brief", ranked_acoustic_evidence: [{ tags: ["node-one texture"] }] });
    const second = await generateReverseQuery(providerContext, { source_modality: "audio", primary_original_request: "Brief", ranked_acoustic_evidence: [{ tags: ["node-two texture"] }] });
    const firstMessage = chat.mock.calls[0][0][0].content as string;
    const secondMessage = chat.mock.calls[1][0][0].content as string;
    expect(firstMessage).toContain("node-one texture");
    expect(secondMessage).toContain("node-two texture");
    expect(first.request_diagnostics.messageSha256).not.toBe(second.request_diagnostics.messageSha256);
    expect(first.request_diagnostics).toMatchObject({ provider: "freellmapi", requestedModel: "auto", actualModel: "provider-route/model-x", credentialsPersisted: false });
    expect(chat.mock.calls[0][1].system).toContain("only when you can provide a genuine Russian version");
    expect(first.request_diagnostics.requestPayload?.messages[0]).toMatchObject({ role: "system" });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("attaches safe request provenance to provider failures", async () => {
    const chat = vi.fn().mockRejectedValue({ message: "temporary upstream error", status: 502, retryAfterMs: 700 });
    await expect(generateReverseQuery(context(chat) as never, { source_modality: "audio", ranked_acoustic_evidence: [{ tags: ["fixture"] }] })).rejects.toMatchObject({
      name: "ReverseQueryProviderError", upstreamStatus: 502, retryAfterMs: 700,
      diagnostics: { provider: "freellmapi", requestedModel: "auto", credentialsPersisted: false },
    });
  });
});
