import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from to_visual_reference import RECORDERS, assert_matches_reference, copy_example

DEPS = ["--with", "fastapi", "--with", "sqlalchemy[asyncio]", "--with", "aiosqlite", "--with", "httpx", "--with", "pytest"]


def uv_flags():
    """`--offline` when uv's cache already holds the deps, `[]` when they can be fetched, None when neither."""
    if not shutil.which("uv"):
        return None
    for flags in (["--offline"], []):
        probe = subprocess.run(["uv", "run", "-q", *flags, "--no-project", *DEPS, "python", "-c",
                                "import fastapi, sqlalchemy.ext.asyncio, aiosqlite, httpx, pytest"],
                               capture_output=True, text=True, check=False)
        if probe.returncode == 0:
            return flags
    return None


FLAGS = uv_flags()


@unittest.skipIf(FLAGS is None, "needs uv with FastAPI, SQLAlchemy[asyncio], aiosqlite, httpx and pytest (cached or online)")
class FastAPIRecorderTest(unittest.TestCase):
    def record(self, tests: str) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            work = copy_example("trash-fastapi", tmp)
            out = Path(tmp) / "trace.json"
            result = subprocess.run(
                ["uv", "run", "-q", *FLAGS, "--no-project", *DEPS, "pytest", "-p", "record_fastapi", "-p", "no:cacheprovider",
                 "--tovisual-out", str(out), "--tovisual-models", "store.models:Item", tests],
                cwd=work, env={**os.environ, "PYTHONPATH": str(RECORDERS), "PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stdout[-2000:] + result.stderr[-2000:])
            return json.loads(out.read_text())

    def test_sync_session_under_testclient_matches_the_django_reference(self):
        trace = self.record("tests/test_trash.py")
        self.assertEqual(trace["meta"]["stack"], "fastapi")
        self.assertEqual(trace["meta"]["warnings"], [])
        self.assertIn("test_trash.test_deleted_item_can_be_restored", trace["tests"])
        assert_matches_reference(self, trace)

    def test_async_session_under_asyncclient_matches_the_django_reference(self):
        trace = self.record("tests/test_trash_async.py")
        self.assertEqual(trace["meta"]["warnings"], [])
        assert_matches_reference(self, trace)


if __name__ == "__main__":
    unittest.main()
