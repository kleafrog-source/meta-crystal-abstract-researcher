/** "12.3" or "12.3/54" — song-position readout for the transport bar. */
export function formatPosition(pos: number, totalCycles?: number | null): string {
  const p = Math.max(0, pos).toFixed(1);
  return totalCycles && totalCycles > 1 ? `${p}/${totalCycles}` : p;
}
