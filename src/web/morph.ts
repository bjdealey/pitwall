/** A point in the trace's drawing box. */
export type Pt = [x: number, y: number];

/** A line drawn over the window t0 to t1: x 0 is t0 and x at full width is t1. */
export type Drawn = { t0: number; t1: number; line: Pt[] };

/** The line's points at each x in xs, which must ascend. An x past either end takes that end's point. */
export function pointsAt(line: Pt[], xs: number[]): Pt[] {
  const first = line[0];
  const last = line.at(-1);
  if (!first || !last) return [];
  let j = 0;
  return xs.map((x): Pt => {
    const px = Math.min(last[0], Math.max(first[0], x));
    while (j < line.length - 2 && (line[j + 1]?.[0] ?? px) < px) j++;
    const a = line[j] ?? first;
    const b = line[j + 1] ?? a;
    const f = b[0] === a[0] ? 0 : (px - a[0]) / (b[0] - a[0]);
    return [px, a[1] + (b[1] - a[1]) * f];
  });
}

const xOf = (d: Drawn, t: number, width: number) => ((t - d.t0) / (d.t1 - d.t0 || 1)) * width;

/**
 * The frame e of the way (0 to 1) from a to b. Points pair by time, so each moment moves from where it sat in a to
 * where it lands in b, like a camera moving between the two windows; a moment one line lacks sits at that line's
 * nearest end. The frame's own window is the blend of the two, so a later morph can start from it.
 */
export function frameAt(a: Drawn, b: Drawn, e: number, width: number): Drawn {
  const time = (d: Drawn, x: number) => d.t0 + (x / width) * (d.t1 - d.t0);
  const times = [...a.line.map(([x]) => time(a, x)), ...b.line.map(([x]) => time(b, x))].sort((p, q) => p - q);
  const from = pointsAt(a.line, times.map((t) => xOf(a, t, width)));
  const to = pointsAt(b.line, times.map((t) => xOf(b, t, width)));
  const line = from.map(([ax, ay], i): Pt => {
    const [bx, by] = to[i] ?? [ax, ay];
    return [ax + (bx - ax) * e, ay + (by - ay) * e];
  });
  // x is linear in time in both windows, so it is in their blend too: x / width = t * k - c.
  const k = (1 - e) / (a.t1 - a.t0 || 1) + e / (b.t1 - b.t0 || 1);
  const c = ((1 - e) * a.t0) / (a.t1 - a.t0 || 1) + (e * b.t0) / (b.t1 - b.t0 || 1);
  return { t0: c / k, t1: c / k + 1 / k, line };
}
