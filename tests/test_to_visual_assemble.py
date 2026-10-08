import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "to-visual"
ASSEMBLE = SKILL / "scripts/assemble.py"
SCENE = SKILL / "assets/examples/dbt-conveyor.html"
WALK = SKILL / "assets/examples/asyncio-create-task.walk.json"


def assemble(*args):
    return subprocess.run(
        [sys.executable, str(ASSEMBLE), *args], capture_output=True, text=True, check=False
    )


class ToVisualAssembleTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, *args, name="out.html"):
        target = self.out / name
        result = assemble(*args, "--out", str(target))
        self.assertEqual(result.returncode, 0, result.stderr)
        return target.read_text()

    def test_scene_page_is_self_contained_and_registers_its_timeline(self):
        html = self.build("--scene", str(SCENE))

        self.assertNotRegex(html, r"<script[^>]*\bsrc=", "every script must be inlined")
        self.assertIn('data-composition-id="dbt-conveyor"', html)
        self.assertIn('id="dbt-conveyor"', html)
        self.assertIn("window.__timelines[id] = tl", html, "kit registers the HyperFrames-shaped timeline")
        self.assertIn('V.scene({ id: "dbt-conveyor" })', html)
        self.assertIn("GSAP 3.15.0", html, "GSAP is inlined with its licence header")
        self.assertIn("<h1>How dbt turns raw data into tables</h1>", html)
        self.assertNotIn("{{TV_", html, "every page slot is filled")

    def test_page_mode_wraps_prose_before_and_after_the_player(self):
        before = self.out / "before.html"
        after = self.out / "after.html"
        before.write_text("<p>The idea first.</p>")
        after.write_text("<p>The trap after.</p>")

        html = self.build("--scene", str(SCENE), "--before", str(before), "--after", str(after))

        self.assertLess(html.index("The idea first."), html.index('<figure class="tv"'))
        self.assertLess(html.index('<figure class="tv"'), html.index("The trap after."))

    def test_fragment_mode_emits_a_pasteable_figure_without_a_document(self):
        html = self.build("--scene", str(SCENE), "--mode", "fragment")

        self.assertTrue(html.startswith("<!-- to-visual fragment: dbt-conveyor"))
        self.assertIn('<figure class="tv" data-tv="dbt-conveyor">', html)
        self.assertNotRegex(html, r"<(html|body|head)\b")
        self.assertIn("if (!window.gsap)", html, "GSAP loads once when several fragments share a page")

    def test_walk_json_becomes_a_walk_scene_and_escapes_script_breakers(self):
        data = json.loads(WALK.read_text())
        data["steps"][0]["caption"] = "a caption with </script> inside"
        walk = self.out / "tricky.walk.json"
        walk.write_text(json.dumps(data))

        html = self.build("--walk", str(walk))

        self.assertIn('V.walk(', html)
        self.assertIn('id: "create-task-lets-two-waits-overlap"', html)
        self.assertIn("<\\/script>", html)
        self.assertEqual(html.count("</script>"), html.count("<script"), "no stray closing tag from the JSON")
        self.assertNotIn("<h1>", html, "a walk draws its own title, so the page header is dropped")

    def test_rejects_a_walk_without_steps_and_a_bad_scene_id(self):
        empty = self.out / "empty.walk.json"
        empty.write_text(json.dumps({"title": "x", "panes": [], "steps": []}))
        self.assertNotEqual(assemble("--walk", str(empty), "--out", str(self.out / "a.html")).returncode, 0)

        bad = self.out / "bad.html"
        bad.write_text("<!-- to-visual scene\nid: Bad_Id\n-->\n<script>V.scene({id:'Bad_Id'})</script>")
        result = assemble("--scene", str(bad), "--out", str(self.out / "b.html"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("kebab-case", result.stderr)

    def test_every_kit_css_rule_is_scoped_under_tv(self):
        css = re.sub(r"/\*.*?\*/", "", (SKILL / "assets/kit.css").read_text(), flags=re.S)
        selectors = [s.strip() for block in re.findall(r"([^{}]+)\{", css) for s in block.split(",")]
        unscoped = [s for s in selectors if s and not s.startswith(".tv")]
        self.assertEqual(unscoped, [], "host pages must not be restyled by the kit")


if __name__ == "__main__":
    unittest.main()
