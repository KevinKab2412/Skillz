#!/usr/bin/env python3
"""Audit and prune the git worktrees under one directory.

    sweep.py audit  --repo <main checkout> [--root <dir>] [--keep NAME ...] [--json]
    sweep.py remove --repo <main checkout> NAME [NAME ...] [--allow-noise]

`audit` never changes anything. It classifies every worktree of --repo that lives under --root
(default: the repo's parent directory) by what removing it would lose. `remove` re-checks each
named worktree, tears down its per-worktree dev stack, and removes it; it refuses any worktree with
uncommitted changes, commits that exist on no origin branch, or running containers.

Lessons this script encodes (from the 2026-11-24 V1 sweep):
- PR state comes from one `gh pr list --head <branch> --state all` per branch; a single bulk
  `--state merged` listing silently missed merges.
- "Unpushed" means not reachable from ANY origin ref, and a commit whose patch already exists on
  the branch's origin copy (an old pre-rebase copy) is reported apart, since it loses nothing.
- A worktree's dev stack is named in `.worktree-stack.local.env` (WORKTREE_COMPOSE_PROJECT); its
  down script deletes that file, so read the project name before tearing down.
- Any running container whose compose working_dir sits inside the worktree blocks removal.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Untracked paths that are per-checkout tool state, not work. Losing them loses nothing.
NOISE_PREFIXES = ('.codex/hooks', '.codex/hooks.json')


def run(*args: str, cwd: Path | None = None, check: bool = False) -> str:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"{' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip() if result.returncode == 0 else ''


def git(path: Path, *args: str) -> str:
    return run('git', '-C', str(path), *args)


def worktrees(repo: Path, root: Path) -> list[dict]:
    items, current = [], {}
    for line in git(repo, 'worktree', 'list', '--porcelain').splitlines() + ['']:
        if not line:
            if current:
                items.append(current)
            current = {}
        elif line.startswith('worktree '):
            current['path'] = Path(line.split(' ', 1)[1])
        elif line.startswith('HEAD '):
            current['head'] = line.split(' ', 1)[1]
        elif line.startswith('branch '):
            current['branch'] = line.split(' ', 1)[1].removeprefix('refs/heads/')
        elif line == 'detached':
            current['branch'] = None
    root = root.resolve()
    return [w for w in items if w['path'].resolve().is_relative_to(root)]


def compose_project(path: Path) -> str | None:
    env = path / '.worktree-stack.local.env'
    if not env.is_file():
        return None
    for line in env.read_text().splitlines():
        if line.startswith('WORKTREE_COMPOSE_PROJECT='):
            return line.split('=', 1)[1].strip()
    return None


def running_containers() -> dict[str, str]:
    """Running container name -> its compose working_dir ('' when not compose-managed)."""
    names = run('docker', 'ps', '--format', '{{.Names}}').split()
    if not names:
        return {}
    out = run('docker', 'inspect', '-f',
              '{{.Name}}\t{{index .Config.Labels "com.docker.compose.project.working_dir"}}', *names)
    pairs = (line.split('\t', 1) for line in out.splitlines())
    return {name.lstrip('/'): wd for name, wd in pairs}


def pr_state(repo: Path, branch: str | None) -> str:
    if not branch:
        return ''
    out = run('gh', 'pr', 'list', '--head', branch, '--state', 'all', '--json',
              'number,state,isDraft', '-q',
              '.[] | "#\\(.number) \\(if .isDraft and .state == "OPEN" then "DRAFT" else .state end)"',
              cwd=repo)
    return ' '.join(out.split('\n')) if out else ''


def inspect(repo: Path, w: dict, containers: dict[str, str]) -> dict:
    path, branch, head = w['path'], w.get('branch'), w['head']
    status = git(path, 'status', '--porcelain', '-uall').splitlines()
    dirty = [line[3:] for line in status]
    work = [p for p in dirty if not p.startswith(NOISE_PREFIXES)]
    unpushed = git(path, 'rev-list', head, '--not', '--remotes=origin').split()
    rebased_copies = 0
    if unpushed and branch and git(repo, 'rev-parse', '-q', '--verify', f'origin/{branch}'):
        cherry = git(repo, 'cherry', f'origin/{branch}', head).splitlines()
        rebased_copies = sum(1 for line in cherry if line.startswith('-'))
    inside = str(path.resolve())
    running = sorted(n for n, wd in containers.items()
                     if wd and (wd == inside or wd.startswith(inside + '/')))
    on_remote = bool(branch and git(repo, 'rev-parse', '-q', '--verify', f'origin/{branch}'))
    return {
        'name': path.name, 'path': str(path), 'branch': branch, 'on_remote': on_remote,
        'uncommitted': work, 'noise': [p for p in dirty if p not in work],
        'unpushed': len(unpushed) - rebased_copies, 'rebased_copies': rebased_copies,
        'running': running, 'stack': compose_project(path),
        'last_commit': git(path, 'log', '-1', '--format=%cs', head),
    }


def classify(item: dict, keep: set[str], is_main: bool) -> str:
    if is_main or item['name'] in keep:
        return 'keep'
    if 'OPEN' in item['prs'] or 'DRAFT' in item['prs']:
        return 'keep (open PR)'
    if item['running']:
        return 'blocked: running containers'
    if item['unpushed']:
        return 'blocked: unpushed commits'
    if item['uncommitted']:
        return 'blocked: uncommitted work'
    return 'safe to remove'


def audit(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    root = Path(args.root).resolve() if args.root else repo.parent
    trees = worktrees(repo, root)
    run('git', '-C', str(repo), 'fetch', '-q', '--prune', 'origin')
    containers = running_containers()
    with ThreadPoolExecutor(max_workers=8) as pool:
        items = list(pool.map(lambda w: inspect(repo, w, containers), trees))
        prs = list(pool.map(
            lambda w: '' if w['path'].resolve() == repo else pr_state(repo, w.get('branch')), trees))
    for item, pr in zip(items, prs):
        item['prs'] = pr
        item['verdict'] = classify(item, set(args.keep), Path(item['path']) == repo)
    items.sort(key=lambda i: (i['verdict'], i['name']))
    if args.json:
        json.dump(items, sys.stdout, indent=2)
        print()
        return 0
    print('| Worktree | Branch | PRs | Remote | Unpushed | Uncommitted | Running | Verdict |')
    print('|---|---|---|---|---|---|---|---|')
    for i in items:
        unpushed = str(i['unpushed']) + (f" (+{i['rebased_copies']} rebased copies)"
                                         if i['rebased_copies'] else '')
        shown = i['prs'].split(' #')
        prs = ' #'.join(shown[:3]) + (' …' if len(shown) > 3 else '')
        print(f"| {i['name']} | {i['branch'] or '(detached)'} | {prs or '-'} | "
              f"{'yes' if i['on_remote'] else 'no'} | {unpushed} | {len(i['uncommitted'])} | "
              f"{len(i['running'])} | {i['verdict']} |")
    counts: dict[str, int] = {}
    for i in items:
        counts[i['verdict']] = counts.get(i['verdict'], 0) + 1
    print('\n' + ', '.join(f'{v}: {n}' for v, n in sorted(counts.items())))
    return 0


def remove(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    trees = {w['path'].name: w for w in worktrees(repo, Path('/'))}
    containers = running_containers()
    failed = 0
    for name in args.names:
        w = trees.get(name)
        if not w:
            print(f'MISSING {name}')
            failed += 1
            continue
        item = inspect(repo, w, containers)
        problems = []
        if Path(item['path']) == repo:
            problems.append('is the main checkout')
        if item['uncommitted']:
            problems.append(f"{len(item['uncommitted'])} uncommitted files")
        if item['noise'] and not args.allow_noise:
            problems.append(f"{len(item['noise'])} tool-state files (pass --allow-noise)")
        if item['unpushed']:
            problems.append(f"{item['unpushed']} commits on no origin branch")
        if item['running']:
            problems.append(f"running containers: {', '.join(item['running'])}")
        if problems:
            print(f"SKIP {name}: {'; '.join(problems)}")
            failed += 1
            continue
        project = item['stack']
        down = Path(item['path']) / 'deploy/dockers/local-dev/worktree-down.local.sh'
        if project and down.is_file():
            run(str(down), '--volumes', cwd=down.parent)
            left = run('docker', 'volume', 'ls', '-q', '--filter',
                       f'label=com.docker.compose.project={project}')
            if left:
                print(f'WARN {name}: stack {project} left volumes: {left.split()}')
        result = subprocess.run(['git', '-C', str(repo), 'worktree', 'remove', '--force',
                                 item['path']], capture_output=True, text=True)
        if result.returncode:
            print(f'FAIL {name}: {result.stderr.strip()}')
            failed += 1
        else:
            print(f'removed {name}')
    git(repo, 'worktree', 'prune')
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    a = sub.add_parser('audit')
    a.add_argument('--repo', required=True)
    a.add_argument('--root')
    a.add_argument('--keep', nargs='*', default=[])
    a.add_argument('--json', action='store_true')
    r = sub.add_parser('remove')
    r.add_argument('--repo', required=True)
    r.add_argument('--allow-noise', action='store_true')
    r.add_argument('names', nargs='+')
    args = parser.parse_args()
    return audit(args) if args.command == 'audit' else remove(args)


if __name__ == '__main__':
    sys.exit(main())
