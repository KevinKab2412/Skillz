/**
 * Places scene objects without pixels from the agent: grids and rows as cells, trees by depth
 * and leaf order, flows in layers from left to right. Objects stack top to bottom.
 */
import type { SceneObject, SceneSpec } from "$pi/diagram-spec";

export const CELL = 46;
export const NODE_W = 112;
export const NODE_H = 36;
const GAP_X = 28;
const GAP_Y = 44;
const PAD = 16;
const LABEL = 22;

export type Box = { ref: string; x: number; y: number; w: number; h: number; kind: "cell" | "node" | "text" | "label" | "slot" };
export type Link = { from: string; to: string; label?: string };
export type Layout = { width: number; height: number; boxes: Box[]; links: Link[] };

export function layout(spec: SceneSpec): Layout {
  const boxes: Box[] = [];
  const links: Link[] = [];
  let y = PAD;
  let width = 0;
  for (const o of spec.objects) {
    const placed = place(o, PAD, y);
    boxes.push(...placed.boxes);
    links.push(...placed.links);
    y += placed.height + GAP_Y;
    width = Math.max(width, placed.width + PAD * 2);
  }
  return { width: Math.max(width, 240), height: y - GAP_Y + PAD, boxes, links };
}

function place(o: SceneObject, x0: number, y0: number): { boxes: Box[]; links: Link[]; width: number; height: number } {
  switch (o.kind) {
    case "grid": {
      const left = o.rowLabels ? LABEL : 0;
      const top = o.colLabels ? LABEL : 0;
      const boxes: Box[] = [];
      o.colLabels?.forEach((l, c) => boxes.push({ ref: `${o.id}.col:${l}`, x: x0 + left + c * CELL, y: y0, w: CELL, h: top, kind: "label" }));
      o.rowLabels?.forEach((l, r) => boxes.push({ ref: `${o.id}.row:${l}`, x: x0, y: y0 + top + r * CELL, w: left, h: CELL, kind: "label" }));
      for (let r = 0; r < o.rows; r++)
        for (let c = 0; c < o.cols; c++)
          boxes.push({ ref: `${o.id}[${r},${c}]`, x: x0 + left + c * CELL, y: y0 + top + r * CELL, w: CELL, h: CELL, kind: "cell" });
      return { boxes, links: [], width: left + o.cols * CELL, height: top + o.rows * CELL };
    }
    case "row": {
      // Cells are sized to the longest label; slot -1 sits left of the first item and slot n right of the last.
      const w = Math.max(CELL * 1.4, Math.max(...o.items.map((n) => n.label.length)) * 8 + 18);
      const left = x0 + w;
      const boxes: Box[] = o.items.map((n, i) => ({ ref: n.id, x: left + i * w, y: y0, w, h: CELL, kind: "node" }));
      for (let i = -1; i <= o.items.length; i++) boxes.push({ ref: `${o.id}[${i}]`, x: left + i * w, y: y0, w, h: CELL, kind: "slot" });
      return { boxes, links: [], width: (o.items.length + 2) * w, height: CELL };
    }
    case "text":
      return { boxes: [{ ref: o.id, x: x0, y: y0, w: 360, h: 24, kind: "text" }], links: [], width: 360, height: 24 };
    case "tree": {
      const kids = new Map<string, string[]>();
      let root = "";
      for (const n of o.nodes) {
        if (n.parent === undefined) root = n.id;
        else kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id]);
      }
      const col = new Map<string, number>();
      const depth = new Map<string, number>();
      let leaf = 0;
      const walk = (id: string, d: number): number => {
        depth.set(id, d);
        const ch = kids.get(id) ?? [];
        const c = ch.length ? ch.map((k) => walk(k, d + 1)).reduce((a, b) => a + b, 0) / ch.length : leaf++;
        col.set(id, c);
        return c;
      };
      walk(root, 0);
      const boxes = o.nodes.map((n) => ({
        ref: n.id,
        x: x0 + (col.get(n.id) ?? 0) * (NODE_W + GAP_X),
        y: y0 + (depth.get(n.id) ?? 0) * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
        kind: "node" as const,
      }));
      const links = o.nodes.filter((n) => n.parent).map((n) => ({ from: n.parent!, to: n.id }));
      const maxD = Math.max(...depth.values());
      return { boxes, links, width: Math.max(leaf, 1) * (NODE_W + GAP_X) - GAP_X, height: (maxD + 1) * (NODE_H + GAP_Y) - GAP_Y };
    }
    case "flow": {
      // Layer = longest path from a source; cycles are cut by visiting each node once.
      const edges = o.edges ?? [];
      const layer = new Map<string, number>(o.nodes.map((n) => [n.id, 0]));
      for (let pass = 0; pass < o.nodes.length; pass++)
        for (const e of edges) {
          const next = (layer.get(e.from) ?? 0) + 1;
          if (next > (layer.get(e.to) ?? 0) && next < o.nodes.length) layer.set(e.to, next);
        }
      const rows = new Map<number, number>();
      const boxes = o.nodes.map((n) => {
        const l = layer.get(n.id) ?? 0;
        const r = rows.get(l) ?? 0;
        rows.set(l, r + 1);
        return { ref: n.id, x: x0 + l * (NODE_W + GAP_X * 1.6), y: y0 + r * (NODE_H + GAP_Y / 2), w: NODE_W, h: NODE_H, kind: "node" as const };
      });
      const layers = Math.max(...layer.values()) + 1;
      const tallest = Math.max(...rows.values());
      return {
        boxes,
        links: edges.map((e) => ({ from: e.from, to: e.to, label: e.label })),
        width: layers * (NODE_W + GAP_X * 1.6) - GAP_X * 1.6,
        height: tallest * (NODE_H + GAP_Y / 2) - GAP_Y / 2,
      };
    }
  }
}

/** Centre of a ref; a grid row/column ref resolves to its first cell. */
export function centre(l: Layout, ref: string): { x: number; y: number } | null {
  const m = /^(\w[\w-]*)\.(r|c)(\d+)$/.exec(ref);
  const key = m ? (m[2] === "r" ? `${m[1]}[${m[3]},0]` : `${m[1]}[0,${m[3]}]`) : ref;
  const b = l.boxes.find((b) => b.ref === key);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
}
