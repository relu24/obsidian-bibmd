# bibmd for Obsidian

An Obsidian plugin that draws fenced `bib` blocks live, with [bibmd](https://github.com/relu24/bibmd)
itself: each block is a canvas that bibmd's own renderer draws with
[bibui](https://github.com/relu24/bibui), running on .NET WebAssembly. The language is
[bibdoc](https://github.com/relu24/bibdoc).

````markdown
---
data:
  suppliers: [{ name: Northwind, price: 41000 }, { name: Fabrikam, price: 45250 }]
---
```bib
let units = slider("Units", 1, 10, value: 2, step: 1)
for s in data.suppliers { stat(s.name, s.price * units, unit: "EUR") }
```
````

- All the `bib` blocks of a note are one program: a `let` in one block is seen by the next, and
  a slider in the first moves what the third draws.
- The front matter's `data:` and the note's `bib data` blocks (YAML) are the program's data; a
  `bib data` block draws nothing.
- What a button would do outside the note (`call`, `send`, `respond`) is said under the block,
  and not done. `state()` and `set()` work: a button can change the note's own state.
- The values given to inputs last while Obsidian is open, and survive editing the note. They
  are not written to the file.
- The blocks take the theme's colours, the note's text size and font, and Obsidian's look for
  text fields and sliders.

Desktop only.

## What it uses

- **Network:** none. bibmd and the .NET runtime it runs on are inside `main.js` (about 4 MB),
  and are unpacked in memory when a note with a `bib` block is first opened. The plugin
  downloads nothing, installs nothing and sends nothing anywhere.
- **Files outside the vault:** on Linux, so the blocks are set in the same font as the note, the
  plugin runs fontconfig's `fc-list` and `fc-match` to find the note's font, and reads that
  font's files (for example `/usr/share/fonts/…/LiberationSans-Regular.ttf`). Nothing else
  outside the vault is read, and nothing outside it is written. Without fontconfig, bibui's own
  font is used.

## Building it

With the .NET 10 SDK and its `wasm-tools` workload (`dotnet workload install wasm-tools`):

    npm install
    wasm/fetch-sources.sh    # bibmd, bibdoc and bibui at the commits wasm/sources.json pins,
                             # and bibui's FreeType and HarfBuzz for the browser
    npm run wasm             # the .NET app, in wasm/out
    npm run package          # it and its licences as dist/bibmd-wasm.zip
    npm run build            # main.js: the plugin, .NET's loader and that zip
    npm run lint             # Obsidian's own lint rules

The build is deterministic: the same sources give the same `main.js`, so a release can be
checked against one built here. `wasm/patch-node.mjs` (part of `npm run wasm`) makes .NET's
loader treat Obsidian, which is Electron with Node in it, as the browser it is, and gives the
modules it runs from memory an address to resolve relative paths on.

To try a build in a vault, `./install.sh <vault>` copies it into
`<vault>/.obsidian/plugins/bibmd/`.

## How it works

- `src/main.ts` registers the `bib` code block processor; `src/scan.ts` finds a note's blocks.
- `src/wasm.ts` unpacks the .NET app in memory and starts it once, handing .NET's loader each file
  it asks for; it gives each block a canvas, and reads the theme (colours, font, control sizes)
  from Obsidian's CSS variables.
- `wasm/` is the .NET app: bibmd's `Bib.cs`, `Document.cs`, `Blocks.cs` and `Text.cs`, compiled
  as they are, with bibdoc's interpreter and bibui's browser platform. Every block of a note
  draws from one program.

## License

MIT (`LICENSE`). Inside `main.js`: bibmd and bibdoc (MIT), bibui (Apache-2.0, with its NOTICE),
the .NET runtime (MIT), FreeType (FTL) and HarfBuzz (MIT); their licence texts are in the
embedded zip's `licenses/` folder, and at the links above.
