/**
 * Export (#1621): Markdown keeps pair's fences; "Just my words" drops pair's reply blocks.
 * PDF uses the print stylesheet; threads print as end notes unless "Just my words" is on.
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Note } from "$lib/api";

/** Removes ```pair-reply fences (and the blank line after them). */
export function stripReplies(markdown: string): string {
  return markdown.replace(/^```pair-reply\n[\s\S]*?\n```\n?(\n)?/gm, "").replace(/\n{3,}/g, "\n\n");
}

export function exportText(markdown: string, justMyWords: boolean): string {
  return justMyWords ? stripReplies(markdown) : markdown;
}

export async function exportMarkdown(note: Note, justMyWords: boolean): Promise<string> {
  const path = await save({ title: "Export note as Markdown", defaultPath: `${note.name}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
  if (!path) return "Export cancelled.";
  await invoke("export_text", { path, contents: exportText(note.markdown, justMyWords) });
  return `Exported to ${path}`;
}

export function exportPdf(justMyWords: boolean) {
  document.documentElement.classList.toggle("print-just-mine", justMyWords);
  // The macOS print dialog offers "Save as PDF".
  window.print();
}
