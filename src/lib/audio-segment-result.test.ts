import { describe, expect, it } from "vitest";

import {
  applySuccessfulSegmentResult,
  type AudioSegmentResultPoint,
} from "./audio-segment-result";
import type { ActiveParameter } from "./rag-v3/types";

function parameter(name: string, value: number): ActiveParameter {
  return {
    technical_name: name,
    category: "test",
    sub_category: "test",
    ui_element: "Range",
    min_value: 0,
    max_value: 100,
    step: 1,
    default: 50,
    suggested_value: value,
    current_value: value,
    before: 50,
    source: "audio_similarity",
    detail: "fixture",
    lyria_prompt_tags: [],
    semantic_keywords: [],
    similarity: 0.9,
    axes: [],
    retrieval_scope: "sound",
  };
}

function segment(time: number): AudioSegmentResultPoint {
  return {
    time,
    offset: time,
    duration: 2,
    clap: [parameter(`clap_${time}`, time + 10)],
    siglip: [parameter(`siglip_${time}`, time + 20)],
    clapStatus: "pending",
    siglipStatus: "error",
  };
}

describe("applySuccessfulSegmentResult", () => {
  it.each([
    ["clap", 0, "clap_marker_0"],
    ["siglip", 2, "siglip_marker_2"],
  ] as const)("updates only %s at segment %i", (engine, index, marker) => {
    const input = [segment(0), segment(1), segment(2)];
    const before = structuredClone(input);
    const response = [parameter(marker, 77)];

    const output = applySuccessfulSegmentResult(input, index, engine, response);

    expect(output).not.toBe(input);
    expect(output[index]).not.toBe(input[index]);
    expect(output[index][engine]).toBe(response);
    expect(output[index][`${engine}Status`]).toBe("complete");
    expect(output[index].time).toBe(input[index].time);
    expect(output[index][engine === "clap" ? "siglip" : "clap"]).toEqual(
      before[index][engine === "clap" ? "siglip" : "clap"],
    );
    expect(output[index][engine === "clap" ? "siglipStatus" : "clapStatus"]).toBe(
      before[index][engine === "clap" ? "siglipStatus" : "clapStatus"],
    );
    for (let other = 0; other < input.length; other += 1) {
      if (other === index) continue;
      expect(output[other]).toBe(input[other]);
      expect(output[other]).toEqual(before[other]);
    }
    expect(input).toEqual(before);
    expect(input[index]).not.toBe(output[index]);
    expect(response[0].current_value).toBe(77);
  });

  it("preserves other target fields and nested input data", () => {
    const input = [segment(0), segment(1)];
    input[1].siglip[0].semantic_keywords.push("nested-original");
    const before = structuredClone(input);
    const output = applySuccessfulSegmentResult(
      input,
      1,
      "clap",
      [parameter("distinct-response", 42)],
    );

    expect(output[1]).toMatchObject({
      ...before[1],
      clap: [expect.objectContaining({ technical_name: "distinct-response" })],
      clapStatus: "complete",
    });
    expect(output[1].siglip).toBe(input[1].siglip);
    expect(output[1].siglip[0].semantic_keywords).toEqual(["nested-original"]);
    expect(input).toEqual(before);
  });

  it.each([-1, 2, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "1"])(
    "rejects invalid index %s with RangeError",
    (index) => {
      expect(() =>
        applySuccessfulSegmentResult(
          [segment(0), segment(1)],
          index as number,
          "clap",
          [],
        ),
      ).toThrow(RangeError);
    },
  );

  it("applies two successful updates in sequence without losing the first", () => {
    const initial = [segment(0), segment(1), segment(2)];
    const afterFirst = applySuccessfulSegmentResult(
      initial,
      2,
      "clap",
      [parameter("first_marker", 31)],
    );
    const afterSecond = applySuccessfulSegmentResult(
      afterFirst,
      0,
      "siglip",
      [parameter("second_marker", 64)],
    );

    expect(afterSecond[2].clap[0].technical_name).toBe("first_marker");
    expect(afterSecond[2].clapStatus).toBe("complete");
    expect(afterSecond[0].siglip[0].technical_name).toBe("second_marker");
    expect(afterSecond[0].siglipStatus).toBe("complete");
    expect(afterSecond[1]).toBe(initial[1]);
    expect(initial[2].clap[0].technical_name).toBe("clap_2");
    expect(initial[0].siglip[0].technical_name).toBe("siglip_0");
  });
});
