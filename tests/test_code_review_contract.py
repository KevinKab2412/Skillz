"""Guard the review delivery and evidence rules against prompt regressions.

These are structural checks, not a claim that an LLM followed the instructions.
"""

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CodeReviewContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (ROOT / "code-review/SKILL.md").read_text()
        cls.contract = (ROOT / "code-review/references/constructive-review.md").read_text()
        cls.drafts = (ROOT / "code-review/references/draft-reviews.md").read_text()

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

    def test_paste_comment_reports_evidence_rationale_request_and_result(self):
        comments = self.skill.split("**The paste comment", 1)[1].split(
            "If you're reviewing in a repo", 1
        )[0]
        self.assertIn("(references/constructive-review.md)", comments)
        for phrase in (
            "what I checked and what actually happened",
            "violated contract or concrete consequence",
            "scoped adjustment", "observable condition",
            "two to four short sentences", "not reproduced locally",
            "Never claim an unrun test passed or failed",
            "not to establish an executable fact",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.contract)
        self.assertNotIn("Open with the wondering", comments)
        self.assertNotIn("Use one compact paragraph", comments)

    def test_done_gate_requires_both_requested_behaviours(self):
        done = self.skill.split("## Done when", 1)[1]
        self.assertIn("without a follow-up request", done)
        self.assertIn("observed outcome and a concrete adjustment question", done)
        self.assertIn("Every issue passed Step 3's evidence gate", done)
        self.assertIn("Verification lists real", done)

    def test_selection_separates_evidence_impact_and_merge_action(self):
        for phrase in (
            "Separate type, evidence, and merge action",
            "A hypothetical or a reproduced low-impact defect is not automatically a blocker",
            "No finding count, praise quota",
            "Personal skill defaults guide the agent",
            "not an acceptance criterion",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.contract + self.skill)
        self.assertNotIn("blocker  = a correctness defect", self.skill)
        self.assertIn("nonblocking", self.skill)

    def test_rereview_and_human_authority_are_preserved(self):
        for phrase in (
            "fixed, still open, refuted, or accepted/deferred",
            "thread resolved", "without new evidence",
            "not interchangeable with\nindependent human approval",
            "Urgency never\nsilently removes a gate",
            "speed as contextual signals rather than targets",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.contract)
        self.assertIn("pin old and new commits", self.contract)
        self.assertIn("author replies", self.skill)
        self.assertIn("UNRESOLVED", self.skill)

    def test_draft_only_permission_never_submits_or_posts_live_reply(self):
        for phrase in (
            "Omit `event` entirely", "`PENDING`", "commit matches the reviewed head",
            "Do not use `gh pr review` for drafts", "outside draft-only permission",
            "Never\ndelete the user's existing draft", "read its body and comments first",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.drafts)
        self.assertIn("(references/draft-reviews.md)", self.skill)

    def test_references_and_behavioural_cases_are_shipped_and_reachable(self):
        self.assertIn("../evals/evals.json", self.contract)
        cases = json.loads((ROOT / "code-review/evals/evals.json").read_text())["evals"]
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        covered = {classification for case in cases
                   for classification in case["expected_classifications"]}
        self.assertTrue({"none", "blocker", "question", "nonblocking",
                         "supporting_evidence"} <= covered)
        for case in cases:
            with self.subTest(case=case["name"]):
                self.assertTrue(case["prompt"])
                self.assertTrue(case["assertions"])
                self.assertTrue(case["expected_actions"])
        self.assertIn("cannot prove the model follows it", self.contract)
        self.assertIn("sync every changed skill asset", self.contract)


if __name__ == "__main__":
    unittest.main()
