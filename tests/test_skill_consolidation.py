"""Regression checks for explicit retirements and the consolidated skill entry points."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('retire', ROOT / 'scripts/prune-retired-skills.py')
retire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retire)


class RetirementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.skills = self.home / '.agents/skills'
        self.policy = self.home / 'retired.txt'
        self.policy.write_text('review\nworktree\ncanvas\n')

    def skill(self, relative, name=None):
        directory = self.home / relative
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'SKILL.md').write_text(f'---\nname: {name or directory.name}\ndescription: test\n---\n')
        return directory

    def prune(self, dry_run=False):
        retire.prune(self.policy, self.home, self.skills, self.home / '.pi/agent', dry_run)

    def test_all_roots_nested_sync_and_unrelated_preserved(self):
        removed = [self.skill('.agents/skills/review'),
                   self.skill('.cursor/skills/canvas'),
                   self.skill('.pi/agent/skills/review'),
                   self.skill('.config/opencode/skills/review'),
                   self.skill('.agents/skills/synced/import/review')]
        keep = self.skill('.agents/skills/pair')
        nested = self.skill('.agents/skills/pair/references/worktree')
        external = self.skill('.agents/skills/unrelated')
        outside = self.skill('project/.agents/skills/review')
        self.prune()
        self.assertTrue(all(not path.exists() for path in removed))
        self.assertTrue(all(path.exists() for path in (keep, nested, external, outside)))
        backups = list((self.home / '.agents/skill-backups').rglob('SKILL.md'))
        self.assertEqual(len(backups), len(removed))
        self.prune()  # Idempotent; backups aren't discovered or deleted.
        self.assertEqual(backups, list((self.home / '.agents/skill-backups').rglob('SKILL.md')))

    def test_shared_symlink_and_broken_tool_link(self):
        self.skill('.agents/skills/review')
        (self.home / '.claude').mkdir()
        (self.home / '.claude/skills').symlink_to(self.skills, target_is_directory=True)
        (self.home / '.codex/skills').mkdir(parents=True)
        link = self.home / '.codex/skills/review'
        link.symlink_to(self.skills / 'review', target_is_directory=True)
        self.prune()
        self.assertTrue((self.home / '.claude/skills').is_symlink())
        self.assertFalse(link.is_symlink())

    def test_dry_run_does_not_mutate(self):
        skill = self.skill('.agents/skills/review')
        self.prune(dry_run=True)
        self.assertTrue(skill.exists())
        self.assertFalse((self.home / '.agents/skill-backups').exists())

    def test_only_duplicate_of_installed_canonical_is_removed(self):
        canonical = self.skill('.agents/skills/morning')
        duplicate = self.skill('.agents/skills/synced/import/morning')
        unique = self.skill('.agents/skills/synced/import/unique')
        self.prune()
        self.assertTrue(canonical.exists())
        self.assertFalse(duplicate.exists())
        self.assertTrue(unique.exists())

    def test_retired_name_is_detected_even_when_directory_differs(self):
        path = self.skill('.agents/skills/custom-name', name='review')
        self.prune()
        self.assertFalse(path.exists())

    def test_invalid_policy_refused_before_deletion(self):
        path = self.skill('.agents/skills/review')
        self.policy.write_text('review\n../pair\n')
        with self.assertRaises(ValueError):
            self.prune()
        self.assertTrue(path.exists())


class WiringTests(unittest.TestCase):
    def test_retired_skills_are_not_top_level_sources(self):
        for name in retire.retired_names(ROOT / 'retired-skills.txt'):
            self.assertFalse((ROOT / name / 'SKILL.md').exists(), name)

    def test_worktree_is_internal_and_reused(self):
        self.assertTrue((ROOT / 'pair/references/worktree/scripts/mkworktree.sh').is_file())
        self.assertIn('(references/worktree/SKILL.md)', (ROOT / 'pair/SKILL.md').read_text())
        self.assertIn('(../pair/references/worktree/SKILL.md)', (ROOT / 'code-review/SKILL.md').read_text())

    def test_to_pr_inspects_both_branch_scopes_and_requires_approval(self):
        layout = (ROOT / 'to-pr/references/pr-layout.md').read_text()
        for marker in ('git branch --no-merged', 'git branch -r --no-merged',
                       'Ask for approval', 'does not include untracked', 'drafts only'):
            self.assertIn(marker, layout)
        self.assertIn('(references/pr-layout.md)', (ROOT / 'to-pr/SKILL.md').read_text())

    def test_review_backends_are_optional_and_honest(self):
        skill = (ROOT / 'code-review/SKILL.md').read_text()
        for marker in ('bugbot.md', 'security.md', 'backend is unavailable', 'partial'):
            self.assertIn(marker, skill)
        for name in ('bugbot', 'security'):
            self.assertTrue((ROOT / f'code-review/references/review-backends/{name}.md').is_file())


if __name__ == '__main__':
    unittest.main()
