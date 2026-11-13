#!/bin/sh
# Copies the built plugin into a vault: ./install.sh <vault>
# (npm run build and npm run wasm first). Obsidian picks it up after a restart, or after
# Settings → Community plugins → reload; turn on "bib blocks" there the first time.
set -e
vault="${1:?usage: ./install.sh <vault folder>}"
here="$(cd "$(dirname "$0")" && pwd)"
dest="$vault/.obsidian/plugins/bib-blocks"
for f in main.js manifest.json styles.css wasm/out/wwwroot/_framework/dotnet.js; do
  [ -e "$here/$f" ] || { echo "missing $f: run npm run build and npm run wasm first" >&2; exit 1; }
done
mkdir -p "$dest"
rm -rf "$dest/_framework" "$dest/_content"
cp "$here/main.js" "$here/manifest.json" "$here/styles.css" "$dest/"
# The .NET app and bibui's browser module, without the compressed copies a web server would use.
cp -r "$here/wasm/out/wwwroot/_framework" "$here/wasm/out/wwwroot/_content" "$dest/"
find "$dest/_framework" "$dest/_content" \( -name '*.br' -o -name '*.gz' \) -delete
echo "installed in $dest ($(du -sh "$dest" | cut -f1))"
