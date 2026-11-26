use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use tokio::process::Command;

async fn run(program: &Path, directory: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new(program)
        .current_dir(directory)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|error| format!("Could not run {}: {error}", program.display()))
}

fn stderr_tail(stderr: &str) -> String {
    let lines: Vec<_> = stderr
        .lines()
        .rev()
        .filter(|line| !line.trim().is_empty())
        .take(8)
        .collect();
    lines
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(1600)
        .collect()
}

async fn registered_worktree(
    root: &Path,
    repo: &Path,
    reference: &str,
) -> Result<Option<PathBuf>, String> {
    let output = run(
        Path::new("git"),
        repo,
        &["worktree", "list", "--porcelain", "-z"],
    )
    .await?;
    if !output.status.success() {
        return Err(format!(
            "Could not list worktrees in {}.\n{}",
            repo.display(),
            stderr_tail(&String::from_utf8_lossy(&output.stderr))
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    for entry in stdout.split("\0\0") {
        let mut fields = entry.split('\0');
        let Some(path) = fields
            .next()
            .and_then(|field| field.strip_prefix("worktree "))
        else {
            continue;
        };
        if !fields.any(|field| field.strip_prefix("branch ") == Some(reference)) {
            continue;
        }
        if let Ok(path) = Path::new(path).canonicalize()
            && path != repo
            && path.starts_with(root)
            && path.is_dir()
        {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

pub async fn prepare(folder: &Path, branch: &str) -> Result<String, String> {
    let root = folder.canonicalize().map_err(|error| error.to_string())?;
    let reference = format!("refs/heads/{branch}");
    if branch.is_empty()
        || branch.starts_with('-')
        || branch == "HEAD"
        || !run(Path::new("git"), &root, &["check-ref-format", &reference])
            .await?
            .status
            .success()
    {
        return Err("Enter a Git branch name, such as feature/my-change.".into());
    }

    let script = root.join("clone");
    let repo = root.join("signal-lift-dev");
    if !script.is_file() || !repo.is_dir() {
        return Err(
            "Choose the V1 folder containing clone and the signal-lift-dev checkout.".into(),
        );
    }
    let repo = repo.canonicalize().map_err(|error| error.to_string())?;
    if let Some(path) = registered_worktree(&root, &repo, &reference).await? {
        return Ok(path.to_string_lossy().into_owned());
    }

    let output = run(&script, &root, &[branch]).await?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let detail = stderr_tail(&stderr);
        if let Ok(Some(path)) = registered_worktree(&root, &repo, &reference).await {
            return Err(format!(
                "The worktree exists at {}. Finish setup before opening it.\n{detail}",
                path.display(),
            ));
        }
        return Err(format!(
            "V1's clone script did not finish ({}).\n{detail}",
            output.status
        ));
    }
    let stdout = std::str::from_utf8(&output.stdout)
        .map_err(|_| "The clone script returned an invalid worktree path.")?;
    let path = Path::new(stdout.trim_end_matches(['\r', '\n']));
    let invalid_path = "The clone script did not return the path of the new worktree.";
    if !path.is_absolute() {
        return Err(invalid_path.into());
    }
    let path = path.canonicalize().map_err(|_| invalid_path)?;
    if registered_worktree(&root, &repo, &reference)
        .await?
        .as_deref()
        != Some(path.as_path())
    {
        return Err(invalid_path.into());
    }
    if stderr
        .lines()
        .any(|line| line.starts_with("warning: survey runtime install failed"))
    {
        return Err(format!(
            "The worktree was created at {}. The SurveyJS runtime setup failed. Finish setup there with uv run invoke dev.survey-runtime, then open the branch again.",
            path.display(),
        ));
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn invokes_clone_from_v1_and_reuses_the_registered_branch() {
        let fixture = tempfile::tempdir().unwrap();
        let root = fixture.path().join("V1 with spaces");
        let repo = root.join("signal-lift-dev");
        fs::create_dir_all(&repo).unwrap();
        let git = |args: &[&str]| {
            let output = std::process::Command::new("git")
                .current_dir(&repo)
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        git(&["init", "-q"]);
        git(&[
            "-c",
            "user.name=Pair",
            "-c",
            "user.email=pair@example.test",
            "commit",
            "--allow-empty",
            "-qm",
            "base",
        ]);

        let script = root.join("clone");
        fs::write(
            &script,
            r#"#!/bin/sh
set -eu
printf 'called\n' >> calls
dir="$PWD/worktree ${1##*/} with spaces"
git -C signal-lift-dev worktree add -q -b "$1" "$dir"
if [ "$1" = "feature/fails" ]; then
  printf 'fixture dependency install failed\n' >&2
  exit 1
fi
printf '%s\n' "$dir"
"#,
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();

        tauri::async_runtime::block_on(async {
            assert!(prepare(&root, "--no-deps").await.is_err());
            let first = prepare(&root, "feature/example").await.unwrap();
            let second = prepare(&root, "feature/example").await.unwrap();
            assert_eq!(first, second);
            assert_eq!(
                Path::new(&first),
                root.join("worktree example with spaces")
                    .canonicalize()
                    .unwrap()
            );
            assert_eq!(fs::read_to_string(root.join("calls")).unwrap(), "called\n");
            let failure = prepare(&root, "feature/fails").await.unwrap_err();
            assert!(failure.contains("Finish setup before opening it."));
            assert!(failure.contains("fixture dependency install failed"));
        });
    }
}
