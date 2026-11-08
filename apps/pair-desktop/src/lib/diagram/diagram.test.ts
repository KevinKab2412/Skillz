import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import DiagramView from "./DiagramView.svelte";
import { centre, layout } from "./layout";
import type { SceneSpec } from "$pi/diagram-spec";

const fib: SceneSpec = {
  v: 1,
  title: "fib(3): answers flow up",
  objects: [
    {
      id: "t",
      kind: "tree",
      nodes: [
        { id: "f3", label: "fib(3)" },
        { id: "f2", label: "fib(2)", parent: "f3" },
        { id: "f1", label: "fib(1)", parent: "f3" },
        { id: "f1b", label: "fib(1)", parent: "f2" },
        { id: "f0", label: "fib(0)", parent: "f2" },
      ],
    },
  ],
  steps: [
    { caption: "Start at fib(3).", focus: ["f3"] },
    { caption: "It calls fib(2) and fib(1).", add: ["f2", "f1"] },
    { caption: "fib(2) calls the base cases.", add: ["f1b", "f0"] },
    { caption: "Answers flow up: fib(3) = 2.", set: { f3: "2", f2: "1" }, focus: ["f3"] },
  ],
};

const grid: SceneSpec = {
  v: 1,
  title: "Grid",
  objects: [{ id: "g", kind: "grid", rows: 2, cols: 3, colLabels: ["a", "b", "c"] }],
  steps: [
    { caption: "Top row.", set: { "g.r0": "1" } },
    { caption: "Cell.", set: { "g[1,2]": "3" }, arrows: [{ from: "g[0,2]", to: "g[1,2]" }] },
  ],
};

describe("layout", () => {
  test("trees put children below parents and centre parents over children", () => {
    const l = layout(fib);
    const pos = (r: string) => l.boxes.find((b) => b.ref === r)!;
    expect(pos("f2").y).toBeGreaterThan(pos("f3").y);
    expect(pos("f0").y).toBeGreaterThan(pos("f2").y);
    expect(pos("f2").x).toBe((pos("f1b").x + pos("f0").x) / 2);
    expect(l.links).toContainEqual({ from: "f3", to: "f2" });
  });
  test("flows lay out in layers left to right", () => {
    const l = layout({
      v: 1,
      title: "f",
      objects: [{ id: "fl", kind: "flow", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c" }] }],
      steps: [{ caption: "1" }, { caption: "2" }],
    });
    const x = (r: string) => l.boxes.find((b) => b.ref === r)!.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
  });
  test("grid cells and row refs resolve to positions", () => {
    const l = layout(grid);
    expect(l.boxes.filter((b) => b.kind === "cell")).toHaveLength(6);
    expect(centre(l, "g.r1")).toEqual(centre(l, "g[1,0]"));
    expect(centre(l, "missing")).toBeNull();
  });
});

describe("DiagramView", () => {
  test("steps forward and back with captions, counts and hidden nodes", async () => {
    const { container } = render(DiagramView, { spec: fib });
    expect(screen.getByText("1/4")).toBeTruthy();
    expect(container.querySelector(".caption")!.textContent).toBe("Start at fib(3).");
    expect(container.querySelectorAll(".steps li")).toHaveLength(4);
    expect(container.querySelector('[data-ref="f2"]')).toBeNull();
    expect(container.querySelector('[data-ref="f3"]')!.classList.contains("focus")).toBe(true);

    await fireEvent.click(screen.getByLabelText("Next step"));
    expect(screen.getByText("2/4")).toBeTruthy();
    expect(container.querySelector('[data-ref="f2"]')).not.toBeNull();
    expect(container.querySelector('[data-ref="f2"]')!.classList.contains("changed")).toBe(true);

    await fireEvent.click(screen.getByLabelText("Next step"));
    await fireEvent.click(screen.getByLabelText("Next step"));
    expect(container.querySelector(".caption")!.textContent).toBe("Answers flow up: fib(3) = 2.");
    expect((screen.getByLabelText("Next step") as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-ref="f3"] text')!.textContent).toBe("2");

    await fireEvent.keyDown(container.querySelector("figure")!, { key: "ArrowLeft" });
    expect(screen.getByText("3/4")).toBeTruthy();
  });

  test("draws step arrows and keeps values across steps", async () => {
    const { container } = render(DiagramView, { spec: grid });
    expect(container.querySelector('[data-ref="g[0,1]"] text')!.textContent).toBe("1");
    expect(container.querySelectorAll("path.arrow")).toHaveLength(0);
    await fireEvent.click(screen.getByLabelText("Next step"));
    expect(container.querySelectorAll("path.arrow")).toHaveLength(1);
    expect(container.querySelector('[data-ref="g[0,1]"] text')!.textContent).toBe("1");
  });

  test("See it larger opens an overlay", async () => {
    render(DiagramView, { spec: grid });
    await fireEvent.click(screen.getByText("See it larger"));
    expect(screen.getAllByLabelText("Diagram: Grid")).toHaveLength(2);
  });
});
