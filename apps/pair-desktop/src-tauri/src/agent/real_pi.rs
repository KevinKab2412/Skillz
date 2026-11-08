//! End-to-end checks against the real, installed Pi with pair's extension, driven through the
//! same `Agents` manager and `PiProvider` the app uses. They call a real model, so they are
//! ignored by default. Run with:
//!
//!   cargo test real_pi -- --ignored --nocapture --test-threads=1
//!
//! `PAIR_REAL_MODEL` picks the model (default `openai-codex/gpt-5.6-luna`).

use super::provider::{PiProvider, StartSpec};
use super::*;
use crate::notes::{self, Stage};
use std::path::Path;
use std::sync::mpsc;

const WAIT: Duration = Duration::from_secs(240);

struct Real {
    agents: Arc<Mutex<Agents>>,
    rx: mpsc::Receiver<NoteEvent>,
    folder: tempfile::TempDir,
    _data: tempfile::TempDir,
    key: String,
    spec: StartSpec,
}

fn real() -> Real {
    let pi = crate::agent_cmds::resolve_pi(None).expect("pi is not on the login shell PATH");
    let ext = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../pi-ext/pair-ext.ts");
    let data = tempfile::tempdir().unwrap();
    let folder = tempfile::tempdir().unwrap();
    let f = folder.path();
    run(f, &["git", "init", "-q", "-b", "main"]);
    std::fs::write(f.join("README.md"), "# demo\n").unwrap();
    run(f, &["git", "add", "."]);
    run(f, &["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"]);
    notes::create(f, "demo").unwrap();

    let provider = PiProvider { program: pi.into(), prefix_args: vec![], extension: ext, session_dir: data.path().join("sessions") };
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let emit: Emit = Arc::new(move |e| {
        let _ = tx.lock().unwrap().send(e);
    });
    let agents = Agents::new(Box::new(provider), emit, data.path().join("running.json"));
    let folder_s = f.to_string_lossy().to_string();
    let model = std::env::var("PAIR_REAL_MODEL").unwrap_or_else(|_| "openai-codex/gpt-5.6-luna".into());
    let spec = StartSpec { cwd: f.to_path_buf(), session_id: "0b7f3c1e-5a2d-4c6b-9e8f-1a2b3c4d5e6f".into(), model: Some(model), note: "demo".into() };
    Real { agents, rx, key: note_key(&folder_s, "demo"), folder, _data: data, spec }
}

fn run(dir: &Path, cmd: &[&str]) {
    let ok = std::process::Command::new(cmd[0]).args(&cmd[1..]).current_dir(dir).status().unwrap().success();
    assert!(ok, "{cmd:?} failed");
}

/// What one ask produced: pair's approval requests (kind, payload) and the assistant's text.
#[derive(Debug, Default)]
struct Outcome {
    requests: Vec<(String, Value)>,
    text: String,
    exited: Option<Value>,
}

impl Real {
    fn set_stage(&self, stage: Stage) {
        let mut n = notes::read(self.folder.path(), "demo").unwrap();
        n.sidecar.stage = stage;
        notes::save_sidecar(self.folder.path(), "demo", &n.sidecar).unwrap();
    }

    /// Sends one prompt the way the app does and answers each pair request with `decide`,
    /// which returns the JSON answer string (or None to cancel, like dismissing a card).
    fn ask(&self, message: &str, mut decide: impl FnMut(&str, &Value) -> Option<String>) -> Outcome {
        self.agents.lock().unwrap().ask(&self.key, self.spec.clone(), message.to_string()).unwrap();
        let mut out = Outcome::default();
        let deadline = Instant::now() + WAIT;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let e = self.rx.recv_timeout(left).unwrap_or_else(|_| panic!("no pair_settled within {WAIT:?}; so far {out:?}"));
            let r = &e.record;
            match r["type"].as_str().unwrap_or("") {
                "extension_ui_request" => {
                    let title = r["title"].as_str().unwrap_or("");
                    let id = r["id"].clone();
                    let reply = match title.strip_prefix("pair:") {
                        Some(kind) if r["method"] == "editor" => {
                            let payload: Value = serde_json::from_str(r["prefill"].as_str().unwrap_or("{}")).unwrap();
                            eprintln!("  ⇢ pair:{kind} {payload}");
                            let answer = decide(kind, &payload);
                            out.requests.push((kind.to_string(), payload));
                            match answer {
                                Some(v) => json!({"type": "extension_ui_response", "id": id, "value": v}),
                                None => json!({"type": "extension_ui_response", "id": id, "cancelled": true}),
                            }
                        }
                        _ if ["editor", "select", "confirm", "input"].contains(&r["method"].as_str().unwrap_or("")) => {
                            json!({"type": "extension_ui_response", "id": id, "cancelled": true})
                        }
                        _ => continue,
                    };
                    self.agents.lock().unwrap().send(&self.key, reply).unwrap();
                }
                "message_update" => {
                    if let Some(d) = r["assistantMessageEvent"]["delta"].as_str()
                        && r["assistantMessageEvent"]["type"] == "text_delta"
                    {
                        out.text.push_str(d);
                    }
                }
                "pair_error" => panic!("pair_error: {r}"),
                "pair_exited" => out.exited = Some(r.clone()),
                "pair_settled" => {
                    eprintln!("  ⇠ {}", out.text.trim());
                    return out;
                }
                _ => {}
            }
        }
    }

    fn file(&self, name: &str) -> Option<String> {
        std::fs::read_to_string(self.folder.path().join(name)).ok()
    }
}

const WRITE: &str = "<pair mode=\"act\"/>\nUse the write tool to create the file hello.txt containing exactly the text: hi\nDo not use bash. If it is declined, do not retry; just say what happened in one sentence.";

#[test]
#[ignore = "calls a real model through the installed pi"]
fn real_pi_full_round_trip() {
    let r = real();

    eprintln!("1. Build stage, Kevin declines the write");
    r.set_stage(Stage::Build);
    let o = r.ask(WRITE, |kind, _| (kind == "file_edit").then(|| json!({"decision": "decline", "reason": "name it greeting.txt instead"}).to_string()));
    assert!(o.exited.is_none(), "pi exited: {:?}", o.exited);
    assert!(o.requests.iter().any(|(k, p)| k == "file_edit" && p["tool"] == "write"), "expected a write card, got {:?}", o.requests);
    assert_eq!(r.file("hello.txt"), None, "a declined write reached the disk");
    assert_eq!(r.file("greeting.txt"), None, "the agent wrote without asking after a decline");

    eprintln!("2. Build stage, Kevin approves; an undo point is taken first, as the app does");
    let folder = r.folder.path().to_path_buf();
    let mut cp = None;
    let o = r.ask(WRITE, |kind, _| {
        if kind != "file_edit" {
            return Some(json!({"decision": "decline", "reason": "not this"}).to_string());
        }
        cp = Some(crate::checkpoints::create(&folder, "demo", "write hello.txt").unwrap());
        Some(json!({"decision": "accept"}).to_string())
    });
    assert!(o.requests.iter().any(|(k, _)| k == "file_edit"), "expected a write card, got {:?}", o.requests);
    assert_eq!(r.file("hello.txt").map(|s| s.trim().to_string()), Some("hi".into()), "approved write did not land");

    eprintln!("3. Undo puts the folder back and keeps the note");
    crate::checkpoints::restore(&folder, "demo", cp.expect("no checkpoint").n).unwrap();
    assert_eq!(r.file("hello.txt"), None, "undo left the approved file behind");
    assert!(notes::read(&folder, "demo").is_ok(), "undo removed the note");

    eprintln!("4. Think stage: writes are refused without a card");
    r.set_stage(Stage::Think);
    let o = r.ask(WRITE, |_, _| Some(json!({"decision": "accept"}).to_string()));
    assert!(o.requests.iter().all(|(k, _)| k != "file_edit"), "Think stage produced a write card: {:?}", o.requests);
    assert_eq!(r.file("hello.txt"), None, "Think stage wrote a file");

    eprintln!("5. Thread mode: the agent may only read and post threads");
    let o = r.ask(
        "<pair mode=\"thread\"/>\nThe note demo is open. Use the add_thread tool once to ask Kevin one short question about the passage \"demo\". Then stop.",
        |kind, _| Some(if kind == "thread" { json!({"decision": "accept"}) } else { json!({"decision": "decline", "reason": "thread mode"}) }.to_string()),
    );
    assert!(o.requests.iter().any(|(k, _)| k == "thread"), "expected a thread request, got {:?}", o.requests);
    assert!(o.requests.iter().all(|(k, _)| k == "thread"), "thread mode asked for something else: {:?}", o.requests);

    r.agents.lock().unwrap().close(&r.key);
}
