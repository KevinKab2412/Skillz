"""Guard the review delivery and evidence rules against prompt regressions.

These are structural checks, not a claim that an LLM followed the instructions.
"""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CodeReviewContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (ROOT / "code-review/SKILL.md").read_text()

    def test_complete_report_is_inline_even_under_prose_cap(self):
        for phrase in (
            "full report directly in the final chat response",
            "a link or a short findings-only summary never replaces it",
            "unless the\nuser explicitly requests that format",
            "The 150-word prose cap controls presentation, not coverage",
            "Large\ndiffs still list every changed file",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.skill)

    def test_template_contains_orientation_route_evidence_and_verification(self):
        template = self.skill.split("Use this exact section order", 1)[1].split(
            "**The review plan", 1
        )[0]
        headings = (
            "# Review", "**Standards:**", "**The goal**",
            "**What it touches**", "**The attempt**", "## Review it yourself",
            "**Where I'm least sure:**", "## The issues", "| Evidence | Result |",
            "## Verification", "## What I left out", "## Want the deep dive?",
        )
        positions = [template.index(heading) for heading in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("every changed file present", template)
        self.assertIn("| # | File | ± lines | Ask |", template)
        self.assertIn("verbatim, line-numbered", template)

    def test_evidence_gate_is_not_skipped_when_no_blockers_exist(self):
        step = self.skill.split("## Step 3", 1)[1].split("## Step 4", 1)[0]
        self.assertLess(step.index("Evidence gate"), step.index("Independent refutation"))
        self.assertIn("every surviving finding", step)
        self.assertIn("skip only this refutation pass", step)
        for phrase in ("real entry point", "expected result, actual result",
                       "control the ordering explicitly", "Mock paid or destructive"):
            self.assertIn(phrase, step)
        self.assertNotIn("skip this step entirely", step)

    def test_unverified_and_refuted_claims_are_not_confirmed_findings(self):
        for phrase in (
            "code-traced,\nnot reproduced",
            "Where I'm least sure",
            "not the confirmed issues or merge-blocking count",
            "removes the disproved\ncorrectness claim",
            "independent refutation was unavailable",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.skill)

    def test_paste_comment_reports_evidence_then_requests_change(self):
        comments = self.skill.split("**The paste comment", 1)[1].split(
            "If you're reviewing in a repo", 1
        )[0]
        for phrase in (
            "what I checked and what actually happened",
            "then ask for a concrete adjustment",
            "i reopened and extended the plan during evaluation",
            "not reproduced locally", "A design example",
            "Ask the author to adjust the code, not to establish the finding",
            "never present a code trace as an executed repro",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, comments)
        self.assertNotIn("Open with the wondering", comments)
        self.assertNotIn("A hypothetical carries a risk finding", comments)

    def test_done_gate_requires_both_requested_behaviours(self):
        done = self.skill.split("## Done when", 1)[1]
        self.assertIn("without a follow-up request", done)
        self.assertIn("observed outcome and a concrete adjustment question", done)
        self.assertIn("Every issue passed Step 3's evidence gate", done)
        self.assertIn("Verification lists real", done)


if __name__ == "__main__":
    unittest.main()
