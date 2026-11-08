/**
 * Operations on a pair note editor: load/save markdown, agent proposals as suggestions, and
 * thread anchors. Kept out of the Svelte component so it can be tested headless.
 */
import { Editor, type EditorOptions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { applySuggestion, revertSuggestion, transformToSuggestionTransaction } from "@handlewithcare/prosemirror-suggest-changes";
import type { Transaction } from "@tiptap/pm/state";
import type { Thread, TextQuote } from "$lib/api";
import { quoteAt, rangeOf, textIndex, resolveQuote } from "./anchors";
import {
  Deletion,
  Insertion,
  Modification,
  PairCodeBlock,
  PairDiagram,
  PairDocument,
  PairReply,
  SuggestChanges,
  ThreadAnchors,
  AGENT_META,
  anchorKey,
  cleanDoc,
  suggestionGroups,
  type LiveAnchor,
} from "./extensions";

export function extensions() {
  return [
    StarterKit.configure({ document: false, codeBlock: false, link: false }),
    PairDocument,
    PairCodeBlock,
    Markdown,
    Insertion,
    Deletion,
    Modification,
    SuggestChanges,
    PairDiagram,
    PairReply,
    ThreadAnchors,
  ];
}

export function editorOptions(markdown: string, extra: Partial<EditorOptions> = {}): Partial<EditorOptions> {
  return { extensions: extensions(), content: markdown, contentType: "markdown", ...extra } as Partial<EditorOptions>;
}

/** Headless editor (tests, export). */
export function headless(markdown: string): Editor {
  return new Editor(editorOptions(markdown));
}

/** Markdown to write to disk: pending proposals are reverted first, so they never reach the file. */
export function markdownOf(editor: Editor): string {
  const doc = cleanDoc(editor.state);
  return (editor as unknown as { markdown: { serialize: (j: unknown) => string } }).markdown.serialize(doc.toJSON());
}

function ids(editor: Editor): Set<number> {
  return new Set(suggestionGroups(editor.state.doc).map((g) => g.id));
}

function propose(editor: Editor, build: (tr: Transaction) => void): number | null {
  const before = ids(editor);
  const tr = editor.state.tr;
  build(tr);
  if (!tr.docChanged) return null;
  editor.view.dispatch(transformToSuggestionTransaction(tr, editor.state).setMeta(AGENT_META, true));
  const fresh = [...ids(editor)].filter((i) => !before.has(i));
  return fresh[0] ?? null;
}

/** True when [from, to] touches a pending suggestion; a new edit there would silently merge into it. */
function touchesSuggestion(editor: Editor, from: number, to: number): boolean {
  return suggestionGroups(editor.state.doc).some((g) => g.from <= to + 1 && g.to >= from - 1);
}

const WAIT = "That passage is next to a suggestion Kevin has not answered yet. Wait for his decision, then propose again.";

/**
 * Agent note edit: replace the exact passage `find` with `replace` as tracked suggestions.
 * Returns the suggestion id, or an error the agent can act on.
 */
export function proposeEdit(editor: Editor, find: string, replace: string): { id: number } | { error: string } {
  if (!find) return { error: "find must be a non-empty passage copied from the note." };
  const ix = textIndex(editor.state.doc);
  const first = ix.text.indexOf(find);
  if (first === -1) return { error: "That passage is not in the note (it may have changed). Copy it exactly from the current note." };
  if (ix.text.indexOf(find, first + 1) !== -1) return { error: "That passage appears more than once; include more surrounding words so it is unique." };
  const from = ix.toPos(first);
  const to = ix.toPos(first + find.length);
  if (touchesSuggestion(editor, from, to)) return { error: WAIT };
  const id = propose(editor, (tr) => {
    if (replace) tr.insertText(replace, from, to);
    else tr.delete(from, to);
  });
  return id === null ? { error: "The edit changes nothing." } : { id };
}

/** Position just after the top-level block containing `quote` (or the end of the doc). */
export function afterBlockOf(editor: Editor, quote?: TextQuote): number {
  const doc = editor.state.doc;
  if (quote) {
    const r = rangeOf(doc, quote);
    if (r) {
      const $pos = doc.resolve(r.to);
      return $pos.after(1);
    }
  }
  return doc.content.size;
}

/** Agent block insert (diagram or reply) as a suggestion under a passage. */
export function proposeBlock(editor: Editor, type: "pairDiagram" | "pairReply", attrs: Record<string, string>, quote?: TextQuote): number | null {
  const at = afterBlockOf(editor, quote);
  if (touchesSuggestion(editor, at, at)) return null;
  const node = editor.schema.nodes[type].create(attrs);
  return propose(editor, (tr) => tr.insert(at, node));
}

export function accept(editor: Editor, id: number): boolean {
  return applySuggestion(id)(editor.state, editor.view.dispatch);
}

export function reject(editor: Editor, id: number): boolean {
  return revertSuggestion(id)(editor.state, editor.view.dispatch);
}

/** Loads threads into the anchor plugin, re-finding each passage by its quote. */
export function setThreads(editor: Editor, threads: Thread[]) {
  const doc = editor.state.doc;
  const ix = textIndex(doc);
  const anchors: LiveAnchor[] = threads
    .filter((t) => !t.resolved)
    .map((t) => {
      const at = t.detached ? null : resolveQuote(ix.text, t.anchor.quote, t.anchor.pos);
      return at === null
        ? { id: t.id, from: 0, to: 0, detached: true }
        : { id: t.id, from: ix.toPos(at), to: ix.toPos(at + t.anchor.quote.exact.length), detached: false };
    });
  editor.view.dispatch(editor.state.tr.setMeta(anchorKey, { anchors }));
}

export function liveAnchors(editor: Editor): LiveAnchor[] {
  return anchorKey.getState(editor.state)?.anchors ?? [];
}

export function setActiveThread(editor: Editor, id: string | null) {
  editor.view.dispatch(editor.state.tr.setMeta(anchorKey, { active: id }));
}

/**
 * Threads with quotes re-derived from their mapped ranges. Call before every save, so an edit
 * made outside the app later can still find the passage.
 */
export function refreshQuotes(editor: Editor, threads: Thread[]): Thread[] {
  const live = new Map(liveAnchors(editor).map((a) => [a.id, a]));
  const ix = textIndex(cleanDoc(editor.state));
  const ixNow = textIndex(editor.state.doc);
  return threads.map((t) => {
    const a = live.get(t.id);
    if (!a) return t;
    if (a.detached) return { ...t, detached: true };
    const exact = ixNow.text.slice(ixNow.toOffset(a.from), ixNow.toOffset(a.to));
    const at = resolveQuote(ix.text, { exact, prefix: "", suffix: "" }, ixNow.toOffset(a.from));
    if (at === null) return t;
    return { ...t, detached: false, anchor: { quote: quoteAt(ix.text, at, at + exact.length), pos: at } };
  });
}

/** A new thread on the current selection (or a given range). */
export function threadForSelection(editor: Editor, id: string, firstMessage: { author: string; text: string } | null): Thread | null {
  const { from, to } = editor.state.selection;
  if (to <= from) return null;
  const ix = textIndex(editor.state.doc);
  const s = ix.toOffset(from);
  const e = ix.toOffset(to);
  if (e <= s) return null;
  return {
    id,
    anchor: { quote: quoteAt(ix.text, s, e), pos: s },
    messages: firstMessage ? [firstMessage] : [],
    resolved: false,
    detached: false,
  };
}

/** Builds a thread from a quote the agent sent; null when the passage is not in the note. */
export function threadForQuote(editor: Editor, id: string, quote: TextQuote, text: string): Thread | null {
  const ix = textIndex(editor.state.doc);
  const at = resolveQuote(ix.text, { exact: quote.exact, prefix: quote.prefix ?? "", suffix: quote.suffix ?? "" });
  if (at === null) return null;
  return { id, anchor: { quote: quoteAt(ix.text, at, at + quote.exact.length), pos: at }, messages: [{ author: "agent", text }], resolved: false, detached: false };
}

export function selectedText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, "\n");
}
