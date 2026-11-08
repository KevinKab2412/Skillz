//! App-wide settings in `<app data>/settings.json`. Credentials are never stored here; they
//! stay in Pi's own auth file.

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    /// Thinks-with-you starts on for new notes.
    pub thinks_with_you: bool,
    /// "normal" (about 2 s pause) or "slow" (about 4 s).
    pub pace: String,
    /// "system", "light" or "dark".
    pub appearance: String,
    /// "s", "m" or "l".
    pub text_size: String,
    pub accent: String,
    /// Absolute path to `pi`; empty means "ask the login shell".
    pub pi_path: Option<String>,
    pub default_model: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            thinks_with_you: true,
            pace: "normal".into(),
            appearance: "system".into(),
            text_size: "m".into(),
            accent: "#d2553a".into(),
            pi_path: None,
            default_model: None,
        }
    }
}

pub fn read(path: &Path) -> Settings {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn write(path: &Path, s: &Settings) -> std::io::Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(s)?)
}

fn file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    file(app).map(|f| read(&f)).unwrap_or_default()
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    load(&app)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let f = file(&app).ok_or("no app data folder")?;
    write(&f, &settings).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_partial_files_fall_back_to_defaults() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("settings.json");
        assert_eq!(read(&p), Settings::default());
        std::fs::write(&p, r#"{"pace":"slow"}"#).unwrap();
        let s = read(&p);
        assert_eq!(s.pace, "slow");
        assert!(s.thinks_with_you);
        let mut s2 = s.clone();
        s2.pi_path = Some("/opt/pi".into());
        write(&p, &s2).unwrap();
        assert_eq!(read(&p), s2);
    }
}
