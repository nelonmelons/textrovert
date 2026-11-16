export type Segment = { kind: 'text'; text: string; bold?: boolean } | { kind: 'cite'; ns: number[] };
export type Block =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'heading'; segments: Segment[] }
  | { kind: 'bullet'; segments: Segment[] }
  | { kind: 'number'; label: string; segments: Segment[] };

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/;
const INLINE = new RegExp(CITE.source + '|\\*\\*(.+?)\\*\\*', 'g');

/** Splits one line into text, **bold** runs and citation groups; [1][2] and [1, 2] become one group. */
function inline(line: string): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  const text = (t: string) => t && segments.push({ kind: 'text', text: t });
  for (const m of line.matchAll(INLINE)) {
    const before = line.slice(at, m.index);
    at = m.index + m[0].length;
    if (m[1]) {
      const ns = m[1].split(',').map((n) => Number(n.trim()));
      const last = segments[segments.length - 1];
      if (!before.trim() && last?.kind === 'cite') last.ns.push(...ns);
      else {
        text(before.trimEnd());
        segments.push({ kind: 'cite', ns });
      }
    } else {
      text(before);
      segments.push({ kind: 'text', text: m[2], bold: true });
    }
  }
  text(line.slice(at));
  return segments;
}

/** A short "Label:" lead-in at the start of a line reads better in bold. */
function boldLeadIn(segments: Segment[]): Segment[] {
  const first = segments[0];
  if (first?.kind !== 'text' || first.bold) return segments;
  const m = /^([^:\s][^:]{0,28}):\s+/.exec(first.text);
  if (!m || m[1].split(/\s+/).length > 3) return segments;
  return [{ kind: 'text', text: m[1] + ':', bold: true }, { kind: 'text', text: ' ' + first.text.slice(m[0].length) }, ...segments.slice(1)];
}

/**
 * Light markdown for assistant answers: paragraphs, "-"/"•" bullets, "1." or "1)" numbered items, "#" headings and
 * short lines ending in a colon as subheads, **bold**, and [n] citation markers kept as their own segments so they
 * can be drawn as tappable receipts.
 */
export function parseAnswer(answer: string): Block[] {
  return answer
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Block => {
      const bullet = /^[-•*]\s+(.*)$/.exec(line);
      if (bullet) return { kind: 'bullet', segments: boldLeadIn(inline(bullet[1])) };
      const number = /^(\d{1,2})[.)]\s+(.*)$/.exec(line);
      if (number) return { kind: 'number', label: number[1] + '.', segments: boldLeadIn(inline(number[2])) };
      const heading = /^#{1,6}\s+(.*)$/.exec(line) ?? /^\*\*([^*]+)\*\*:?$/.exec(line);
      if (heading) return { kind: 'heading', segments: inline(heading[1].replace(/:$/, '')) };
      if (/:$/.test(line) && line.split(/\s+/).length <= 7 && !CITE.test(line)) return { kind: 'heading', segments: inline(line.slice(0, -1)) };
      return { kind: 'paragraph', segments: boldLeadIn(inline(line)) };
    });
}

/** Characters of visible text in a block, for deciding where a long answer folds. */
export const blockLength = (b: Block) => b.segments.reduce((n, s) => n + (s.kind === 'text' ? s.text.length : 2), 0);

export const firstName = (name: string) => name.split(/\s+/)[0] || name;

export const formatSent = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", "3 days ago", "Oct 12", or "Oct 12, 2024" for older years. */
export function formatAgo(iso: string, now = Date.now()) {
  const then = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(then.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : null) });
}
