// Obsidian's renderer is Electron with Node in it, so .NET's loader (dotnet.js and the
// runtime and native modules it loads) takes it for Node.js and imports Node's "process".
// The page is a browser page, and bibui wants the browser: this rewrites the one test that
// decides, in the published files, to "not Node". Run after every publish:
//   node wasm/patch-node.mjs wasm/out/wwwroot/_framework
import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const tests = [
  /"string"\s*==\s*typeof process\.versions\.node/g,
  /typeof process\.versions\.node\s*==\s*['"]string['"]/g,
];
for (const f of readdirSync(dir)) {
  const path = join(dir, f);
  // The compressed copies are for web servers; a stale one would undo the patch there.
  if (/^dotnet\..*\.(br|gz)$/.test(f)) { rmSync(path); continue; }
  if (!/^dotnet\..*js$/.test(f)) continue;
  let s = readFileSync(path, "utf8"), n = 0;
  for (const t of tests) s = s.replace(t, () => { n++; return "false"; });
  if (n) { writeFileSync(path, s); console.log(`${f}: ${n} test(s) now say not Node`); }
}
