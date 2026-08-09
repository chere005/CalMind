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

To ship, from the repo root (after Sean says prod):
  scp server/prod-only/apple-app-site-association \
      "$SSH_DEST":/home/public/.well-known/
and verify: curl -si https://seancheren.com/.well-known/apple-app-site-association
(expect 200, application/json, and the appID above).

Note: iOS caches AASA fetches aggressively (hours to a day). A wrong first
serve lingers; get the content-type right before the first install.
