# CalMind

I haven't been quite happy with subtle things like not being able to have reminders from previous days on the calendar not continue to show until they are checked off.. I also wanted to tie together reminders, notes, and my calendar.. I also like enforcing date and time patterns.

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

Reminders, calendar, notes and habits in one local-first app.

- Runs on web, iOS, Android, Apple Watch, macOS, Windows and Linux.
- One TypeScript core shared by every platform. A small PHP server syncs.
- Notes can be recipes, from a photo or a URL. Search, sharing, themes.
- Live at <https://seancheren.com/calmind/>.

<table>
<tr>
<td align="center" valign="top"><img src="docs/screenshots/calmind-dinner-calendar-mobile.png" width="200" alt="Calendar"><br><sub><b>Calendar.</b> Calendars, reminders, notes and ChefMind recipes in one month.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/calmind-ingredient-prep-mobile.png" width="200" alt="Reminders"><br><sub><b>Reminders.</b> Home, errands and work to-dos, dated or not.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/calmind-notes-mobile.png" width="200" alt="Notes"><br><sub><b>Notes.</b> Reference notes and recipes, in folders.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/calmind-recipe-note-mobile.png" width="200" alt="Recipe editor"><br><sub><b>Recipe editor.</b> Ingredients, quantities and steps.</sub></td>
</tr>
</table>

## Run

```sh
npm install
php -S 127.0.0.1:8788 -t server/public   # the API
npm run web                              # the app on :8081
npm test
```

`EXPO_PUBLIC_API_URL` points a build at another server. Release: `npm run dtp` (or `tdtp`, tests first); the tag builds the desktop installers on GitHub.

Docs: [ARCHITECTURE](ARCHITECTURE.md) · [API](docs/api.md) · [TESTING](TESTING.md) · [PARITY](PARITY.md) · [TODO](TODO.md) · [AGENTS](AGENTS.md). BSD 3-Clause.
