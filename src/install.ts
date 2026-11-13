// The .NET app bibmd runs on (about 7 MB) is not in the plugin's three files: the first time a
// note has a bib block, it is fetched from this version's GitHub release, checked against the
// SHA-256 this build was made with, and unpacked beside main.js.
import { Notice, requestUrl, type App, type PluginManifest } from "obsidian";
import { unzipSync } from "fflate";

// Set by the build (esbuild.config.mjs) from the zip it made; empty in a build without one,
// which uses whatever _framework is already in the plugin's folder.
declare const BIBMD_WASM_SHA256: string;
// Where to fetch it from instead of the release: set only in a test build (BIBMD_WASM_URL=…).
declare const BIBMD_WASM_URL: string;

const REPO = "relu24/obsidian-bibmd";
const ASSET = "bibmd-wasm.zip";

let installing: Promise<void> | null = null;

/** The plugin folder has this version's .NET app, fetched first when it has not. */
export function ensureRuntime(app: App, manifest: PluginManifest): Promise<void> {
  installing ??= install(app, manifest).catch(e => {
    installing = null;   // a later block may try again
    throw e;
  });
  return installing;
}

async function install(app: App, manifest: PluginManifest) {
  const fs = app.vault.adapter;
  const dir = manifest.dir!;
  const marker = `${dir}/_framework/bibmd.version`;
  const want = `${manifest.version} ${BIBMD_WASM_SHA256}`;
  if (!BIBMD_WASM_SHA256) return;
  if (await fs.exists(marker) && (await fs.read(marker)).trim() === want) return;

  const notice = new Notice("bibmd: fetching what it runs on (about 3 MB)…", 0);
  try {
    const url = BIBMD_WASM_URL || `https://github.com/${REPO}/releases/download/${manifest.version}/${ASSET}`;
    const zip = (await requestUrl({ url })).arrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", zip);
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (hex !== BIBMD_WASM_SHA256) throw new Error(`${ASSET} is not the file this version was built with`);

    for (const old of ["_framework", "_content"])
      if (await fs.exists(`${dir}/${old}`)) await fs.rmdir(`${dir}/${old}`, true);
    const files = unzipSync(new Uint8Array(zip));
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith("/")) continue;
      if (name.includes("..") || name.startsWith("/")) throw new Error(`${ASSET} has a path outside the plugin: ${name}`);
      const path = `${dir}/${name}`;
      const parent = path.slice(0, path.lastIndexOf("/"));
      if (!(await fs.exists(parent))) await fs.mkdir(parent);
      await fs.writeBinary(path, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    }
    await fs.write(marker, want);
  } finally {
    notice.hide();
  }
}
