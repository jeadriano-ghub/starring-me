#!/bin/sh
# Copy the library + version.json from site/ into the Android project and sync Capacitor.
set -e
cd "$(dirname "$0")"
cp site/index.html app/www/index.html
cp site/version.json app/www/version.json
cd app && npx cap sync android
