// Run after every publish, on wasm/out/wwwroot/_framework (and the _content beside it):
//   node wasm/patch-node.mjs wasm/out/wwwroot/_framework
//
// 1. Obsidian's renderer is Electron with Node in it, so .NET's loader (dotnet.js and the runtime
//    and native modules it loads) takes it for Node.js and imports Node's "process". The page is a
//    browser page, and bibui wants the browser: the one test that decides becomes "not Node".
// 2. The plugin runs these modules from memory (blob: URLs), which cannot be a base for relative
//    URLs, and they find the files beside them from import.meta.url. It becomes the address the
//    bundled dotnet.js is given (esbuild.config.mjs): never fetched, since every file comes from
//    the plugin's zip through .NET's resource loader, but a base that relative paths resolve on.
import { readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const framework = process.argv[2];
const root = dirname(framework);
const base = "https://bibmd.invalid/";
const nodeTests = [
  /"string"\s*==\s*typeof process\.versions\.node/g,
  /typeof process\.versions\.node\s*==\s*['"]string['"]/g,
];

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const path of [...files(framework), ...files(join(root, "_content"))]) {
  const name = path.split("/").pop();
  // The compressed copies are for web servers; a stale one would undo the patch there.
  if (/\.(br|gz)$/.test(name)) { if (/^dotnet\.|bibui-browser/.test(name)) rmSync(path); continue; }
  if (!/^dotnet\.(.*\.)?js$/.test(name) && !/\/_content\/.*\.js$/.test(path)) continue;
  let s = readFileSync(path, "utf8"), notNode = 0, meta = 0;
  for (const t of nodeTests) s = s.replace(t, () => { notNode++; return "false"; });
  // dotnet.js itself is bundled into main.js, where esbuild defines import.meta.url.
  if (name !== "dotnet.js")
    s = s.replace(/import\.meta\.url/g, () => { meta++; return JSON.stringify(base + relative(root, path)); });
  if (notNode || meta) {
    writeFileSync(path, s);
    console.log(`${relative(root, path)}: ${notNode} Node test(s) now say not Node, ${meta} import.meta.url given an address`);
  }
}
