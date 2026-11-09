import { describe, expect, it } from "vitest";
import { readSegmentWindows } from "./segment-plan";

describe("readSegmentWindows", () => {
  const windows = [
    { id: "segment-1", startSeconds: 12, endSeconds: 24, durationSeconds: 12 },
    { id: "segment-2", startSeconds: 24, endSeconds: 36, durationSeconds: 12 },
  ];

  it("reads windows from the persisted segment-plan artifact shape", () => {
    expect(readSegmentWindows({ schemaVersion: 1, windows })).toEqual(windows);
  });

  it("accepts the legacy direct-array shape", () => {
    expect(readSegmentWindows(windows)).toEqual(windows);
  });

  it("rejects a present but malformed segment plan instead of silently using the whole range", () => {
    expect(() => readSegmentWindows({ schemaVersion: 1, windows: [{ id: "bad", startSeconds: 20, endSeconds: 10 }] })).toThrow(/valid segment windows/i);
  });

  it("rejects empty plans", () => {
    expect(() => readSegmentWindows({ schemaVersion: 1, windows: [] })).toThrow(/valid segment windows/i);
  });
});
