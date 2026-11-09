/**
 * The `pair-diagram` scene spec (v1): named objects placed by layout, plus steps that change
 * them. Shared by the Pi extension (to check what the agent wrote) and the app (to draw it).
 * No dependencies, so both sides can import it as plain TypeScript.
 */

export type GridObject = { id: string; kind: "grid"; rows: number; cols: number; rowLabels?: string[]; colLabels?: string[] };
export type TreeObject = { id: string; kind: "tree"; nodes: { id: string; label: string; parent?: string }[] };
export type FlowObject = {
  id: string;
  kind: "flow";
  nodes: { id: string; label: string }[];
  edges?: { from: string; to: string; label?: string }[];
};
export type RowObject = { id: string; kind: "row"; items: { id: string; label: string }[] };
export type TextObject = { id: string; kind: "text"; text: string };
export type SceneObject = GridObject | TreeObject | FlowObject | RowObject | TextObject;

export type Step = {
  caption: string;
  set?: Record<string, string>;
  add?: string[];
  remove?: string[];
  arrows?: { from: string; to: string }[];
  focus?: string[];
};

export type SceneSpec = { v: 1; kind?: "scene"; title: string; objects: SceneObject[]; steps: Step[] };
export type MermaidSpec = { v: 1; kind: "mermaid"; title: string; source: string };
export type DiagramSpec = SceneSpec | MermaidSpec;

export const LIMITS = { minSteps: 2, maxSteps: 12, caption: 120, title: 120, cells: 200, objects: 8, nodes: 40 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Every name a step may refer to, mapped to what it is. */
export function refsOf(spec: SceneSpec): Map<string, "cell" | "line" | "node" | "text" | "slot"> {
  const refs = new Map<string, "cell" | "line" | "node" | "text" | "slot">();
  for (const o of spec.objects) {
    if (o.kind === "grid") {
      for (let r = 0; r < o.rows; r++) {
        refs.set(`${o.id}.r${r}`, "line");
        for (let c = 0; c < o.cols; c++) refs.set(`${o.id}[${r},${c}]`, "cell");
      }
      for (let c = 0; c < o.cols; c++) refs.set(`${o.id}.c${c}`, "line");
    } else if (o.kind === "text") {
      refs.set(o.id, "text");
    } else {
      const items = o.kind === "row" ? o.items : o.nodes;
      for (const n of items) refs.set(n.id, "node");
      // Row positions, including one before and one after, so pointers like i = -1 or i = n work.
      if (o.kind === "row") for (let i = -1; i <= o.items.length; i++) refs.set(`${o.id}[${i}]`, "slot");
    }
  }
  return refs;
}

/**
 * Checks shape and meaning. Returns plain-English problems the agent can fix; empty means valid.
 */
export function validate(input: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(input)) return ["The diagram must be a JSON object."];
  if (input.v !== 1) errs.push('Set "v": 1.');
  if (!isStr(input.title) || !input.title.trim()) errs.push('Give the diagram a "title".');
  else if (input.title.length > LIMITS.title) errs.push(`Keep "title" under ${LIMITS.title} characters.`);

  if (input.kind === "mermaid") {
    if (!isStr(input.source) || !input.source.trim()) errs.push('A mermaid diagram needs a non-empty "source".');
    return errs;
  }
  if (input.kind !== undefined && input.kind !== "scene") errs.push('"kind" must be "scene" or "mermaid".');

  const ids = new Set<string>();
  const nodeIds = new Set<string>();
  const claim = (id: unknown, where: string, set = ids) => {
    if (!isStr(id) || !/^[A-Za-z][\w-]*$/.test(id)) {
      errs.push(`${where}: "id" must start with a letter and use letters, digits, - or _.`);
      return;
    }
    if (ids.has(id) || nodeIds.has(id)) errs.push(`${where}: id "${id}" is used twice.`);
    set.add(id);
  };

  if (!Array.isArray(input.objects) || input.objects.length === 0) {
    errs.push('Add at least one entry to "objects".');
  } else if (input.objects.length > LIMITS.objects) {
    errs.push(`Use at most ${LIMITS.objects} objects.`);
  } else {
    input.objects.forEach((o, i) => {
      const where = `objects[${i}]`;
      if (!isObj(o)) return void errs.push(`${where} must be an object.`);
      claim(o.id, where);
      switch (o.kind) {
        case "grid": {
          if (!isInt(o.rows) || !isInt(o.cols) || o.rows < 1 || o.cols < 1) errs.push(`${where}: grid needs whole-number "rows" and "cols" of at least 1.`);
          else if (o.rows * o.cols > LIMITS.cells) errs.push(`${where}: grid has ${o.rows * o.cols} cells; the limit is ${LIMITS.cells}.`);
          if (o.rowLabels !== undefined && (!Array.isArray(o.rowLabels) || o.rowLabels.length !== o.rows)) errs.push(`${where}: "rowLabels" must list exactly ${o.rows} labels.`);
          if (o.colLabels !== undefined && (!Array.isArray(o.colLabels) || o.colLabels.length !== o.cols)) errs.push(`${where}: "colLabels" must list exactly ${o.cols} labels.`);
          break;
        }
        case "text":
          if (!isStr(o.text)) errs.push(`${where}: text needs a "text" string (it may be empty).`);
          break;
        case "row":
        case "tree":
        case "flow": {
          const list = o.kind === "row" ? o.items : o.nodes;
          const key = o.kind === "row" ? "items" : "nodes";
          if (!Array.isArray(list) || list.length === 0) {
            errs.push(`${where}: ${o.kind} needs a non-empty "${key}" list.`);
            break;
          }
          if (list.length > LIMITS.nodes) errs.push(`${where}: at most ${LIMITS.nodes} ${key}.`);
          list.forEach((n, j) => {
            if (!isObj(n)) return void errs.push(`${where}.${key}[${j}] must be an object.`);
            claim(n.id, `${where}.${key}[${j}]`, nodeIds);
            if (!isStr(n.label)) errs.push(`${where}.${key}[${j}]: needs a "label" string.`);
          });
          const local = new Set(list.filter(isObj).map((n) => n.id));
          if (o.kind === "tree") {
            const roots = list.filter((n) => isObj(n) && n.parent === undefined).length;
            if (roots !== 1) errs.push(`${where}: a tree needs exactly one node without "parent" (found ${roots}).`);
            list.forEach((n, j) => {
              if (isObj(n) && n.parent !== undefined && !local.has(n.parent)) errs.push(`${where}.nodes[${j}]: parent "${String(n.parent)}" is not a node in this tree.`);
            });
          }
          if (o.kind === "flow" && o.edges !== undefined) {
            if (!Array.isArray(o.edges)) errs.push(`${where}: "edges" must be a list.`);
            else
              o.edges.forEach((e, j) => {
                if (!isObj(e) || !local.has(e.from) || !local.has(e.to)) errs.push(`${where}.edges[${j}]: "from" and "to" must be node ids of this flow.`);
              });
          }
          break;
        }
        default:
          errs.push(`${where}: "kind" must be one of grid, tree, flow, row, text (or use a whole-diagram "kind": "mermaid").`);
      }
    });
  }

  if (!Array.isArray(input.steps) || input.steps.length < LIMITS.minSteps || input.steps.length > LIMITS.maxSteps) {
    errs.push(`Use between ${LIMITS.minSteps} and ${LIMITS.maxSteps} "steps".`);
    return errs;
  }
  if (errs.length) return errs;

  const refs = refsOf(input as unknown as SceneSpec);
  const known = (r: unknown) => isStr(r) && (refs.has(r) || refs.has(r.replace(/\.text$/, "")));
  const hint = (r: unknown) => {
    const m = isStr(r) ? /^(\w[\w-]*)\[(\d+),(\d+)\]$/.exec(r) : null;
    if (m) {
      const g = (input.objects as SceneObject[]).find((o) => o.id === m[1]);
      if (g?.kind === "grid") return ` Cells of "${g.id}" run from [0,0] to [${g.rows - 1},${g.cols - 1}].`;
    }
    return " Use a grid cell like g[1,2], a row g.r0, a column g.c0, a row position like arr[-1] or arr[3], a node id, or a text object id.";
  };
  (input.steps as unknown[]).forEach((s, i) => {
    const where = `steps[${i}]`;
    if (!isObj(s)) return void errs.push(`${where} must be an object.`);
    if (!isStr(s.caption) || !s.caption.trim()) errs.push(`${where}: every step needs a "caption".`);
    else if (s.caption.length > LIMITS.caption) errs.push(`${where}: keep the caption under ${LIMITS.caption} characters (it has ${s.caption.length}).`);
    if (s.set !== undefined) {
      if (!isObj(s.set)) errs.push(`${where}: "set" maps refs to text.`);
      else
        for (const [k, v] of Object.entries(s.set)) {
          if (!known(k)) errs.push(`${where}.set: unknown ref "${k}".${hint(k)}`);
          else if (refs.get(k) === "slot") errs.push(`${where}.set: "${k}" is a position, not a value; set the item's id instead.`);
          if (!isStr(v)) errs.push(`${where}.set["${k}"] must be text.`);
        }
    }
    for (const key of ["add", "remove", "focus"] as const) {
      const list = s[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errs.push(`${where}: "${key}" must be a list of refs.`);
        continue;
      }
      for (const r of list) if (!known(r)) errs.push(`${where}.${key}: unknown ref "${String(r)}".${hint(r)}`);
      if (key !== "focus") for (const r of list) if (isStr(r) && refs.get(r) !== "node") errs.push(`${where}.${key}: only nodes can be added or removed ("${r}" is not a node).`);
    }
    if (s.arrows !== undefined) {
      if (!Array.isArray(s.arrows)) errs.push(`${where}: "arrows" must be a list of {from, to}.`);
      else
        s.arrows.forEach((a, j) => {
          if (!isObj(a) || !known(a.from) || !known(a.to)) errs.push(`${where}.arrows[${j}]: "from" and "to" must be known refs.${hint(isObj(a) ? a.from : undefined)}`);
        });
    }
  });
  return errs;
}

export type Frame = {
  caption: string;
  /** Current text per ref (cells, node labels, text objects). */
  values: Record<string, string>;
  /** Node ids not visible in this frame. */
  hidden: string[];
  focus: string[];
  arrows: { from: string; to: string }[];
  /** Refs whose value changed in this step (drawn with the accent). */
  changed: string[];
};

/** Folds the step deltas into one complete frame per step. */
export function frames(spec: SceneSpec): Frame[] {
  const values: Record<string, string> = {};
  for (const o of spec.objects) {
    if (o.kind === "text") values[o.id] = o.text;
    if (o.kind === "row") for (const n of o.items) values[n.id] = n.label;
    if (o.kind === "tree" || o.kind === "flow") for (const n of o.nodes) values[n.id] = n.label;
  }
  const hidden = new Set<string>(spec.steps.flatMap((s) => s.add ?? []));
  const out: Frame[] = [];
  for (const s of spec.steps) {
    const changed: string[] = [];
    for (const id of s.add ?? []) {
      hidden.delete(id);
      changed.push(id);
    }
    for (const id of s.remove ?? []) hidden.add(id);
    for (const [ref, text] of Object.entries(s.set ?? {})) {
      const key = ref.replace(/\.text$/, "");
      const lines = expandLine(spec, key);
      for (const k of lines) {
        values[k] = text;
        changed.push(k);
      }
    }
    out.push({ caption: s.caption, values: { ...values }, hidden: [...hidden], focus: s.focus ?? [], arrows: s.arrows ?? [], changed });
  }
  return out;
}

/** `g.r0` → every cell in row 0; `g.c1` → every cell in column 1; anything else → itself. */
export function expandLine(spec: SceneSpec, ref: string): string[] {
  const m = /^(\w[\w-]*)\.(r|c)(\d+)$/.exec(ref);
  if (!m) return [ref];
  const g = spec.objects.find((o) => o.id === m[1]);
  if (!g || g.kind !== "grid") return [ref];
  const i = Number(m[3]);
  return m[2] === "r" ? Array.from({ length: g.cols }, (_, c) => `${g.id}[${i},${c}]`) : Array.from({ length: g.rows }, (_, r) => `${g.id}[${r},${i}]`);
}

/** Parses a fenced block's text. Returns the spec or the problems found. */
export function parse(text: string): { spec: DiagramSpec } | { errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const errors = validate(data);
  return errors.length ? { errors } : { spec: data as DiagramSpec };
}
