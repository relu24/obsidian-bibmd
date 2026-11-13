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

## What it downloads

The plugin's own files are small; bibmd and the .NET runtime it runs on are not (about 7 MB).
The first time a note with a `bib` block is opened, the plugin fetches `bibmd-wasm.zip` (3.0 MB)
from this repository's release for its version, checks it against the SHA-256 the plugin was
built with, and unpacks it into its folder (`.obsidian/plugins/bibmd/`). A file that does
not match is refused. Nothing else is fetched, and nothing is sent anywhere.

On Linux the plugin reads the note's font files through fontconfig (`fc-match`), so the blocks
are set in the same font as the note; elsewhere bibui's own font is used.

## Building it

The plugin (`main.js`):

    npm install
    npm run build

The .NET app (`bibmd-wasm.zip`), from the commits `wasm/sources.json` pins, with the .NET 10
SDK and its `wasm-tools` workload (`dotnet workload install wasm-tools`):

    wasm/fetch-sources.sh    # bibmd, bibdoc and bibui at the pinned commits, and bibui's
                             # FreeType and HarfBuzz for the browser
    npm run wasm             # wasm/out
    npm run package          # dist/bibmd-wasm.zip and its SHA-256
    npm run build            # main.js, with that SHA-256 in it

The build is deterministic: the same sources give the same zip, so a release's
`bibmd-wasm.zip` can be checked against one built here. `wasm/patch-node.mjs` (part of
`npm run wasm`) makes .NET's loader treat Obsidian, which is Electron with Node in it, as the
browser it is.

To try a build in a vault without a release, `./install.sh <vault>` copies the plugin and the
.NET app into `<vault>/.obsidian/plugins/bibmd/`.

## How it works

- `src/main.ts` registers the `bib` code block processor; `src/scan.ts` finds a note's blocks.
- `src/install.ts` fetches and checks the .NET app; `src/wasm.ts` loads it once, gives each
  block a canvas, and reads the theme (colours, font, control sizes) from Obsidian's CSS
  variables.
- `wasm/` is the .NET app: bibmd's `Bib.cs`, `Document.cs`, `Blocks.cs` and `Text.cs`, compiled
  as they are, with bibdoc's interpreter and bibui's browser platform. Every block of a note
  draws from one program.

## License

MIT (`LICENSE`). bibmd and bibdoc are MIT; bibui is Apache-2.0; FreeType (FTL) and HarfBuzz
(MIT) are linked into the .NET app, and their licences are in the zip.
