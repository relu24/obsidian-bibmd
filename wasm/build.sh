#!/bin/sh
# Publishes the .NET app and makes it loadable in Obsidian (see patch-node.mjs).
cd "$(dirname "$0")"
export PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet"
# A publish adds its files beside the last one's, each named by its hash: start from nothing.
rm -rf out
if ! dotnet publish -c Release -o out > /tmp/bibwasm-publish.log 2>&1; then
  grep -E "error" /tmp/bibwasm-publish.log | sort -u
  exit 1
fi
node patch-node.mjs out/wwwroot/_framework
