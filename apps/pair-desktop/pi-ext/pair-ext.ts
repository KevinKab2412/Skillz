/**
 * pair's Pi extension. Loaded with `pi --mode rpc -ne -ns -e pair-ext.ts` by the pair desktop app.
 *
 * - Gates every tool call (see policy.ts): reads inside the project pass, changes become
 *   Proposals that wait for Kevin, and some calls are blocked outright with a reason.
 * - Registers the note tools the agent uses to work in the note.
 *
 * Proposals and note-tool calls reach the app as an RPC extension `editor` dialog whose title is
 * `pair:<kind>` and whose prefill is JSON; the app answers with JSON in the dialog value.
 */
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validate } from "./diagram-spec";
import { decide, readHeader, type Mode, type Stage } from "./policy";

type Answer = { decision: "accept" | "decline"; reason?: string; command?: string; note?: string };

const NOTE = process.env.PAIR_NOTE ?? "";
let mode: Mode = "act";
let diagramFailures = 0;

/** Stage is read fresh on every call, since Kevin can move it at any time. */
function currentStage(cwd: string): Stage {
  if (!NOTE) return "build";
  try {
    const side = JSON.parse(readFileSync(join(cwd, ".pair", "notes", `${NOTE}.pair.json`), "utf8"));
    return (["think", "plan", "build", "review"] as const).includes(side.stage) ? side.stage : "think";
  } catch {
    return "think";
  }
}

async function ask(ctx: ExtensionContext, kind: string, payload: Record<string, unknown>): Promise<Answer> {
  if (!ctx.hasUI) return { decision: "decline", reason: "No pair app is attached to approve this." };
  const raw = await ctx.ui.editor(`pair:${kind}`, JSON.stringify(payload));
  if (raw === undefined) return { decision: "decline", reason: "Kevin dismissed it without answering." };
  try {
    return JSON.parse(raw) as Answer;
  } catch {
    return { decision: "decline", reason: "pair sent an unreadable answer." };
  }
}

const declined = (a: Answer) => `Kevin declined this.${a.reason ? ` Reason: ${a.reason}` : ""}`;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: undefined });

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" };
    const { mode: m, text: rest } = readHeader(event.text);
    mode = m ?? "act";
    diagramFailures = 0;
    return m ? { action: "transform", text: rest } : { action: "continue" };
  });

  pi.on("tool_call", async (event, ctx) => {
    const input = event.input as Record<string, unknown>;
    const d = decide({ toolName: event.toolName, input, cwd: ctx.cwd, stage: currentStage(ctx.cwd), mode });
    if (d.action === "pass") return undefined;
    if (d.action === "block") return { block: true, reason: d.reason };

    const answer = await ask(ctx, d.kind, { toolCallId: event.toolCallId, tool: event.toolName, input, cwd: ctx.cwd });
    if (answer.decision !== "accept") return { block: true, reason: declined(answer) };
    if (d.kind === "command" && typeof answer.command === "string" && answer.command !== input.command) {
      input.command = answer.command; // Kevin edited the command before running it.
    }
    return undefined;
  });

  const quote = Type.Object({
    exact: Type.String({ description: "The exact passage from the note, copied character for character." }),
    prefix: Type.Optional(Type.String({ description: "Up to 32 characters just before the passage, to tell repeats apart." })),
    suffix: Type.Optional(Type.String({ description: "Up to 32 characters just after the passage." })),
  });

  pi.registerTool(
    defineTool({
      name: "add_thread",
      label: "Margin thread",
      description:
        "Leave a short margin comment on a passage of the note: a question, a nudge, or a concern. Use this instead of rewriting Kevin's words. Keep it to one or two sentences.",
      parameters: Type.Object({ quote, text: Type.String({ description: "The comment." }), thread_id: Type.Optional(Type.String({ description: "Reply inside an existing thread instead of starting one." })) }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        const a = await ask(ctx, "thread", { toolCallId, ...params });
        return text(a.decision === "accept" ? `Thread posted${a.note ? `: ${a.note}` : "."}` : `Thread not posted: ${a.reason ?? "unknown"}`);
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "suggest_note_edit",
      label: "Note edit",
      description:
        "Propose an edit to the note. Kevin sees it as tracked changes and accepts or rejects it. `find` must be an exact passage from the note; `replace` is the new text (empty to delete). To add text, find the passage it follows and repeat it in `replace` followed by the new text.",
      parameters: Type.Object({ find: Type.String(), replace: Type.String(), why: Type.Optional(Type.String({ description: "One line on why." })) }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        const a = await ask(ctx, "note_edit", { toolCallId, ...params });
        if (a.decision === "accept") return text("Kevin accepted the edit.");
        throw new Error(declined(a));
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "add_diagram",
      label: "Diagram",
      description: [
        "Draw a step-through diagram under the selected passage. Pass the JSON scene spec as a string:",
        '{"v":1,"title":"…","objects":[…],"steps":[{"caption":"…", "set":{ref:text}, "add":[nodeIds], "remove":[nodeIds], "arrows":[{"from":ref,"to":ref}], "focus":[refs]}]}',
        'Objects: {"id","kind":"grid","rows","cols","rowLabels"?,"colLabels"?} (refs g[r,c], g.r0 for a row, g.c0 for a column);',
        '{"id","kind":"tree","nodes":[{"id","label","parent"?}]} (exactly one root); {"id","kind":"flow","nodes":[{"id","label"}],"edges":[{"from","to","label"?}]};',
        '{"id","kind":"row","items":[{"id","label"}]} for arrays and stacks; {"id","kind":"text","text"} for an equation or note.',
        "Node ids are refs too. 2–12 steps, one short caption each (≤120 chars). Nodes named in any step's add start hidden.",
        'Only if the scene spec cannot express it after two failed tries, send {"v":1,"kind":"mermaid","title":"…","source":"<mermaid>"} instead (static, no steps).',
      ].join("\n"),
      parameters: Type.Object({ spec_json: Type.String({ description: "The diagram spec as a JSON string." }) }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        let spec: unknown;
        let errors: string[];
        try {
          spec = JSON.parse(params.spec_json);
          errors = validate(spec);
        } catch (e) {
          errors = [`Not valid JSON: ${(e as Error).message}`];
        }
        const isMermaid = (spec as { kind?: string } | undefined)?.kind === "mermaid";
        if (isMermaid && diagramFailures < 2) errors = ["Use the scene spec first; the mermaid fallback is only for after two failed tries."];
        if (errors.length) {
          diagramFailures++;
          const next = diagramFailures >= 2 ? ' You may now fall back to {"v":1,"kind":"mermaid",…}.' : "";
          throw new Error(`The diagram has problems; fix them and call add_diagram again:\n- ${errors.join("\n- ")}${next}`);
        }
        const a = await ask(ctx, "diagram", { toolCallId, spec });
        if (a.decision === "accept") return text("Kevin added the diagram to the note.");
        throw new Error(declined(a));
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "suggest_stage",
      label: "Stage suggestion",
      description: "Suggest that Kevin move the note to another stage (think, plan, build, review). Only Kevin moves it.",
      parameters: Type.Object({ stage: StringEnum(["think", "plan", "build", "review"] as const), why: Type.String() }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        await ask(ctx, "stage", { toolCallId, ...params });
        return text("Suggestion shown to Kevin. Do not act as if the stage changed.");
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "review_verdict",
      label: "Review verdict",
      description: "End a review with a one-line verdict: ready to ship or not, and the main reason.",
      parameters: Type.Object({ ready: Type.Boolean(), summary: Type.String() }),
      async execute(toolCallId, params, _signal, _onUpdate, ctx) {
        await ask(ctx, "verdict", { toolCallId, ...params });
        return text("Verdict recorded in the note.");
      },
    }),
  );
}
