#!/usr/bin/env bash
# Fetches latest RBI data. Run manually or schedule once a day (see DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run fetch
