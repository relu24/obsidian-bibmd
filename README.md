# bibmd for Obsidian

Notes that compute. Write a small program in a fenced `bib` block and Obsidian shows it as
sliders, choices, buttons, cards, tables and charts that update as you move them, right inside
the note.

````markdown
---
data:
  rooms: [{ name: Kitchen, m2: 12 }, { name: Living room, m2: 28 }, { name: Bedroom, m2: 16 }]
---
```bib
let coats = state("coats", 2)
let price = slider("Paint, EUR a litre", 10, 60, value: 25, step: 5)
row(fit: true) {
  if button("One coat", style: ghost, disabled: coats == 1).clicked { set("coats", 1) }
  if button("Two coats", style: ghost, disabled: coats == 2).clicked { set("coats", 2) }
}
```

Walls are about three times the floor, and a litre covers 10 m².

```bib
for r in data.rooms {
  let litres = r.m2 * 3 * coats / 10
  stat(r.name, round(litres * price), unit: "EUR")
}
```
````

Drag the slider or press a button, and the costs under the prose change with it.

## What you get

- **One note, one program.** Every `bib` block in a note is part of the same program. A
  `let` in one block can be used in the next, so a slider at the top can drive a chart three
  paragraphs down, with ordinary writing in between.
- **Your data stays in the note.** The front matter's `data:` and any `bib data` blocks (plain
  YAML) are what the program reads. A `bib data` block doesn't draw anything.
- **Buttons that do things.** `state()` and `set()` give a note its own memory: presets
  that move sliders, steps through a checklist or a wizard, another roll of the dice.
- **Looks like Obsidian.** Blocks pick up your theme's colours, the note's font and text
  size, and Obsidian's own text fields and sliders, in light and dark mode.
- **Doesn't change your file.** What you type and pick stays while Obsidian is open, and
  isn't lost when you edit the note. None of it is written to the file.

The language is [bibdoc](https://github.com/relu24/bibdoc), and its reference lists every
widget. The same notes open in [bibmd](https://github.com/relu24/bibmd), the desktop reader,
and on [bibmd.app](https://bibmd.app).

## Installing

From the [latest release](https://github.com/relu24/obsidian-bibmd/releases/latest), put
`main.js`, `manifest.json` and `styles.css` in `<vault>/.obsidian/plugins/bibmd/`. Then
turn on **bibmd** under Settings → Community plugins. Desktop only (Obsidian 1.5 or later).

## Disclosures

- **Network:** none. bibmd and its .NET runtime are inside `main.js` (about 4 MB) and are
  unpacked in memory; nothing is downloaded or sent.
- **Files outside the vault:** on Linux, the plugin runs fontconfig (`fc-list`, `fc-match`) to
  find the note's font and reads that font's files, so the blocks match the note. Nothing else
  outside the vault is read or written.

## Building it

With the .NET 10 SDK and its `wasm-tools` workload (`dotnet workload install wasm-tools`):

    npm install
    wasm/fetch-sources.sh    # bibmd, bibdoc and bibui at the commits wasm/sources.json pins,
                             # and bibui's FreeType and HarfBuzz for the browser
    npm run wasm             # the .NET app, in wasm/out
    npm run package          # it and its licences as dist/bibmd-wasm.zip
    npm run build            # main.js: the plugin, .NET's loader and that zip
    npm run lint             # Obsidian's own lint rules
    ./install.sh <vault>     # copies the build into <vault>/.obsidian/plugins/bibmd/

The build is deterministic: the same sources give the same `main.js`, so you can check a
release against one you build yourself.

## How it works

Each block is a `<canvas>` drawn by bibmd's own renderer, the same code the desktop reader
uses, compiled to WebAssembly with [bibui](https://github.com/relu24/bibui) as its UI
toolkit.

- `src/main.ts` registers the `bib` code block processor; `src/scan.ts` finds a note's blocks.
- `src/wasm.ts` unpacks the .NET app in memory and starts it once, handing .NET's loader each
  file it asks for. It gives each block a canvas and reads the theme (colours, font, control
  sizes) from Obsidian's CSS variables.
- `wasm/` is the .NET app: bibmd's `Bib.cs`, `Charts.cs`, `Document.cs`, `Blocks.cs`,
  `Fences.cs` and `Text.cs`, compiled as they are, with bibdoc's interpreter and bibui's
  browser platform. All the blocks of a note run as one program. `wasm/patch-node.mjs` makes .NET's loader treat Obsidian
  (Electron, with Node in it) as the browser it is, and gives the modules it runs from memory
  an address to resolve relative paths against.

## License

MIT (`LICENSE`). Inside `main.js`: bibmd and bibdoc (MIT), bibui (Apache-2.0, with its
NOTICE), the .NET runtime (MIT), FreeType (FTL) and HarfBuzz (MIT). Their licence texts are
in the embedded zip's `licenses/` folder, and at the links above.
