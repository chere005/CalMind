import { StyleSheet } from 'react-native';

/**
 * The suite's THEMES table (lib/auth.php), same columns, same values —
 * midnight / sage / forest / olive, the boards Draft 3 was judged on.
 * Midnight is the default and the login's only look. Semantic colours
 * (overdue, danger, the event blue) stay literal across themes, exactly as
 * the web keeps its kind palette out of theme_vars().
 */
export type ThemeName = 'midnight' | 'sage' | 'forest' | 'olive';

type Cols = {
  label: string;
  bg: string; surface: string; surface2: string; line: string; lineSoft: string;
  text: string; dim: string; muted: string; accent: string; accentInk: string;
  accentSoft: string; gold: string;
};

export const THEMES: Record<ThemeName, Cols> = {
  midnight: { label: 'Midnight', bg: '#111111', surface: '#1a1a1a', surface2: '#2a2a2a', line: '#333333', lineSoft: '#262626', text: '#eeeeee', dim: '#cccccc', muted: '#888888', accent: '#34d399', accentInk: '#06251b', accentSoft: '#14332a', gold: '#f0b429' },
  sage: { label: 'Sage & Cream', bg: '#fefae0', surface: '#faedcd', surface2: '#e9edc9', line: '#ccd5ae', lineSoft: '#e4e7c9', text: '#3f3a2e', dim: '#5c5545', muted: '#776e56', accent: '#96632f', accentInk: '#fefae0', accentSoft: '#efe2c2', gold: '#8a5a12' },
  forest: { label: 'Forest', bg: '#040303', surface: '#16201d', surface2: '#3a4e48', line: '#3a4e48', lineSoft: '#263230', text: '#e4ddd6', dim: '#beb0a7', muted: '#6a7b76', accent: '#8b9d83', accentInk: '#0a0f0d', accentSoft: '#1c2a25', gold: '#c9a227' },
  olive: { label: 'Olive & Slate', bg: '#241e2d', surface: '#332a3e', surface2: '#443850', line: '#564a62', lineSoft: '#3b3247', text: '#eaf0ce', dim: '#c0c5c1', muted: '#848b98', accent: '#bbbe64', accentInk: '#241e2d', accentSoft: '#3a3448', gold: '#d8c46a' },
};

/** Themes whose page is lighter than their ink — native controls and the
 *  status bar need to draw the right way round. */
export const THEMES_LIGHT: readonly ThemeName[] = ['sage'];

/**
 * The live palette. MUTABLE on purpose: applyTheme swaps the values in place
 * and bumps the generation, and every style sheet in the app is created
 * through themed() below, which re-creates itself lazily per generation —
 * so no component has to know themes exist.
 */
export const T = {
  ...THEMES.midnight,
  // The suite's kind palette (kind_color_css) — semantic, never themed.
  overdue: '#f0a860',
  danger: '#ef4444',
  folderBlue: '#60a5fa', // --k-event: deliberately a blue, never a cyan
  kindNote: '#8b6ef0',
  kindDone: '#555555',
};

let gen = 0;
let current: ThemeName = 'midnight';
const listeners = new Set<() => void>();

export function applyTheme(name: ThemeName): void {
  if (!THEMES[name]) name = 'midnight';
  // The palette work is skipped when nothing changed, but the DOM sync below
  // is NOT. Returning early here meant a normal load — where the saved theme
  // already is the current one — never wrote theme-color or the page
  // background at all, and the only reason midnight looked right was the
  // hardcoded style injected at export time. Any other theme, or any change
  // to that constant, and the safe areas would have gone back to white with
  // nothing in the app to explain why.
  const changed = name !== current;
  current = name;
  const { label: _label, ...cols } = THEMES[name];
  if (changed) {
    Object.assign(T, cols);
    gen++;
  }
  // The suite's <meta name="theme-color"> reads theme_bg() — follow on web.
  if (typeof document !== 'undefined') {
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = T.bg;
    // …and the PAGE's own background, which is what shows through anywhere the
    // app's views don't reach. With viewport-fit=cover that includes both safe
    // areas, and an unset background is white — which is exactly how a white
    // band appeared under the tab bar once the top strip was fixed.
    document.documentElement.style.backgroundColor = T.bg;
    if (document.body) document.body.style.backgroundColor = T.bg;
  }
  if (changed) listeners.forEach((fn) => fn());
}

export function currentTheme(): ThemeName {
  return current;
}

/** Subscribe to theme switches; returns the unsubscribe. The app root keys
 *  its tree on this so a switch remounts everything under the new palette. */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A lazily themed style sheet: pass the usual StyleSheet.create call as a
 * factory and read the result exactly like before. The Proxy re-runs the
 * factory when the theme generation moved, so module-level `const s = …`
 * keeps working — values just stop being baked at import time.
 */
export function themed<S extends object>(factory: () => S): S {
  let cacheGen = -1;
  let cache: S | undefined;
  return new Proxy({} as S, {
    get(_t, prop) {
      if (!cache || cacheGen !== gen) {
        cache = factory();
        cacheGen = gen;
      }
      return cache[prop as keyof S];
    },
  });
}

/** Ready-made lazy sheet helper so call sites read naturally. */
export function themedSheet<S extends StyleSheet.NamedStyles<S>>(factory: () => S): S {
  return themed(factory);
}

/**
 * The suite's per-app palettes, computed values carried over from
 * lib/palette.php (Draft 3): blue/red/green/orange/purple/grey, each app
 * leaning the hues into its own unmistakable shade — reminders the vivid
 * anchor, calendar electric-deep with a violet lean, notes leaned back and
 * brightened, habits at full jewel strength. Every own colour clears 3:1 on
 * the dark card; the shared sets are the matching lighter tier, waiting for
 * sharing to land.
 */
export const APP_PALETTES: Record<'reminders' | 'calendar' | 'notes' | 'habits', readonly string[]> = {
  reminders: ['#4c8bf0', '#ea5853', '#66d695', '#f39849', '#9e5ce0', '#929aaa'],
  calendar: ['#0379f6', '#ed0d10', '#2ad05f', '#fa6800', '#803be7', '#677289'],
  notes: ['#7dc2ed', '#e9818a', '#8fdb9d', '#efa37b', '#a088e2', '#adb2bd'],
  habits: ['#4357ef', '#e44525', '#3ecb9f', '#f09a19', '#b131d8', '#7d8699'],
};

export const APP_PALETTES_SHARED: Record<'reminders' | 'calendar' | 'notes' | 'habits', readonly string[]> = {
  reminders: ['#aecbf8', '#f6b4b2', '#baedcf', '#fad1ad', '#d3b6f1', '#ced2d9'],
  calendar: ['#8ec3fb', '#f79293', '#9feab7', '#fdbb8c', '#c6a7f4', '#bbc0ca'],
  notes: ['#badff5', '#f3bcc1', '#c4eccb', '#f7ceb9', '#cdc0f0', '#d4d6dc'],
  habits: ['#a1abf7', '#f2a292', '#9fe5cf', '#f8cd8c', '#d898ec', '#bec3cc'],
};

/** Legacy alias — callers should pick from APP_PALETTES by app. */
export const FOLDER_PALETTE = [...APP_PALETTES.reminders];

/** The page column: phone-first content centred on a wide window, suite-style. */
export const PAGE_MAX_WIDTH = 640;
