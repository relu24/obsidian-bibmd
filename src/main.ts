import { MarkdownRenderChild, Plugin, TFile, debounce, type MarkdownPostProcessorContext } from "obsidian";
import { scan, type Scan } from "./scan.ts";
import { openBlock, updateNote, type Block } from "./wasm.ts";

/** A note with bib blocks on screen: its text as last read, where its blocks are, and their views. */
class Note {
  path: string;
  text = "";
  scan: Scan = { front: null, programs: [], data: [] };
  readonly views = new Set<BlockView>();

  constructor(path: string) {
    this.path = path;
  }

  /** The note's text as it is now. When it changed, bibmd draws every block of it again. */
  update(text: string) {
    if (text === this.text) return;
    this.text = text;
    this.scan = scan(text);
    updateNote(this.path, text);
    for (const v of this.views) v.place();
  }
}

/**
 * A `bib` (or `bib data`) block as the note shows it, in Reading view or Live Preview: a canvas
 * bibmd draws the block on. All the bib blocks of a note are one program in bibmd, so a slider in
 * one block moves what another draws. A data block draws nothing.
 */
class BlockView extends MarkdownRenderChild {
  private readonly note: Note;
  private readonly source: string;
  private readonly ctx: MarkdownPostProcessorContext;
  private block: Promise<Block | null> | null = null;
  private shown = -1;

  constructor(el: HTMLElement, note: Note, source: string, ctx: MarkdownPostProcessorContext) {
    super(el);
    this.note = note;
    this.source = source;
    this.ctx = ctx;
  }

  onload() {
    this.note.views.add(this);
    this.place();
  }

  onunload() {
    this.note.views.delete(this);
    void this.block?.then(b => b?.close());
  }

  // Which bib block of the note this is: the one on this block's lines, or else the one with
  // this block's source. A data block draws nothing.
  private locate(): number | "data" {
    const body = this.source.trimEnd();
    const line = this.ctx.getSectionInfo(this.containerEl)?.lineStart;
    const { programs, data } = this.note.scan;
    if (line !== undefined) {
      const k = programs.findIndex(p => p.lineStart === line);
      if (k >= 0 && programs[k].body.trimEnd() === body) return k;
      if (data.some(d => d.lineStart === line)) return "data";
    }
    const same = programs.findIndex(p => p.body.trimEnd() === body);
    if (same >= 0) return same;
    if (data.some(d => d.body.trimEnd() === body)) return "data";
    return line !== undefined ? programs.findIndex(p => p.lineStart === line) : -1;
  }

  /** Opens the canvas, or tells bibmd which block it is now. */
  place() {
    const el = this.containerEl;
    const at = this.locate();
    if (at === "data") {
      el.addClass("bib-data-block");
      return;
    }
    if (at < 0) return;
    if (this.block) {
      if (at !== this.shown) {
        this.shown = at;
        void this.block.then(b => b?.show(at));
      }
      return;
    }
    this.shown = at;
    el.addClass("bib-block");
    el.empty();
    const canvas = el.createEl("canvas", { cls: "bib-canvas" });
    this.block = openBlock(canvas, this.note.path, this.note.text, at)
      .catch((e: unknown) => {
        el.createDiv({ cls: "bib-problem", text: `bibmd could not draw this block: ${e instanceof Error ? e.message : String(e)}` });
        return null;
      });
  }
}

export default class BibPlugin extends Plugin {
  private readonly notes = new Map<string, Note>();

  async onload() {
    this.registerMarkdownCodeBlockProcessor("bib", async (source, el, ctx) => {
      const note = this.note(ctx.sourcePath);
      // The section's text is the whole note as it is on screen; without it, the file.
      let text = ctx.getSectionInfo(el)?.text;
      if (text === undefined) {
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        text = file instanceof TFile ? await this.app.vault.cachedRead(file) : source;
      }
      note.update(text);
      ctx.addChild(new BlockView(el, note, source, ctx));
    });

    // Typing in the editor: the blocks Obsidian does not draw again (the ones not touched, and
    // the front matter's data) still follow the note.
    const typed = debounce((path: string, text: string) => {
      const note = this.notes.get(path);
      if (note && note.views.size > 0) note.update(text);
    }, 250, true);
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      if (info.file && this.notes.has(info.file.path)) typed(info.file.path, editor.getValue());
    }));
    this.registerEvent(this.app.vault.on("modify", async file => {
      const note = this.notes.get(file.path);
      if (!note || note.views.size === 0 || !(file instanceof TFile)) return;
      note.update(await this.app.vault.cachedRead(file));
    }));
  }

  onunload() {
    this.notes.clear();
  }

  private note(path: string): Note {
    let note = this.notes.get(path);
    if (!note) {
      note = new Note(path);
      this.notes.set(path, note);
    }
    return note;
  }
}
