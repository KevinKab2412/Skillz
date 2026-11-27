import { execFile } from "node:child_process";
import { posix } from "node:path";
import { promisify } from "node:util";

export type ReviewRevision = { base: string; head: string };
type Source = { operation: "rules" | "read" | "search" | "patch"; path?: string; query?: string; start?: number };
const exec = promisify(execFile);
const MAX_TEXT = 18_000;

async function git(cwd: string, args: string[]) {
  const { stdout } = await exec("git", ["--no-pager", "--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false", ...args], {
    cwd, timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

export async function reviewRules(cwd: string, revision: ReviewRevision) {
  const paths = (await reviewSource(cwd, revision, { operation: "rules" })).split("\n");
  if (paths[0].startsWith("No committed repo rules")) return { paths: [], excerpts: [] };
  const topRules = paths.filter((path) => !path.includes("/"));
  const scopedRules = paths.filter((path) => path.endsWith("/AGENTS.md"));
  const ordered = [...new Set([...topRules, ...scopedRules, ...paths])];
  const excerpts = await Promise.all(ordered.slice(0, 12).map(async (path) => ({
    path,
    text: (await reviewSource(cwd, revision, { operation: "read", path }).catch(() => "Could not read this rule file.")).slice(0, 2_400),
  })));
  return { paths: ordered, excerpts };
}

function excerpt(text: string) {
  return text.length <= MAX_TEXT ? text : text.slice(0, MAX_TEXT) + "\n[Excerpt truncated]";
}

export async function matchingWorktree(cwd: string, head: string) {
  try {
    const commit = await git(cwd, ["rev-parse", "HEAD"]);
    const changes = await git(cwd, ["status", "--porcelain", "--untracked-files=normal"]);
    return commit.trim() === head && changes.trim() === "";
  } catch {
    return false;
  }
}

type TestProcess = { stdout: string; stderr: string; code: number; killed: boolean };
type TestReport = { status: "skipped" | "inconclusive" | "passed" | "failed"; message: string };

export async function verifyReviewTest(
  cwd: string,
  head: string,
  approve: () => Promise<boolean>,
  run: () => Promise<TestProcess>,
): Promise<TestReport> {
  const wrongCheckout: TestReport = { status: "skipped", message: "Tests require a clean checkout at the reviewed commit." };
  if (!(await matchingWorktree(cwd, head))) return wrongCheckout;
  if (!(await approve())) return { status: "skipped", message: "The test was not approved or the review stopped." };
  if (!(await matchingWorktree(cwd, head))) return wrongCheckout;
  try {
    const result = await run();
    const matched = await matchingWorktree(cwd, head);
    return {
      status: !matched || result.killed ? "inconclusive" : result.code === 0 ? "passed" : "failed",
      message: [
        result.killed ? "The test was stopped or timed out."
          : !matched ? "The checkout changed during the test. Its result cannot verify the selected revision."
          : `Test exit code: ${result.code}.`,
        result.stdout.slice(-5_000),
        result.stderr.slice(-3_000),
      ].filter(Boolean).join("\n").trim(),
    };
  } catch {
    return { status: "inconclusive", message: "Pair could not run the approved test. Check that the test runner is installed." };
  }
}

export async function reviewSource(cwd: string, revision: ReviewRevision, source: Source): Promise<string> {
  const { base, head } = revision;
  const { operation, path, query } = source;
  if (path && (path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".."))) {
    throw new Error("Use a repository-relative path from the comparison.");
  }
  if (operation === "rules") {
    const changed = await git(cwd, ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, head, "--"]);
    const dirs = new Set<string>();
    for (const file of changed.split("\0").filter(Boolean)) {
      for (let dir = posix.dirname(file); dir !== "."; dir = posix.dirname(dir)) dirs.add(dir);
    }
    const candidates = ["AGENTS.md", "CODING_STANDARDS.md", "CONTRIBUTING.md", "docs/standards", "docs/standards.md",
      "design-patterns/patterns.md", ...[...dirs].map((dir) => `${dir}/AGENTS.md`)];
    const paths = await git(cwd, ["ls-tree", "-r", "--name-only", "-z", base, "--", ...candidates.slice(0, 180)]);
    return paths.split("\0").filter(Boolean).join("\n") || "No committed repo rules found for these paths at the merge base.";
  }
  if (operation === "search") {
    if (!query?.trim() || query.length > 200 || /[\r\n]/.test(query)) throw new Error("Supply one literal search term.");
    try {
      return excerpt(await git(cwd, ["grep", "-n", "-I", "-F", "-m", "8", "-e", query, head, "--", ...(path ? [path] : [])]));
    } catch (error) {
      if ((error as { code?: number }).code === 1) return "No matches at the reviewed revision.";
      throw error;
    }
  }
  if (!path) throw new Error("Supply a file path.");
  if (operation === "patch") {
    return excerpt(await git(cwd, ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=4", base, head, "--", path]));
  }
  // Standards are read from the baseline so the branch under review cannot weaken its own rules.
  const ref = /(?:^|\/)(AGENTS|CODING_STANDARDS|CONTRIBUTING)\.md$|^docs\/standards(?:\/|\.md$)|^design-patterns\/patterns\.md$/.test(path) ? base : head;
  const file = await git(cwd, ["cat-file", "blob", `${ref}:${path}`]);
  if (file.includes("\0")) return "This file is binary.";
  const start = Math.max(1, Math.floor(source.start ?? 1));
  return excerpt(file.split("\n").slice(start - 1, start + 119).map((line, index) => `${start + index}: ${line}`).join("\n"));
}
