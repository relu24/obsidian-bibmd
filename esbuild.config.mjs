// node esbuild.config.mjs              watch, writing main.js beside manifest.json
// node esbuild.config.mjs production   one minified build
import esbuild from "esbuild";
import { existsSync } from "node:fs";
import { builtinModules } from "node:module";

const mode = process.argv[2];

// The .NET app, inside main.js: .NET's loader (dotnet.js, from npm run wasm) bundled as a
// dependency, and the rest of the app as a zip (npm run package), unpacked in memory at run time.
const framework = "wasm/out/wwwroot/_framework/dotnet.js";
for (const need of [framework, "dist/bibmd-wasm.zip"])
  if (!existsSync(need)) throw new Error(`${need} is missing: run npm run wasm and npm run package first`);

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: mode === "production" ? false : "inline",
  minify: mode === "production",
  treeShaking: true,
  outfile: "main.js",
  alias: { "bibmd-dotnet": "./" + framework, "bibmd-wasm-zip": "./dist/bibmd-wasm.zip" },
  loader: { ".zip": "binary" },
  // dotnet.js finds the files beside it from its own URL; in main.js it has none, so it is given
  // one that is never fetched: every file comes from the zip, through its resource loader.
  define: { "import.meta.url": JSON.stringify("https://bibmd.invalid/_framework/dotnet.js") },
});
if (mode === "production") {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
