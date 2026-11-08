#!/usr/bin/env bash
# Local checks for the pair desktop app: Rust tests + clippy, svelte-check, vitest, extension tests.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/Library/Application Support/reflex/bun/bin:$HOME/.bun/bin:$PATH"
(cd src-tauri && cargo test --quiet && cargo clippy --quiet --all-targets -- -D warnings)
bun run check
if [ -f vitest.config.ts ]; then bun x vitest run; fi
if [ -d pi-ext ]; then (cd pi-ext && bun test); fi
echo "all checks passed"
