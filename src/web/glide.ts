/** A glider's layout box, relative to the box it sits in, or how far it is drawn from that box. */
export type Box = { x: number; y: number; w: number; h: number };
/** A laid-out glider. end is set when its content sits at its right edge, like a figure in a table, so that edge is what holds still. */
export type Laid = Box & { end?: boolean };

const ZERO: Box = { x: 0, y: 0, w: 0, h: 0 };

/**
 * One frame of gliding. before and after hold each glider's layout box last frame and this frame, off how far each is
 * drawn from its layout box, dw and dh how far the window's width and height moved, and k how much of an offset
 * survives the frame. Returns the new offsets. A change the window's own movement can't explain is a jump: a
 * breakpoint, a container query, a grid that fits one column fewer, a column that faded out. On a frame with a jump
 * every glider is drawn where it was, so the whole layout moves together, and its offset then eases away.
 */
export function glideStep<K>(before: Map<K, Laid>, after: Map<K, Laid>, off: Map<K, Box>, dw: number, dh: number, k: number): Map<K, Box> {
  // A width change moves things across by at most that much. Text that rewraps moves things down by a line or two.
  const down = dw || dh ? 48 : 2;
  const jumped = (a: Box, b: Box) => Math.abs(b.x - a.x) > dw + 2 || Math.abs(b.w - a.w) > dw + 2 || Math.abs(b.y - a.y) > down || Math.abs(b.h - a.h) > down;
  // A window snapped or maximised in one step, or a phone turned, moves everything at once.
  const leap = dw > 160 || [...after].some(([key, b]) => {
    const a = before.get(key);
    return a !== undefined && jumped(a, b);
  });
  const next = new Map<K, Box>();
  for (const [key, b] of after) {
    const o = off.get(key) ?? ZERO;
    const a = (leap && before.get(key)) || b;
    const x = b.end ? a.x + a.w - b.x - b.w : a.x - b.x;
    const n = { x: o.x * k + x, y: o.y * k + a.y - b.y, w: o.w * k + a.w - b.w, h: o.h * k + a.h - b.h };
    if (Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.w), Math.abs(n.h)) >= 0.5) next.set(key, n);
  }
  return next;
}

/** Panels slide into place and grow or shrink their face to their new size; pitwall.css draws it from --glide-r and --glide-b. */
const PANELS = '.pw-screen, .pw-tower, .pw-trace, .pw-slat';
/** Rows slide inside their panel, and each piece a narrower or wider row moves slides inside its row. */
const GLIDERS = `${PANELS}, .pw-tower-row, .pw-event, .pw-tower-row > *, .pw-event > *, .pw-tower-foot > *, .pw-system > div, .pw-table :is(th, td), .pw-track > *`;
/** A glider is measured inside the nearest glider that holds it, so its own glide adds to its holder's. */
const HOLDERS = `${GLIDERS}, .pw-main, .pw-track`;
/** The ease out's time constant: most of the way in 250ms, settled by 600ms. */
const TAU = 110;
/** How long gliding keeps watching after the window stops: a column that fades out leaves its space 240ms later. */
const SETTLE_MS = 400;

function measure(): Map<HTMLElement, Laid> {
  // Offsets ignore transforms and scrolling, so a glide, an entrance or a scrolled page never reads as a move.
  const page = new Map<HTMLElement, [number, number]>();
  const at = (el: HTMLElement): [number, number] => {
    let p = page.get(el);
    if (!p) {
      const parent = el.offsetParent as HTMLElement | null;
      const [x, y] = parent ? at(parent) : [0, 0];
      p = [x + el.offsetLeft, y + el.offsetTop];
      page.set(el, p);
    }
    return p;
  };
  const boxes = new Map<HTMLElement, Laid>();
  for (const el of document.querySelectorAll<HTMLElement>(GLIDERS)) {
    const holder = el.parentElement?.closest<HTMLElement>(HOLDERS);
    if (!holder || !el.checkVisibility({ contentVisibilityAuto: true })) continue;
    const [x, y] = at(el);
    const [hx, hy] = at(holder);
    const end = !el.matches(PANELS) && /right|end/.test(getComputedStyle(el).textAlign);
    boxes.set(el, { x: x - hx, y: y - hy, w: el.offsetWidth, h: el.offsetHeight, end });
  }
  return boxes;
}

function draw(el: HTMLElement, o: Box) {
  el.style.translate = `${o.x}px ${o.y}px`;
  if (!el.matches(PANELS)) return;
  el.style.setProperty('--glide-r', `${-o.w}px`);
  el.style.setProperty('--glide-b', `${-o.h}px`);
  el.dataset.glide = '';
}

function clear(el: HTMLElement) {
  el.style.removeProperty('translate');
  el.style.removeProperty('--glide-r');
  el.style.removeProperty('--glide-b');
  delete el.dataset.glide;
}

/**
 * Smooths every layout change a window resize makes. Between resizes it keeps the last layout up to date, so even the
 * first frame of a drag, or a window snapped in one step, glides from what was on screen.
 */
export function glide() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let before = new Map<HTMLElement, Laid>();
  let off = new Map<HTMLElement, Box>();
  let size = [innerWidth, innerHeight];
  let raf = 0;
  let last = 0;
  let resized = 0;
  let refresh = 0;

  const step = (now: number) => {
    const after = measure();
    const [w = 0, h = 0] = size;
    size = [innerWidth, innerHeight];
    const next = reduced.matches ? new Map<HTMLElement, Box>() : glideStep(before, after, off, Math.abs(innerWidth - w), Math.abs(innerHeight - h), Math.exp(-(now - last) / TAU));
    for (const el of off.keys()) if (!next.has(el)) clear(el);
    for (const [el, o] of next) draw(el, o);
    before = after;
    off = next;
    last = now;
    raf = next.size || now - resized < SETTLE_MS ? requestAnimationFrame(step) : 0;
  };

  addEventListener('resize', () => {
    resized = performance.now();
    raf ||= requestAnimationFrame(step);
  });

  // Content, transitions and fonts change the layout too. Measure once after each, unless a resize is already gliding.
  const stale = () => {
    refresh ||= requestAnimationFrame(() => {
      refresh = 0;
      if (raf) return;
      before = measure();
      size = [innerWidth, innerHeight];
    });
  };
  new MutationObserver(stale).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  addEventListener('transitionend', stale);
  addEventListener('animationend', stale);
  void document.fonts.ready.then(stale);
}
