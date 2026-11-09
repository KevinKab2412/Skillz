import type { Thread } from "$lib/api";
import type { Card, NoteSession } from "$lib/session.svelte";

/** What a widget under a passage needs from the note view. Reads are reactive. */
export type ExchangeCtx = {
  session: NoteSession;
  thread(id: string): Thread | undefined;
  suggestion(id: number): { ins: string; del: string } | undefined;
  active(): string | null;
  activate(id: string | null): void;
  reply(thread: Thread, text: string): void;
  resolve(thread: Thread): void;
  decideCard(card: Card, decision: "accept" | "reject", opts: { reason?: string; command?: string }): void;
};

/** How many messages a folded thread shows: the latest, plus Kevin's question if pair is answering it. */
export function visibleMessages<T extends { author: string }>(messages: T[], open: boolean): { shown: T[]; hidden: number } {
  if (open || messages.length <= 2) return { shown: messages, hidden: 0 };
  const last = messages[messages.length - 1];
  const keep = last.author === "agent" ? 1 : 2;
  return { shown: messages.slice(-keep), hidden: messages.length - keep };
}
