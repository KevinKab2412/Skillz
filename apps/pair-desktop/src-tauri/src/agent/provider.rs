//! The provider seam: the app talks to an agent runtime only through these traits.
//! Pi over RPC is the first implementation; another runtime can be added behind the same seam.

use super::rpc::{encode, RecordSplitter};
use serde_json::Value;
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq)]
pub enum ProcessEvent {
    Record(Value),
    /// The process ended. `stderr_tail` holds its last diagnostic lines.
    Exited { code: Option<i32>, stderr_tail: String },
}

pub type EventSink = Arc<dyn Fn(ProcessEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct StartSpec {
    pub cwd: PathBuf,
    pub session_id: String,
    pub model: Option<String>,
}

pub trait AgentProcess: Send {
    fn send(&mut self, cmd: &Value) -> Result<(), String>;
    /// Requests an orderly shutdown (closes stdin for Pi).
    fn stop(&mut self);
}

pub trait Provider: Send + Sync {
    fn start(&self, spec: &StartSpec, sink: EventSink) -> Result<Box<dyn AgentProcess>, String>;
}

/// Spawns `pi --mode rpc` with only pair's extension loaded.
pub struct PiProvider {
    pub program: PathBuf,
    /// Arguments placed before pair's own (used by tests to run a fake Pi through an interpreter).
    pub prefix_args: Vec<String>,
    pub extension: PathBuf,
    pub session_dir: PathBuf,
}

impl PiProvider {
    pub fn args(&self, spec: &StartSpec) -> Vec<String> {
        let mut a = self.prefix_args.clone();
        a.extend(
            [
                "--mode", "rpc", "-ne", "-ns", "-e",
                &self.extension.to_string_lossy(),
                "--session-dir", &self.session_dir.to_string_lossy(),
                "--session-id", &spec.session_id,
            ]
            .map(String::from),
        );
        if let Some(m) = &spec.model {
            a.push("--model".into());
            a.push(m.clone());
        }
        a
    }
}

impl Provider for PiProvider {
    fn start(&self, spec: &StartSpec, sink: EventSink) -> Result<Box<dyn AgentProcess>, String> {
        std::fs::create_dir_all(&self.session_dir).map_err(|e| e.to_string())?;
        let mut child = Command::new(&self.program)
            .args(self.args(spec))
            .current_dir(&spec.cwd)
            .env("PAIR_DESKTOP", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("could not start pi ({}): {e}", self.program.display()))?;
        let stdin = child.stdin.take();
        let mut stdout = child.stdout.take().expect("piped stdout");
        let mut stderr = child.stderr.take().expect("piped stderr");

        let tail: Arc<Mutex<VecDeque<String>>> = Arc::default();
        let tail_w = tail.clone();
        let err_thread = std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = stderr.read_to_string(&mut buf);
            let mut t = tail_w.lock().unwrap();
            for line in buf.lines() {
                t.push_back(line.to_string());
                if t.len() > 20 {
                    t.pop_front();
                }
            }
        });

        let child = Arc::new(Mutex::new(child));
        let child_r = child.clone();
        std::thread::spawn(move || {
            let mut splitter = RecordSplitter::default();
            let mut chunk = [0u8; 16 * 1024];
            loop {
                match stdout.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        for rec in splitter.push(&chunk[..n]) {
                            match rec {
                                Ok(v) => sink(ProcessEvent::Record(v)),
                                Err(e) => eprintln!("pair: {e}"),
                            }
                        }
                    }
                }
            }
            let _ = err_thread.join();
            let code = child_r.lock().unwrap().wait().ok().and_then(|s| s.code());
            let stderr_tail = tail.lock().unwrap().iter().cloned().collect::<Vec<_>>().join("\n");
            sink(ProcessEvent::Exited { code, stderr_tail });
        });

        Ok(Box::new(PiProcess { stdin, child }))
    }
}

struct PiProcess {
    stdin: Option<ChildStdin>,
    child: Arc<Mutex<Child>>,
}

impl AgentProcess for PiProcess {
    fn send(&mut self, cmd: &Value) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("agent process is stopping")?;
        stdin.write_all(&encode(cmd)).and_then(|_| stdin.flush()).map_err(|e| e.to_string())
    }

    fn stop(&mut self) {
        self.stdin.take();
    }
}

impl Drop for PiProcess {
    fn drop(&mut self) {
        self.stdin.take();
        // Give Pi a moment to shut down after stdin closes, then make sure it is gone.
        let child = self.child.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if let Ok(mut c) = child.lock()
                && matches!(c.try_wait(), Ok(None))
            {
                let _ = c.kill();
            }
        });
    }
}
