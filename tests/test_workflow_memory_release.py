import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from workflow_memory_release.evaluate import (
    GateRefused,
    _failure_prompt,
    _workflow_prompt,
    run_instruction_mutation,
    score_workflow_trace,
    score_retrieval,
    validate_install_evidence,
    validate_release_tree,
)


ROOT = Path(__file__).resolve().parents[1]


class WorkflowMemoryReleaseTest(unittest.TestCase):
    def test_runner_preserves_authority_array_for_evaluator_bookkeeping(self):
        scenario = json.loads(
            (ROOT / "workflow_memory_release/fixtures/workflows-v1.json").read_text()
        )["workflows"]["pair"]
        authority_path = Path("/fixture/authority.json")
        required = (
            "copy the JSON `authority` array exactly as read, preserving every item and its order"
        )
        normal_prompt = " ".join(
            _workflow_prompt("pair", scenario, authority_path).split()
        )
        incompatible_prompt = " ".join(
            _failure_prompt(
                "pair", scenario, authority_path, "incompatible"
            ).split()
        )
        self.assertIn(required, normal_prompt)
        self.assertIn(
            required,
            incompatible_prompt,
        )

    def observed_trace(self, scenario):
        events = [{"operation": "mark", "arguments": {"phase": "boundary:completion:begin"}}]
        events.append(
            {"operation": "recall", "arguments": {"project_id": scenario["project_id"], "limit": 5}}
        )
        events.extend(
            {
                "operation": "remember",
                "arguments": {
                    "claim_kind": kind,
                    "scope": "global" if kind in scenario["global_kinds"] else "project",
                    "project_id": None if kind in scenario["global_kinds"] else scenario["project_id"],
                },
            }
            for kind in scenario["capture_kinds"]
        )
        events.append(
            {
                "operation": "correct",
                "arguments": {
                    "claim_kind": "correction",
                    "target_memory_id": "mem-7",
                    "scope": "project",
                    "project_id": scenario["project_id"],
                },
            }
        )
        if scenario["nested_markers"]:
            events.append({"operation": "mark", "arguments": {"phase": "nested:begin"}})
        if scenario["nested_capture_kind"]:
            events.append(
                {
                    "operation": "remember",
                    "arguments": {
                        "claim_kind": scenario["nested_capture_kind"],
                        "scope": "project",
                        "project_id": scenario["project_id"],
                    },
                }
            )
        if scenario["nested_markers"]:
            events.append({"operation": "mark", "arguments": {"phase": "nested:end"}})
        events.extend(
            [
                {"operation": "flush", "arguments": {}},
                {
                    "operation": "record_outcome",
                    "arguments": {
                        "selected_authority": scenario["authority"],
                        "warnings": [],
                    },
                },
                {"operation": "mark", "arguments": {"phase": "boundary:completion:end"}},
            ]
        )
        for boundary in scenario["close_boundaries"]:
            if boundary == "completion":
                continue
            events.extend(
                [
                    {"operation": "mark", "arguments": {"phase": f"boundary:{boundary}:begin"}},
                    {
                        "operation": "recall",
                        "arguments": {"limit": 5, "project_id": scenario["project_id"]},
                    },
                    {"operation": "flush", "arguments": {}},
                    {"operation": "mark", "arguments": {"phase": f"boundary:{boundary}:end"}},
                ]
            )
        events.extend(
            [
                {
                    "operation": "mark",
                    "arguments": {"phase": "failure:incompatible:begin"},
                },
                {
                    "operation": "recall",
                    "arguments": {"limit": 5, "project_id": scenario["project_id"]},
                },
                {
                    "operation": "record_outcome",
                    "arguments": {
                        "selected_authority": scenario["authority"],
                        "warnings": ["Workflow memory is unavailable."],
                    },
                },
                {
                    "operation": "mark",
                    "arguments": {"phase": "failure:incompatible:end"},
                },
                {"operation": "mark", "arguments": {"phase": "failure:absent:begin"}},
                {
                    "operation": "assistant_output",
                    "arguments": {
                        "text": "Workflow memory is unavailable.\nWORKFLOW_CONTINUED",
                    },
                },
                {"operation": "mark", "arguments": {"phase": "failure:absent:end"}},
            ]
        )
        trace = [
            {"name": "Read", "input": {"file_path": "/fixture/authority.json"}},
            {"name": "mcp__workflow-memory-eval__recall", "input": {"limit": 5}},
        ]
        return events, trace

    def test_observed_trace_scorer_covers_all_workflows(self):
        fixture = json.loads(
            (ROOT / "workflow_memory_release/fixtures/workflows-v1.json").read_text()
        )
        for workflow, scenario in fixture["workflows"].items():
            events, trace = self.observed_trace(scenario)
            result = score_workflow_trace(workflow, scenario, events, trace)
            self.assertTrue(all(result["checks"].values()))

    def test_observed_trace_scorer_rejects_order_and_nesting_mutations(self):
        scenario = json.loads(
            (ROOT / "workflow_memory_release/fixtures/workflows-v1.json").read_text()
        )["workflows"]["pair"]
        events, trace = self.observed_trace(scenario)
        with self.assertRaisesRegex(GateRefused, "authority"):
            score_workflow_trace("pair", scenario, events, list(reversed(trace)))
        nested_end = next(
            index
            for index, event in enumerate(events)
            if event == {"operation": "mark", "arguments": {"phase": "nested:end"}}
        )
        events.insert(nested_end, {"operation": "recall", "arguments": {"limit": 5}})
        with self.assertRaisesRegex(GateRefused, "nesting"):
            score_workflow_trace("pair", scenario, events, trace)

    def test_installed_instruction_mutation_must_change_observed_calls(self):
        scenario = json.loads(
            (ROOT / "workflow_memory_release/fixtures/workflows-v1.json").read_text()
        )["workflows"]["pair"]
        changed = [
            {"operation": "mark", "arguments": {"phase": "nested:begin"}},
            {"operation": "recall", "arguments": {"limit": 5}},
            {"operation": "flush", "arguments": {}},
            {"operation": "mark", "arguments": {"phase": "nested:end"}},
        ]
        unchanged = [event for event in changed if event["operation"] not in {"recall", "flush"}]
        with patch(
            "workflow_memory_release.evaluate._execute_workflow_prompt",
            return_value=(changed, [], 1),
        ) as execute:
            self.assertTrue(
                run_instruction_mutation("claude", ROOT, scenario)["rejected"]
            )
        mutation_source = execute.call_args.args[5]
        self.assertTrue(
            mutation_source.startswith("## Workflow memory lifecycle (automatic)")
        )
        self.assertIn(
            "Those stages must open their own memory session",
            mutation_source,
        )
        self.assertNotIn("## Stage 0", mutation_source)
        with patch(
            "workflow_memory_release.evaluate._execute_workflow_prompt",
            return_value=(unchanged, [], 1),
        ):
            with self.assertRaisesRegex(GateRefused, "instruction mutation"):
                run_instruction_mutation("claude", ROOT, scenario)

    def test_checked_release_report_is_current_and_passing(self):
        self.assertEqual(
            validate_install_evidence()["workflows"],
            ["pair"],
        )

    def test_activation_is_exactly_tracked_or_refused(self):
        self.assertEqual(
            validate_release_tree()["workflows"],
            ["pair"],
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in (
                "shared/memory",
                "pair/references",
                "pair/references/grill",
                "pair/references/experts",
                "code-review",
            ):
                (root / path).mkdir(parents=True, exist_ok=True)
            release = json.loads((ROOT / "shared/memory/release.json").read_text())
            release["workflows"].remove("pair")
            (root / "shared/memory/release.json").write_text(json.dumps(release))
            (root / "shared/memory/workflow-memory.md").write_text("ordinary runs are active")
            for workflow in ("pair",):
                (root / workflow / "references/.shared").write_text("memory\n")
                (root / workflow / "SKILL.md").write_text(
                    "Workflow memory lifecycle (automatic)"
                )
            for workflow in ("pair/references/grill", "pair/references/experts", "code-review"):
                (root / workflow / "SKILL.md").write_text("")
            with self.assertRaisesRegex(GateRefused, "exactly the tracked"):
                validate_release_tree(root)

    def test_retrieval_guard_uses_only_explicit_thresholds(self):
        fixture = {
            "queries": [
                {"id": f"q{index}", "expected": [f"m{index}"]} for index in range(10)
            ]
        }
        passing = score_retrieval(
            fixture,
            {f"q{index}": [f"m{index}"] for index in range(9)} | {"q9": []},
            set(),
            set(),
        )
        self.assertTrue(passing["passed"])
        self.assertEqual(passing["recall_at_five"], 0.9)
        self.assertFalse(score_retrieval(fixture, {}, set(), set())["passed"])
        self.assertFalse(
            score_retrieval(
                fixture,
                {f"q{index}": [f"m{index}"] for index in range(10)},
                {"foreign"},
                set(),
            )["passed"]
        )
        self.assertFalse(
            score_retrieval(
                fixture,
                {f"q{index}": [f"m{index}"] for index in range(10)},
                set(),
                {"inactive"},
            )["passed"]
        )


if __name__ == "__main__":
    unittest.main()
