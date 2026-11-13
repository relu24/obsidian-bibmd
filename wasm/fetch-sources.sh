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
