#!/bin/sh
# tdtp — test, deploy, tag, push: the full lane. Everything dtp does, with the
# between-runs suite in front and the FULL gesture+WebKit gates in the deploy
# (no --quick). See tools/dtp.sh for the lane itself.
exec sh "$(dirname "$0")/dtp.sh" --full
