import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy V3 anchors route", () => {
  it("refuses an unpinned build and directs callers to Service Bay", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toMatch(/pinned effective-catalogue snapshot/i);
    expect(body.error).toContain("Service Bay");
  });
});
