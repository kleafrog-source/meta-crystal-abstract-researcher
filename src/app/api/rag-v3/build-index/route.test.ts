import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy V3 index route", () => {
  it("refuses to launch an unpinned live build", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toMatch(/pinned current-catalogue candidate/i);
    expect(body.error).toContain("Service Bay");
  });
});
