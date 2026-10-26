import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_TITLE_LENGTH = 72;
const SMALL_TALK = /^(?:(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|please|sure|test|testing)(?:\s+(?:there|pi|please|you))?)[\s.!?,]*$/i;

/** Local prompt excerpt: no model calls, transcript exports, or external storage. */
export function sessionTitle(text: string): string | undefined {
  const prompt = text.trim().replace(/\s+/g, " ");
  if (!/[\p{L}\p{N}]/u.test(prompt) || SMALL_TALK.test(prompt)) return;
  if (/^[!/]/.test(prompt)) return;

  const title = prompt
    .replace(/^(?:hi|hello|hey)[,!]?\s+/i, "")
    .replace(/^(?:can|could|would) you\s+(?:please\s+)?/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[\s.!?]+$/, "");
  if (!title || SMALL_TALK.test(title)) return;
  if (Array.from(title).length <= MAX_TITLE_LENGTH) return title;

  const prefix = Array.from(title).slice(0, MAX_TITLE_LENGTH - 1).join("");
  const boundary = prefix.lastIndexOf(" ");
  return (boundary >= MAX_TITLE_LENGTH / 2 ? prefix.slice(0, boundary) : prefix) + "…";
}

export default function (pi: ExtensionAPI) {
  pi.on("input", (event) => {
    // Read the active name each time: /name, /resume and /new need no cached state.
    if (event.source !== "extension" && !pi.getSessionName()) {
      const title = sessionTitle(event.text);
      if (title) pi.setSessionName(title);
    }
    return { action: "continue" };
  });
}
