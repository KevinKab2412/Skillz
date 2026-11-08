//! Undo points for approved changes, kept as hidden git refs: `refs/pair/<note>/<n>`.
//!
//! A checkpoint snapshots the working tree (tracked and untracked, honouring ignores) through a
//! temporary index, so Kevin's index, HEAD and branch are never touched and no branch gets a
//! commit. Restoring writes that snapshot back and removes files created since.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Checkpoint {
    pub n: u32,
    pub commit: String,
    pub label: String,
}

fn git(folder: &Path, index: Option<&Path>, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(folder)
        .args(args)
        .env("GIT_AUTHOR_NAME", "pair")
        .env("GIT_AUTHOR_EMAIL", "pair@localhost")
        .env("GIT_COMMITTER_NAME", "pair")
        .env("GIT_COMMITTER_EMAIL", "pair@localhost");
    if let Some(i) = index {
        cmd.env("GIT_INDEX_FILE", i);
    }
    let out = cmd.output().map_err(|e| format!("git: {e}"))?;
    if !out.status.success() {
        return Err(format!("git {}: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Ref-safe form of a note name.
pub fn ref_name(note: &str) -> String {
    note.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()
}

fn prefix(note: &str) -> String {
    format!("refs/pair/{}/", ref_name(note))
}

struct TempIndex(PathBuf);
impl Drop for TempIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn temp_index(folder: &Path) -> Result<TempIndex, String> {
    let git_dir = git(folder, None, &["rev-parse", "--absolute-git-dir"])?;
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    Ok(TempIndex(PathBuf::from(git_dir).join(format!("pair-index-{}-{n}", std::process::id()))))
}

/// Writes the current working tree as a tree object without touching the real index.
fn snapshot_tree(folder: &Path) -> Result<String, String> {
    let idx = temp_index(folder)?;
    if git(folder, None, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok() {
        git(folder, Some(&idx.0), &["read-tree", "HEAD"])?;
    }
    // Notes are never part of an undo point, even if the exclude line is missing.
    git(folder, Some(&idx.0), &["add", "-A", "--", ".", ":(exclude).pair"])?;
    git(folder, Some(&idx.0), &["write-tree"])
}

pub fn list(folder: &Path, note: &str) -> Result<Vec<Checkpoint>, String> {
    let out = git(folder, None, &["for-each-ref", "--format=%(refname) %(objectname) %(contents:subject)", &prefix(note)])?;
    let mut v: Vec<Checkpoint> = out
        .lines()
        .filter_map(|l| {
            let mut parts = l.splitn(3, ' ');
            let name = parts.next()?;
            let commit = parts.next()?.to_string();
            let label = parts.next().unwrap_or("").to_string();
            let n = name.rsplit('/').next()?.parse().ok()?;
            Some(Checkpoint { n, commit, label })
        })
        .collect();
    v.sort_by_key(|c| c.n);
    Ok(v)
}

/// Snapshots the folder before an approved change. `label` says what is about to happen.
pub fn create(folder: &Path, note: &str, label: &str) -> Result<Checkpoint, String> {
    let tree = snapshot_tree(folder)?;
    let n = list(folder, note)?.last().map(|c| c.n + 1).unwrap_or(1);
    let msg = label.lines().next().unwrap_or("").chars().take(200).collect::<String>();
    let commit = git(folder, None, &["commit-tree", &tree, "-m", &msg])?;
    git(folder, None, &["update-ref", &format!("{}{n}", prefix(note)), &commit])?;
    Ok(Checkpoint { n, commit, label: msg })
}

/// Puts the folder back to checkpoint `n`: files return to their content then, and files
/// created since are removed. Ignored files and `.pair/` are left alone. Later checkpoints
/// stay, so undo can itself be undone.
pub fn restore(folder: &Path, note: &str, n: u32) -> Result<Checkpoint, String> {
    let cp = list(folder, note)?.into_iter().find(|c| c.n == n).ok_or(format!("no checkpoint {n}"))?;
    // Save the present first, so the undo itself can be undone (files created since included).
    let before = create(folder, note, &format!("undo to #{n}"))?;
    let then = format!("{}^{{tree}}", cp.commit);
    let now = format!("{}^{{tree}}", before.commit);
    let added = git(folder, None, &["diff", "--name-only", "--relative", "-z", "--no-renames", "--diff-filter=A", &then, &now, "--", ".", ":(exclude).pair"])?;
    for f in added.split('\0').filter(|l| !l.is_empty()) {
        let _ = std::fs::remove_file(folder.join(f));
    }
    let idx = temp_index(folder)?;
    git(folder, Some(&idx.0), &["read-tree", &then])?;
    git(folder, Some(&idx.0), &["checkout-index", "-a", "-f"])?;
    Ok(before)
}

/// Deletes every checkpoint of a note (when the note is deleted).
pub fn prune(folder: &Path, note: &str) -> Result<usize, String> {
    let cps = list(folder, note)?;
    for c in &cps {
        git(folder, None, &["update-ref", "-d", &format!("{}{}", prefix(note), c.n)])?;
    }
    Ok(cps.len())
}

#[tauri::command]
pub fn checkpoint_create(folder: String, note: String, label: String) -> Result<Checkpoint, String> {
    create(Path::new(&folder), &note, &label)
}

#[tauri::command]
pub fn checkpoint_list(folder: String, note: String) -> Result<Vec<Checkpoint>, String> {
    list(Path::new(&folder), &note)
}

#[tauri::command]
pub fn checkpoint_restore(folder: String, note: String, n: u32) -> Result<Checkpoint, String> {
    restore(Path::new(&folder), &note, n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn repo() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        git(d.path(), None, &["init", "-q", "-b", "main"]).unwrap();
        fs::write(d.path().join("a.txt"), "one\n").unwrap();
        fs::write(d.path().join(".gitignore"), "ignored.log\n").unwrap();
        git(d.path(), None, &["add", "."]).unwrap();
        git(d.path(), None, &["commit", "-q", "-m", "init"]).unwrap();
        d
    }

    fn head(d: &Path) -> String {
        git(d, None, &["rev-parse", "HEAD"]).unwrap()
    }

    #[test]
    fn checkpoint_then_restore_undoes_edits_new_files_and_deletes() {
        let d = repo();
        let p = d.path();
        fs::write(p.join("draft.md"), "untracked before\n").unwrap();
        fs::write(p.join("staged.txt"), "staged\n").unwrap();
        git(p, None, &["add", "staged.txt"]).unwrap();
        let head_before = head(p);
        let status_before = git(p, None, &["status", "--porcelain"]).unwrap();

        let cp = create(p, "auth flow", "write a.txt").unwrap();
        assert_eq!(cp.n, 1);

        fs::write(p.join("a.txt"), "two\n").unwrap();
        fs::write(p.join("new.rs"), "fn main(){}\n").unwrap();
        fs::remove_file(p.join("draft.md")).unwrap();
        fs::write(p.join("ignored.log"), "keep me\n").unwrap();

        let saved = restore(p, "auth flow", 1).unwrap();
        assert_eq!(saved.n, 2);

        assert_eq!(fs::read_to_string(p.join("a.txt")).unwrap(), "one\n");
        assert_eq!(fs::read_to_string(p.join("draft.md")).unwrap(), "untracked before\n");
        assert!(!p.join("new.rs").exists());
        assert_eq!(fs::read_to_string(p.join("ignored.log")).unwrap(), "keep me\n");
        // Kevin's branch, HEAD and index are untouched.
        assert_eq!(head(p), head_before);
        assert_eq!(git(p, None, &["status", "--porcelain"]).unwrap(), status_before);
        assert_eq!(git(p, None, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap(), "main");

        // The undo can be undone: #2 brings back the edit and the new file.
        restore(p, "auth flow", 2).unwrap();
        assert_eq!(fs::read_to_string(p.join("a.txt")).unwrap(), "two\n");
        assert!(p.join("new.rs").exists());
    }

    #[test]
    fn notes_are_never_rolled_back_and_subfolders_restore_correctly() {
        let d = repo();
        let sub = d.path().join("app");
        fs::create_dir_all(sub.join(".pair/notes")).unwrap();
        fs::write(sub.join(".pair/notes/n.md"), "old note").unwrap();
        create(&sub, "n", "edit").unwrap();
        fs::write(sub.join(".pair/notes/n.md"), "new note").unwrap();
        fs::write(sub.join(".pair/notes/m.md"), "another").unwrap();
        fs::write(sub.join("made.txt"), "x").unwrap();
        restore(&sub, "n", 1).unwrap();
        assert!(!sub.join("made.txt").exists(), "file created in a subfolder is removed");
        assert_eq!(fs::read_to_string(sub.join(".pair/notes/n.md")).unwrap(), "new note");
        assert!(sub.join(".pair/notes/m.md").exists());
    }

    #[test]
    fn checkpoints_number_per_note_and_prune() {
        let d = repo();
        let p = d.path();
        assert_eq!(create(p, "a", "first").unwrap().n, 1);
        assert_eq!(create(p, "a", "second\nmore").unwrap().n, 2);
        assert_eq!(create(p, "b/../x", "other").unwrap().n, 1);
        let a = list(p, "a").unwrap();
        assert_eq!(a.iter().map(|c| (c.n, c.label.as_str())).collect::<Vec<_>>(), vec![(1, "first"), (2, "second")]);
        assert!(git(p, None, &["branch", "--list"]).unwrap().lines().count() == 1);
        assert_eq!(prune(p, "a").unwrap(), 2);
        assert!(list(p, "a").unwrap().is_empty());
        assert_eq!(list(p, "b/../x").unwrap().len(), 1);
    }

    #[test]
    fn works_before_the_first_commit_and_fails_cleanly_outside_git() {
        let d = tempfile::tempdir().unwrap();
        git(d.path(), None, &["init", "-q"]).unwrap();
        fs::write(d.path().join("x"), "1").unwrap();
        create(d.path(), "n", "x").unwrap();
        fs::write(d.path().join("x"), "2").unwrap();
        restore(d.path(), "n", 1).unwrap();
        assert_eq!(fs::read_to_string(d.path().join("x")).unwrap(), "1");

        let plain = tempfile::tempdir().unwrap();
        assert!(create(plain.path(), "n", "x").is_err());
    }
}
