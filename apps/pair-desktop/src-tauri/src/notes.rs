//! Notes on disk: `<folder>/.pair/notes/<name>.md` plus a `<name>.pair.json` sidecar.
//!
//! The markdown file is the source of truth for the text. The sidecar holds everything the
//! app needs around it: margin threads, pending suggestions, the agent session id, the model,
//! the Tell line and the current stage.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const NOTES_DIR: &str = ".pair/notes";
const EXCLUDE_LINE: &str = ".pair/";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    #[default]
    Think,
    Plan,
    Build,
    Review,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct TextQuote {
    pub exact: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(default)]
    pub suffix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Anchor {
    pub quote: TextQuote,
    /// Last known character offset of `quote.exact` in the note text; a hint, not the truth.
    #[serde(default)]
    pub pos: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThreadMessage {
    pub author: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Thread {
    pub id: String,
    pub anchor: Anchor,
    #[serde(default)]
    pub messages: Vec<ThreadMessage>,
    #[serde(default)]
    pub resolved: bool,
    #[serde(default)]
    pub detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Session {
    #[serde(default)]
    pub id: Option<String>,
    /// Set when the app closed while a task was running; cleared by Retry or a new ask.
    #[serde(default)]
    pub interrupted: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sidecar {
    pub v: u32,
    #[serde(default)]
    pub threads: Vec<Thread>,
    #[serde(default)]
    pub session: Session,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub tell: String,
    #[serde(default)]
    pub stage: Stage,
}

impl Default for Sidecar {
    fn default() -> Self {
        Sidecar {
            v: 1,
            threads: vec![],
            session: Session::default(),
            model: None,
            tell: String::new(),
            stage: Stage::Think,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Note {
    pub name: String,
    pub markdown: String,
    pub sidecar: Sidecar,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteSummary {
    pub name: String,
    pub modified_ms: u64,
}

pub fn notes_dir(folder: &Path) -> PathBuf {
    folder.join(NOTES_DIR)
}

/// A note name is a single path segment: no separators, no leading dot, not empty.
pub fn validate_name(name: &str) -> io::Result<()> {
    let bad = name.trim().is_empty()
        || name.starts_with('.')
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name.ends_with(".pair.json");
    if bad {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, format!("invalid note name: {name:?}")));
    }
    Ok(())
}

fn md_path(folder: &Path, name: &str) -> PathBuf {
    notes_dir(folder).join(format!("{name}.md"))
}

fn sidecar_path(folder: &Path, name: &str) -> PathBuf {
    notes_dir(folder).join(format!("{name}.pair.json"))
}

/// Seed text for a new note: one H2 per stage, so the note reads as a document.
pub fn template(title: &str) -> String {
    format!("# {title}\n\n## Think\n\n\n## Plan\n\n\n## Build\n\n\n## Review\n\n")
}

pub fn list(folder: &Path) -> io::Result<Vec<NoteSummary>> {
    let dir = notes_dir(folder);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let modified_ms = entry
            .metadata()?
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(NoteSummary { name: name.to_string(), modified_ms });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then(a.name.cmp(&b.name)));
    Ok(out)
}

pub fn create(folder: &Path, name: &str) -> io::Result<Note> {
    validate_name(name)?;
    fs::create_dir_all(notes_dir(folder))?;
    ensure_git_exclude(folder)?;
    let md = md_path(folder, name);
    if md.exists() {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, format!("note exists: {name}")));
    }
    let note = Note { name: name.to_string(), markdown: template(name), sidecar: Sidecar::default() };
    save(folder, &note)?;
    Ok(note)
}

pub fn read(folder: &Path, name: &str) -> io::Result<Note> {
    validate_name(name)?;
    let markdown = fs::read_to_string(md_path(folder, name))?;
    let sidecar = match fs::read_to_string(sidecar_path(folder, name)) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?,
        Err(e) if e.kind() == io::ErrorKind::NotFound => Sidecar::default(),
        Err(e) => return Err(e),
    };
    Ok(Note { name: name.to_string(), markdown, sidecar })
}

/// Writes both files atomically (temp file + rename) so a crash never leaves half a note.
pub fn save(folder: &Path, note: &Note) -> io::Result<()> {
    validate_name(&note.name)?;
    fs::create_dir_all(notes_dir(folder))?;
    write_atomic(&md_path(folder, &note.name), note.markdown.as_bytes())?;
    let json = serde_json::to_vec_pretty(&note.sidecar).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    write_atomic(&sidecar_path(folder, &note.name), &json)
}

pub fn save_sidecar(folder: &Path, name: &str, sidecar: &Sidecar) -> io::Result<()> {
    validate_name(name)?;
    let json = serde_json::to_vec_pretty(sidecar).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    write_atomic(&sidecar_path(folder, name), &json)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

/// Adds `.pair/` to `.git/info/exclude` once, so notes stay out of git without touching
/// the project's tracked `.gitignore`. No-op outside a git repository.
pub fn ensure_git_exclude(folder: &Path) -> io::Result<()> {
    let git = folder.join(".git");
    if !git.is_dir() {
        return Ok(());
    }
    let info = git.join("info");
    fs::create_dir_all(&info)?;
    let exclude = info.join("exclude");
    let current = fs::read_to_string(&exclude).unwrap_or_default();
    if current.lines().any(|l| l.trim() == EXCLUDE_LINE || l.trim() == "/.pair/") {
        return Ok(());
    }
    let mut next = current;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str("# pair desktop notes (local only)\n");
    next.push_str(EXCLUDE_LINE);
    next.push('\n');
    fs::write(exclude, next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn create_writes_template_and_default_sidecar() {
        let d = tmp();
        let note = create(d.path(), "auth-flow").unwrap();
        assert!(note.markdown.contains("## Think") && note.markdown.contains("## Review"));
        let back = read(d.path(), "auth-flow").unwrap();
        assert_eq!(back, note);
        assert_eq!(back.sidecar.stage, Stage::Think);
    }

    #[test]
    fn create_refuses_duplicates_and_bad_names() {
        let d = tmp();
        create(d.path(), "a").unwrap();
        assert_eq!(create(d.path(), "a").unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        for bad in ["", ".hidden", "x/y", "..", "n.pair.json"] {
            assert!(create(d.path(), bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn sidecar_round_trips_threads_and_session() {
        let d = tmp();
        let mut note = create(d.path(), "n").unwrap();
        note.sidecar.threads.push(Thread {
            id: "t1".into(),
            anchor: Anchor { quote: TextQuote { exact: "Think".into(), prefix: "## ".into(), suffix: "\n".into() }, pos: 5 },
            messages: vec![ThreadMessage { author: "agent".into(), text: "why?".into() }],
            resolved: false,
            detached: false,
        });
        note.sidecar.session.id = Some("s-123".into());
        note.sidecar.stage = Stage::Build;
        note.sidecar.tell = "be terse".into();
        save(d.path(), &note).unwrap();
        assert_eq!(read(d.path(), "n").unwrap(), note);
    }

    #[test]
    fn missing_sidecar_reads_as_default() {
        let d = tmp();
        fs::create_dir_all(notes_dir(d.path())).unwrap();
        fs::write(md_path(d.path(), "plain"), "hello").unwrap();
        let n = read(d.path(), "plain").unwrap();
        assert_eq!(n.sidecar, Sidecar::default());
    }

    #[test]
    fn list_returns_md_notes_only() {
        let d = tmp();
        create(d.path(), "one").unwrap();
        create(d.path(), "two").unwrap();
        let mut names: Vec<_> = list(d.path()).unwrap().into_iter().map(|n| n.name).collect();
        names.sort();
        assert_eq!(names, vec!["one", "two"]);
        assert!(list(&d.path().join("nowhere")).unwrap().is_empty());
    }

    #[test]
    fn git_exclude_added_once_and_only_in_git_repos() {
        let d = tmp();
        create(d.path(), "no-git").unwrap();
        assert!(!d.path().join(".git").exists());

        let g = tmp();
        fs::create_dir_all(g.path().join(".git/info")).unwrap();
        fs::write(g.path().join(".git/info/exclude"), "*.log").unwrap();
        create(g.path(), "a").unwrap();
        create(g.path(), "b").unwrap();
        let ex = fs::read_to_string(g.path().join(".git/info/exclude")).unwrap();
        assert!(ex.starts_with("*.log\n"));
        assert_eq!(ex.matches(".pair/").count(), 1);
    }
}
