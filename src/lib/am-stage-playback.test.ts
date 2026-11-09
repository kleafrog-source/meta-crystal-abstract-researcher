import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlaybackTimeSnapshot, setPlaybackTime, subscribePlaybackTime } from "./am-stage-playback";

describe("AM-Stage playback time store", () => {
  afterEach(() => setPlaybackTime(0));

  it("publishes changed finite non-negative playback time", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePlaybackTime(listener);

    setPlaybackTime(1.25);
    expect(getPlaybackTimeSnapshot()).toBe(1.25);
    expect(listener).toHaveBeenCalledTimes(1);

    setPlaybackTime(-1);
    expect(getPlaybackTimeSnapshot()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("skips sub-millisecond noise and stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePlaybackTime(listener);

    setPlaybackTime(0.5);
    setPlaybackTime(0.5005);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPlaybackTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
