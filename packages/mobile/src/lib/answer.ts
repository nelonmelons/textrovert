export type Segment = { kind: 'text'; text: string; bold?: boolean } | { kind: 'cite'; n: number };
export interface Block {
  bullet: boolean;
  segments: Segment[];
}

/**
 * Splits an assistant answer into lines (bullets marked) and each line into text, **bold** runs and [n] citation
 * markers, so the markers can be rendered as tappable receipts.
 */
export function parseAnswer(answer: string): Block[] {
  return answer
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = /^[-•*]\s+/.test(line);
      const body = bullet ? line.replace(/^[-•*]\s+/, '') : line;
      const segments: Segment[] = [];
      let at = 0;
      for (const m of body.matchAll(/\[(\d+)\]|\*\*(.+?)\*\*/g)) {
        if (m.index > at) segments.push({ kind: 'text', text: body.slice(at, m.index) });
        segments.push(m[1] ? { kind: 'cite', n: Number(m[1]) } : { kind: 'text', text: m[2], bold: true });
        at = m.index + m[0].length;
      }
      if (at < body.length) segments.push({ kind: 'text', text: body.slice(at) });
      return { bullet, segments };
    });
}

export const firstName = (name: string) => name.split(/\s+/)[0] || name;

export const formatSent = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
