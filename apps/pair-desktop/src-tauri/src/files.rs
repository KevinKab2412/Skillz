//! The project's files, for the file tree and the read-only file pane.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// More than this many files and the tree stops listing (the agent can still read anything).
pub const MAX_FILES: usize = 5000;
/// Files larger than this open truncated.
pub const MAX_BYTES: usize = 512 * 1024;

const SKIP_DIRS: &[&str] = &[".git", ".pair", "node_modules", "target", "dist", "build", ".svelte-kit", ".venv", "__pycache__"];

/// Relative paths of the project's files, sorted. In a git repo this is tracked plus untracked
/// files that are not ignored; elsewhere a walk that skips hidden and build folders.
pub fn list(folder: &Path) -> Result<Vec<String>, String> {
    let out = Command::new("git").current_dir(folder).args(["ls-files", "-co", "--exclude-standard", "-z", "--", ".", ":(exclude).pair"]).output();
    let mut files: Vec<String> = match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).split('\0').filter(|s| !s.is_empty()).map(String::from).collect(),
        _ => walk(folder),
    };
    files.retain(|f| !f.split('/').any(|part| part == ".pair"));
    files.sort();
    files.dedup();
    files.truncate(MAX_FILES);
    Ok(files)
}

fn walk(root: &Path) -> Vec<String> {
    let mut out = vec![];
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push(e.path());
                }
            } else if ft.is_file()
                && !name.starts_with('.')
                && let Ok(rel) = e.path().strip_prefix(root)
            {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
            if out.len() >= MAX_FILES {
                return out;
            }
        }
    }
    out
}

#[derive(Debug, Serialize, PartialEq)]
pub struct FileText {
    pub path: String,
    pub text: String,
    pub truncated: bool,
    pub binary: bool,
}

/// Reads one file inside the folder. Paths that leave the folder (`..`, symlinks) are refused.
pub fn read(folder: &Path, rel: &str) -> Result<FileText, String> {
    let root = folder.canonicalize().map_err(|e| e.to_string())?;
    let full: PathBuf = root.join(rel).canonicalize().map_err(|e| format!("{rel}: {e}"))?;
    if !full.starts_with(&root) {
        return Err(format!("{rel} is outside the project folder"));
    }
    let bytes = std::fs::read(&full).map_err(|e| format!("{rel}: {e}"))?;
    let truncated = bytes.len() > MAX_BYTES;
    let head = &bytes[..bytes.len().min(MAX_BYTES)];
    let binary = head.iter().take(8000).any(|b| *b == 0);
    let text = if binary { String::new() } else { String::from_utf8_lossy(head).into_owned() };
    Ok(FileText { path: rel.to_string(), text, truncated, binary })
}

#[tauri::command]
pub fn list_files(folder: String) -> Result<Vec<String>, String> {
    list(Path::new(&folder))
}

#[tauri::command]
pub fn read_file(folder: String, path: String) -> Result<FileText, String> {
    read(Path::new(&folder), &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn git(d: &Path, args: &[&str]) {
        assert!(Command::new("git").current_dir(d).args(args).status().unwrap().success());
    }

    #[test]
    fn lists_tracked_and_untracked_but_not_ignored_or_notes() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        git(p, &["init", "-q"]);
        fs::create_dir_all(p.join("src")).unwrap();
        fs::create_dir_all(p.join(".pair/notes")).unwrap();
        fs::write(p.join("src/a.ts"), "x").unwrap();
        fs::write(p.join("README.md"), "x").unwrap();
        fs::write(p.join(".gitignore"), "out.log\n").unwrap();
        fs::write(p.join("out.log"), "x").unwrap();
        fs::write(p.join(".pair/notes/n.md"), "x").unwrap();
        git(p, &["add", "README.md"]);
        assert_eq!(list(p).unwrap(), vec![".gitignore", "README.md", "src/a.ts"]);
    }

    #[test]
    fn walks_plain_folders_skipping_hidden_and_build_dirs() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        for f in ["a.py", "pkg/b.py", "node_modules/x.js", ".hidden/y", ".pair/notes/n.md"] {
            fs::create_dir_all(p.join(f).parent().unwrap()).unwrap();
            fs::write(p.join(f), "x").unwrap();
        }
        assert_eq!(list(p).unwrap(), vec!["a.py", "pkg/b.py"]);
    }

    #[test]
    fn reads_inside_only_and_flags_binary() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        fs::write(p.join("a.txt"), "hello").unwrap();
        fs::write(p.join("b.bin"), [0u8, 1, 2]).unwrap();
        assert_eq!(read(p, "a.txt").unwrap().text, "hello");
        assert!(read(p, "b.bin").unwrap().binary);
        assert!(read(p, "../etc/passwd").is_err());
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("s"), "secret").unwrap();
        std::os::unix::fs::symlink(outside.path().join("s"), p.join("link")).unwrap();
        assert!(read(p, "link").unwrap_err().contains("outside"));
    }
}
