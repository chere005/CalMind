# CalMind

I haven't been quite happy with subtle things like not being able to have reminders from previous days on the calendar not continue to show until they are checked off.. I also wanted to tie together reminders, notes, and my calendar.. I also like enforcing date and time patterns.

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

Reminders, Calendar, Notes, Habits and Add, in one app that runs on the web,
on iOS and Android, on an Apple Watch with its own watch-face complication,
in an iPhone home-screen widget, and in a desktop window on macOS and
Windows. Everything the product *does* — the date parsing, the repeats, the
ordering, the merging — is written once in TypeScript and shared verbatim by
every surface. It is local-first: each client holds the whole store and draws
from it instantly, and a small PHP server reconciles.

It is Sean's app, running at <https://seancheren.com/calmind/>, and it is also
yours: deploy the server on your own host, build the phone apps, change what
you like. BSD 3-Clause — see [LICENSE](LICENSE).

## Running it

```sh
npm install                              # once, at the root
php -S 127.0.0.1:8788 -t server/public   # the API, data in server/data/
npm run web                              # the app on :8081, talking to that API
npm test                                 # core + server
```

`cd apps/app && npx expo start`, then `i` or `a`, opens the iOS or Android
simulator. Deploying a copy of your own needs `server/deploy.conf` (copy
`server/deploy.conf.sample`) and one script; ARCHITECTURE.md has it, along
with every other command.

## More

**[ARCHITECTURE.md](ARCHITECTURE.md) is the map** — the tree, each platform
and how it ships, the sync model, the three environments, the release lane,
and why any of it is the way it is. Beside it,
[`docs/api.md`](docs/api.md) is the API reference,
[TESTING.md](TESTING.md) says what the tests are worth,
[PARITY.md](PARITY.md) is the ledger of what shipped,
[TODO.md](TODO.md) is what is still owed, and
[AGENTS.md](AGENTS.md) is the house rules for anyone — human or agent —
writing code here.
