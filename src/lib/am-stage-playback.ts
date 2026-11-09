let playbackTime = 0;
const listeners = new Set<() => void>();

export function getPlaybackTimeSnapshot() {
  return playbackTime;
}

export function subscribePlaybackTime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPlaybackTime(value: number) {
  const next = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (Math.abs(next - playbackTime) < 0.001) return;
  playbackTime = next;
  listeners.forEach((listener) => listener());
}
