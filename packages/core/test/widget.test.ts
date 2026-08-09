/**
 * The widget script, actually RUN.
 *
 * tools/scriptable-widget.js is real code on Sean's home screen and no test
 * has ever executed a line of it. The gesture suite pins the app's copy by
 * matching strings, which catches a rewrite that drops the header row — and
 * would not catch a typo, a bad property, or a day loop that quietly draws
 * nothing. It already drifted into a second, flatter version once.
 *
 * Scriptable's globals don't exist off the phone, so they are stubbed here:
 * just enough shape to record what the script BUILDS, then assertions about
 * that structure. The widget's own formatting rules — the header, uppercase
 * day headings, today in green over its own rule, a heavier rule between
 * days, the time last on the row, and "No more items today." — are the ones
 * Sean asked for back after a rewrite lost them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../../tools/scriptable-widget.js', import.meta.url));

type Node = { kind: string; text?: string; font?: string; color?: string; size?: [number, number]; children: Node[] };

function harness(feed: unknown, family = 'medium') {
  const root: Node = { kind: 'widget', children: [] };
  const mk = (kind: string, parent: Node): Node => {
    const n: Node = { kind, children: [] };
    parent.children.push(n);
    return n;
  };
  const stack: Node[] = [root];
  const api = (self: Node) => ({
    addText: (t: string) => Object.assign(mk('text', self), { text: t }),
    addStack: () => {
      const s = mk('stack', self);
      Object.assign(s, api(s));
      return s;
    },
    addImage: () => mk('image', self),
    addSpacer: (n?: number) => Object.assign(mk('spacer', self), { text: String(n ?? '') }),
    setPadding: () => {},
    centerAlignContent: () => {},
  });
  Object.assign(root, api(root));

  const g = globalThis as Record<string, unknown>;
  g.ListWidget = class { constructor() { return root; } };
  g.Color = class { constructor(public hex: string) {} };
  (g.Color as { white: () => unknown }).white = () => ({ hex: '#ffffff' });
  g.Font = new Proxy({}, { get: () => (n: number) => `font${n}` });
  g.Size = class { constructor(public w: number, public h: number) {} };
  g.SFSymbol = { named: () => ({ image: {} }) };
  g.Request = class {
    constructor(public url: string) {}
    async loadJSON() { return feed; }
  };
  g.config = { runsInWidget: true, widgetFamily: family };
  g.Script = { setWidget: () => {}, complete: () => {} };
  return { root, stack };
}

/** Every text node the script laid down, in order. */
const texts = (n: Node): string[] => [
  ...(n.kind === 'text' && n.text !== undefined ? [n.text] : []),
  ...n.children.flatMap(texts),
];

async function run(feed: unknown, family = 'medium') {
  const { root } = harness(feed, family);
  const src = readFileSync(SCRIPT, 'utf8').replace('PASTE_FEED_URL_HERE', 'https://x/api/index.php?feed=1&t=k');
  // Top-level await inside the script; wrap it in an async function body.
  await new Function(`return (async () => { ${src} })()`)();
  return root;
}

describe('the Scriptable widget, executed', () => {
  beforeEach(() => {
    for (const k of ['ListWidget', 'Color', 'Font', 'Size', 'SFSymbol', 'Request', 'config', 'Script']) {
      delete (globalThis as Record<string, unknown>)[k];
    }
  });

  const feed = {
    today: '2026-08-08',
    days: {
      '2026-08-08': [
        { kind: 'reminder', id: 'r1', text: 'water the ferns', time: null, rolled: false },
        { kind: 'event', id: 'e1', text: 'dinner with aki', time: '7pm' },
      ],
      '2026-08-09': [{ kind: 'event', id: 'e2', text: 'market', time: '9am' }],
    },
  };

  it('runs at all, and draws the header row', async () => {
    const out = texts(await run(feed));
    expect(out).toContain('Calendar');
  });

  it('day headings are UPPERCASE, today named as today', async () => {
    const out = texts(await run(feed));
    expect(out.some((t) => /TODAY · AUG 8/.test(t))).toBe(true);
    expect(out.some((t) => /SUN · AUG 9/.test(t))).toBe(true);
  });

  it('the row text is there, and the time is a separate node after it', async () => {
    const out = texts(await run(feed));
    const at = out.indexOf('dinner with aki');
    expect(at).toBeGreaterThan(-1);
    // The time is its own text node LATER in the row — right-aligned at the
    // far edge, not glued to the front of the title as the rewrite had it.
    expect(out.slice(at).includes('7pm')).toBe(true);
    expect(out.some((t) => /^7pm.*dinner/.test(t))).toBe(false);
  });

  it('an empty today says so rather than vanishing', async () => {
    const out = texts(await run({ today: '2026-08-08', days: {} }));
    expect(out).toContain('No more items today.');
  });

  it('a feed that will not load says so instead of drawing a blank widget', async () => {
    const { root } = harness(null);
    (globalThis as Record<string, unknown>).Request = class {
      async loadJSON() { throw new Error('offline'); }
    };
    const src = readFileSync(SCRIPT, 'utf8').replace('PASTE_FEED_URL_HERE', 'https://x/api/index.php');
    await new Function(`return (async () => { ${src} })()`)();
    expect(texts(root)).toContain("Couldn't load.");
  });

  it('a small widget shows fewer rows than a large one', async () => {
    const many = {
      today: '2026-08-08',
      days: { '2026-08-08': Array.from({ length: 12 }, (_x, i) => ({ kind: 'event', id: `e${i}`, text: `thing ${i}`, time: null })) },
    };
    const small = texts(await run(many, 'small')).filter((t) => t.startsWith('thing ')).length;
    const large = texts(await run(many, 'large')).filter((t) => t.startsWith('thing ')).length;
    expect(small).toBeLessThan(large);
  });
});
