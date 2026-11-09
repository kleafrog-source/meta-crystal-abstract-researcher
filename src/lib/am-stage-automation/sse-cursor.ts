export function needsAutomationSnapshot(input: { cursor: number | null; latest: number; firstAfter: number | null }) {
  if (input.cursor === null || input.cursor > input.latest) return true;
  if (input.cursor < input.latest && input.firstAfter !== input.cursor + 1) return true;
  return false;
}
