#!/bin/sh
# Copies the built plugin into a vault: ./install.sh <vault>
# (npm run wasm, npm run package and npm run build first). Obsidian picks it up after a restart, or after
# Settings → Community plugins → reload; turn on "bibmd" there the first time.
set -e
vault="${1:?usage: ./install.sh <vault folder>}"
here="$(cd "$(dirname "$0")" && pwd)"
dest="$vault/.obsidian/plugins/bibmd"
for f in main.js manifest.json styles.css; do
  [ -e "$here/$f" ] || { echo "missing $f: run npm run build first" >&2; exit 1; }
done
mkdir -p "$dest"
# Files an earlier version unpacked beside main.js; this one has everything inside it.
rm -rf "$dest/_framework" "$dest/_content" "$dest/licenses"
cp "$here/main.js" "$here/manifest.json" "$here/styles.css" "$dest/"
echo "installed in $dest ($(du -sh "$dest" | cut -f1))"
