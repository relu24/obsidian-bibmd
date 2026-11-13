// Packs the published .NET app (wasm/out/wwwroot: _framework and _content, without the
// compressed copies a web server would use) as dist/bibmd-wasm.zip, the release asset the
// plugin fetches on first use, and writes its SHA-256 beside it for the build to embed.
//   node wasm/package.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const root = "wasm/out/wwwroot";
const files = {};
function add(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) add(path);
    else if (!/\.(br|gz)$/.test(name) && name !== "bibmd.version") files[relative(root, path)] = [readFileSync(path), { mtime: new Date(2000, 0, 1) }];
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
for (const [name, path] of Object.entries(licenses)) files[`licenses/${name}`] = [readFileSync(path), { mtime: new Date(2000, 0, 1) }];
if (!files["_framework/dotnet.js"]) throw new Error("no wasm/out: run npm run wasm first");
const zip = zipSync(files, { level: 9 });
mkdirSync("dist", { recursive: true });
writeFileSync("dist/bibmd-wasm.zip", zip);
const sha = createHash("sha256").update(zip).digest("hex");
writeFileSync("dist/bibmd-wasm.sha256", sha + "\n");
// The same marker the plugin writes once it has unpacked the zip: a plugin folder that links to
// wasm/out (a development vault) then has this version, and fetches nothing.
const version = JSON.parse(readFileSync("manifest.json", "utf8")).version;
writeFileSync(join(root, "_framework", "bibmd.version"), `${version} ${sha}\n`);
console.log(`dist/bibmd-wasm.zip: ${Object.keys(files).length} files, ${(zip.length / 1e6).toFixed(1)} MB, sha256 ${sha}`);
