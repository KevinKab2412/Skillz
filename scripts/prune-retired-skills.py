#!/usr/bin/env python3
"""Remove explicitly retired global skills, keeping recoverable backups outside discovery."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import shutil


def retired_names(policy):
    names = {line.split('#', 1)[0].strip() for line in policy.read_text().splitlines()}
    names.discard('')
    if any(not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) for name in names):
        raise ValueError('Invalid skill name in retirement policy')
    return names


def candidates(root, names, deduplicate=False):
    if not root.is_dir():
        return
    for current, dirs, files in os.walk(root, followlinks=False):
        directory = Path(current)
        # A skill owns its nested references: never prune modules within a retained skill.
        if 'SKILL.md' in files:
            text = (directory / 'SKILL.md').read_text()
            frontmatter = text.split('---', 2)[1] if text.startswith('---\n') else ''
            match = re.search(r'^name:\s*[\'"]?([a-zA-Z0-9-]+)[\'"]?\s*$', frontmatter, re.M)
            name = match.group(1) if match else directory.name
            canonical = root / name / 'SKILL.md'
            duplicate = (deduplicate and directory.parent != root and canonical.is_file())
            if directory.name in names or name in names or duplicate:
                yield directory
            dirs[:] = []
            continue
        for name in list(dirs):
            child = directory / name
            if child.is_symlink() or name.startswith('.'):
                dirs.remove(name)
                if child.is_symlink() and name in names:
                    yield child
        # Broken directory symlinks are reported as files by os.walk.
        for name in files:
            child = directory / name
            if child.is_symlink() and name in names:
                yield child


def prune(policy, home, agents_dir, pi_home, dry_run=False):
    names = retired_names(policy)
    roots = [agents_dir, home / '.claude/skills', home / '.codex/skills',
             home / '.cursor/skills', pi_home / 'skills', home / '.config/opencode/skills',
             home / '.config/opencode/skill', home / '.opencode/skills']
    seen = set()
    backup = home / '.agents/skill-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    for index, root in enumerate(roots):
        real_root = root.resolve()
        if real_root in seen:
            continue
        seen.add(real_root)
        for path in candidates(root, names, deduplicate=real_root == agents_dir.resolve()):
            print(f'{"Would retire" if dry_run else "Retired"}: {path}')
            if dry_run:
                continue
            backup.mkdir(parents=True, mode=0o700, exist_ok=True)
            target = backup / f'root-{index}' / path.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if path.is_symlink():
                target.symlink_to(os.readlink(path))
                path.unlink()
            else:
                shutil.copytree(path, target, symlinks=True)
                shutil.rmtree(path)
    if backup.exists():
        print(f'Retired skill backups: {backup}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--agents-dir', type=Path)
    parser.add_argument('--pi-home', type=Path)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    prune(args.policy, args.home, args.agents_dir or args.home / '.agents/skills',
          args.pi_home or args.home / '.pi/agent', args.dry_run)
