# Files that only make sense at the PROD domain root

Nothing here is deployed by deploy-test.sh, and nothing here CAN be: these
files work only at https://seancheren.com/.well-known/, and the test deploy
never leaves /test/calmind/. Shipping them is a prod touch, which is Sean's
word, in that message, per the standing rule.

## apple-app-site-association

The domain half of native-iOS passkeys: iOS fetches
https://seancheren.com/.well-known/apple-app-site-association (no
extension, served as application/json, no redirect) and will only offer
CalMind's native passkey sheet if the team+bundle id matches. The team id
is the free Personal Team's — if Sean ever moves to a paid team, this file
changes with it.

## well-known.htaccess

The other half, and the one that actually broke. NFSN's Apache will not
serve an extensionless file as `application/json` on its own, so without
this the association is fetched and ignored and passkeys stop being offered
with no error anywhere. It lived ONLY on the server for a while — one
`rm` from a silent, undiagnosable outage. It is in the repo now, and the
deploy ships the pair together.

## Shipping it

There used to be a hand-typed `scp` here, which made this README the
riskiest command in the repo. Use the script:

```sh
./server/deploy-prod.sh --verify   # read-only: what is prod serving right now?
./server/deploy-prod.sh --dry-run  # preview the payload
./server/deploy-prod.sh --yes      # only after Sean has said prod, in that message
```

`--yes` is required — there is no bare form — and the script ships this
directory to `/home/public/.well-known/` and nothing else. `--verify`
checks status, content type, and that the served appID matches this repo's
copy, so it answers the question this file exists to raise without touching
anything.

Note: iOS caches AASA fetches aggressively (hours to a day). A wrong first
serve lingers; get the content-type right before the first install.
