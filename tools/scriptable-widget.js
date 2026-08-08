// CalMind widget — paste into Scriptable, set FEED to the URL the app's
// Settings → Widget button shows. Reminders draw an empty tick box (orange
// when rolled), events a dot; grouped by day, 21 days ahead — the suite's
// widget, speaking the new feed.
const FEED = "PASTE_FEED_URL_HERE";

const res = await new Request(FEED).loadJSON();
// The app lives beside the api/: tapping the widget (or a reminder row)
// opens it — a reminder row at ?tick=<id>, the suite's quick.php Done page.
const APP = FEED.replace(/api\/index\.php.*$/, "");
const w = new ListWidget();
w.url = APP;
w.backgroundColor = new Color("#111111");
const days = Object.keys(res.days || {}).sort();
let shown = 0;
for (const d of days) {
  if (shown >= 9) break;
  const head = w.addText(d === res.today ? `Today · ${fmt(d)}` : fmt(d));
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#d1a33c");
  for (const row of res.days[d]) {
    if (shown >= 9) break;
    const line = w.addStack();
    const mark = line.addText(row.kind === "reminder" ? "☐ " : "• ");
    mark.font = Font.systemFont(11);
    mark.textColor = row.rolled ? new Color("#fb923c") : new Color("#34d399");
    const t = line.addText((row.time ? row.time + " " : "") + row.text);
    t.font = Font.systemFont(11);
    t.textColor = new Color("#eeeeee");
    if (row.kind === "reminder" && row.id) line.url = APP + "?tick=" + row.id;
    shown++;
  }
  w.addSpacer(3);
}
function fmt(d) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
Script.setWidget(w);
Script.complete();
