#!/usr/bin/env sh
# TraceWatch for macOS and Linux:  ./start.sh          start (installs and builds on first run)
#                                  ./start.sh update   pull the latest version, then start
#                                  ./start.sh cli      open the TraceWatch CLI in this terminal
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "TraceWatch needs Node.js 20 or newer."
  echo "  macOS:  brew install node        (or download from https://nodejs.org)"
  echo "  Linux:  use your package manager, e.g. sudo apt install nodejs npm, or https://nodejs.org"
  exit 1
fi

exec node scripts/tracewatch.mjs "$@"
