/** Distinct avatar colors. A name hashes to the same color in every reel unless someone in the chat already has it. */
export const PARTICIPANT_COLORS = ["#ff7a59", "#f7b733", "#2ec4b6", "#5b8cff", "#c77dff", "#ff5d8f", "#8ac926", "#00b4d8", "#ff9f1c", "#9d4edd"];

export function assignColors(names: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  const used = new Set<number>();
  for (const name of names) {
    let hash = 0;
    for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
    let slot = hash % PARTICIPANT_COLORS.length;
    for (let k = 0; k < PARTICIPANT_COLORS.length && used.has(slot); k++) slot = (slot + 1) % PARTICIPANT_COLORS.length;
    used.add(slot);
    colors.set(name, PARTICIPANT_COLORS[slot]);
  }
  return colors;
}
