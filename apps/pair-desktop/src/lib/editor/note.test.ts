import { afterEach, describe, expect, test } from "vitest";
import type { Editor } from "@tiptap/core";
import { accept, headless, liveAnchors, markdownOf, proposeBlock, proposeEdit, refreshQuotes, reject, setThreads, threadForQuote } from "./note";
import { quoteAt, resolveQuote } from "./anchors";
import { suggestionGroups } from "./extensions";
import type { Thread } from "$lib/api";

const NOTE = `# Basket

## Think

Prices are summed recursively, so the stack depth stays flat for large baskets.

## Plan

Replace the recursive helper with a loop.

\`\`\`pair-diagram
{"v":1,"title":"Loop","objects":[{"id":"r","kind":"row","items":[{"id":"a","label":"1"}]}],"steps":[{"caption":"one"},{"caption":"two"}]}
\`\`\`

\`\`\`pair-reply
A loop keeps memory flat.
\`\`\`
`;

let ed: Editor;
afterEach(() => ed?.destroy());

describe("markdown round trip", () => {
  test("pair fences survive load and save", () => {
    ed = headless(NOTE);
    const md = markdownOf(ed);
    expect(md).toContain("```pair-diagram\n{\"v\":1");
    expect(md).toContain("```pair-reply\nA loop keeps memory flat.\n```");
    expect(md).toContain("## Plan");
    expect(ed.state.doc.content.content.some((n) => n.type.name === "pairDiagram")).toBe(true);
  });
});

describe("agent note edits", () => {
  test("a proposal shows as suggestions but is never saved until accepted", () => {
    ed = headless(NOTE);
    const r = proposeEdit(ed, "so the stack depth stays flat for large baskets", "with no recursion");
    expect("id" in r).toBe(true);
    const g = suggestionGroups(ed.state.doc);
    expect(g).toHaveLength(1);
    expect(g[0].ins).toBe("with no recursion");
    expect(g[0].del).toBe("so the stack depth stays flat for large baskets");
    const md = markdownOf(ed);
    expect(md).toContain("so the stack depth stays flat for large baskets.");
    expect(md).not.toContain("with no recursion");
  });

  test("accept applies, reject restores", () => {
    ed = headless(NOTE);
    const a = proposeEdit(ed, "recursively", "in a loop") as { id: number };
    accept(ed, a.id);
    expect(markdownOf(ed)).toContain("Prices are summed in a loop,");
    expect(suggestionGroups(ed.state.doc)).toHaveLength(0);

    const b = proposeEdit(ed, "Replace the recursive helper", "Rewrite the helper") as { id: number };
    reject(ed, b.id);
    expect(markdownOf(ed)).toContain("Replace the recursive helper with a loop.");
    expect(suggestionGroups(ed.state.doc)).toHaveLength(0);
  });

  test("missing or ambiguous passages return an error the agent can act on", () => {
    ed = headless(NOTE);
    expect(proposeEdit(ed, "not in the note", "x")).toEqual({ error: expect.stringContaining("not in the note") });
    expect(proposeEdit(ed, "the", "x")).toEqual({ error: expect.stringContaining("more than once") });
  });

  test("a diagram proposal lands under the passage and is dropped from disk until accepted", () => {
    ed = headless(NOTE);
    const id = proposeBlock(ed, "pairDiagram", { spec: '{"v":1,"title":"New","objects":[],"steps":[]}' }, { exact: "Prices are summed", prefix: "", suffix: "" })!;
    expect(id).not.toBeNull();
    expect(markdownOf(ed)).not.toContain('"title":"New"');
    const blocks = ed.state.doc.content.content.map((n) => n.type.name);
    expect(blocks[blocks.indexOf("pairDiagram") - 1]).toBe("paragraph");
    accept(ed, id);
    const md = markdownOf(ed);
    expect(md.indexOf('"title":"New"')).toBeGreaterThan(md.indexOf("Prices are summed"));
    expect(md.indexOf('"title":"New"')).toBeLessThan(md.indexOf("## Plan"));
  });
});

describe("review fixes", () => {
  test("an edit next to a pending suggestion is refused instead of merging", () => {
    ed = headless(NOTE);
    expect("id" in proposeEdit(ed, "recursively", "in a loop")).toBe(true);
    expect(proposeEdit(ed, ", so the stack", ", so stack")).toEqual({ error: expect.stringContaining("Wait for his decision") });
    expect(suggestionGroups(ed.state.doc)).toHaveLength(1);
  });

  test("Kevin's typing inside a pending insertion stays his and is saved", () => {
    ed = headless(NOTE);
    proposeEdit(ed, "recursively", "in one simple loop");
    const g = suggestionGroups(ed.state.doc)[0];
    const mid = ed.state.doc.textBetween(g.from, g.to).indexOf("simple");
    // Find the absolute position of "simple" inside the insertion and type before it.
    let at = -1;
    ed.state.doc.descendants((n, pos) => {
      if (at === -1 && n.isText && n.text!.includes("in one simple loop")) at = pos + n.text!.indexOf("simple");
      return at === -1;
    });
    expect(mid).toBeGreaterThan(-1);
    ed.commands.insertContentAt(at, "very ");
    expect(markdownOf(ed)).toContain("very ");
    reject(ed, g.id);
    expect(markdownOf(ed)).toContain("very ");
  });
});

describe("thread anchors", () => {
  const thread = (id: string, exact: string): Thread => ({ id, anchor: { quote: { exact, prefix: "", suffix: "" }, pos: 0 }, messages: [], resolved: false, detached: false });

  test("anchors follow edits and detach when their passage is deleted", () => {
    ed = headless(NOTE);
    setThreads(ed, [thread("t1", "stack depth"), thread("t2", "recursive helper")]);
    const before = liveAnchors(ed).find((a) => a.id === "t1")!;
    ed.commands.insertContentAt(1, "Big ");
    const after = liveAnchors(ed).find((a) => a.id === "t1")!;
    expect(after.from).toBe(before.from + 4);
    expect(ed.state.doc.textBetween(after.from, after.to)).toBe("stack depth");

    const t2 = liveAnchors(ed).find((a) => a.id === "t2")!;
    ed.commands.deleteRange({ from: t2.from, to: t2.to });
    expect(liveAnchors(ed).find((a) => a.id === "t2")!.detached).toBe(true);
  });

  test("refreshed quotes re-anchor after an outside edit", () => {
    ed = headless(NOTE);
    let threads = [thread("t1", "stack depth stays flat")];
    setThreads(ed, threads);
    // Kevin edits inside the passage in the app, then the file changes outside the app.
    const a = liveAnchors(ed)[0];
    ed.commands.insertContentAt(a.from + "stack depth ".length, "really ");
    threads = refreshQuotes(ed, threads);
    expect(threads[0].anchor.quote.exact).toBe("stack depth really stays flat");
    const outside = markdownOf(ed).replace("Prices are summed", "Totals are summed");
    ed.destroy();
    ed = headless(outside);
    setThreads(ed, threads);
    const live = liveAnchors(ed)[0];
    expect(live.detached).toBe(false);
    expect(ed.state.doc.textBetween(live.from, live.to)).toBe("stack depth really stays flat");
  });

  test("agent quotes become threads only when the passage exists", () => {
    ed = headless(NOTE);
    expect(threadForQuote(ed, "x", { exact: "loop", prefix: "with a ", suffix: "." }, "why?")!.anchor.quote.exact).toBe("loop");
    expect(threadForQuote(ed, "y", { exact: "nowhere", prefix: "", suffix: "" }, "?")).toBeNull();
  });
});

test("quote matching prefers context, then nearness", () => {
  const text = "a cat sat. the cat ran. a cat sat.";
  const q = quoteAt(text, 15, 18);
  expect(resolveQuote(text, q)).toBe(15);
  expect(resolveQuote(text, { exact: "cat", prefix: "", suffix: "" }, 30)).toBe(26);
  expect(resolveQuote(text, { exact: "dog", prefix: "", suffix: "" })).toBeNull();
});
