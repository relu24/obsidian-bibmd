// Packs the published .NET app (wasm/out/wwwroot: _framework and _content, without the
// compressed copies a web server would use) and the licences of what it is built from as
// dist/bibmd-wasm.zip, which the build puts inside main.js.
//   node wasm/package.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const root = "wasm/out/wwwroot";
const files = {};
function add(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) add(path);
    else if (!/\.(br|gz)$/.test(name)) files[relative(root, path)] = [readFileSync(path), { mtime: new Date(2000, 0, 1) }];
  }
}
for (const top of ["_framework", "_content"]) add(join(root, top));
// The licences of what the app is built from, beside it.
const licenses = {
  "bibmd-LICENSE.txt": "wasm/sources/bibmd/LICENSE",
  "bibdoc-LICENSE.txt": "wasm/sources/bibdoc/LICENSE",
  "bibui-LICENSE.txt": "wasm/sources/bibui/LICENSE",
  "bibui-NOTICE.txt": "wasm/sources/bibui/NOTICE",
  "FreeType-FTL.txt": "wasm/sources/bibui/bibui-platform-browser/native/lib/FreeType-FTL.txt",
  "HarfBuzz-COPYING.txt": "wasm/sources/bibui/bibui-platform-browser/native/lib/HarfBuzz-COPYING.txt",
};
// The .NET runtime's own, from the runtime pack the build used (the newest installed).
const packs = join(process.env.DOTNET_ROOT ?? join(homedir(), ".dotnet"), "packs", "Microsoft.NETCore.App.Runtime.Mono.browser-wasm");
const pack = join(packs, readdirSync(packs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop());
licenses["dotnet-LICENSE.txt"] = join(pack, "LICENSE.TXT");
licenses["dotnet-THIRD-PARTY-NOTICES.txt"] = join(pack, "THIRD-PARTY-NOTICES.TXT");
// The emoji face and the symbol fonts bibmd's web viewer uses for what the note's font lacks.
const fonts = {
  "fonts/Twemoji.Mozilla.ttf": "wasm/sources/fonts/Twemoji.Mozilla.ttf",
  "fonts/NotoSansMath-Symbols.ttf": "wasm/sources/bibmd/web/fonts/NotoSansMath-Symbols.ttf",
  "fonts/NotoSansSymbols2-Symbols.ttf": "wasm/sources/bibmd/web/fonts/NotoSansSymbols2-Symbols.ttf",
};
for (const [name, path] of Object.entries(fonts)) files[name] = [readFileSync(path), { mtime: new Date(2000, 0, 1) }];
licenses["Noto-OFL.txt"] = "wasm/sources/bibmd/web/fonts/OFL.txt";
files["licenses/Twemoji.txt"] = [new TextEncoder().encode(
  "Twemoji.Mozilla.ttf (https://github.com/mozilla/twemoji-colr, v0.7.0):\n" +
  "the art is Copyright Twitter, Inc and other contributors, licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/);\n" +
  "the font is Copyright Mozilla Foundation, licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).\n"),
  { mtime: new Date(2000, 0, 1) }];
for (const [name, path] of Object.entries(licenses)) files[`licenses/${name}`] = [readFileSync(path), { mtime: new Date(2000, 0, 1) }];
if (!files["_framework/dotnet.js"]) throw new Error("no wasm/out: run npm run wasm first");
const zip = zipSync(files, { level: 9 });
mkdirSync("dist", { recursive: true });
writeFileSync("dist/bibmd-wasm.zip", zip);
const sha = createHash("sha256").update(zip).digest("hex");
console.log(`dist/bibmd-wasm.zip: ${Object.keys(files).length} files, ${(zip.length / 1e6).toFixed(1)} MB, sha256 ${sha}`);
