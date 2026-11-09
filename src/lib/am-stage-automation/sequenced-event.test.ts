import { describe, expect, it } from "vitest";
import { createSequencedEvent } from "./sequenced-event";

describe("sequenced automation events", () => {
  it("retries concurrent sequence collisions without losing events", async () => {
    const rows: number[] = [];
    const readNextSequence = async () => Math.max(0, ...rows) + 1;
    const create = async (sequence: number) => {
      await Promise.resolve();
      if (rows.includes(sequence)) throw { code: "P2002" };
      rows.push(sequence);
      return sequence;
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => createSequencedEvent({
      readNextSequence,
      create,
      isUniqueConflict: (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"),
    })));
    expect(results).toHaveLength(20);
    expect(rows.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
});
