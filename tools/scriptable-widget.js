// CalMind widget — paste into Scriptable, set FEED to the URL the app's
// Settings → Widget button shows.
//
// The formatting is the SUITE's widget, value for value (its source is
// calmind/public/calendar/feed.php in seancheren-reminders): a header row,
// uppercase day headings with today in green over its own rule, a heavier
// rule between days, and the time right-aligned at the far edge rather than
// crammed in front of the title. A rewrite drifted away from all of that;
// this brings it back and speaks the new feed.
//
// Times arrive already spoken — the server formats them, in its own timezone
// (America/Chicago by config), so nothing here converts a clock. That means
// "3:30pm" OR "15:30": the feed reads the account's prefs_suite.clock24 like
// every other surface does, so whichever you set is what arrives. Printing it
// verbatim is what keeps this script out of that decision.
const FEED = "PASTE_FEED_URL_HERE";

// The app lives beside the api/: tapping the widget opens it, and tapping a
// reminder opens that one row's Done page — the suite's quick.php idea. The
// widget's own token is read-only by design, so the write happens in Safari
// under your own session.
const OPEN = FEED.replace(/api\/index\.php.*$/, "");
// Tapping opens the app in SAFARI specifically, not the default browser.
// An https:// url from a widget goes wherever iOS sends links — DuckDuckGo,
// in Sean's case — and x-safari-https:// is the long-standing way to name
// Safari instead. Verified still handled on current iOS.
//
// What this does NOT do, because iOS does not allow it: open the CalMind
// icon on the home screen. A home-screen web app has no url scheme and is
// not a universal-link target; it launches from its icon and nothing else.
// This lands in a Safari TAB, which keeps its own login separate from the
// installed app's — so expect to sign in there once.
const SAFARI = (u) => "x-safari-" + u;
const COLORS = { reminder: "#34d399", event: "#60a5fa", note: "#8b6ef0" };
const META = new Color("#777777");        // the muted time colour
const OVERDUE = "#ff7755";

let data;
try { data = await new Request(FEED).loadJSON(); }
catch (e) { data = { days: {}, error: true }; }

const w = new ListWidget();
w.backgroundColor = new Color("#111111");
w.url = SAFARI(OPEN);
w.setPadding(12, 14, 12, 14);

const head = w.addStack();
const title = head.addText("Calendar");
title.font = Font.boldSystemFont(15);
title.textColor = Color.white();
head.addSpacer();
const dl = head.addText(new Date().toLocaleDateString([], { month: "short", day: "numeric" }));
dl.font = Font.mediumSystemFont(13);
dl.textColor = new Color("#8a8a8a");
w.addSpacer(8);

if (data.error) {
  const t = w.addText("Couldn't load.");
  t.textColor = new Color("#ff6666");
  t.font = Font.systemFont(12);
} else {
  // The day is the section, not the kind: one heading per date, reminders
  // before events under it.
  const max = config.widgetFamily === "large" ? 8 : (config.widgetFamily === "small" ? 3 : 5);
  const RANK = { reminder: 0, event: 1, note: 2 };
  const byDay = Object.keys(data.days || {}).sort().map((date) => ({
    date,
    list: (data.days[date] || []).slice().sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9)),
  }));
  // Today is always its own section, even when empty — an overdue reminder
  // rolls onto today, so an empty today genuinely means "nothing left".
  if (!byDay.length || byDay[0].date !== data.today) byDay.unshift({ date: data.today, list: [] });
  let budget = max;

  // A full-width rule. 1 is the hairline under a date, 2 the divider between
  // days, which is the only thing separating one day's list from the next.
  const rule = (weight, color) => {
    const div = w.addStack();
    div.size = new Size(0, weight);
    div.backgroundColor = new Color(color);
    div.addSpacer();
  };

  const drawRow = (it) => {
    const row = w.addStack();
    row.centerAlignContent();
    const late = !!it.rolled;
    if (it.kind === "reminder") {
      // A reminder wears an empty tick box rather than a dot — it's a thing
      // to *do*, and tapping it opens that row's Done page.
      if (it.id) row.url = SAFARI(OPEN + "?tick=" + encodeURIComponent(it.id));
      const box = row.addImage(SFSymbol.named("square").image);
      box.imageSize = new Size(11, 11);
      box.tintColor = new Color(late ? OVERDUE : COLORS.reminder);
      box.resizable = true;
    } else {
      const dot = row.addText("●");
      dot.textColor = new Color(COLORS[it.kind] || "#888888");
      dot.font = Font.systemFont(9);
    }
    row.addSpacer(6);
    const label = row.addText(it.text || "");
    label.font = Font.systemFont(12);
    label.textColor = new Color(late ? OVERDUE : "#eeeeee");
    label.lineLimit = 1;
    row.addSpacer();
    // The date has moved up to its day heading, so only the time sits right.
    if (it.time) {
      const t = row.addText(it.time);
      t.font = Font.systemFont(11);
      t.textColor = META;
    }
    w.addSpacer(5);
  };

  let first = true;
  for (const day of byDay) {
    if (budget <= 0) break;
    if (!first) {                        // heavier rule marks the change of day
      w.addSpacer(7);
      rule(2, "#3a3a3a");
      w.addSpacer(8);
    }
    first = false;
    const isToday = day.date === data.today;
    const h = w.addText(longDate(day.date, data.today).toUpperCase());
    h.font = Font.boldSystemFont(10);
    h.textColor = new Color(isToday ? COLORS.reminder : "#9a9a9a");
    w.addSpacer(3);
    rule(1, isToday ? "#2f5f4d" : "#242424");   // the date's own light underline
    w.addSpacer(6);
    if (!day.list.length) {
      const t = w.addText("No more items today.");
      t.textColor = META;
      t.font = Font.systemFont(12);
      w.addSpacer(5);
      continue;
    }
    for (const it of day.list) {
      if (budget <= 0) break;
      drawRow(it);
      budget--;
    }
  }
}

// The day heading: "Today · Aug 8", otherwise "Sat · Aug 8" — the weekday
// earns its place once it's a heading rather than a note at the end of a row.
function longDate(ymd, today) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const md = date.toLocaleDateString([], { month: "short", day: "numeric" });
  if (ymd === today) return "Today · " + md;
  return date.toLocaleDateString([], { weekday: "short" }) + " · " + md;
}

if (config.runsInWidget) { Script.setWidget(w); } else { await w.presentMedium(); }
Script.complete();
