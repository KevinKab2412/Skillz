import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from to_visual_reference import RECORDERS, assert_matches_reference, copy_example


def uv_django_available() -> bool:
    if not shutil.which("uv"):
        return False
    probe = subprocess.run(["uv", "run", "--offline", "--no-project", "--with", "django", "python", "-c", "import django"],
                           capture_output=True, text=True, check=False)
    return probe.returncode == 0


@unittest.skipUnless(uv_django_available(), "needs uv with Django in its cache")
class DjangoRecorderTest(unittest.TestCase):
    def test_records_each_request_with_caller_status_and_model_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = copy_example("trash-django", tmp)
            out = Path(tmp) / "trace.json"
            result = subprocess.run(
                ["uv", "run", "--offline", "--no-project", "--with", "django", "python", str(RECORDERS / "record_django.py"),
                 "--settings", "trashdemo.settings", "--models", "store.Item", "--out", str(out), "--", "store.tests"],
                cwd=work, env=os.environ | {"PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            trace = json.loads(out.read_text())

        self.assertEqual(trace["meta"]["stack"], "django")
        restore = trace["tests"]["TrashTests.test_deleted_item_can_be_restored"]
        self.assertEqual(restore[0]["caller"], {"client": 1, "auth": "none"})
        self.assertIsNone(restore[0]["state"]["Item"][0]["trashed_at"])
        self.assertRegex(restore[1]["state"]["Item"][0]["trashed_at"], r"^[+-]\d+s$")
        assert_matches_reference(self, trace)


if __name__ == "__main__":
    unittest.main()
