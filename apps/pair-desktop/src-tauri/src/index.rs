//! App-level index of project folders and recently opened notes, kept in app data.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const MAX_RECENT: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RecentNote {
    pub folder: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct AppIndex {
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default)]
    pub recent: Vec<RecentNote>,
}

impl AppIndex {
    pub fn load(path: &Path) -> AppIndex {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(self).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(path, json)
    }

    pub fn add_folder(&mut self, folder: &str) {
        if !self.folders.iter().any(|f| f == folder) {
            self.folders.push(folder.to_string());
        }
    }

    pub fn remove_folder(&mut self, folder: &str) {
        self.folders.retain(|f| f != folder);
        self.recent.retain(|r| r.folder != folder);
    }

    /// Moves the note to the front of the recent list, keeping at most `MAX_RECENT`.
    pub fn touch(&mut self, folder: &str, name: &str) {
        self.add_folder(folder);
        self.recent.retain(|r| !(r.folder == folder && r.name == name));
        self.recent.insert(0, RecentNote { folder: folder.into(), name: name.into() });
        self.recent.truncate(MAX_RECENT);
    }
}

pub fn index_path(app_data: &Path) -> PathBuf {
    app_data.join("index.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn touch_dedupes_orders_and_caps() {
        let mut ix = AppIndex::default();
        for i in 0..25 {
            ix.touch("/p", &format!("n{i}"));
        }
        ix.touch("/p", "n10");
        assert_eq!(ix.recent.len(), MAX_RECENT);
        assert_eq!(ix.recent[0].name, "n10");
        assert_eq!(ix.recent.iter().filter(|r| r.name == "n10").count(), 1);
        assert_eq!(ix.folders, vec!["/p"]);
    }

    #[test]
    fn save_load_and_remove_folder() {
        let d = tempfile::tempdir().unwrap();
        let p = index_path(d.path());
        let mut ix = AppIndex::default();
        ix.touch("/a", "x");
        ix.touch("/b", "y");
        ix.save(&p).unwrap();
        let mut back = AppIndex::load(&p);
        assert_eq!(back, ix);
        back.remove_folder("/a");
        assert_eq!(back.folders, vec!["/b"]);
        assert!(back.recent.iter().all(|r| r.folder == "/b"));
        assert_eq!(AppIndex::load(&d.path().join("missing.json")), AppIndex::default());
    }
}
