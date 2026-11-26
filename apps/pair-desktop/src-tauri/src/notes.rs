//! Notes on disk in Pair's app data, keyed by the canonical project path.
//!
//! The markdown file is the source of truth for the text. The sidecar holds everything the
//! app needs around it: margin threads, the agent's pending proposals and approval requests,
//! the agent session id, the model, the Tell line and the current stage.
//!
//! The two files are the contract any client reads, so the sidecar is versioned by `v`:
//! - Bump `v` whenever its shape changes, and give every new field a serde default so older
//!   sidecars still load. Loading upgrades them in memory; the next save writes the new version.
//! - A sidecar newer than this build is refused rather than loaded, because saving it back would
//!   silently drop the fields this build does not know.
//! - Anything that points into the note text does so with a text-quote [`Anchor`], never a bare
//!   offset, so it survives edits made outside pair.
//!
//! Versions: 1 = core note state, 2 = proposals and approvals, 3 = note kind and review state,
//! 4 = selected repository path, 5 = code review base selection source,
//! 6 = pending comparison refresh after base correction, 7 = generated note title,
//! 8 = note selection chat.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LEGACY_NOTES_DIR: &str = ".pair/notes";
static MIGRATION_LOCK: Mutex<()> = Mutex::new(());
static SIDECAR_LOCK: Mutex<()> = Mutex::new(());
/// The sidecar version this build writes, and the newest it can read.
pub const SIDECAR_VERSION: u32 = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum NoteKind {
    #[default]
    Note,
    CodeReview,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewState {
    #[serde(default)]
    pub repo_path: Option<String>,
    #[serde(default)]
    pub base_source: Option<ReviewBaseSource>,
    #[serde(default)]
    pub base_refresh_required: Option<bool>,
    #[serde(default)]
    pub base_branch: Option<String>,
    #[serde(default)]
    pub head_branch: Option<String>,
    #[serde(default)]
    pub base_commit: Option<String>,
    #[serde(default)]
    pub head_commit: Option<String>,
    #[serde(default)]
    pub reviewed_files: Vec<String>,
    #[serde(default)]
    pub guide: Option<ReviewGuide>,
    #[serde(default)]
    pub chat_context: Option<ReviewChatContext>,
    #[serde(default)]
    pub chat: Vec<ReviewChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewBaseSource {
    PullRequest,
    Fallback,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewChatContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<SelectionSource>,
    pub path: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub selection: String,
    #[serde(default)]
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SelectionSource {
    Note,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SelectionChatState {
    pub context: ReviewChatContext,
    pub messages: Vec<ReviewChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReviewChatRole {
    #[default]
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewChatMessage {
    pub id: String,
    pub role: ReviewChatRole,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewGuide {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<String>,
    #[serde(default)]
    pub sections: Vec<ReviewSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewSection {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub focus: String,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub suggestions: Vec<ReviewSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ReviewSuggestion {
    pub path: String,
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub side: Option<ReviewLineSide>,
    #[serde(default)]
    pub severity: Option<String>,
    pub summary: String,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub next_check: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ReviewLineSide {
    Old,
    New,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProposalKind {
    /// Replace the anchored passage with `replace`.
    Edit,
    /// Insert a diagram (`spec`) after the anchored passage's block.
    Diagram,
    /// Insert a reply block (`text`) after the anchored passage's block.
    Reply,
}

/// A change the agent proposed to the note that Kevin has not accepted or rejected yet. It is
/// kept out of the markdown until accepted, and re-applied as a suggestion when the note opens.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Proposal {
    pub id: String,
    pub kind: ProposalKind,
    /// For an edit, the passage it replaces. For a block, the passage it goes under; none means
    /// the end of the note.
    #[serde(default)]
    pub anchor: Option<Anchor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default)]
    pub thread_id: Option<String>,
    /// The agent request waiting on Kevin's answer. Only meaningful while that agent process is
    /// alive; after a restart nothing is waiting, and the decision only changes the note.
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalStatus {
    /// The agent is waiting for Kevin's answer.
    #[default]
    Pending,
    /// The agent process that asked has gone, so answering cannot run it; Kevin can ask again.
    Expired,
}

/// A file edit, command, outside read or other tool call the agent asked Kevin to approve.
/// It shows under its thread's passage (or at the end of the note without a thread).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Approval {
    /// The agent's request id.
    pub id: String,
    /// `file_edit`, `command`, `read_outside` or `tool`.
    pub kind: String,
    pub tool: String,
    #[serde(default)]
    pub input: serde_json::Value,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub status: ApprovalStatus,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection_chat: Option<SelectionChatState>,
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
    #[serde(default)]
    pub proposals: Vec<Proposal>,
    #[serde(default)]
    pub approvals: Vec<Approval>,
    #[serde(default)]
    pub kind: NoteKind,
    #[serde(default)]
    pub review: Option<ReviewState>,
}

impl Default for Sidecar {
    fn default() -> Self {
        Sidecar {
            v: SIDECAR_VERSION,
            title: None,
            selection_chat: None,
            threads: vec![],
            proposals: vec![],
            approvals: vec![],
            kind: NoteKind::Note,
            review: None,
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
    pub title: Option<String>,
    #[serde(default)]
    pub kind: NoteKind,
}

/// Resolves the central note directory for a project and migrates its old repo-local notes.
pub fn project_notes_dir(app_data: &Path, folder: &Path) -> io::Result<PathBuf> {
    let folder = folder.canonicalize()?;
    let key = project_key(&folder);
    let dir = app_data.join("projects").join(key).join("notes");
    let _migration = MIGRATION_LOCK.lock().map_err(|error| io::Error::other(error.to_string()))?;
    migrate_legacy_notes(&folder.join(LEGACY_NOTES_DIR), &dir)?;
    Ok(dir)
}

fn project_key(folder: &Path) -> String {
    // FNV-1a 128 keeps project storage paths deterministic across app updates without another
    // runtime dependency. The full canonical path is the input, so same-named projects stay apart.
    stable_key(folder.to_string_lossy().as_bytes())
}

fn stable_key(value: &[u8]) -> String {
    let mut hash = 0x6c62272e07bb014262b821756295c58d_u128;
    for byte in value {
        hash ^= u128::from(*byte);
        hash = hash.wrapping_mul(0x0000000001000000000000000000013b_u128);
    }
    format!("{hash:032x}")
}

fn migrate_legacy_notes(legacy: &Path, central: &Path) -> io::Result<()> {
    if !legacy.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(central)?;
    let recovery = central.parent().unwrap_or(central).join("legacy-conflicts");
    let mut notes = BTreeMap::<String, Vec<PathBuf>>::new();
    for entry in fs::read_dir(legacy)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let source = entry.path();
        let Some(file) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(name) = file.strip_suffix(".md").or_else(|| file.strip_suffix(".pair.json")) else { continue };
        notes.entry(name.to_owned()).or_default().push(source);
    }

    for (name, mut sources) in notes {
        sources.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        let mut has_conflict = false;
        for source in &sources {
            let file = source.file_name().expect("legacy note file name");
            match fs::read(central.join(file)) {
                Ok(existing) if existing != fs::read(source)? => has_conflict = true,
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }

        let destination_dir = if has_conflict {
            // Keep a conflicting legacy note as one recoverable pair, outside the active notes
            // list. This also prevents a later deletion from importing it back as a new note.
            let backup = recovery.join(conflict_key(&name, &sources)?);
            fs::create_dir_all(&backup)?;
            write_atomic(&backup.join("name.txt"), name.as_bytes())?;
            backup
        } else {
            central.to_path_buf()
        };
        copy_verified(&sources, &destination_dir)?;

        for source in sources {
            let file = source.file_name().expect("legacy note file name");
            let destination = destination_dir.join(file);
            if fs::read(&destination)? == fs::read(&source)? {
                fs::remove_file(source)?;
            }
        }
    }

    let _ = fs::remove_dir(legacy);
    if let Some(parent) = legacy.parent() {
        let _ = fs::remove_dir(parent);
    }
    Ok(())
}

fn conflict_key(name: &str, sources: &[PathBuf]) -> io::Result<String> {
    let mut key = name.as_bytes().to_vec();
    for source in sources {
        key.extend_from_slice(source.file_name().expect("legacy note file name").to_string_lossy().as_bytes());
        key.extend_from_slice(&fs::read(source)?);
    }
    Ok(stable_key(&key))
}

fn copy_verified(sources: &[PathBuf], destination: &Path) -> io::Result<()> {
    for source in sources {
        let file = source.file_name().expect("legacy note file name");
        let bytes = fs::read(source)?;
        let path = destination.join(file);
        match fs::read(&path) {
            Ok(existing) if existing == bytes => {}
            Ok(_) => return Err(io::Error::new(io::ErrorKind::AlreadyExists, format!("conflicting note backup {}", path.display()))),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                write_atomic(&path, &bytes)?;
                if fs::read(&path)? != bytes {
                    return Err(io::Error::other(format!("could not verify migrated note {}", source.display())));
                }
            }
            Err(error) => return Err(error),
        }
    }
    Ok(())
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

fn md_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.md"))
}

fn sidecar_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.pair.json"))
}

/// A new note starts blank: the page is Kevin's to fill.
pub fn template(_title: &str) -> String {
    String::new()
}

pub fn list(dir: &Path) -> io::Result<Vec<NoteSummary>> {
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
        let sidecar = fs::read_to_string(sidecar_path(dir, name))
            .ok()
            .and_then(|json| serde_json::from_str::<Sidecar>(&json).ok());
        let (kind, title) = sidecar.map(|sidecar| (sidecar.kind, sidecar.title)).unwrap_or_default();
        out.push(NoteSummary { name: name.to_string(), modified_ms, kind, title });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then(a.name.cmp(&b.name)));
    Ok(out)
}

#[cfg(test)]
pub fn create(dir: &Path, name: &str) -> io::Result<Note> {
    create_kind(dir, name, NoteKind::Note)
}

pub fn create_kind(dir: &Path, name: &str, kind: NoteKind) -> io::Result<Note> {
    validate_name(name)?;
    fs::create_dir_all(dir)?;
    let md = md_path(dir, name);
    if md.exists() {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, format!("note exists: {name}")));
    }
    let mut sidecar = Sidecar::default();
    sidecar.kind = kind.clone();
    if kind == NoteKind::CodeReview {
        sidecar.stage = Stage::Review;
        sidecar.review = Some(ReviewState::default());
    }
    let note = Note { name: name.to_string(), markdown: template(name), sidecar };
    save(dir, &note)?;
    Ok(note)
}

pub fn read(dir: &Path, name: &str) -> io::Result<Note> {
    validate_name(name)?;
    let markdown = fs::read_to_string(md_path(dir, name))?;
    let sidecar = read_sidecar(dir, name)?;
    Ok(Note { name: name.to_string(), markdown, sidecar })
}

fn read_sidecar(dir: &Path, name: &str) -> io::Result<Sidecar> {
    match fs::read_to_string(sidecar_path(dir, name)) {
        Ok(s) => parse_sidecar(&s),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Sidecar::default()),
        Err(e) => Err(e),
    }
}

/// Parses a sidecar of this version or older, upgraded to this version.
fn parse_sidecar(json: &str) -> io::Result<Sidecar> {
    let mut sidecar: Sidecar = serde_json::from_str(json).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    if sidecar.v > SIDECAR_VERSION {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("this note was saved by a newer pair (sidecar v{}); update pair to open it", sidecar.v),
        ));
    }
    sidecar.v = SIDECAR_VERSION;
    Ok(sidecar)
}

/// Writes both files atomically (temp file + rename) so a crash never leaves half a note.
pub fn save(dir: &Path, note: &Note) -> io::Result<()> {
    validate_name(&note.name)?;
    fs::create_dir_all(dir)?;
    write_atomic(&md_path(dir, &note.name), note.markdown.as_bytes())?;
    save_sidecar(dir, &note.name, &note.sidecar)
}

/// Removes a note's markdown and sidecar.
pub fn delete(dir: &Path, name: &str) -> io::Result<()> {
    validate_name(name)?;
    let _lock = SIDECAR_LOCK.lock().map_err(|error| io::Error::other(error.to_string()))?;
    for p in [md_path(dir, name), sidecar_path(dir, name)] {
        match fs::remove_file(p) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(())
}

pub fn save_sidecar(dir: &Path, name: &str, sidecar: &Sidecar) -> io::Result<()> {
    validate_name(name)?;
    let _lock = SIDECAR_LOCK.lock().map_err(|error| io::Error::other(error.to_string()))?;
    let mut sidecar = sidecar.clone();
    sidecar.v = SIDECAR_VERSION;
    sidecar.title = read_sidecar(dir, name)?.title.or(sidecar.title);
    write_sidecar(dir, name, &sidecar)
}

pub fn save_title(dir: &Path, name: &str, title: String) -> io::Result<String> {
    validate_name(name)?;
    let _lock = SIDECAR_LOCK.lock().map_err(|error| io::Error::other(error.to_string()))?;
    // Re-read after the model returns. The note may have been edited or deleted while it ran.
    let mut note = read(dir, name)?;
    if let Some(title) = note.sidecar.title {
        return Ok(title);
    }
    note.sidecar.title = Some(title.clone());
    write_sidecar(dir, name, &note.sidecar)?;
    Ok(title)
}

fn write_sidecar(dir: &Path, name: &str, sidecar: &Sidecar) -> io::Result<()> {
    let json = serde_json::to_vec_pretty(sidecar).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::create_dir_all(dir)?;
    write_atomic(&sidecar_path(dir, name), &json)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
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
        assert_eq!(note.markdown, "");
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
    fn sidecar_round_trips_review_guide_and_chat_context() {
        let d = tmp();
        let mut note = create(d.path(), "review").unwrap();
        note.sidecar.review = Some(ReviewState {
            guide: Some(ReviewGuide {
                goal: Some("Let riders fix pickup details.".into()),
                attempt: Some("Add an edit window.".into()),
                ..ReviewGuide::default()
            }),
            chat_context: Some(ReviewChatContext {
                source: None,
                path: "src/lib.rs".into(),
                location: "old 12, new 18".into(),
                selection: "return next_value;".into(),
                excerpt: "@@ -12 +18 @@\n-return old_value;\n+return next_value;".into(),
            }),
            chat: vec![
                ReviewChatMessage { id: "q1".into(), role: ReviewChatRole::User, text: "Why did this change?".into() },
                ReviewChatMessage { id: "a1".into(), role: ReviewChatRole::Assistant, text: "The new value comes from the updated policy.".into() },
            ],
            ..ReviewState::default()
        });
        save(d.path(), &note).unwrap();

        assert_eq!(read(d.path(), "review").unwrap(), note);
    }

    #[test]
    fn sidecar_round_trips_note_selection_chat() {
        let d = tmp();
        let mut note = create(d.path(), "note").unwrap();
        note.sidecar.selection_chat = Some(SelectionChatState {
            context: ReviewChatContext {
                source: Some(SelectionSource::Note),
                path: "Discuss delivery".into(),
                selection: "Claim the send first.".into(),
                ..ReviewChatContext::default()
            },
            messages: vec![ReviewChatMessage {
                id: "ask-1".into(),
                role: ReviewChatRole::User,
                text: "Why claim it first?".into(),
            }],
        });
        save(d.path(), &note).unwrap();
        assert_eq!(read(d.path(), "note").unwrap(), note);
    }

    #[test]
    fn sidecar_round_trips_proposals_and_approvals() {
        let d = tmp();
        let mut note = create(d.path(), "n").unwrap();
        let anchor = Anchor { quote: TextQuote { exact: "loop".into(), prefix: "a ".into(), suffix: ".".into() }, pos: 9 };
        note.sidecar.proposals = vec![
            Proposal { id: "p1".into(), kind: ProposalKind::Edit, anchor: Some(anchor.clone()), replace: Some("for loop".into()), spec: None, text: None, thread_id: Some("t1".into()), request_id: Some("r1".into()) },
            Proposal { id: "p2".into(), kind: ProposalKind::Reply, anchor: None, replace: None, spec: None, text: Some("Ready: yes".into()), thread_id: None, request_id: None },
        ];
        note.sidecar.approvals = vec![Approval {
            id: "r2".into(),
            kind: "command".into(),
            tool: "bash".into(),
            input: serde_json::json!({"command": "cargo test"}),
            thread_id: Some("t1".into()),
            status: ApprovalStatus::Expired,
        }];
        save(d.path(), &note).unwrap();
        assert_eq!(read(d.path(), "n").unwrap(), note);
        let raw = fs::read_to_string(sidecar_path(d.path(), "n")).unwrap();
        assert!(raw.contains(&format!("\"v\": {SIDECAR_VERSION}")));
        assert!(raw.contains("\"status\": \"expired\""));
    }

    #[test]
    fn v1_sidecar_loads_and_saves_at_current_version() {
        let d = tmp();
        create(d.path(), "old").unwrap();
        // Written by pair before proposals and approvals were saved.
        let v1 = r#"{
  "v": 1,
  "threads": [{"id": "t1", "anchor": {"quote": {"exact": "Think", "prefix": "", "suffix": ""}, "pos": 3},
               "messages": [{"author": "kevin", "text": "why?"}], "resolved": false, "detached": false}],
  "session": {"id": "s-1", "interrupted": null},
  "model": null,
  "tell": "be terse",
  "stage": "plan"
}"#;
        fs::write(sidecar_path(d.path(), "old"), v1).unwrap();
        let note = read(d.path(), "old").unwrap();
        assert_eq!(note.sidecar.v, SIDECAR_VERSION);
        assert_eq!(note.sidecar.threads[0].messages[0].text, "why?");
        assert_eq!(note.sidecar.stage, Stage::Plan);
        assert!(note.sidecar.proposals.is_empty() && note.sidecar.approvals.is_empty());
        save(d.path(), &note).unwrap();
        let raw = fs::read_to_string(sidecar_path(d.path(), "old")).unwrap();
        assert!(raw.contains(&format!("\"v\": {SIDECAR_VERSION}")) && raw.contains("\"proposals\": []"));
    }

    #[test]
    fn newer_sidecar_is_refused() {
        let d = tmp();
        create(d.path(), "new").unwrap();
        let future = serde_json::json!({ "v": SIDECAR_VERSION + 1, "threads": [], "somethingNew": [1] });
        fs::write(sidecar_path(d.path(), "new"), future.to_string()).unwrap();
        let err = read(d.path(), "new").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
        assert!(err.to_string().contains("newer pair"), "{err}");
    }

    #[test]
    fn code_review_notes_start_in_review_and_keep_their_kind() {
        let d = tmp();
        let note = create_kind(d.path(), "review-one", NoteKind::CodeReview).unwrap();
        assert_eq!(note.sidecar.kind, NoteKind::CodeReview);
        assert_eq!(note.sidecar.stage, Stage::Review);
        assert_eq!(note.sidecar.review, Some(ReviewState::default()));
        assert_eq!(list(d.path()).unwrap()[0].kind, NoteKind::CodeReview);
        assert_eq!(read(d.path(), "review-one").unwrap(), note);
    }

    #[test]
    fn generated_title_survives_stale_editor_saves_and_keeps_the_note_id() {
        let d = tmp();
        let mut stale = create(d.path(), "note-2026-11-26-1234").unwrap();
        let name = stale.name.clone();
        let title = "Prevent duplicate sends".to_string();
        assert_eq!(save_title(d.path(), &name, title.clone()).unwrap(), title);
        stale.markdown = "Claim before calling the delivery service.".into();
        save(d.path(), &stale).unwrap();
        save_sidecar(d.path(), &name, &stale.sidecar).unwrap();

        let note = read(d.path(), &name).unwrap();
        assert_eq!(note.sidecar.title.as_ref(), Some(&title));
        assert_eq!(note.markdown, stale.markdown);
        let summary = list(d.path()).unwrap().pop().unwrap();
        assert_eq!(summary.name, name);
        assert_eq!(summary.title.as_ref(), Some(&title));
        delete(d.path(), &name).unwrap();
        assert_eq!(save_title(d.path(), &name, title).unwrap_err().kind(), io::ErrorKind::NotFound);
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn delete_removes_both_files() {
        let d = tmp();
        create(d.path(), "gone").unwrap();
        delete(d.path(), "gone").unwrap();
        assert!(list(d.path()).unwrap().is_empty());
        assert!(!sidecar_path(d.path(), "gone").exists());
        delete(d.path(), "gone").unwrap();
    }

    #[test]
    fn missing_sidecar_reads_as_default() {
        let d = tmp();
        fs::create_dir_all(d.path()).unwrap();
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

    fn git(dir: &Path, args: &[&str]) -> String {
        let o = std::process::Command::new("git").current_dir(dir).args(args).output().unwrap();
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }

    #[test]
    fn central_notes_do_not_add_files_or_ignore_rules_to_the_project() {
        let project = tmp();
        let data = tmp();
        git(project.path(), &["init", "-q"]);
        fs::write(project.path().join(".git/info/exclude"), "*.log\n").unwrap();

        let dir = project_notes_dir(data.path(), project.path()).unwrap();
        create(&dir, "n").unwrap();

        assert!(!project.path().join(".pair").exists());
        assert_eq!(fs::read_to_string(project.path().join(".git/info/exclude")).unwrap(), "*.log\n");
        assert_eq!(git(project.path(), &["status", "--porcelain", "--untracked-files=all"]), "");
    }

    #[test]
    fn migrates_legacy_notes_from_project_subfolders_and_worktrees() {
        let repo = tmp();
        let data = tmp();
        git(repo.path(), &["init", "-q", "-b", "main"]);
        fs::write(repo.path().join("x"), "1").unwrap();
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "i"]);

        let sub = repo.path().join("app");
        let legacy = sub.join(LEGACY_NOTES_DIR);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("n.md"), "subfolder note").unwrap();
        fs::write(legacy.join("n.pair.json"), "{\"v\": 6}").unwrap();
        let sub_notes = project_notes_dir(data.path(), &sub).unwrap();
        assert_eq!(fs::read_to_string(sub_notes.join("n.md")).unwrap(), "subfolder note");
        assert!(sub_notes.join("n.pair.json").exists());
        assert!(!legacy.exists());

        let worktree = repo.path().join("wt");
        git(repo.path(), &["worktree", "add", "-q", "-b", "w", worktree.to_str().unwrap()]);
        assert!(worktree.join(".git").is_file());
        let legacy = worktree.join(LEGACY_NOTES_DIR);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("m.md"), "worktree note").unwrap();
        let worktree_notes = project_notes_dir(data.path(), &worktree).unwrap();
        assert_eq!(fs::read_to_string(worktree_notes.join("m.md")).unwrap(), "worktree note");
        assert!(!legacy.exists());
    }
}
