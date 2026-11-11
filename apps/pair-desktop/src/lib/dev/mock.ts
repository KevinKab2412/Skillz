/**
 * Browser-only stand-in for the Rust backend, so the UI can be run and checked with `bun run dev`
 * outside Tauri. Loaded only in dev builds when no Tauri runtime is present.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";

const FOLDER = "/Users/demo/basket";
const KEY = `${FOLDER}::checkout-loop`;

const seed = {
  name: "checkout-loop",
  markdown: `# Checkout loop

Prices are summed recursively in sum.ts, so the stack depth grows with the basket. A 200-seat group booking crashed last week.

Replace the recursive helper with a loop and keep the rounding rules identical.
`,
  sidecar: {
    v: 2,
    proposals: [],
    approvals: [],
    threads: [
      {
        id: "t1",
        anchor: { quote: { exact: "A 200-seat group booking crashed last week.", prefix: "", suffix: "" }, pos: 0 },
        messages: [
          { author: "agent", text: "Do we know the crash was stack depth, not the payment timeout that week?" },
          { author: "kevin", text: "The trace shows RangeError: Maximum call stack size exceeded." },
          { author: "agent", text: "Then it is the recursion: sumPrices calls itself once per seat, so 200 seats means 200 waiting frames." },
        ],
        resolved: false,
        detached: false,
      },
    ],
    session: { id: null, interrupted: null },
    model: null,
    tell: "We use bun; keep diffs small.",
    stage: "plan",
  },
};

// The note's "disk" survives a page reload, so reloading stands in for quitting and reopening pair.
const DISK = "pair-mock-note";
const note: typeof seed = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(DISK) ?? "null") ?? seed;
  } catch {
    return seed;
  }
})();
const persist = () => {
  try {
    sessionStorage.setItem(DISK, JSON.stringify(note));
  } catch {
    /* storage unavailable: the note lives for this page only */
  }
};

let n = 0;
const send = (record: Record<string, unknown>) => emit("agent-event", { key: KEY, record });
const say = async (text: string) => {
  for (const w of text.split(/(?<= )/)) {
    await new Promise((r) => setTimeout(r, 25));
    await send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: w } });
  }
};

const FILES: Record<string, string> = {
  "src/checkout/sum.ts": `// Sums line prices in cents.
export function sumPrices(prices: number[]): number {
  if (prices.length === 0) return 0;
  const [head, ...rest] = prices;
  return head + sumPrices(rest);
}
`,
  "src/checkout/sum.test.ts": `import { expect, test } from "bun:test";
import { sumPrices } from "./sum";

test("sums", () => expect(sumPrices([1, 2, 3])).toBe(6));
`,
  "src/checkout/round.ts": "export const round = (c: number) => Math.round(c);\n",
  "package.json": `{ "name": "basket", "scripts": { "test": "bun test" } }\n`,
  "README.md": "# basket\n",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tool = async (toolName: string, args: Record<string, unknown>) => {
  await send({ type: "tool_execution_start", toolName, args });
  await wait(700);
  await send({ type: "tool_execution_end", toolName });
};

async function runAsk(message: string) {
  await send({ type: "pair_started", message });
  await wait(500);
  if (message.includes("riddle it")) {
    await tool("read", { path: "src/checkout/sum.ts" });
    await say("Which rounding: per line or on the total? The recursive version rounds per line.");
  } else if (message.includes("asked a question")) {
    await tool("read", { path: "src/checkout/sum.ts" });
    await say("sumPrices takes the first price, then asks itself for the sum of the rest. An empty list returns 0, and the totals add up on the way back.");
  } else if (message.includes("visualize")) {
    const spec = {
      v: 1,
      title: "Summing a basket: recursion vs loop",
      objects: [
        { id: "t", kind: "tree", nodes: [{ id: "s3", label: "sum([a,b,c])" }, { id: "s2", label: "sum([b,c])", parent: "s3" }, { id: "s1", label: "sum([c])", parent: "s2" }, { id: "s0", label: "sum([])", parent: "s1" }] },
        { id: "eq", kind: "text", text: "" },
      ],
      steps: [
        { caption: "Each call waits for the rest of the basket.", focus: ["s3"] },
        { caption: "The stack grows one frame per item.", add: ["s2", "s1"], set: { eq: "depth = 3" } },
        { caption: "200 items means 200 waiting frames.", add: ["s0"], set: { eq: "depth = n" }, focus: ["s0"] },
        { caption: "A loop keeps one frame and a running total.", set: { s3: "total += price", eq: "depth = 1" }, focus: ["s3"] },
      ],
    };
    await send({ type: "extension_ui_request", id: `ui${++n}`, method: "editor", title: "pair:diagram", prefill: JSON.stringify({ spec }) });
    await say("Drew the call stack against the loop.");
  } else if (message.includes("do it") || message.includes("@pair")) {
    await tool("read", { path: "src/checkout/sum.ts" });
    await send({ type: "extension_ui_request", id: `ui${++n}`, method: "editor", title: "pair:note_edit", prefill: JSON.stringify({ find: "Replace the recursive helper with a loop", replace: "Replace sumPrices' recursion with a for…of loop" }) });
    await send({ type: "extension_ui_request", id: `ui${++n}`, method: "editor", title: "pair:file_edit", prefill: JSON.stringify({ tool: "edit", input: { path: "src/checkout/sum.ts", edits: [{ oldText: "return head + sumPrices(rest);", newText: "let total = 0;\nfor (const p of prices) total += p;\nreturn total;" }] }, cwd: FOLDER }) });
    await say("Proposed the loop in sum.ts; the tests run once you accept it.");
  } else {
    await say("Looks fine to me.");
  }
  await send({ type: "agent_settled" });
  await send({ type: "pair_settled" });
}

export function installMock() {
  (window as unknown as { __pairNote: typeof note }).__pairNote = note;
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      switch (cmd) {
        case "load_index":
          return { folders: [FOLDER], recent: [{ folder: FOLDER, name: note.name }] };
        case "list_notes":
          return [{ name: note.name, modified_ms: Date.now() }, { name: "auth-refresh", modified_ms: 0 }];
        case "open_note":
          return structuredClone(note);
        case "save_note":
          Object.assign(note, a.note);
          persist();
          return null;
        case "save_sidecar":
          note.sidecar = a.sidecar;
          persist();
          return null;
        case "get_settings":
          return { thinks_with_you: false, pace: "normal", appearance: "system", text_size: "m", accent: "#d2553a", pi_path: null, default_model: "openai-codex/gpt-6-sol" };
        case "pi_status":
          return { path: "/Users/demo/.local/bin/pi", version: "1.4.0", expected: "1.4.0", extension: "pair-ext.ts" };
        case "pi_models":
          return ["openai-codex/gpt-6-sol", "openai-codex/gpt-6-luna", "openrouter/qwen/qwen3-coder"];
        case "agent_interrupted":
          return {};
        case "agent_ask":
          setTimeout(() => void runAsk(a.message), 50);
          return "started";
        case "checkpoint_create":
          return { n: ++n, commit: "abc", label: a.label };
        case "checkpoint_list":
          return [{ n: 1, commit: "abc", label: "edit src/checkout/sum.ts" }];
        case "list_files":
          return Object.keys(FILES).sort();
        case "read_file":
          return { path: a.path, text: FILES[a.path] ?? "", truncated: false, binary: false };
        case "plugin:dialog|open":
          return FOLDER;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
