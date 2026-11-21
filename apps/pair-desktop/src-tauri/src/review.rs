//! Read-only Git data for guided code review notes.

use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Output, Stdio};

const MAX_FILES: usize = 150;
const MAX_FILE_PATCH_BYTES: usize = 96 * 1024;
const MAX_TOTAL_PATCH_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Serialize, PartialEq)]
pub struct BranchList {
    pub current: Option<String>,
    pub branches: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ReviewFile {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
    pub binary: bool,
    pub truncated: bool,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ReviewDiff {
    pub base_branch: String,
    pub head_branch: String,
    pub base_commit: String,
    pub head_commit: String,
    pub merge_base: String,
    pub total_files: usize,
    pub truncated: bool,
    pub files: Vec<ReviewFile>,
}

fn git(root: &Path, args: &[&str]) -> Result<Output, String> {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| format!("could not start git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git command failed".into()
        } else {
            stderr
        });
    }
    Ok(output)
}

fn text(output: Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn git_bounded(root: &Path, args: &[&str], limit: usize) -> Result<(String, bool), String> {
    let mut child = Command::new("git")
        .current_dir(root)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start git: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("could not read git output")?;
    let mut bytes = Vec::new();
    stdout
        .by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("could not read git output: {e}"))?;
    drop(stdout);

    let truncated = bytes.len() > limit;
    if truncated {
        bytes.truncate(limit);
        let _ = child.kill();
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("could not wait for git: {e}"))?;
    if !truncated && !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git command failed".into()
        } else {
            stderr
        });
    }
    Ok((String::from_utf8_lossy(&bytes).into_owned(), truncated))
}

pub fn branches(root: &Path) -> Result<BranchList, String> {
    let output = git(
        root,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let mut branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty() && !name.ends_with("/HEAD"))
        .map(str::to_string)
        .collect();
    branches.sort();
    branches.dedup();
    let current = Command::new("git")
        .current_dir(root)
        .args(["symbolic-ref", "--short", "--quiet", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(text)
        .filter(|s| !s.is_empty());
    Ok(BranchList { current, branches })
}

fn resolve_commit(root: &Path, name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Choose both a base branch and a branch to review.".into());
    }
    for prefix in ["refs/heads/", "refs/remotes/"] {
        let reference = format!("{prefix}{name}");
        if !Command::new("git")
            .current_dir(root)
            .args(["check-ref-format", &reference])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            continue;
        }
        let commit_ref = format!("{reference}^{{commit}}");
        if let Ok(output) = git(
            root,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                "--end-of-options",
                &commit_ref,
            ],
        ) {
            let commit = text(output);
            if !commit.is_empty() {
                return Ok(commit);
            }
        }
    }
    Err(format!(
        "Branch '{name}' is not available in this repository."
    ))
}

fn changed_paths(
    root: &Path,
    merge_base: &str,
    head: &str,
) -> Result<Vec<(String, String)>, String> {
    let output = git(
        root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-color",
            "--no-renames",
            "--name-status",
            "-z",
            merge_base,
            head,
            "--",
        ],
    )?;
    let listing = String::from_utf8_lossy(&output.stdout);
    let fields: Vec<&str> = listing.split('\0').collect();
    let mut changed = Vec::new();
    let mut i = 0;
    while i + 1 < fields.len() {
        let status = fields[i].trim();
        let path = fields[i + 1];
        if !status.is_empty() && !path.is_empty() {
            changed.push((status.to_string(), path.to_string()));
        }
        i += 2;
    }
    Ok(changed)
}

fn change_counts(
    root: &Path,
    merge_base: &str,
    head: &str,
) -> Result<HashMap<String, (usize, usize)>, String> {
    let output = git(
        root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-color",
            "--no-renames",
            "--numstat",
            "-z",
            merge_base,
            head,
            "--",
        ],
    )?;
    let listing = String::from_utf8_lossy(&output.stdout);
    let mut counts = HashMap::new();
    for record in listing.split('\0').filter(|record| !record.is_empty()) {
        let mut fields = record.splitn(3, '\t');
        let additions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let deletions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let path = fields.next().unwrap_or_default();
        if !path.is_empty() {
            counts.insert(path.to_string(), (additions, deletions));
        }
    }
    Ok(counts)
}

pub fn diff(root: &Path, base_branch: &str, head_branch: &str) -> Result<ReviewDiff, String> {
    let base_commit = resolve_commit(root, base_branch)?;
    let head_commit = resolve_commit(root, head_branch)?;
    let merge_base = text(git(root, &["merge-base", &base_commit, &head_commit])?);
    if merge_base.is_empty() {
        return Err("These branches do not share a merge base.".into());
    }
    let all_paths = changed_paths(root, &merge_base, &head_commit)?;
    let counts = change_counts(root, &merge_base, &head_commit)?;
    let total_files = all_paths.len();
    let mut remaining = MAX_TOTAL_PATCH_BYTES;
    let mut files = Vec::new();
    for (status, path) in all_paths.into_iter().take(MAX_FILES) {
        let (patch, patch_truncated) = if remaining == 0 {
            (String::new(), true)
        } else {
            git_bounded(
                root,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-color",
                    "--no-renames",
                    "--unified=4",
                    &merge_base,
                    &head_commit,
                    "--",
                    &path,
                ],
                MAX_FILE_PATCH_BYTES.min(remaining),
            )?
        };
        let binary = patch.contains("Binary files ") || patch.contains("GIT binary patch");
        let (additions, deletions) = counts.get(&path).copied().unwrap_or_default();
        remaining = remaining.saturating_sub(patch.len());
        files.push(ReviewFile {
            path,
            status,
            additions,
            deletions,
            patch,
            binary,
            truncated: patch_truncated,
        });
    }
    Ok(ReviewDiff {
        base_branch: base_branch.to_string(),
        head_branch: head_branch.to_string(),
        base_commit,
        head_commit,
        merge_base,
        total_files,
        truncated: total_files > MAX_FILES || files.iter().any(|f| f.truncated),
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn git_ok(root: &Path, args: &[&str]) {
        let out = Command::new("git")
            .current_dir(root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git_ok(root, &["init", "-q", "-b", "main"]);
        git_ok(root, &["config", "user.email", "review@example.test"]);
        git_ok(root, &["config", "user.name", "Review Test"]);
        fs::write(root.join("app.ts"), "export const value = 1;\n").unwrap();
        git_ok(root, &["add", "app.ts"]);
        git_ok(root, &["commit", "-qm", "base"]);
        git_ok(root, &["switch", "-qc", "feature/review"]);
        fs::write(root.join("app.ts"), "export const value = 2;\n").unwrap();
        fs::write(root.join("new.ts"), "export const added = true;\n").unwrap();
        git_ok(root, &["add", "app.ts", "new.ts"]);
        git_ok(root, &["commit", "-qm", "feature"]);
        dir
    }

    #[test]
    fn lists_local_branches_and_reads_a_three_dot_review_diff() {
        let dir = repo();
        let found = branches(dir.path()).unwrap();
        assert_eq!(found.current.as_deref(), Some("feature/review"));
        assert!(found.branches.contains(&"main".to_string()));

        let diff = diff(dir.path(), "main", "feature/review").unwrap();
        assert_eq!(diff.total_files, 2);
        assert_eq!(diff.files[0].path, "app.ts");
        assert!(diff.files[0].patch.contains("-export const value = 1;"));
        assert!(diff.files[0].patch.contains("+export const value = 2;"));
        assert_eq!(diff.files[1].status, "A");
    }

    #[test]
    fn rejects_a_branch_that_is_not_a_git_ref() {
        let dir = repo();
        assert!(
            diff(dir.path(), "main", "--help")
                .unwrap_err()
                .contains("not available")
        );
        assert!(
            diff(dir.path(), "missing", "feature/review")
                .unwrap_err()
                .contains("not available")
        );
    }

    #[test]
    fn bounds_large_patch_output_without_losing_change_counts() {
        let dir = repo();
        fs::write(dir.path().join("large.txt"), "x".repeat(MAX_FILE_PATCH_BYTES * 2)).unwrap();
        git_ok(dir.path(), &["add", "large.txt"]);
        git_ok(dir.path(), &["commit", "-qm", "large change"]);

        let diff = diff(dir.path(), "main", "feature/review").unwrap();
        let large = diff.files.iter().find(|file| file.path == "large.txt").unwrap();
        assert!(large.truncated);
        assert!(large.patch.len() <= MAX_FILE_PATCH_BYTES);
        assert_eq!(large.additions, 1);
    }
}
