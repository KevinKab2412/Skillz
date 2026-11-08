/**
 * TipTap extensions for a pair note: suggestion marks for agent note edits, `pair-diagram` and
 * `pair-reply` fences as rich blocks, and thread anchors mapped through every edit.
 */
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import CodeBlock from "@tiptap/extension-code-block";
import { Plugin, PluginKey, EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  deletion,
  insertion,
  modification,
  revertSuggestions,
  suggestChanges,
} from "@handlewithcare/prosemirror-suggest-changes";
import { SvelteNodeViewRenderer } from "svelte-tiptap";
import DiagramNode from "./DiagramNode.svelte";
import ReplyNode from "./ReplyNode.svelte";

type MarkSpecLike = {
  attrs?: Record<string, { default?: unknown }>;
  excludes?: string;
  parseDOM?: unknown;
  toDOM: (mark: unknown, inline: boolean) => [string, Record<string, unknown>, ...unknown[]];
};

/** Wraps a suggest-changes MarkSpec as a TipTap mark so TipTap owns the schema. */
function suggestionMark(name: string, spec: MarkSpecLike) {
  return Mark.create({
    name,
    inclusive: false,
    excludes: spec.excludes,
    addAttributes() {
      const out: Record<string, { default: unknown; rendered: boolean }> = {};
      for (const [k, a] of Object.entries(spec.attrs ?? {})) out[k] = { default: a.default ?? null, rendered: false };
      return out;
    },
    parseHTML() {
      return spec.parseDOM as never;
    },
    renderHTML({ mark }) {
      const [tag, attrs] = spec.toDOM(mark, true);
      return [tag, mergeAttributes(attrs, { class: `sg sg-${name}` }), 0];
    },
  });
}

export const Insertion = suggestionMark("insertion", insertion as unknown as MarkSpecLike);
export const Deletion = suggestionMark("deletion", deletion as unknown as MarkSpecLike);
export const Modification = suggestionMark("modification", modification as unknown as MarkSpecLike);

/** Block children may carry suggestion marks (an inserted diagram or paragraph). */
export const PairDocument = Document.extend({ marks: "insertion modification deletion" });

/** Registers suggest-changes' plugin so its commands (apply/revert) work. Kevin's typing stays untracked. */
export const SuggestChanges = Extension.create({
  name: "pairSuggestChanges",
  addProseMirrorPlugins() {
    return [suggestChanges()];
  },
});

export const PairDiagram = Node.create({
  name: "pairDiagram",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { spec: { default: "{}" } };
  },
  parseHTML() {
    return [{ tag: "pair-diagram" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["pair-diagram", mergeAttributes(HTMLAttributes)];
  },
  renderMarkdown(node: { attrs: { spec: string } }) {
    return "```pair-diagram\n" + node.attrs.spec.trim() + "\n```";
  },
  addNodeView() {
    return SvelteNodeViewRenderer(DiagramNode as never);
  },
});

export const PairReply = Node.create({
  name: "pairReply",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { text: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "pair-reply" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["pair-reply", mergeAttributes(HTMLAttributes)];
  },
  renderMarkdown(node: { attrs: { text: string } }) {
    return "```pair-reply\n" + node.attrs.text.trim() + "\n```";
  },
  addNodeView() {
    return SvelteNodeViewRenderer(ReplyNode as never);
  },
});

/** Fences tagged `pair-diagram` / `pair-reply` become rich blocks instead of code blocks. */
export const PairCodeBlock = CodeBlock.extend({
  parseMarkdown(token: { lang?: string; text: string }, helpers: unknown) {
    const lang = (token.lang ?? "").trim();
    if (lang === "pair-diagram") return { type: "pairDiagram", attrs: { spec: token.text } } as never;
    if (lang === "pair-reply") return { type: "pairReply", attrs: { text: token.text } } as never;
    return (this as unknown as { parent: (t: unknown, h: unknown) => unknown }).parent(token, helpers) as never;
  },
});

// --- thread anchors ---------------------------------------------------------------------------

export type LiveAnchor = { id: string; from: number; to: number; detached: boolean };
export const anchorKey = new PluginKey<{ anchors: LiveAnchor[]; active: string | null }>("pairAnchors");

/** Maps each thread's range through every transaction; a passage deleted entirely detaches. */
export const ThreadAnchors = Extension.create({
  name: "threadAnchors",
  addProseMirrorPlugins() {
    return [
      new Plugin<{ anchors: LiveAnchor[]; active: string | null }>({
        key: anchorKey,
        state: {
          init: () => ({ anchors: [], active: null }),
          apply(tr, value) {
            const meta = tr.getMeta(anchorKey) as Partial<{ anchors: LiveAnchor[]; active: string | null }> | undefined;
            let next = meta ? { ...value, ...meta } : value;
            if (tr.docChanged && !meta?.anchors) {
              next = {
                ...next,
                anchors: next.anchors.map((a) => {
                  if (a.detached) return a;
                  const from = tr.mapping.map(a.from, 1);
                  const to = tr.mapping.map(a.to, -1);
                  return to <= from ? { ...a, from, to: from, detached: true } : { ...a, from, to };
                }),
              };
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = anchorKey.getState(state)!;
            return DecorationSet.create(
              state.doc,
              s.anchors
                .filter((a) => !a.detached && a.to > a.from)
                .map((a) => Decoration.inline(a.from, a.to, { class: a.id === s.active ? "anchor active" : "anchor", "data-thread": a.id })),
            );
          },
        },
      }),
    ];
  },
});

/** The note as it should be saved: pending suggestions reverted, so proposals never reach disk. */
export function cleanDoc(state: EditorState): PMNode {
  let clean = state;
  revertSuggestions(state, (tr) => {
    clean = state.apply(tr);
  });
  return clean.doc;
}

/** True when the doc holds any pending suggestion mark. */
export function hasSuggestions(doc: PMNode): boolean {
  let found = false;
  doc.descendants((n) => {
    if (found) return false;
    if (n.marks.some((m) => ["insertion", "deletion", "modification"].includes(m.type.name))) found = true;
    return !found;
  });
  return found;
}

/** Groups pending suggestion marks by id, with their range and text. */
export function suggestionGroups(doc: PMNode): { id: number; from: number; to: number; ins: string; del: string; block: boolean }[] {
  const groups = new Map<number, { id: number; from: number; to: number; ins: string; del: string; block: boolean }>();
  doc.descendants((n, pos) => {
    for (const m of n.marks) {
      if (m.type.name !== "insertion" && m.type.name !== "deletion") continue;
      const id = m.attrs.id as number;
      const g = groups.get(id) ?? { id, from: pos, to: pos, ins: "", del: "", block: false };
      g.from = Math.min(g.from, pos);
      g.to = Math.max(g.to, pos + n.nodeSize);
      if (n.isText) {
        if (m.type.name === "insertion") g.ins += n.text;
        else g.del += n.text;
      } else g.block = true;
      groups.set(id, g);
    }
    return !n.isText;
  });
  return [...groups.values()].sort((a, b) => a.from - b.from);
}
