//! Tauri commands for the agent runtime. Events reach the UI as `agent-event` ({key, record}).

use crate::agent::provider::{PiProvider, StartSpec};
use crate::agent::{note_key, Agents, AskOutcome, Emit, IDLE_STOP};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AgentState {
    agents: OnceLock<Arc<Mutex<Agents>>>,
}

impl AgentState {
    pub fn new() -> Self {
        AgentState { agents: OnceLock::new() }
    }
}

/// Where Pi and pair's extension live, and whether the installed Pi matches the tested one.
#[derive(Debug, Clone, Serialize)]
pub struct PiStatus {
    pub path: Option<String>,
    pub version: Option<String>,
    pub expected: String,
    pub extension: String,
}

fn ext_dir(app: &AppHandle) -> PathBuf {
    // Bundled builds ship pi-ext as a resource; dev builds read it from the source tree.
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("pi-ext");
        if bundled.join("pair-ext.ts").exists() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../pi-ext")
}

/// Apps opened from Finder, the Dock or Shortcuts start with launchd's minimal PATH, and many
/// shells only extend PATH in their interactive rc file (`~/.zshrc`). Adopt the PATH of an
/// interactive login shell once at startup, so `pi`, the Node it runs on, and the tools it
/// calls resolve the same way they do in Terminal.
pub fn adopt_shell_path() {
    if let Some(path) = shell_path() {
        // Runs before any other thread starts.
        unsafe { std::env::set_var("PATH", path) };
    }
}

const PATH_START: &str = "__PAIR_PATH_START__";
const PATH_END: &str = "__PAIR_PATH_END__";

fn shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let script = format!("printf '%s%s%s' '{PATH_START}' \"$PATH\" '{PATH_END}'");
    let out = Command::new(shell).args(["-ilc", &script]).stdin(std::process::Stdio::null()).output().ok()?;
    parse_shell_path(&String::from_utf8_lossy(&out.stdout))
}

/// The PATH between the markers; rc files may print banners around it.
fn parse_shell_path(stdout: &str) -> Option<String> {
    let start = stdout.rfind(PATH_START)? + PATH_START.len();
    let len = stdout[start..].find(PATH_END)?;
    let path = stdout[start..start + len].trim();
    (!path.is_empty()).then(|| path.to_string())
}

/// The Pi to run: the path set in Settings, else the first `pi` on PATH.
pub(crate) fn resolve_pi(override_path: Option<String>) -> Option<String> {
    if let Some(p) = override_path.filter(|p| !p.trim().is_empty()) {
        return Some(p);
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join("pi")).find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned())
}

fn pi_version(path: &str) -> Option<String> {
    let out = Command::new(path).arg("--version").output().ok()?;
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!v.is_empty()).then_some(v)
}

pub fn status(app: &AppHandle, override_path: Option<String>) -> PiStatus {
    let dir = ext_dir(app);
    let expected = std::fs::read_to_string(dir.join("PI_VERSION")).unwrap_or_default().trim().to_string();
    let path = resolve_pi(override_path);
    let version = path.as_deref().and_then(pi_version);
    PiStatus { path, version, expected, extension: dir.join("pair-ext.ts").to_string_lossy().into() }
}

fn agents(app: &AppHandle, state: &AgentState) -> Result<Arc<Mutex<Agents>>, String> {
    if let Some(a) = state.agents.get() {
        return Ok(a.clone());
    }
    let s = status(app, crate::settings::load(app).pi_path);
    let program = s.path.clone().ok_or("pi is not installed or not on your shell PATH")?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let provider = PiProvider {
        program: program.into(),
        prefix_args: vec![],
        extension: s.extension.into(),
        session_dir: data.join("sessions"),
    };
    let handle = app.clone();
    let emit: Emit = Arc::new(move |ev| {
        let _ = handle.emit("agent-event", ev);
    });
    let a = Agents::new(Box::new(provider), emit, data.join("running.json"));
    let reaper = Arc::downgrade(&a);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let Some(a) = reaper.upgrade() else { break };
        a.lock().unwrap().reap_idle(Instant::now(), IDLE_STOP);
    });
    Ok(state.agents.get_or_init(|| a).clone())
}

#[tauri::command]
pub fn pi_status(app: AppHandle) -> PiStatus {
    status(&app, crate::settings::load(&app).pi_path)
}

#[tauri::command]
pub fn agent_ask(
    app: AppHandle,
    state: State<AgentState>,
    folder: String,
    name: String,
    session_id: String,
    model: Option<String>,
    message: String,
) -> Result<AskOutcome, String> {
    let a = agents(&app, &state)?;
    let spec = StartSpec { cwd: folder.clone().into(), session_id, model, note: name.clone() };
    let mut guard = a.lock().map_err(|e| e.to_string())?;
    guard.ask(&note_key(&folder, &name), spec, message)
}

#[tauri::command]
pub fn agent_stop(app: AppHandle, state: State<AgentState>, folder: String, name: String) -> Result<(), String> {
    agents(&app, &state)?.lock().map_err(|e| e.to_string())?.stop(&note_key(&folder, &name))
}

/// Sends a raw record to the note's Pi: extension UI responses, `set_model`, `get_state`…
#[tauri::command]
pub fn agent_send(app: AppHandle, state: State<AgentState>, folder: String, name: String, record: Value) -> Result<(), String> {
    agents(&app, &state)?.lock().map_err(|e| e.to_string())?.send(&note_key(&folder, &name), record)
}

#[tauri::command]
pub fn agent_close(state: State<AgentState>, folder: String, name: String) -> Result<(), String> {
    if let Some(a) = state.agents.get() {
        a.lock().map_err(|e| e.to_string())?.close(&note_key(&folder, &name));
    }
    Ok(())
}

#[tauri::command]
pub fn agent_interrupted(app: AppHandle) -> Result<HashMap<String, String>, String> {
    // Works before any agent has started, since it only reads the running file.
    let file = app.path().app_data_dir().map_err(|e| e.to_string())?.join("running.json");
    Ok(crate::agent::take_interrupted(&file))
}

/// Lists models Pi can use with the user's logins (ChatGPT and OpenRouter in v1).
#[tauri::command]
pub fn pi_models(app: AppHandle) -> Result<Vec<String>, String> {
    let s = status(&app, crate::settings::load(&app).pi_path);
    let path = s.path.ok_or("pi not found")?;
    let out = Command::new(path).arg("--list-models").output().map_err(|e| e.to_string())?;
    Ok(parse_models(&String::from_utf8_lossy(&out.stdout)))
}

/// `pi --list-models` prints a table: provider, model, …; keep ChatGPT and OpenRouter rows.
pub fn parse_models(table: &str) -> Vec<String> {
    table
        .lines()
        .filter_map(|l| {
            let mut cols = l.split_whitespace();
            let provider = cols.next()?;
            let model = cols.next()?;
            matches!(provider, "openai-codex" | "openrouter").then(|| format!("{provider}/{model}"))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_models, parse_shell_path};

    #[test]
    fn reads_the_path_between_markers_despite_rc_noise() {
        let out = "Welcome back!\n__PAIR_PATH_START__/usr/bin:/Users/k/.local/bin__PAIR_PATH_END__\n";
        assert_eq!(parse_shell_path(out).as_deref(), Some("/usr/bin:/Users/k/.local/bin"));
        assert_eq!(parse_shell_path("no markers"), None);
        assert_eq!(parse_shell_path("__PAIR_PATH_START____PAIR_PATH_END__"), None);
    }

    #[test]
    fn keeps_only_v1_providers() {
        let t = "provider      model            context\nopenai-codex  gpt-5.5          400K\nanthropic     claude-x         200K\nopenrouter    qwen/qwen3-coder 262K\n";
        assert_eq!(parse_models(t), vec!["openai-codex/gpt-5.5", "openrouter/qwen/qwen3-coder"]);
    }
}
