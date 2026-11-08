import { invoke } from "@tauri-apps/api/core";

export type Stage = "think" | "plan" | "build" | "review";

export interface TextQuote { exact: string; prefix: string; suffix: string }
export interface Anchor { quote: TextQuote; pos: number }
export interface ThreadMessage { author: "kevin" | "agent" | string; text: string }
export interface Thread {
  id: string;
  anchor: Anchor;
  messages: ThreadMessage[];
  resolved: boolean;
  detached: boolean;
}
export interface Sidecar {
  v: number;
  threads: Thread[];
  session: { id: string | null; interrupted: string | null };
  model: string | null;
  tell: string;
  stage: Stage;
}
export interface Note { name: string; markdown: string; sidecar: Sidecar }
export interface NoteSummary { name: string; modified_ms: number }
export interface AppIndex { folders: string[]; recent: { folder: string; name: string }[] }

export const api = {
  loadIndex: () => invoke<AppIndex>("load_index"),
  addFolder: (folder: string) => invoke<AppIndex>("add_folder", { folder }),
  removeFolder: (folder: string) => invoke<AppIndex>("remove_folder", { folder }),
  listNotes: (folder: string) => invoke<NoteSummary[]>("list_notes", { folder }),
  createNote: (folder: string, name: string) => invoke<Note>("create_note", { folder, name }),
  openNote: (folder: string, name: string) => invoke<Note>("open_note", { folder, name }),
  saveNote: (folder: string, note: Note) => invoke<void>("save_note", { folder, note }),
  saveSidecar: (folder: string, name: string, sidecar: Sidecar) =>
    invoke<void>("save_sidecar", { folder, name, sidecar }),
  watchFolder: (folder: string) => invoke<void>("watch_folder", { folder }),
};

export const folderLabel = (folder: string) => folder.split("/").filter(Boolean).pop() ?? folder;
