"""Structural evidence-policy checks; these do not prove model compliance."""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "shared/evidence/behavior-evidence.md"


class BehaviorEvidenceTests(unittest.TestCase):
    def test_both_callers_opt_into_one_policy(self):
        for skill in ("pair", "code-review"):
            manifest = (ROOT / skill / "references/.shared").read_text().splitlines()
            self.assertEqual(manifest.count("evidence"), 1)
            self.assertFalse((ROOT / skill / "references/evidence").exists())

    def test_guided_auto_implementation_and_review_reach_policy(self):
        pointers = {
            "pair/SKILL.md": "references/evidence/behavior-evidence.md",
            "pair/references/auto.md": "evidence/behavior-evidence.md",
            "pair/references/implement/SKILL.md": "../evidence/behavior-evidence.md",
            "code-review/SKILL.md": "references/evidence/behavior-evidence.md",
        }
        for path, pointer in pointers.items():
            with self.subTest(path=path):
                text = (ROOT / path).read_text()
                self.assertIn(f"]({pointer})", text)
                self.assertIn("all UI/visual changes", text)

    def test_static_ui_and_headless_runs_default_to_real_recordings(self):
        text = POLICY.read_text()
        for phrase in (
            "Recording is the default for all UI/visual changes",
            "even when the change is static",
            "Headless browser video is a valid recording",
            "record the actual verification session",
            "confirm it is playable",
            "inspect the key moments",
        ):
            self.assertIn(phrase, text)

    def test_fallback_and_review_do_not_invent_defects_or_permission(self):
        text = POLICY.read_text()
        for phrase in (
            "unavailable, unsafe, or explicitly declined",
            "numbered screenshots with assertions",
            "report the visual behavior as untested",
            "not a product defect",
            "not an independent reviewer run",
            "Rerun material claims",
            "mark affected evidence stale",
            "require authorization for that destination and task",
            "Inspect\nartifacts for sensitive content",
        ):
            self.assertIn(phrase, text)

    def test_handoff_identifies_dirty_code_process_cases_and_rerun(self):
        text = POLICY.read_text()
        for phrase in (
            "digest of the tested patch and new-file contents",
            "port's process and working directory",
            "`passed` / `failed` / `untested`",
            "Exact safe rerun commands",
            "known-bad verifier result",
            "Before/after measurements",
            "Documentation with no rendered UI change",
        ):
            self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
