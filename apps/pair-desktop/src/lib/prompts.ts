/**
 * pair's own prompts (#1602: the app does not load Skillz skills at runtime). Every ask carries
 * the stage instructions, the Tell line, the whole note and the selection or thread at hand.
 */
import type { Stage } from "$lib/api";

export type AskKind = "passive" | "riddle" | "ask" | "visualize" | "doit" | "inline" | "chat" | "retry";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "think", label: "Think" },
  { id: "plan", label: "Plan" },
  { id: "build", label: "Build" },
  { id: "review", label: "Review" },
];

const STAGE_PROMPT: Record<Stage, string> = {
  think:
    "Stage: THINK. Help Kevin understand the problem before solving it. Ask sharp questions, point out unstated assumptions and risks, and keep comments short. Do not plan or build yet.",
  plan:
    "Stage: PLAN. Help turn the thinking into a concrete plan in the note's Plan section: small steps, the files they touch, and how each is checked. You may propose note edits with suggest_note_edit. Do not change project files.",
  build:
    "Stage: BUILD. Carry out the plan in small steps. Every file edit and command is shown to Kevin for approval, one at a time; if he declines, read his reason and adjust. Read files freely before changing them. Keep the note's Build section up to date by proposing note edits.",
  review:
    "Stage: REVIEW. Review the changes made since Build began (read the files and use git diff). Leave margin threads on concerns with add_thread, then end with review_verdict. Do not change files.",
};

const MODE_PROMPT: Record<AskKind, string> = {
  passive:
    "Kevin just paused after writing the passage below. Read it in the context of the note. Only if something is genuinely worth saying (a wrong assumption, a missing case, a sharper question), leave ONE short margin thread on it with add_thread. Otherwise do nothing and reply with an empty message.",
  riddle:
    "Kevin selected the passage below and asked you to riddle it: find the single most useful nudge (a question, a counterexample, a missing step) and leave it as one short margin thread on the passage with add_thread. Do not answer for him.",
  ask: "Kevin asked a question about the selected passage. Answer it directly and briefly in plain text; your reply is shown in the margin thread beside the passage.",
  visualize:
    "Kevin asked you to visualize the selected passage. Read the relevant code if it helps, then draw one step-through diagram with add_diagram. Choose the layout that fits (grid, tree, flow, row). Then reply with one sentence.",
  doit: "Kevin selected the passage below and asked you to do it. Carry it out within the current stage's limits; each change is proposed to Kevin. Finish with a short summary of what you did and what is left.",
  inline: "Kevin typed @pair on a line of the note. Answer what that line asks, briefly, in plain text. Your reply is offered as a block under that line.",
  chat: "Kevin is talking to you about the note as a whole in the side chat. Answer briefly. You may propose changes within the current stage's limits.",
  retry: "The app closed while you were working on the request below. Pick it up again from the current state of the note and files.",
};

/** Which asks may only read and leave threads (enforced again by the extension). */
export function modeOf(kind: AskKind): "thread" | "act" {
  return kind === "passive" || kind === "riddle" || kind === "ask" ? "thread" : "act";
}

export function buildPrompt(args: {
  kind: AskKind;
  stage: Stage;
  tell: string;
  note: string;
  noteName: string;
  selection?: string;
  request?: string;
}): string {
  const parts = [
    `<pair mode="${modeOf(args.kind)}"/>`,
    "You are pair, working with Kevin inside one note in his project. The note is the shared plan; Kevin decides. Be brief and concrete.",
    STAGE_PROMPT[args.stage],
  ];
  if (args.tell.trim()) parts.push(`Kevin's standing instruction for this note: ${args.tell.trim()}`);
  parts.push(`<note name="${args.noteName}">\n${args.note}\n</note>`);
  parts.push(MODE_PROMPT[args.kind]);
  if (args.selection) parts.push(`<selection>\n${args.selection}\n</selection>`);
  if (args.request) parts.push(`<request>\n${args.request}\n</request>`);
  return parts.join("\n\n");
}
