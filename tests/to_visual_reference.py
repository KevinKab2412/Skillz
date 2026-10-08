"""The trash example as a cross-stack reference.

Each stack ports the same trash app (same routes, responses and test names) and records it with
its own recorder. A port is right when its trace matches the Django reference step by step and
renders ``trash.view.json`` into the same beats. Only the provenance chip may differ, because it
names the test in the stack's own style.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "to-visual"
EXAMPLES = SKILL / "assets/examples"
RECORDERS = SKILL / "scripts/recorders"
REFERENCE = EXAMPLES / "trash.trace.json"
RELATIVE = r"^[+-]\d+s$"

sys.path.insert(0, str(SKILL / "scripts"))
import concept_view  # noqa: E402


def _normal(step: dict) -> dict:
    """A step without what legitimately varies between runs: the exact seconds of a timestamp."""
    rows = {model: [{k: ("set" if k == "trashed_at" and v is not None else v) for k, v in row.items()} for row in table]
            for model, table in step["state"].items()}
    return {k: step.get(k) for k in ("caller", "method", "path", "params", "status", "response", "redirect")} | {"state": rows}


def _beats(trace: dict) -> list:
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "trace.json").write_text(json.dumps(trace))
        watch = json.loads((EXAMPLES / "trash.view.json").read_text())["watch"] | {"trace": "trace.json"}
        beats = concept_view.build_watch(watch, Path(tmp))["beats"]
    return [{k: v for k, v in beat.items() if k != "prov"} for beat in beats]


def assert_matches_reference(case, trace: dict) -> None:
    reference = json.loads(REFERENCE.read_text())
    case.assertEqual(trace["meta"]["failures"], 0, "the port's own tests failed while recording")
    case.assertEqual(len(trace["tests"]), len(reference["tests"]), sorted(trace["tests"]))
    for ref_id, ref_steps in reference["tests"].items():
        test_id, steps = concept_view.find_test(trace["tests"], concept_view.test_name(ref_id))
        case.assertEqual([_normal(s) for s in steps], [_normal(s) for s in ref_steps], test_id)
        for step in steps:
            for row in step["state"]["Item"]:
                if row["trashed_at"] is not None:
                    case.assertRegex(row["trashed_at"], RELATIVE)
    case.assertEqual(_beats(trace), _beats(reference), "trash.view.json renders differently from this trace")


def copy_example(name: str, tmp: str) -> Path:
    work = Path(tmp) / name
    shutil.copytree(EXAMPLES / name, work, ignore=shutil.ignore_patterns("vendor", "node_modules", "__pycache__", ".venv"))
    return work
