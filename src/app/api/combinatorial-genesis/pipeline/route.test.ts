import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy inbox pipeline route", () => {
  it("refuses to launch the historical activation pipeline", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toMatch(/disabled.*current-catalogue candidate workflow/i);
    expect(body.error).toContain("Service Bay");
  });
});
