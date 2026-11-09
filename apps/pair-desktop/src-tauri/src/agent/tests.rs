//! Runs the agent manager against a fake Pi that speaks the same JSONL protocol.

use super::provider::{PiProvider, StartSpec};
use super::*;
use std::sync::mpsc;

const FAKE_PI: &str = r#"
import json, sys
print("fake pi args: " + " ".join(sys.argv[1:]), file=sys.stderr, flush=True)
def out(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()
held = None
for line in sys.stdin:
    cmd = json.loads(line)
    t = cmd.get("type")
    if t == "prompt":
        msg = cmd["message"]
        out({"id": cmd.get("id"), "type": "response", "command": "prompt", "success": True, "data": {"disposition": "started"}})
        if msg == "crash":
            print("boom: provider exploded", file=sys.stderr, flush=True)
            sys.exit(3)
        if msg == "hold":
            held = cmd
            continue
        out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "echo:" + msg + " "}})
        out({"type": "agent_settled"})
    elif t == "abort":
        out({"id": cmd.get("id"), "type": "response", "command": "abort", "success": True})
        if held:
            held = None
            out({"type": "agent_settled"})
"#;

struct Rig {
    agents: Arc<Mutex<Agents>>,
    rx: mpsc::Receiver<NoteEvent>,
    dir: tempfile::TempDir,
}

fn rig() -> Rig {
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("fake_pi.py");
    std::fs::write(&script, FAKE_PI).unwrap();
    let provider = PiProvider {
        program: "python3".into(),
        prefix_args: vec!["-u".into(), script.to_string_lossy().into()],
        extension: dir.path().join("pair-ext.ts"),
        session_dir: dir.path().join("sessions"),
    };
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let emit: Emit = Arc::new(move |e| {
        let _ = tx.lock().unwrap().send(e);
    });
    let agents = Agents::new(Box::new(provider), emit, dir.path().join("running.json"));
    Rig { agents, rx, dir }
}

fn spec(dir: &tempfile::TempDir) -> StartSpec {
    StartSpec { cwd: dir.path().to_path_buf(), session_id: "s1".into(), model: Some("openai-codex/gpt-5".into()), note: "n".into() }
}

impl Rig {
    /// Collects events for `key` until one of type `until` arrives.
    fn until(&self, key: &str, until: &str) -> Vec<Value> {
        let mut seen = vec![];
        loop {
            let e = self.rx.recv_timeout(Duration::from_secs(10)).unwrap_or_else(|_| panic!("timed out waiting for {until} on {key}; saw {seen:?}"));
            if e.key != key {
                continue;
            }
            let done = e.record["type"] == until;
            seen.push(e.record);
            if done {
                return seen;
            }
        }
    }
}

#[test]
fn ask_starts_pi_streams_events_and_settles() {
    let r = rig();
    let out = r.agents.lock().unwrap().ask("a", spec(&r.dir), "hi".into()).unwrap();
    assert_eq!(out, AskOutcome::Started);
    let seen = r.until("a", "pair_settled");
    let delta = seen.iter().find(|v| v["type"] == "message_update").unwrap();
    assert_eq!(delta["assistantMessageEvent"]["delta"], "echo:hi\u{2028}");
    assert!(seen.iter().any(|v| v["type"] == "agent_settled"));
    let a = r.agents.lock().unwrap();
    assert!(a.is_live("a") && !a.is_running("a"));
}

#[test]
fn pi_args_load_only_pairs_extension_and_the_note_session() {
    let p = PiProvider { program: "pi".into(), prefix_args: vec![], extension: "/x/pair-ext.ts".into(), session_dir: "/d/sessions".into() };
    let args = p.args(&StartSpec { cwd: "/p".into(), session_id: "abc".into(), model: None, note: "n".into() }).join(" ");
    assert_eq!(args, "--mode rpc -ne -ns -e /x/pair-ext.ts --session-dir /d/sessions --session-id abc");
}

#[test]
fn second_ask_on_a_busy_note_queues_and_runs_after() {
    let r = rig();
    {
        let mut a = r.agents.lock().unwrap();
        assert_eq!(a.ask("a", spec(&r.dir), "hold".into()).unwrap(), AskOutcome::Started);
        assert_eq!(a.ask("a", spec(&r.dir), "next".into()).unwrap(), AskOutcome::Queued);
    }
    r.until("a", "pair_queued");
    r.agents.lock().unwrap().send("a", json!({"type": "abort"})).unwrap();
    r.until("a", "pair_settled");
    let seen = r.until("a", "pair_settled");
    assert!(seen.iter().any(|v| v["assistantMessageEvent"]["delta"] == "echo:next\u{2028}"));
}

#[test]
fn stop_drops_queued_asks_and_aborts() {
    let r = rig();
    {
        let mut a = r.agents.lock().unwrap();
        a.ask("a", spec(&r.dir), "hold".into()).unwrap();
        a.ask("a", spec(&r.dir), "never".into()).unwrap();
        a.stop("a").unwrap();
    }
    r.until("a", "pair_settled");
    std::thread::sleep(Duration::from_millis(300));
    while let Ok(e) = r.rx.try_recv() {
        assert_ne!(e.record["type"], "pair_started", "queued ask should have been dropped");
    }
}

#[test]
fn crash_mid_task_reports_stderr_and_frees_the_slot() {
    let r = rig();
    r.agents.lock().unwrap().ask("a", spec(&r.dir), "crash".into()).unwrap();
    let seen = r.until("a", "pair_settled");
    let exit = seen.iter().find(|v| v["type"] == "pair_exited").unwrap();
    assert_eq!(exit["code"], 3);
    assert_eq!(exit["during_task"], true);
    assert!(exit["stderr"].as_str().unwrap().contains("boom: provider exploded"));
    let a = r.agents.lock().unwrap();
    assert!(!a.is_live("a") && !a.is_running("a"));
}

#[test]
fn a_task_cut_off_by_quitting_is_reported_once_as_interrupted() {
    let r = rig();
    r.agents.lock().unwrap().ask("a", spec(&r.dir), "hold".into()).unwrap();
    r.until("a", "response");
    // Simulate the app quitting: the next launch reads the same running file.
    let got = take_interrupted(&r.dir.path().join("running.json"));
    assert_eq!(got.get("a").map(String::as_str), Some("hold"));
    assert!(take_interrupted(&r.dir.path().join("running.json")).is_empty());
}

#[test]
fn idle_processes_are_stopped_but_busy_ones_are_kept() {
    let r = rig();
    r.agents.lock().unwrap().ask("idle", spec(&r.dir), "hi".into()).unwrap();
    r.until("idle", "pair_settled");
    r.agents.lock().unwrap().ask("busy", spec(&r.dir), "hold".into()).unwrap();
    r.until("busy", "response");
    let later = Instant::now() + IDLE_STOP;
    let stopped = r.agents.lock().unwrap().reap_idle(later, IDLE_STOP);
    assert_eq!(stopped, vec!["idle".to_string()]);
    let a = r.agents.lock().unwrap();
    assert!(!a.is_live("idle") && a.is_live("busy"));
}

#[test]
fn missing_binary_reports_an_error_and_frees_the_slot() {
    let dir = tempfile::tempdir().unwrap();
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let emit: Emit = Arc::new(move |e| {
        let _ = tx.lock().unwrap().send(e);
    });
    let provider = PiProvider { program: "/nonexistent/pi".into(), prefix_args: vec![], extension: "x".into(), session_dir: dir.path().join("s") };
    let agents = Agents::new(Box::new(provider), emit, dir.path().join("running.json"));
    let err = agents.lock().unwrap().ask("a", spec(&dir), "hi".into()).unwrap_err();
    assert!(err.contains("could not start pi"));
    let types: Vec<Value> = rx.try_iter().map(|e| e.record["type"].clone()).collect();
    assert!(types.contains(&json!("pair_error")) && types.contains(&json!("pair_settled")));
    assert!(!agents.lock().unwrap().is_running("a"));
}

#[test]
fn a_closed_process_exiting_late_does_not_disturb_its_replacement() {
    let r = rig();
    r.agents.lock().unwrap().ask("a", spec(&r.dir), "hi".into()).unwrap();
    r.until("a", "pair_settled");
    // Close, then immediately ask again: a new process starts while the old one is still exiting.
    {
        let mut a = r.agents.lock().unwrap();
        a.close("a");
        a.ask("a", spec(&r.dir), "hold".into()).unwrap();
    }
    std::thread::sleep(Duration::from_millis(800));
    let a = r.agents.lock().unwrap();
    assert!(a.is_live("a") && a.is_running("a"), "old process exit must not kill the new one");
    while let Ok(e) = r.rx.try_recv() {
        assert_ne!(e.record["type"], "pair_exited");
    }
}

#[test]
fn large_prompts_do_not_block_the_caller() {
    let r = rig();
    let big = "x".repeat(512 * 1024);
    let started = Instant::now();
    r.agents.lock().unwrap().ask("a", spec(&r.dir), big).unwrap();
    assert!(started.elapsed() < Duration::from_millis(500), "send must not wait for the pipe");
    r.until("a", "pair_settled");
}
