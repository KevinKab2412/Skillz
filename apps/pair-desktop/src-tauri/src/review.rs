//! Read-only Git and GitHub data for guided code review notes.

use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Output, Stdio};
use std::time::Duration;

const MAX_FILES: usize = 150;
const MAX_FILE_PATCH_BYTES: usize = 96 * 1024;
const MAX_TOTAL_PATCH_BYTES: usize = 2 * 1024 * 1024;
const MAX_PR_TITLE_BYTES: usize = 512;
const MAX_PR_BODY_BYTES: usize = 8 * 1024;

#[derive(Debug, Serialize, PartialEq)]
pub struct PullRequestContext {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct PullRequestBase {
    pub branch: String,
    pub remote: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PullRequestBaseStatus {
    Found,
    NotFound,
    Unavailable,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct BranchList {
    pub current: Option<String>,
    pub branches: Vec<String>,
    pub pr_base: Option<PullRequestBase>,
    pub pr_base_status: Option<PullRequestBaseStatus>,
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

pub fn branches(root: &Path, include_pr_base: bool) -> Result<BranchList, String> {
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
    let (pr_base, pr_base_status) = if include_pr_base {
        match pull_request_base(root) {
            PrBaseLookup::Found(base) => (Some(base), Some(PullRequestBaseStatus::Found)),
            PrBaseLookup::NotFound => (None, Some(PullRequestBaseStatus::NotFound)),
            PrBaseLookup::Unavailable => (None, Some(PullRequestBaseStatus::Unavailable)),
        }
    } else {
        (None, None)
    };
    Ok(BranchList { current, branches, pr_base, pr_base_status })
}

enum PrBaseLookup {
    Found(PullRequestBase),
    NotFound,
    Unavailable,
}

fn pull_request_base(root: &Path) -> PrBaseLookup {
    let output = match Command::new("gh")
        .current_dir(root)
        .args(["pr", "view", "--json", "baseRefName,url"])
        .output()
    {
        Ok(output) => output,
        Err(_) => return PrBaseLookup::Unavailable,
    };
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        return if error.contains("no pull requests found") || error.contains("no pull request found") {
            PrBaseLookup::NotFound
        } else {
            PrBaseLookup::Unavailable
        };
    }
    let Some(review) = serde_json::from_slice::<serde_json::Value>(&output.stdout).ok() else {
        return PrBaseLookup::Unavailable;
    };
    let Some(branch) = review.get("baseRefName").and_then(serde_json::Value::as_str).map(str::trim) else {
        return PrBaseLookup::Unavailable;
    };
    let Some(repository) = review
        .get("url")
        .and_then(serde_json::Value::as_str)
        .and_then(pull_request_repository)
        .map(|repository| repository.to_ascii_lowercase())
    else {
        return PrBaseLookup::Unavailable;
    };
    if branch.is_empty() {
        return PrBaseLookup::Unavailable;
    }

    let remotes = git(root, &["remote", "-v"])
        .ok()
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    let (name, target) = line.split_once('\t')?;
                    let url = target.split_whitespace().next()?;
                    let url = url.strip_suffix(".git").unwrap_or(url).to_ascii_lowercase();
                    let same_repository = url == repository
                        || url.ends_with(&format!("/{repository}"))
                        || url.ends_with(&format!(":{repository}"));
                    same_repository.then(|| name.to_string())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let remote = remotes.first().cloned().filter(|_| remotes.iter().all(|name| name == &remotes[0]));

    PrBaseLookup::Found(PullRequestBase { branch: branch.to_string(), remote })
}

fn pull_request_repository(url: &str) -> Option<String> {
    let (_, path) = url.split_once("://")?;
    let (_, path) = path.split_once('/')?;
    let mut parts = path.split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    (parts.next()? == "pull").then(|| format!("{owner}/{repo}"))
}

struct ReviewBranch<'a> {
    name: &'a str,
    remote_url: Option<String>,
}

fn review_branch<'a>(root: &Path, reference: &'a str) -> Option<ReviewBranch<'a>> {
    if let Some(name) = reference.strip_prefix("refs/heads/") {
        return Some(ReviewBranch { name, remote_url: None });
    }
    let tracking_branch = reference.strip_prefix("refs/remotes/")?;
    let remotes = text(git(root, &["remote"]).ok()?);
    let remote = remotes
        .lines()
        .filter(|remote| {
            tracking_branch.strip_prefix(*remote).is_some_and(|suffix| suffix.starts_with('/'))
        })
        .max_by_key(|remote| remote.len())?;
    Some(ReviewBranch {
        name: &tracking_branch[remote.len() + 1..],
        remote_url: Some(text(git(root, &["remote", "get-url", "--", remote]).ok()?)),
    })
}

pub async fn pull_request(
    root: &Path,
    base_branch: &str,
    head_branch: &str,
    head_commit: &str,
) -> Option<PullRequestContext> {
    let (head_ref, current_head) = resolve_branch(root, head_branch).ok()?;
    if current_head != head_commit {
        return None;
    }
    let (base_ref, _) = resolve_branch(root, base_branch).ok()?;
    let head = review_branch(root, &head_ref)?;
    let base = review_branch(root, &base_ref)?;
    let mut gh = tokio::process::Command::new("gh");
    gh.current_dir(root)
        .kill_on_drop(true)
        .env("GH_PROMPT_DISABLED", "1")
        .args([
            "pr",
            "view",
            "--json",
            "baseRefName,headRefName,headRefOid,headRepository,url,title,body",
            "--",
            head.name,
        ]);
    let output = tokio::time::timeout(Duration::from_secs(5), gh.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }
    matching_pull_request(&output.stdout, &base, &head, head_commit)
}

fn matches_remote(branch: &ReviewBranch<'_>, repository: Option<&str>) -> bool {
    branch.remote_url.as_ref().is_none_or(|url| {
        repository.is_some_and(|repository| {
            let url = url.strip_suffix(".git").unwrap_or(url).to_ascii_lowercase();
            let repository = repository.to_ascii_lowercase();
            url.ends_with(&format!("/{repository}")) || url.ends_with(&format!(":{repository}"))
        })
    })
}

fn matching_pull_request(
    json: &[u8],
    base: &ReviewBranch<'_>,
    head: &ReviewBranch<'_>,
    commit: &str,
) -> Option<PullRequestContext> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Repository {
        name_with_owner: String,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PullRequest {
        base_ref_name: String,
        head_ref_name: String,
        head_ref_oid: String,
        head_repository: Option<Repository>,
        url: String,
        title: String,
        body: String,
    }

    let mut pr: PullRequest = serde_json::from_slice(json).ok()?;
    let head_repository = pr.head_repository.as_ref().map(|repo| repo.name_with_owner.as_str());
    if pr.head_ref_oid != commit
        || pr.head_ref_name != head.name
        || pr.base_ref_name != base.name
        || !matches_remote(head, head_repository)
        || !matches_remote(base, pull_request_repository(&pr.url).as_deref())
    {
        return None;
    }
    pr.title.truncate(pr.title.floor_char_boundary(MAX_PR_TITLE_BYTES));
    pr.body.truncate(pr.body.floor_char_boundary(MAX_PR_BODY_BYTES));
    Some(PullRequestContext {
        title: pr.title,
        body: pr.body,
    })
}

fn resolve_commit(root: &Path, name: &str) -> Result<String, String> {
    resolve_branch(root, name).map(|(_, commit)| commit)
}

fn resolve_branch(root: &Path, name: &str) -> Result<(String, String), String> {
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
                return Ok((reference, commit));
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
        let found = branches(dir.path(), false).unwrap();
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
    fn returns_bounded_pr_context_only_for_the_exact_head() {
        let commit = "0123456789012345678901234567890123456789";
        let json = serde_json::json!({
            "baseRefName": "main",
            "headRefName": "feature/review",
            "headRefOid": commit,
            "headRepository": { "nameWithOwner": "owner/fork" },
            "url": "https://github.com/org/repo/pull/1",
            "title": "Review guide",
            "body": format!("a{}", "é".repeat(MAX_PR_BODY_BYTES / 2)),
        })
        .to_string();

        let base = ReviewBranch {
            name: "main",
            remote_url: Some("https://github.com/org/repo.git".into()),
        };
        let head = ReviewBranch {
            name: "feature/review",
            remote_url: Some("git@github.com:owner/fork.git".into()),
        };
        let other_commit = "1123456789012345678901234567890123456789";
        assert!(matching_pull_request(json.as_bytes(), &base, &head, other_commit).is_none());
        let other_base = ReviewBranch { name: "dev", remote_url: None };
        assert!(matching_pull_request(json.as_bytes(), &other_base, &head, commit).is_none());
        let other_fork = ReviewBranch {
            name: head.name,
            remote_url: Some("git@github.com:other/fork.git".into()),
        };
        assert!(matching_pull_request(json.as_bytes(), &base, &other_fork, commit).is_none());
        let pr = matching_pull_request(json.as_bytes(), &base, &head, commit).unwrap();
        assert_eq!(pr.title, "Review guide");
        assert_eq!(pr.body, format!("a{}", "é".repeat(MAX_PR_BODY_BYTES / 2 - 1)));
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
