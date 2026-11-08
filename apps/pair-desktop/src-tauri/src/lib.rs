mod index;
mod notes;

use index::{index_path, AppIndex};
use notes::{Note, NoteSummary, Sidecar};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Clone, Serialize)]
struct NoteChanged {
    folder: String,
    name: String,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(err)
}

fn folder_path(folder: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(folder);
    if !p.is_absolute() || !p.is_dir() {
        return Err(format!("not a folder: {folder}"));
    }
    Ok(p)
}

#[tauri::command]
fn load_index(app: AppHandle) -> Result<AppIndex, String> {
    Ok(AppIndex::load(&index_path(&app_data(&app)?)))
}

#[tauri::command]
fn add_folder(app: AppHandle, folder: String) -> Result<AppIndex, String> {
    folder_path(&folder)?;
    let path = index_path(&app_data(&app)?);
    let mut ix = AppIndex::load(&path);
    ix.add_folder(&folder);
    ix.save(&path).map_err(err)?;
    Ok(ix)
}

#[tauri::command]
fn remove_folder(app: AppHandle, folder: String) -> Result<AppIndex, String> {
    let path = index_path(&app_data(&app)?);
    let mut ix = AppIndex::load(&path);
    ix.remove_folder(&folder);
    ix.save(&path).map_err(err)?;
    Ok(ix)
}

#[tauri::command]
fn list_notes(folder: String) -> Result<Vec<NoteSummary>, String> {
    notes::list(&folder_path(&folder)?).map_err(err)
}

#[tauri::command]
fn create_note(app: AppHandle, folder: String, name: String) -> Result<Note, String> {
    let note = notes::create(&folder_path(&folder)?, &name).map_err(err)?;
    touch(&app, &folder, &name)?;
    Ok(note)
}

#[tauri::command]
fn open_note(app: AppHandle, folder: String, name: String) -> Result<Note, String> {
    let note = notes::read(&folder_path(&folder)?, &name).map_err(err)?;
    touch(&app, &folder, &name)?;
    Ok(note)
}

#[tauri::command]
fn save_note(folder: String, note: Note) -> Result<(), String> {
    notes::save(&folder_path(&folder)?, &note).map_err(err)
}

#[tauri::command]
fn save_sidecar(folder: String, name: String, sidecar: Sidecar) -> Result<(), String> {
    notes::save_sidecar(&folder_path(&folder)?, &name, &sidecar).map_err(err)
}

/// Watches `<folder>/.pair/notes` and emits `note-changed` for each touched note. The UI
/// compares the new text with what it last saved, so the app's own writes are ignored there.
#[tauri::command]
fn watch_folder(app: AppHandle, state: State<AppState>, folder: String) -> Result<(), String> {
    let root = folder_path(&folder)?;
    let dir = notes::notes_dir(&root);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let mut watchers = state.watchers.lock().map_err(err)?;
    if watchers.contains_key(&folder) {
        return Ok(());
    }
    let app2 = app.clone();
    let folder2 = folder.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        for path in event.paths {
            if let Some(name) = note_name(&path) {
                let _ = app2.emit("note-changed", NoteChanged { folder: folder2.clone(), name });
            }
        }
    })
    .map_err(err)?;
    watcher.watch(&dir, RecursiveMode::NonRecursive).map_err(err)?;
    watchers.insert(folder, watcher);
    Ok(())
}

fn note_name(path: &Path) -> Option<String> {
    let file = path.file_name()?.to_str()?;
    let name = file.strip_suffix(".md").or_else(|| file.strip_suffix(".pair.json"))?;
    Some(name.to_string())
}

fn touch(app: &AppHandle, folder: &str, name: &str) -> Result<(), String> {
    let path = index_path(&app_data(app)?);
    let mut ix = AppIndex::load(&path);
    ix.touch(folder, name);
    ix.save(&path).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_index,
            add_folder,
            remove_folder,
            list_notes,
            create_note,
            open_note,
            save_note,
            save_sidecar,
            watch_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::note_name;
    use std::path::Path;

    #[test]
    fn note_name_maps_both_files_and_ignores_temp_files() {
        assert_eq!(note_name(Path::new("/x/.pair/notes/a.md")).as_deref(), Some("a"));
        assert_eq!(note_name(Path::new("/x/.pair/notes/a.pair.json")).as_deref(), Some("a"));
        assert_eq!(note_name(Path::new("/x/.pair/notes/a.md.tmp")), None);
    }
}
