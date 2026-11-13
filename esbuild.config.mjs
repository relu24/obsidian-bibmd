// node esbuild.config.mjs              watch, writing main.js beside manifest.json
// node esbuild.config.mjs production   one minified build
import esbuild from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const mode = process.argv[2];

// The SHA-256 of the .NET app's release zip (node wasm/package.mjs), which the plugin checks what
// it fetches against. Without one, a build uses the _framework already in its folder (development).
const sha = existsSync("dist/bibmd-wasm.sha256") ? readFileSync("dist/bibmd-wasm.sha256", "utf8").trim() : "";

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
  define: { BIBMD_WASM_SHA256: JSON.stringify(sha), BIBMD_WASM_URL: JSON.stringify(process.env.BIBMD_WASM_URL ?? "") },
});
if (mode === "production") {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
