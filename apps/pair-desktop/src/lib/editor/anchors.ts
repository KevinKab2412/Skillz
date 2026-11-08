/**
 * Thread anchors as W3C TextQuoteSelectors over the note's plain text. A quote is re-found after
 * any edit, inside or outside the app; when it is gone the thread is "detached".
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import type { TextQuote } from "$lib/api";

export const CONTEXT = 32;

/** Builds the quote for `text[start, end)`, with up to 32 characters of context each side. */
export function quoteAt(text: string, start: number, end: number): TextQuote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Finds the best occurrence of `quote.exact` in `text`: most matching context wins, then the one
 * nearest the last known position. Returns the start offset, or null when the passage is gone.
 */
export function resolveQuote(text: string, quote: TextQuote, hint = 0): number | null {
  if (!quote.exact) return null;
  let best: { at: number; score: number; dist: number } | null = null;
  for (let at = text.indexOf(quote.exact); at !== -1; at = text.indexOf(quote.exact, at + 1)) {
    const before = text.slice(Math.max(0, at - CONTEXT), at);
    const after = text.slice(at + quote.exact.length, at + quote.exact.length + CONTEXT);
    const score = commonSuffix(before, quote.prefix ?? "") + commonPrefix(after, quote.suffix ?? "");
    const dist = Math.abs(at - hint);
    if (!best || score > best.score || (score === best.score && dist < best.dist)) best = { at, score, dist };
  }
  return best?.at ?? null;
}

/**
 * The document's text with a map back to ProseMirror positions. Text blocks are joined by "\n";
 * atom nodes (diagrams, replies) contribute nothing, so anchors never land inside them.
 */
export type TextIndex = { text: string; toPos: (offset: number) => number; toOffset: (pos: number) => number };

export function textIndex(doc: PMNode): TextIndex {
  const chunks: { offset: number; pos: number; len: number }[] = [];
  let text = "";
  let first = true;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (node.type.name === "codeBlock" && String(node.attrs.language ?? "").startsWith("pair-")) return false;
      if (!first) text += "\n";
      first = false;
      node.forEach((child, off) => {
        if (child.isText) {
          chunks.push({ offset: text.length, pos: pos + 1 + off, len: child.text!.length });
          text += child.text;
        }
      });
      return false;
    }
    return true;
  });
  const toPos = (offset: number) => {
    for (const c of chunks) if (offset >= c.offset && offset <= c.offset + c.len) return c.pos + (offset - c.offset);
    const last = chunks[chunks.length - 1];
    return last ? last.pos + last.len : 1;
  };
  const toOffset = (pos: number) => {
    for (const c of chunks) if (pos >= c.pos && pos <= c.pos + c.len) return c.offset + (pos - c.pos);
    let o = 0;
    for (const c of chunks) if (c.pos <= pos) o = c.offset + c.len;
    return o;
  };
  return { text, toPos, toOffset };
}

/** Resolves a quote to a ProseMirror range, or null if detached. */
export function rangeOf(doc: PMNode, quote: TextQuote, hint = 0): { from: number; to: number } | null {
  const ix = textIndex(doc);
  const at = resolveQuote(ix.text, quote, hint);
  if (at === null) return null;
  return { from: ix.toPos(at), to: ix.toPos(at + quote.exact.length) };
}
