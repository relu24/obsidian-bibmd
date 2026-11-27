// bibmd in Obsidian: each bib block drawn by bibmd's own Bib.cs with bibui, on a <canvas>, from
// the .NET WebAssembly app in wasm/. All of it is inside main.js: .NET's loader bundled as a
// dependency, and the rest of the app as a zip that is unpacked in memory and handed to the
// loader file by file. Nothing is downloaded or written. The runtime is started once, the first
// time a note asks for it; all the blocks of a note are one program there.
import { dotnet } from "bibmd-dotnet";
import zip from "bibmd-wasm-zip";
import { unzipSync } from "fflate";

interface Bibmd {
  Preload(url: string): Promise<void>;
  Open(canvas: HTMLCanvasElement, note: string, text: string, block: number, theme: string): Promise<number>;
  Update(note: string, text: string): void;
  Show(id: number, block: number): void;
  Close(id: number): void;
  Font(family: string, base64: string): void;
  Emoji(font: Uint8Array): void;
  Fallback(font: Uint8Array): void;
}

let loading: Promise<Bibmd> | null = null;

// What the .NET side calls back: a block's height, and its first frame (nothing waits for it).
(window as unknown as { bibCanvas: unknown }).bibCanvas = {
  height(canvas: HTMLCanvasElement, px: number) { canvas.style.height = `${px}px`; },
  drawn() {},
  // A note's download(): Obsidian saves it as any download (a save dialog on the desktop).
  download(name: string, text: string) {
    const a = createEl("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  },
};

// A copy of a file's bytes as an ArrayBuffer of its own, for Blob and Response.
const own = (bytes: Uint8Array) => bytes.slice().buffer;

function load(): Promise<Bibmd> {
  loading ??= (async () => {
    const files = unzipSync(zip);
    // A JavaScript module of the app, as a URL the page can import: .NET's loader imports its
    // runtime this way, and bibui its browser module.
    const moduleUrl = (path: string) => URL.createObjectURL(new Blob([own(files[path])], { type: "text/javascript" }));
    const runtime = await dotnet.withResourceLoader((type, name) => {
      const path = name.includes("/") ? name : `_framework/${name}`;
      const bytes = files[path];
      if (!bytes) return null;
      if (type === "dotnetjs") return moduleUrl(path);
      const kind = name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
      return Promise.resolve(new Response(own(bytes), { headers: { "Content-Type": kind } }));
    }).create();
    await runtime.runMain();
    const exports = await runtime.getAssemblyExports("bibwasm.dll") as { BibMd: { BibCanvas: Bibmd } };
    const bibmd = exports.BibMd.BibCanvas;
    await bibmd.Preload(moduleUrl("_content/Bibui.Platform.Browser/bibui-browser.js"));
    // The emoji face and the symbol fonts packed with the plugin: nothing is downloaded.
    if (files["fonts/Twemoji.Mozilla.ttf"]) bibmd.Emoji(files["fonts/Twemoji.Mozilla.ttf"]);
    for (const name of ["fonts/NotoSansMath-Symbols.ttf", "fonts/NotoSansSymbols2-Symbols.ttf"])
      if (files[name]) bibmd.Fallback(files[name]);
    return bibmd;
  })();
  return loading;
}

/** A block bibmd draws on a canvas: told when blocks before it come or go, and closed. */
export interface Block {
  show(block: number): void;
  close(): void;
}

/** The note's text as it is now, for every block of it on screen; nothing before .NET is loaded. */
export function updateNote(note: string, text: string) {
  void loading?.then(b => b.Update(note, text)).catch(() => {});
}

/** Opens bibmd on a canvas for the `block`-th bib block of the note at `note` (its path). */
export async function openBlock(canvas: HTMLCanvasElement, note: string, text: string, block: number): Promise<Block> {
  const bibmd = await load();
  const theme = { ...hostTheme(canvas), fonts: noteFonts(bibmd, canvas) };
  const id = await bibmd.Open(canvas, note, text, block, JSON.stringify(theme));
  return {
    show: k => bibmd.Show(id, k),
    close: () => bibmd.Close(id),
  };
}

// ── fonts ──

// The families registered with bibui, by the CSS stack they stand for.
const registered = new Map<string, string | null>();

/**
 * The note's own fonts, for bibui to set its text in: the body's and the code's CSS font stacks,
 * each resolved as Chromium resolves it on Linux (the first family fontconfig has; system-ui and
 * the generic names through fc-match), and its regular, bold and italic files read from disk and
 * registered with bibui. Desktop only; elsewhere, or when fontconfig is missing, bibui's own.
 */
function noteFonts(bibui: Bibmd, at: HTMLElement): { body?: string; mono?: string } {
  const out: { body?: string; mono?: string } = {};
  const body = getComputedStyle(at.parentElement!).fontFamily;
  const mono = getComputedStyle(at.doc.body).getPropertyValue("--font-monospace");
  const b = register(bibui, body, "host-body", "sans-serif");
  const m = register(bibui, mono, "host-mono", "monospace");
  if (b) out.body = b;
  if (m) out.mono = m;
  return out;
}

function register(bibui: Bibmd, stack: string, name: string, generic: string): string | null {
  const key = name + "\u0001" + stack;
  if (registered.has(key)) return registered.get(key)!;
  let family: string | null = null;
  try {
    const files = fontFiles(stack, generic);
    if (files.length > 0) {
      const fs = node<typeof import("fs")>("fs");
      if (!fs) return null;
      family = `${name}-${registered.size}`;
      for (const f of files) bibui.Font(family, fs.readFileSync(f).toString("base64"));
    }
  } catch {
    family = null;   // the note's font could not be read: bibui's own is used
  }
  registered.set(key, family);
  return family;
}

// A Node module, on the desktop, where Obsidian has Node; nothing elsewhere.
function node<T>(name: string): T | null {
  const require = (window as unknown as { require?: (name: string) => unknown }).require;
  return require ? require(name) as T : null;
}

// The files of the first family in a CSS font stack that this system has.
function fontFiles(stack: string, generic: string): string[] {
  const cp = node<typeof import("child_process")>("child_process");
  if (!cp) return [];
  const run = (...args: string[]) => cp.execFileSync(args[0], args.slice(1), { encoding: "utf8" });
  const has = (family: string) => run("fc-list", `:family=${family}`, "family").trim() !== "";
  const generics: Record<string, string> = { "system-ui": "system-ui", "sans-serif": "sans-serif", serif: "serif", monospace: "monospace" };
  let pattern: string | null = null;
  for (const raw of stack.split(",")) {
    const name = raw.trim().replace(/^["']|["']$/g, "");
    if (!name || name === "??" || name.startsWith("-apple") || name === "BlinkMacSystemFont" || name.startsWith("ui-")) continue;
    if (generics[name]) { pattern = generics[name]; break; }
    if (has(name)) { pattern = name; break; }
  }
  pattern ??= generic;
  const family = run("fc-match", "-f", "%{family[0]}", pattern).trim();
  const files = new Set<string>();
  for (const style of ["", ":weight=bold", ":slant=italic", ":weight=bold:slant=italic"]) {
    const file = run("fc-match", "-f", "%{file}", `${family}${style}`).trim();
    if (/\.(ttf|otf)$/i.test(file)) files.add(file);
  }
  return [...files];
}

// bibui's colour roles, from the Obsidian variables that play the same part.
const ROLES: Record<string, string> = {
  surface: "--background-primary",
  field: "--background-modifier-form-field",
  track: "--slider-track-background",
  thumbBorder: "--slider-thumb-border-color",
  raised: "--background-secondary",
  raisedHover: "--background-modifier-hover",
  raisedActive: "--background-modifier-active-hover",
  border: "--background-modifier-border",
  borderHover: "--background-modifier-border-hover",
  borderFocus: "--background-modifier-border-focus",
  text: "--text-normal",
  muted: "--text-muted",
  faint: "--text-faint",
  accent: "--interactive-accent",
  accentHover: "--interactive-accent-hover",
  onAccent: "--text-on-accent",
  danger: "--color-red",
  success: "--color-green",
};

/** The theme as the canvas's place in the note sees it: each role as #RRGGBBAA, and the text size. */
function hostTheme(at: HTMLElement) {
  const probe = at.parentElement!.createDiv();
  const ctx = createEl("canvas").getContext("2d")!;
  const colors: Record<string, string> = {};
  // A translucent variable (a hover tint) is mixed onto the background it is drawn on.
  const ground = getComputedStyle(probe).getPropertyValue("--background-primary");
  for (const [role, variable] of Object.entries(ROLES)) {
    probe.style.color = `var(${variable})`;
    const css = getComputedStyle(probe).color;
    if (!css) continue;
    ctx.clearRect(0, 0, 1, 1);
    if (role !== "surface") { ctx.fillStyle = ground; ctx.fillRect(0, 0, 1, 1); }
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    colors[role] = "#" + [r, g, b, a].map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  const size = parseFloat(getComputedStyle(probe).fontSize) || 16;
  probe.remove();
  const css = getComputedStyle(at.doc.body);
  const px = (name: string, otherwise: number) => parseFloat(css.getPropertyValue(name)) || otherwise;
  const pointer = css.getPropertyValue("--cursor").trim() === "pointer";
  // Obsidian's controls, by its own variables: a field 30 px tall with 8 px at its sides, and a
  // slider with a plain track and a white thumb.
  const input = { paddingX: px("--size-4-2", 8), paddingY: px("--size-4-1", 4), radius: px("--input-radius", 5) };
  const slider = { grooveHeight: px("--slider-track-height", 4), thumbSize: px("--slider-thumb-height", 18), thumb: "#FFFFFFFF" };
  return { dark: at.doc.body.classList.contains("theme-dark"), size, colors, pointer, input, slider };
}
