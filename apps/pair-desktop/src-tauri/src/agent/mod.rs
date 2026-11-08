//! Agent sessions: one runtime process per note, started on first use and stopped when idle.

pub mod provider;
pub mod rpc;
pub mod scheduler;

use provider::{AgentProcess, EventSink, ProcessEvent, Provider, StartSpec};
use scheduler::{NoteKey, Scheduler, Task};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

pub const MAX_RUNNING: usize = 3;
pub const IDLE_STOP: Duration = Duration::from_secs(10 * 60);

/// What the UI receives for a note: Pi's own records, plus pair's lifecycle records
/// (`pair_queued`, `pair_started`, `pair_settled`, `pair_exited`, `pair_error`).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct NoteEvent {
    pub key: NoteKey,
    pub record: Value,
}

pub type Emit = Arc<dyn Fn(NoteEvent) + Send + Sync>;

pub fn note_key(folder: &str, name: &str) -> NoteKey {
    format!("{folder}::{name}")
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AskOutcome {
    Started,
    Queued,
}

struct Live {
    process: Box<dyn AgentProcess>,
    last_active: Instant,
    /// Which spawn this is; events from an older process of the same note are ignored.
    generation: u64,
}

pub struct Agents {
    provider: Box<dyn Provider>,
    emit: Emit,
    specs: HashMap<NoteKey, StartSpec>,
    live: HashMap<NoteKey, Live>,
    sched: Scheduler,
    running_file: PathBuf,
    me: Weak<Mutex<Agents>>,
    next_id: u64,
}

impl Agents {
    pub fn new(provider: Box<dyn Provider>, emit: Emit, running_file: PathBuf) -> Arc<Mutex<Agents>> {
        Arc::new_cyclic(|me| {
            Mutex::new(Agents {
                provider,
                emit,
                specs: HashMap::new(),
                live: HashMap::new(),
                sched: Scheduler::new(MAX_RUNNING),
                running_file,
                me: me.clone(),
                next_id: 0,
            })
        })
    }

    /// Queues or starts a task for a note. The spec is remembered so the process can be
    /// (re)started lazily.
    pub fn ask(&mut self, key: &str, spec: StartSpec, message: String) -> Result<AskOutcome, String> {
        self.specs.insert(key.to_string(), spec);
        match self.sched.submit(Task { key: key.to_string(), message }) {
            Some(task) => {
                self.dispatch(task)?;
                Ok(AskOutcome::Started)
            }
            None => {
                self.emit(key, json!({"type": "pair_queued", "queued": self.sched.queued(key)}));
                Ok(AskOutcome::Queued)
            }
        }
    }

    /// Stop: drops queued asks for the note and aborts the running one.
    pub fn stop(&mut self, key: &str) -> Result<(), String> {
        self.sched.cancel_queued(key);
        if self.sched.is_running(key) {
            self.send(key, json!({"type": "abort"}))?;
        }
        Ok(())
    }

    /// Sends an arbitrary record to a live process (extension UI responses, model changes).
    pub fn send(&mut self, key: &str, mut cmd: Value) -> Result<(), String> {
        if cmd.get("id").is_none() && cmd["type"] != "extension_ui_response" {
            self.next_id += 1;
            cmd["id"] = json!(format!("pair-{}", self.next_id));
        }
        let live = self.live.get_mut(key).ok_or("no agent running for this note")?;
        live.last_active = Instant::now();
        live.process.send(&cmd)
    }

    /// The note closed: stop its process and forget queued work.
    pub fn close(&mut self, key: &str) {
        self.sched.cancel_queued(key);
        if let Some(mut l) = self.live.remove(key) {
            l.process.stop();
        }
        if self.sched.is_running(key) {
            self.finish(key);
        }
    }

    /// Stops processes that have no running task and have been quiet longer than `idle`.
    pub fn reap_idle(&mut self, now: Instant, idle: Duration) -> Vec<NoteKey> {
        let stale: Vec<NoteKey> = self
            .live
            .iter()
            .filter(|(k, l)| !self.sched.is_running(k) && now.duration_since(l.last_active) >= idle)
            .map(|(k, _)| k.clone())
            .collect();
        for k in &stale {
            if let Some(mut l) = self.live.remove(k) {
                l.process.stop();
            }
        }
        stale
    }

    #[cfg(test)]
    pub fn is_live(&self, key: &str) -> bool {
        self.live.contains_key(key)
    }

    #[cfg(test)]
    pub fn is_running(&self, key: &str) -> bool {
        self.sched.is_running(key)
    }


    fn dispatch(&mut self, task: Task) -> Result<(), String> {
        if let Err(e) = self.ensure_live(&task.key) {
            self.emit(&task.key, json!({"type": "pair_error", "error": e}));
            self.finish(&task.key);
            return Err(e);
        }
        let mut running = self.read_running();
        running.insert(task.key.clone(), task.message.clone());
        self.write_running(&running);
        self.emit(&task.key, json!({"type": "pair_started", "message": task.message}));
        let cmd = json!({"type": "prompt", "message": task.message});
        if let Err(e) = self.send(&task.key, cmd) {
            self.emit(&task.key, json!({"type": "pair_error", "error": e}));
            self.finish(&task.key);
            return Err(e);
        }
        Ok(())
    }

    fn ensure_live(&mut self, key: &str) -> Result<(), String> {
        if self.live.contains_key(key) {
            return Ok(());
        }
        let spec = self.specs.get(key).ok_or("no start spec for note")?.clone();
        let me = self.me.clone();
        let k = key.to_string();
        self.next_id += 1;
        let generation = self.next_id;
        let sink: EventSink = Arc::new(move |ev| {
            if let Some(agents) = me.upgrade() {
                agents.lock().unwrap().on_event(&k, generation, ev);
            }
        });
        let process = self.provider.start(&spec, sink)?;
        self.live.insert(key.to_string(), Live { process, last_active: Instant::now(), generation });
        Ok(())
    }

    fn on_event(&mut self, key: &str, generation: u64, ev: ProcessEvent) {
        match self.live.get_mut(key) {
            Some(l) if l.generation == generation => l.last_active = Instant::now(),
            // A process that was closed or reaped (possibly replaced by a new one): ignore it.
            _ => return,
        }
        match ev {
            ProcessEvent::Record(rec) => {
                let settled = rec["type"] == "agent_settled"
                    || (rec["type"] == "response"
                        && rec["command"] == "prompt"
                        && (rec["success"] == false || rec["data"]["disposition"] == "handled"));
                self.emit(key, rec);
                if settled && self.sched.is_running(key) {
                    self.finish(key);
                }
            }
            ProcessEvent::Exited { code, stderr_tail } => {
                self.live.remove(key);
                let was_running = self.sched.is_running(key);
                self.emit(key, json!({"type": "pair_exited", "code": code, "stderr": stderr_tail, "during_task": was_running}));
                if was_running {
                    self.sched.cancel_queued(key);
                    self.finish(key);
                }
            }
        }
    }

    fn finish(&mut self, key: &str) {
        let mut running = self.read_running();
        running.remove(key);
        self.write_running(&running);
        self.emit(key, json!({"type": "pair_settled"}));
        for next in self.sched.settled(key) {
            let _ = self.dispatch(next);
        }
    }

    fn emit(&self, key: &str, record: Value) {
        (self.emit)(NoteEvent { key: key.to_string(), record });
    }

    fn read_running(&self) -> HashMap<NoteKey, String> {
        std::fs::read_to_string(&self.running_file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn write_running(&self, map: &HashMap<NoteKey, String>) {
        if let Some(p) = self.running_file.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&self.running_file, serde_json::to_vec(map).unwrap_or_default());
    }
}

/// Tasks that were running when the app last quit. Reading clears them.
pub fn take_interrupted(running_file: &std::path::Path) -> HashMap<NoteKey, String> {
    let map = std::fs::read_to_string(running_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let _ = std::fs::remove_file(running_file);
    map
}

#[cfg(test)]
mod tests;
