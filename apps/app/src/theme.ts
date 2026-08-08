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
