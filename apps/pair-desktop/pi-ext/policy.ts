/**
 * What pair lets the agent do without asking, what it must propose, and what it never does.
 * Pure apart from resolving symlinks, so the rules are tested apart from Pi.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type Stage = "think" | "plan" | "build" | "review";
/** `thread`: may only read and leave margin threads (Thinks-with-you, Riddle, Ask). `act`: may propose. */
export type Mode = "thread" | "act";

export type ProposalKind = "file_edit" | "command" | "read_outside" | "tool";

export type Decision =
  | { action: "pass" }
  | { action: "block"; reason: string }
  | { action: "propose"; kind: ProposalKind };

export const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
export const WRITE_TOOLS = new Set(["write", "edit"]);
export const NOTE_TOOLS = new Set(["add_thread", "suggest_note_edit", "add_diagram", "suggest_stage", "review_verdict"]);

const STAGE_HINT: Record<Stage, string> = {
  think: "The note is in Think: ask questions or leave margin threads. Suggest moving to Plan with suggest_stage if it is time.",
  plan: "The note is in Plan: you may propose note edits (the plan) but not file edits or commands. Suggest Build with suggest_stage when the plan is ready.",
  build: "",
  review: "The note is in Review: read the changes and leave margin threads, then give a verdict with review_verdict.",
};

/**
 * The path Pi's tools will actually touch: the same normalisation Pi applies (leading `@`,
 * `~/`, `file://`), resolved against cwd, then with symlinks followed through the nearest
 * existing ancestor (the target itself may not exist yet).
 */
export function realTarget(cwd: string, target: string): string {
  let p = target.trim();
  if (p.startsWith("@")) p = p.slice(1);
  if (p === "~") p = homedir();
  else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  if (/^file:\/\//.test(p)) {
    try {
      p = fileURLToPath(p);
    } catch {
      /* keep as is */
    }
  }
  return realish(resolve(cwd, p));
}

function realish(abs: string): string {
  const tail: string[] = [];
  let cur = abs;
  for (;;) {
    try {
      return join(realpathSync(cur), ...tail.reverse());
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs;
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

/** macOS disks are case-insensitive by default, so compare paths ignoring case. */
const fold = (p: string) => (process.platform === "darwin" || process.platform === "win32" ? p.toLowerCase() : p);

function relFromRoot(cwd: string, target: string): string {
  return relative(fold(realish(resolve(cwd))), fold(realTarget(cwd, target)));
}

/** True when `target` (as Pi will resolve it) is inside `cwd`. */
export function inside(cwd: string, target: string): boolean {
  const rel = relFromRoot(cwd, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function inPairDir(cwd: string, target: string): boolean {
  const rel = relFromRoot(cwd, target);
  return rel === ".pair" || rel.startsWith(`.pair${sep}`);
}

export function decide(args: { toolName: string; input: Record<string, unknown>; cwd: string; stage: Stage; mode: Mode }): Decision {
  const { toolName, input, cwd, stage, mode } = args;
  const path = typeof input.path === "string" ? input.path : ".";

  if (READ_TOOLS.has(toolName)) {
    return inside(cwd, path) ? { action: "pass" } : { action: "propose", kind: "read_outside" };
  }

  if (toolName === "add_thread") return { action: "pass" };
  if (toolName === "suggest_stage") return { action: "pass" };
  if (toolName === "review_verdict") {
    return stage === "review" ? { action: "pass" } : { action: "block", reason: "review_verdict is only for the Review stage." };
  }

  if (mode === "thread") {
    return {
      action: "block",
      reason: "Right now you may only read and leave margin threads with add_thread. Kevin asks explicitly when he wants changes.",
    };
  }

  if (toolName === "add_diagram") return { action: "pass" };
  if (toolName === "suggest_note_edit") {
    return stage === "plan" || stage === "build" ? { action: "pass" } : { action: "block", reason: STAGE_HINT[stage] };
  }

  if (WRITE_TOOLS.has(toolName)) {
    if (!inside(cwd, path)) return { action: "block", reason: `"${path}" is outside the project folder; pair only changes files inside it.` };
    if (inPairDir(cwd, path)) return { action: "block", reason: "The .pair folder is managed by pair. Change the note with suggest_note_edit instead." };
    return stage === "build" ? { action: "propose", kind: "file_edit" } : { action: "block", reason: STAGE_HINT[stage] };
  }

  if (toolName === "bash") {
    return stage === "build" ? { action: "propose", kind: "command" } : { action: "block", reason: STAGE_HINT[stage] };
  }

  // Anything else (a tool pair does not know) needs Kevin's yes, in Build only.
  return stage === "build" ? { action: "propose", kind: "tool" } : { action: "block", reason: STAGE_HINT[stage] };
}

/** Prompt header the app puts in front of each ask; the extension strips it. */
export const HEADER = /^<pair mode="(thread|act)"\s*\/>\n?/;

export function readHeader(text: string): { mode: Mode | null; text: string } {
  const m = HEADER.exec(text);
  return m ? { mode: m[1] as Mode, text: text.slice(m[0].length) } : { mode: null, text };
}
