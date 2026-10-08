import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from to_visual_reference import RECORDERS, assert_matches_reference, copy_example

LARAVEL = RECORDERS / "laravel"


@unittest.skipUnless(shutil.which("php") and shutil.which("composer"), "needs php and composer")
class LaravelRecorderTest(unittest.TestCase):
    def test_records_each_request_with_soft_deleted_rows_still_visible(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = copy_example("trash-laravel", tmp)
            install = subprocess.run(["composer", "install", "--no-interaction", "--prefer-dist", "--no-progress"],
                                     cwd=work, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                self.skipTest(f"composer install failed (offline?): {install.stderr[-500:]}")
            out = Path(tmp) / "trace.json"
            env = os.environ | {"TOVISUAL_OUT": str(out), "TOVISUAL_MODELS": "App\\Models\\Item"}
            result = subprocess.run(
                ["php", "-d", f"auto_prepend_file={LARAVEL / 'autoload.php'}", "vendor/bin/phpunit",
                 "--extension", "ToVisual\\Laravel\\Recorder"],
                cwd=work, env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stdout[-2000:] + result.stderr[-2000:])
            trace = json.loads(out.read_text())

        self.assertEqual(trace["meta"]["stack"], "laravel")
        restore = trace["tests"]["TrashTest.test_deleted_item_can_be_restored"]
        # SoftDeletes hides a trashed row from the app; the recorder reads without scopes, so the row stays.
        self.assertEqual(restore[2]["response"], {"items": []})
        self.assertEqual([r["name"] for r in restore[1]["state"]["Item"]], ["report.pdf"])
        self.assertRegex(restore[1]["state"]["Item"][0]["trashed_at"], r"^[+-]\d+s$")
        assert_matches_reference(self, trace)


if __name__ == "__main__":
    unittest.main()
