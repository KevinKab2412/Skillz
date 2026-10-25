"""Structural bank checks; these do not prove agent behavior or example compatibility."""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "shared/evidence"


class VerificationMethodTests(unittest.TestCase):
    def test_policy_and_spec_reach_bank(self):
        for path, pointer in (
            (BANK / "behavior-evidence.md", "verification-methods.md"),
            (ROOT / "pair/references/spec/SKILL.md", "../evidence/verification-methods.md"),
        ):
            self.assertIn(f"]({pointer})", path.read_text())
        for skill in ("pair", "code-review"):
            manifest = (ROOT / skill / "references/.shared").read_text().splitlines()
            self.assertEqual(manifest.count("evidence"), 1)

    def test_bank_local_links_resolve(self):
        for path in BANK.rglob("*.md"):
            for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
                if "://" not in target and not target.startswith("#"):
                    with self.subTest(path=path, target=target):
                        self.assertTrue((path.parent / target.split("#")[0]).is_file())

    def test_entries_have_complete_recipes(self):
        expected = {
            "pixel-diff", "behavioral-assertions", "property-based", "contract",
            "differential", "metamorphic", "round-trip", "state-machine",
            "fault-injection", "concurrency-replay", "data-reconciliation",
            "performance", "accessibility", "mutation",
        }
        self.assertEqual({p.stem for p in (BANK / "methods").glob("*.md")}, expected)
        index = (BANK / "verification-methods.md").read_text()
        for name in sorted(expected):
            self.assertIn(f"](methods/{name}.md)", index)
            text = (BANK / "methods" / f"{name}.md").read_text()
            for heading in (
                "## Suitable claims", "## Prerequisites", "## Independent reference",
                "## Execution recipe", "## Known-bad check", "## Blind spots",
                "## Official documentation",
            ):
                with self.subTest(name=name, heading=heading):
                    self.assertIn(heading, text)
            self.assertIn("```sh", text)

    def test_pixel_diff_preserves_baseline_and_capture_guards(self):
        text = (BANK / "methods/pixel-diff.md").read_text()
        for phrase in (
            "approved baseline with provenance", "report parity as untested",
            "threshold: 0", "maxDiffPixels: 0", "tolerance", "Mask only",
            "Keep the existing UI recording requirement", "does not establish DOM semantics",
        ):
            self.assertIn(phrase, text)

    def test_selection_keeps_requirements_tools_and_limits_distinct(self):
        text = (BANK / "verification-methods.md").read_text()
        for phrase in (
            "approved requirements remain the acceptance bar", "Methods describe evidence",
            "explain why that method fits", "another defensible method",
            "blind spots", "reviewer-reproduced", "proprietary code",
        ):
            self.assertIn(phrase, text)

    def test_adapters_require_version_discovery_and_honest_source_status(self):
        text = (BANK / "framework-adapters.md").read_text()
        for phrase in (
            "composer.lock", "pyproject.toml", "conftest.py",
            "installed runner", "official docs matching those versions",
            "inaccessible docs were checked", "HTTP 403", "not a global",
        ):
            self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
