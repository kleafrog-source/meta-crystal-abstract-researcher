import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMorphoAudioSearch: vi.fn(),
}));

vi.mock("@/lib/morpho/jobs", () => ({
  MorphoIndexNotReadyError: class MorphoIndexNotReadyError extends Error {},
  runMorphoAudioSearch: mocks.runMorphoAudioSearch,
  stopMorpho: vi.fn(),
}));

import { POST } from "./route";

describe("audio segment SigLIP cancellation", () => {
  beforeEach(() => {
    mocks.runMorphoAudioSearch.mockReset().mockResolvedValue({ results: [] });
  });

  it("passes the request AbortSignal to the SigLIP child-process owner", async () => {
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "segment.wav");
    form.set("engine", "siglip");
    form.set("offset", "2");
    form.set("duration", "8");
    form.set("top_k", "4");
    const controller = new AbortController();

    const request = new Request("http://localhost/api/audio-to-parameter/segment", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const [audioPath, offset, duration, topK, detail, layout, signal] = mocks.runMorphoAudioSearch.mock.calls[0];
    expect(audioPath).toEqual(expect.any(String));
    expect([offset, duration, topK, detail, layout]).toEqual([2, 8, 4, "medium", "rgb_delta"]);
    expect(signal).toBe(request.signal);
  });
});
