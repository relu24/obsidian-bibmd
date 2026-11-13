// Drives the real Obsidian over the DevTools protocol, for iterating on the plugin without
// a person in the loop. Obsidian has to be started with a debugging port:
//
//   obsidian --remote-debugging-port=9222
//
// Commands (several can follow each other in one call):
//   open <note>            opens a note of the test vault ("Wasm spike.md")
//   reload                 reloads the plugin (main.js, styles.css)
//   reload-app             reloads the whole window: needed after a new .NET build
//   wait <ms>              waits
//   shot <file.png> [css]  screenshot of the window, or of the first element matching css
//   eval <js>              runs js in the window and prints what it gives (awaited)
//   move <x> <y>           moves the mouse to (x, y), in CSS pixels of the window
//   click <x> <y>          clicks there
//   drag <x1> <y1> <x2> <y2>
//   wheel <x> <y> <dy>     scrolls there
//   type <text>            types text into whatever has the keyboard
//   compose <text>         an input method's text in progress (a dead key's accent); type commits it
//   key <Name>             presses a key: Enter, Escape, Tab, ArrowDown…
//   cursor <x> <y>         prints the CSS cursor the element at (x, y) shows
//   console                prints the window's console from here on, until the end
//
//   node test/obsidian.mjs open "Wasm spike.md" wait 1500 shot /tmp/o.png ".bib-wasm-canvas"
import { writeFileSync } from "node:fs";

const port = Number(process.env.OBSIDIAN_PORT ?? 9222);
const vault = process.env.OBSIDIAN_VAULT ?? "vault";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json`).catch(() => {
  console.error(`No Obsidian on port ${port}: start it with obsidian --remote-debugging-port=${port}`);
  process.exit(2);
})).json();
const pages = targets.filter(t => t.type === "page" && t.url.startsWith("app://obsidian.md/"));
const page = pages.find(t => t.title.includes(` - ${vault} - `)) ?? pages.find(t => t.title.includes(vault));
if (!page) {
  console.error(`No window of the vault "${vault}" among: ${pages.map(p => p.title).join(" | ")}`);
  process.exit(2);
}

let ws, id = 0, printConsole = false;
const waiting = new Map();
async function connect() {
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.addEventListener("open", r); ws.addEventListener("error", e); });
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (printConsole && m.method === "Runtime.consoleAPICalled")
      console.log(`[console.${m.params.type}]`, m.params.args.map(a => a.value ?? a.description).join(" "));
    if (printConsole && m.method === "Runtime.exceptionThrown")
      console.log("[exception]", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    waiting.get(m.id)?.(m);
  });
}
const send = (method, params = {}) => new Promise((r, e) => {
  waiting.set(++id, m => (m.error ? e(new Error(`${method}: ${m.error.message}`)) : r(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(js) {
  const r = await send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });

await connect();
await send("Runtime.enable");
await send("Page.enable");

const args = process.argv.slice(2);
while (args.length) {
  const cmd = args.shift();
  switch (cmd) {
    case "open": {
      const note = args.shift();
      // The tab that shows it already, brought to the front; or else the note, in the active tab.
      await evaluate(`(async () => { const n = ${JSON.stringify(note)};
        const leaf = app.workspace.getLeavesOfType("markdown").find(l => l.view.file?.path === n);
        if (leaf) { app.workspace.setActiveLeaf(leaf, { focus: true }); await app.workspace.revealLeaf(leaf); }
        else await app.workspace.openLinkText(n, "", false); })()`);
      break;
    }
    case "reload":
      await evaluate(`(async () => { await app.plugins.disablePlugin("bibmd"); await app.plugins.enablePlugin("bibmd"); })()`);
      break;
    case "reload-app": {
      await send("Page.reload", { ignoreCache: true });
      ws.close();
      await sleep(3000);
      await connect();
      await send("Runtime.enable");
      await send("Page.enable");
      break;
    }
    case "wait": await sleep(Number(args.shift())); break;
    case "shot": {
      const file = args.shift();
      const css = args[0] && !isCommand(args[0]) ? args.shift() : null;
      let clip;
      if (css) {
        const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return null;
          e.scrollIntoView({ block: "nearest" }); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`);
        if (!r) { console.error(`shot: nothing matches ${css}`); break; }
        clip = { ...r, scale: 1 };
      }
      const png = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
      writeFileSync(file, Buffer.from(png.data, "base64"));
      console.log(`shot: ${file}${clip ? ` (${Math.round(clip.width)}×${Math.round(clip.height)} at ${Math.round(clip.x)},${Math.round(clip.y)})` : ""}`);
      break;
    }
    case "eval": console.log(JSON.stringify(await evaluate(args.shift()), null, 1)); break;
    case "move": await mouse("mouseMoved", Number(args.shift()), Number(args.shift()), { button: "none" }); break;
    case "click": {
      const x = Number(args.shift()), y = Number(args.shift());
      await mouse("mouseMoved", x, y, { button: "none" });
      await mouse("mousePressed", x, y);
      await mouse("mouseReleased", x, y);
      break;
    }
    case "drag": {
      const [x1, y1, x2, y2] = args.splice(0, 4).map(Number);
      await mouse("mouseMoved", x1, y1, { button: "none" });
      await mouse("mousePressed", x1, y1);
      for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", x1 + ((x2 - x1) * i) / 10, y1 + ((y2 - y1) * i) / 10, { buttons: 1 }); await sleep(16); }
      await mouse("mouseReleased", x2, y2);
      break;
    }
    case "wheel": {
      const [x, y, dy] = args.splice(0, 3).map(Number);
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
      break;
    }
    case "type": await send("Input.insertText", { text: args.shift() }); break;
    case "compose": {
      const text = args.shift();
      await send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      break;
    }
    case "key": {
      const key = args.shift();
      const code = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }[key] ?? 0;
      for (const type of ["rawKeyDown", "keyUp"])
        await send("Input.dispatchKeyEvent", { type, key, windowsVirtualKeyCode: code, ...(key === "Enter" && type === "rawKeyDown" ? { text: "\r" } : {}) });
      break;
    }
    case "cursor": {
      const x = Number(args.shift()), y = Number(args.shift());
      console.log(await evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName.toLowerCase() + "." + [...e.classList].join(".") + " → " + getComputedStyle(e).cursor : "nothing"; })()`));
      break;
    }
    case "console": printConsole = true; break;
    default: console.error(`unknown command ${cmd}`); process.exit(2);
  }
}
if (printConsole) await sleep(300);
ws.close();
process.exit(0);

function isCommand(s) {
  return ["open", "reload", "reload-app", "wait", "shot", "eval", "move", "click", "drag", "wheel", "type", "compose", "key", "cursor", "console"].includes(s);
}
