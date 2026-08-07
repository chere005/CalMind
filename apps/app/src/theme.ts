/**
 * Midnight — the suite's default look (#111 / #eee / #34d399), as tokens. When
 * themes arrive they become a second table with the same columns, exactly like
 * theme_vars() on the web.
 */
export const T = {
  bg: '#111111',
  surface: '#1b1b1b',
  surface2: '#242424',
  line: '#333333',
  lineSoft: '#2a2a2a',
  text: '#eeeeee',
  dim: '#9aa0a6',
  muted: '#777777',
  gold: '#d1a33c', // section titles, as on the web
  accent: '#34d399',
  accentInk: '#06251b',
  overdue: '#fb923c',
  danger: '#ef4444',
  folderBlue: '#60a5fa',
};

/** The per-app folder palette — reminders' vivid anchor tier, as in lib/palette.php. */
export const FOLDER_PALETTE = ['#60a5fa', '#ef4444', '#34d399', '#f59e0b', '#a78bfa', '#9ca3af'];

/** The page column: phone-first content centred on a wide window, suite-style. */
export const PAGE_MAX_WIDTH = 640;
