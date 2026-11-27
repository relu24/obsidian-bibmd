#!/bin/sh
# Checks out what the .NET app is built from, at the commits wasm/sources.json pins, into
# wasm/sources/{bibmd,bibdoc,bibui}, and builds FreeType and HarfBuzz for the browser in the
# bibui checkout (with the wasm-tools workload's Emscripten). Then: npm run wasm.
set -e
cd "$(dirname "$0")"
mkdir -p sources
for name in bibmd bibdoc bibui; do
  repo=$(node -p "require('./sources.json').$name.repo")
  commit=$(node -p "require('./sources.json').$name.commit")
  if [ ! -d "sources/$name/.git" ]; then git clone --quiet "$repo" "sources/$name"; fi
  git -C "sources/$name" fetch --quiet origin "$commit" 2>/dev/null || git -C "sources/$name" fetch --quiet origin
  git -C "sources/$name" checkout --quiet --detach "$commit"
  echo "$name at $commit"
done
if [ ! -f sources/bibui/bibui-platform-browser/native/lib/libfreetype.so.6.a ]; then
  export PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
  sources/bibui/bibui-platform-browser/native/build.sh
fi
# The emoji face, as bibmd's web viewer brings it: Mozilla's Twemoji, COLRv0, which the browser's
# FreeType draws (a CBDT font, as Noto Color Emoji, is PNGs, and it is built without libpng). Fetched
# here, checked against its SHA-256, and packed inside main.js: the plugin downloads nothing.
emoji_url=https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf
emoji_sha256=6d90152ee0d29e82fe2a87793af5aa4b7ad13e6538360889e141e81ed299ee8e
emoji=sources/fonts/Twemoji.Mozilla.ttf
mkdir -p sources/fonts
if [ ! -f "$emoji" ] || ! echo "$emoji_sha256  $emoji" | sha256sum -c --status; then
  curl -fsSL --retry 3 -o "$emoji.part" "$emoji_url"
  echo "$emoji_sha256  $emoji.part" | sha256sum -c --status || { echo "Twemoji: wrong SHA-256" >&2; rm -f "$emoji.part"; exit 1; }
  mv "$emoji.part" "$emoji"
fi
echo "Twemoji.Mozilla.ttf checked"
