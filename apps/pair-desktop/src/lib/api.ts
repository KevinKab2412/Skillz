import { invoke } from "@tauri-apps/api/core";

export type Stage = "think" | "plan" | "build" | "review";
export type NoteKind = "note" | "code_review";
export type ReviewSuggestionSeverity = "blocker" | "should_fix" | "nit";
export type LegacyReviewPromptKind = "check" | "question";

export interface ReviewSuggestion {
  path: string;
  line?: number | null;
  side?: "old" | "new" | null;
  severity?: ReviewSuggestionSeverity | LegacyReviewPromptKind | null;
  summary: string;
  rationale?: string;
  next_check?: string;
}
export interface ReviewSection {
  id: string;
  title: string;
  summary: string;
  focus: string;
  files: string[];
  suggestions: ReviewSuggestion[];
}
export interface ReviewGuide {
  goal?: string | null;
  attempt?: string | null;
  sections: ReviewSection[];
}
export interface ReviewChatContext {
  path: string;
  location: string;
  selection: string;
  excerpt: string;
}
export interface ReviewChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
export type ReviewBaseSource = "pull_request" | "fallback" | "manual";
export interface ReviewState {
  repo_path?: string | null;
  base_source?: ReviewBaseSource | null;
  base_refresh_required?: boolean | null;
  base_branch: string | null;
  head_branch: string | null;
  base_commit?: string | null;
  head_commit?: string | null;
  reviewed_files: string[];
  guide: ReviewGuide | null;
  chat_context: ReviewChatContext | null;
  chat: ReviewChatMessage[];
}

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
/** An agent change to the note Kevin has not answered yet; see `Proposal` in notes.rs. */
export interface Proposal {
  id: string;
  kind: "edit" | "diagram" | "reply";
  anchor: Anchor | null;
  replace?: string;
  spec?: string;
  text?: string;
  thread_id: string | null;
  request_id: string | null;
}
/** A tool call waiting for Kevin's approval; see `Approval` in notes.rs. */
export interface Approval {
  id: string;
  kind: "file_edit" | "command" | "read_outside" | "tool";
  tool: string;
  input: Record<string, unknown>;
  thread_id: string | null;
  status: "pending" | "expired";
}
export interface Sidecar {
  v: number;
  threads: Thread[];
  proposals: Proposal[];
  approvals: Approval[];
  session: { id: string | null; interrupted: string | null };
  model: string | null;
  tell: string;
  stage: Stage;
  kind: NoteKind;
  review: ReviewState | null;
}
export interface Note { name: string; markdown: string; sidecar: Sidecar }
export interface NoteSummary { name: string; modified_ms: number; kind: NoteKind }
export interface PullRequestBase { branch: string; remote: string | null }
export interface ReviewPullRequest { title: string; body: string }
export type PullRequestBaseStatus = "found" | "not_found" | "unavailable";
export interface ReviewBranchList {
  current: string | null;
  branches: string[];
  pr_base: PullRequestBase | null;
  pr_base_status: PullRequestBaseStatus | null;
}
export interface ReviewFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  binary: boolean;
  truncated: boolean;
}
export interface ReviewDiff {
  base_branch: string;
  head_branch: string;
  base_commit: string;
  head_commit: string;
  merge_base: string;
  total_files: number;
  truncated: boolean;
  files: ReviewFile[];
}
export interface AppIndex { folders: string[]; recent: { folder: string; name: string }[] }

export const api = {
  loadIndex: () => invoke<AppIndex>("load_index"),
  addFolder: (folder: string) => invoke<AppIndex>("add_folder", { folder }),
  openFolderWindow: (folder: string) => invoke<void>("open_folder_window", { folder }),
  removeFolder: (folder: string) => invoke<AppIndex>("remove_folder", { folder }),
  listNotes: (folder: string) => invoke<NoteSummary[]>("list_notes", { folder }),
  createNote: (folder: string, name: string, kind: NoteKind = "note") => invoke<Note>("create_note", { folder, name, kind }),
  openNote: (folder: string, name: string) => invoke<Note>("open_note", { folder, name }),
  saveNote: (folder: string, note: Note, expected?: string) => invoke<void>("save_note", { folder, note, expected: expected ?? null }),
  saveSidecar: (folder: string, name: string, sidecar: Sidecar) =>
    invoke<void>("save_sidecar", { folder, name, sidecar }),
  watchFolder: (folder: string) => invoke<void>("watch_folder", { folder }),
  deleteNote: (folder: string, name: string) => invoke<void>("delete_note", { folder, name }),
  listFiles: (folder: string) => invoke<string[]>("list_files", { folder }),
  readFile: (folder: string, path: string) => invoke<FileText>("read_file", { folder, path }),
  reviewBranches: (folder: string, includePrBase: boolean) => invoke<ReviewBranchList>("review_branches", { folder, includePrBase }),
  reviewDiff: (folder: string, baseBranch: string, headBranch: string) => invoke<ReviewDiff>("review_diff", { folder, baseBranch, headBranch }),
  reviewPullRequest: (folder: string, baseBranch: string, headBranch: string, headCommit: string) =>
    invoke<ReviewPullRequest | null>("review_pull_request", { folder, baseBranch, headBranch, headCommit }),
};

export interface FileText { path: string; text: string; truncated: boolean; binary: boolean }

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
  ask: (folder: string, name: string, sessionId: string, model: string | null, message: string, workingDirectory?: string) =>
    invoke<"started" | "queued">("agent_ask", { folder, name, sessionId, model, message, workingDirectory: workingDirectory ?? null }),
  stop: (folder: string, name: string) => invoke<void>("agent_stop", { folder, name }),
  send: (folder: string, name: string, record: unknown) => invoke<void>("agent_send", { folder, name, record }),
  close: (folder: string, name: string) => invoke<void>("agent_close", { folder, name }),
  interrupted: () => invoke<Record<string, string>>("agent_interrupted"),
  checkpoint: (folder: string, note: string, label: string) => invoke<Checkpoint>("checkpoint_create", { folder, note, label }),
  checkpoints: (folder: string, note: string) => invoke<Checkpoint[]>("checkpoint_list", { folder, note }),
  restore: (folder: string, note: string, n: number) => invoke<Checkpoint>("checkpoint_restore", { folder, note, n }),
};

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  set: (settings: Settings) => invoke<void>("set_settings", { settings }),
};

export const folderLabel = (folder: string) => folder.split("/").filter(Boolean).pop() ?? folder;
