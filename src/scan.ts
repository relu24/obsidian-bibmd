// Where a note's bib blocks are: its front matter, its `bib` blocks (the program,
// in order) and its `bib data` blocks (YAML added to the data), with the lines
// each one stands on so a rendered block can find itself.

export interface Fence {
  lineStart: number;   // the opening fence's line, 0-based, as Obsidian's section info counts
  lineEnd: number;     // the closing fence's line (the last line, for a block not closed yet)
  body: string;
}

export interface Scan {
  front: string | null;
  programs: Fence[];
  data: Fence[];
}

const OPEN = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})(.*)$/;

/** A fence's info string as words: ["bib"], ["bib", "data"], or null for another language. */
export function bibInfo(info: string): string[] | null {
  const words = info.trim().split(/\s+/);
  return words[0] === "bib" ? words : null;
}

export const isData = (words: string[]) => words[1] === "data";

export function scan(text: string): Scan {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Scan = { front: null, programs: [], data: [] };
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === "---" || lines[j].trim() === "...") {
        out.front = lines.slice(0, j + 1).join("\n");
        i = j + 1;
        break;
      }
    }
  }
  for (; i < lines.length; i++) {
    const m = OPEN.exec(lines[i]);
    if (!m) continue;
    const [, prefix, fence, info] = m;
    if (fence[0] === "`" && info.includes("`")) continue;
    // Inside a quote or callout every line carries the same "> "; the body is what follows it.
    const quoted = prefix.includes(">");
    const strip = (l: string) => (quoted ? l.replace(/^(?:[ \t]*>)*[ \t]?/, "") : l.startsWith(prefix) ? l.slice(prefix.length) : l.trimStart());
    let j = i + 1;
    const body: string[] = [];
    for (; j < lines.length; j++) {
      const inner = strip(lines[j]);
      const close = inner.trim();
      if (close.length >= fence.length && close[0] === fence[0] && /^(`+|~+)$/.test(close)) break;
      body.push(inner);
    }
    const words = bibInfo(info);
    if (words) {
      const f: Fence = { lineStart: i, lineEnd: Math.min(j, lines.length - 1), body: body.join("\n") };
      (isData(words) ? out.data : out.programs).push(f);
    }
    i = j;
  }
  return out;
}
