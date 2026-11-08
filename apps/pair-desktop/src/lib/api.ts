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
  deleteNote: (folder: string, name: string) => invoke<void>("delete_note", { folder, name }),
};

export interface PiStatus { path: string | null; version: string | null; expected: string; extension: string }
export interface Settings {
  thinks_with_you: boolean;
  pace: "normal" | "slow";
  appearance: "system" | "light" | "dark";
  text_size: "s" | "m" | "l";
  accent: string;
  pi_path: string | null;
  default_model: string | null;
}
export interface Checkpoint { n: number; commit: string; label: string }
export interface AgentEvent { key: string; record: Record<string, any> }

export const noteKey = (folder: string, name: string) => `${folder}::${name}`;

export const agent = {
  status: () => invoke<PiStatus>("pi_status"),
  models: () => invoke<string[]>("pi_models"),
  ask: (folder: string, name: string, sessionId: string, model: string | null, message: string) =>
    invoke<"started" | "queued">("agent_ask", { folder, name, sessionId, model, message }),
  stop: (folder: string, name: string) => invoke<void>("agent_stop", { folder, name }),
  send: (folder: string, name: string, record: unknown) => invoke<void>("agent_send", { folder, name, record }),
  close: (folder: string, name: string) => invoke<void>("agent_close", { folder, name }),
  interrupted: () => invoke<Record<string, string>>("agent_interrupted"),
  checkpoint: (folder: string, note: string, label: string) => invoke<Checkpoint>("checkpoint_create", { folder, note, label }),
  checkpoints: (folder: string, note: string) => invoke<Checkpoint[]>("checkpoint_list", { folder, note }),
  restore: (folder: string, note: string, n: number) => invoke<void>("checkpoint_restore", { folder, note, n }),
};

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  set: (settings: Settings) => invoke<void>("set_settings", { settings }),
};

export const folderLabel = (folder: string) => folder.split("/").filter(Boolean).pop() ?? folder;
