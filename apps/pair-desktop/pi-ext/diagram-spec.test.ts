import { expect, test } from "bun:test";
import { frames, parse, validate, type SceneSpec } from "./diagram-spec";

const grid: SceneSpec = {
  v: 1,
  title: "Unique paths",
  objects: [
    { id: "g", kind: "grid", rows: 3, cols: 4 },
    { id: "eq", kind: "text", text: "" },
  ],
  steps: [
    { caption: "Edges have one path.", set: { "g.r0": "1", "g.c0": "1" }, focus: ["g.r0"] },
    { caption: "Add above and left.", set: { "g[1,1]": "2", "eq.text": "1 + 1 = 2" }, arrows: [{ from: "g[0,1]", to: "g[1,1]" }] },
    { caption: "Answer.", set: { "g[2,3]": "10" }, focus: ["g[2,3]"] },
  ],
};

const tree: SceneSpec = {
  v: 1,
  title: "fib(3)",
  objects: [
    {
      id: "t",
      kind: "tree",
      nodes: [
        { id: "f3", label: "fib(3)" },
        { id: "f2", label: "fib(2)", parent: "f3" },
        { id: "f1", label: "fib(1)", parent: "f3" },
      ],
    },
  ],
  steps: [
    { caption: "Start at the root.", focus: ["f3"] },
    { caption: "Call both children.", add: ["f2", "f1"] },
    { caption: "Answers flow up.", set: { f3: "fib(3) = 2" } },
  ],
};

test("valid grid and tree specs pass", () => {
  expect(validate(grid)).toEqual([]);
  expect(validate(tree)).toEqual([]);
});

test("mermaid fallback needs only title and source", () => {
  expect(validate({ v: 1, kind: "mermaid", title: "x", source: "graph LR; a-->b" })).toEqual([]);
  expect(validate({ v: 1, kind: "mermaid", title: "x", source: "" })).toHaveLength(1);
});

test("out-of-range cells name the valid range", () => {
  const bad = structuredClone(grid);
  bad.steps[1].set = { "g[3,0]": "x" };
  const errs = validate(bad);
  expect(errs).toHaveLength(1);
  expect(errs[0]).toContain('unknown ref "g[3,0]"');
  expect(errs[0]).toContain("[2,3]");
});

test("structural mistakes are reported in plain English", () => {
  expect(validate([])).toEqual(["The diagram must be a JSON object."]);
  const e = validate({ v: 2, title: "", objects: [{ id: "1x", kind: "blob" }], steps: [] });
  expect(e.join("\n")).toMatch(/"v": 1/);
  expect(e.join("\n")).toMatch(/title/);
  expect(e.join("\n")).toMatch(/must start with a letter/);
  expect(e.join("\n")).toMatch(/"kind" must be one of/);
  expect(e.join("\n")).toMatch(/between 2 and 12/);
});

test("trees need one root and real parents; ids are unique", () => {
  const t = structuredClone(tree);
  (t.objects[0] as { nodes: { id: string; label: string; parent?: string }[] }).nodes.push({ id: "f3", label: "dup", parent: "nope" });
  const e = validate(t).join("\n");
  expect(e).toContain('id "f3" is used twice');
  expect(e).toContain('parent "nope"');
});

test("only nodes can be added or removed", () => {
  const g = structuredClone(grid);
  g.steps[0].add = ["g[0,0]"];
  expect(validate(g).join()).toContain("only nodes can be added");
});

test("captions are limited to 120 characters", () => {
  const g = structuredClone(grid);
  g.steps[0].caption = "x".repeat(121);
  expect(validate(g).join()).toContain("under 120");
});

test("frames fold deltas: lines expand, added nodes start hidden, values persist", () => {
  const f = frames(grid);
  expect(f).toHaveLength(3);
  expect(f[0].values["g[0,3]"]).toBe("1");
  expect(f[0].values["g[2,0]"]).toBe("1");
  expect(f[0].changed).toContain("g[0,2]");
  expect(f[1].values["eq"]).toBe("1 + 1 = 2");
  expect(f[2].values["g[1,1]"]).toBe("2");
  expect(f[2].changed).toEqual(["g[2,3]"]);

  const t = frames(tree);
  expect(t[0].hidden.sort()).toEqual(["f1", "f2"]);
  expect(t[1].hidden).toEqual([]);
  expect(t[2].values.f3).toBe("fib(3) = 2");
});

test("parse reports JSON errors", () => {
  expect("errors" in parse("{nope")).toBe(true);
  expect("spec" in parse(JSON.stringify(tree))).toBe(true);
});

test("row positions -1 and n are valid pointer targets but not values", () => {
  const spec = {
    v: 1,
    title: "Two pointers",
    objects: [
      { id: "arr", kind: "row", items: [{ id: "a0", label: "3" }, { id: "a1", label: "5" }] },
      { id: "i", kind: "text", text: "i" },
    ],
    steps: [
      { caption: "i starts before the array.", arrows: [{ from: "i", to: "arr[-1]" }] },
      { caption: "and ends after it.", arrows: [{ from: "i", to: "arr[2]" }], focus: ["arr[2]"] },
    ],
  };
  expect(validate(spec)).toEqual([]);
  const bad = structuredClone(spec) as any;
  bad.steps[0].arrows = [{ from: "i", to: "arr[3]" }];
  expect(validate(bad).join()).toContain("arr[-1] or arr[3]");
  bad.steps[0] = { caption: "x", set: { "arr[0]": "9" } };
  expect(validate(bad).join()).toContain("is a position");
});
