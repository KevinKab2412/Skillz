import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "to-visual/assets/examples/trash-app"
RECORDER = ROOT / "to-visual/scripts/record_trace.py"


def uv_django_available() -> bool:
    if not shutil.which("uv"):
        return False
    probe = subprocess.run(["uv", "run", "--offline", "--no-project", "--with", "django", "python", "-c", "import django"],
                           capture_output=True, text=True, check=False)
    return probe.returncode == 0


@unittest.skipUnless(uv_django_available(), "needs uv with Django in its cache")
class RecorderEndToEndTest(unittest.TestCase):
    def test_records_each_request_with_caller_status_and_model_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "app"
            shutil.copytree(APP, work)
            out = Path(tmp) / "trace.json"
            result = subprocess.run(
                ["uv", "run", "--offline", "--no-project", "--with", "django", "python", str(RECORDER),
                 "--settings", "trashdemo.settings", "--models", "store.Item", "--out", str(out), "--", "store.tests"],
                cwd=work, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            trace = json.loads(out.read_text())

        tests = trace["tests"]
        self.assertEqual(trace["meta"]["failures"], 0)
        self.assertEqual(len(tests), 3)
        restore = tests["TrashTests.test_deleted_item_can_be_restored"]
        self.assertEqual([(s["method"], s["path"], s["status"]) for s in restore],
                         [("POST", "/items/", 201), ("POST", "/items/1/delete/", 200), ("GET", "/items/", 200),
                          ("POST", "/items/1/restore/", 200), ("GET", "/items/", 200)])
        self.assertEqual(restore[0]["caller"], {"client": 1, "auth": "none"})
        self.assertIsNone(restore[0]["state"]["Item"][0]["trashed_at"])
        self.assertRegex(restore[1]["state"]["Item"][0]["trashed_at"], r"^[+-]\d+s$")
        emptied = tests["TrashTests.test_emptying_the_trash_removes_items_for_good"][3]
        self.assertEqual([r["name"] for r in emptied["state"]["Item"]], ["notes.txt"])


if __name__ == "__main__":
    unittest.main()
