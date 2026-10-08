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


VIEW = SKILL / "assets/examples/trash.view.json"
sys.path.insert(0, str(SKILL / "scripts"))
import concept_view  # noqa: E402


class ConceptViewTest(unittest.TestCase):
    def test_view_page_holds_inventory_recorded_watch_play_and_check(self):
        out = Path(tempfile.mkdtemp()) / "view.html"
        result = assemble("--view", str(VIEW), "--out", str(out))
        self.assertEqual(result.returncode, 0, result.stderr)
        html = out.read_text()

        self.assertNotRegex(html, r"<script[^>]*\bsrc=")
        for marker in ("V.inventory(", "V.trace(", "V.machine(MACHINE", "V.quiz(", 'data-composition-id="trash-concept"'):
            self.assertIn(marker, html)
        self.assertIn("recorded · test_deleted_item_can_be_restored · step 2/5", html)
        self.assertIn("OTHER RECORDED TESTS · EMPTYING, AND THE SPACE TRAP", html)

    def test_view_fragment_has_no_document_shell(self):
        out = Path(tempfile.mkdtemp()) / "frag.html"
        result = assemble("--view", str(VIEW), "--mode", "fragment", "--out", str(out))
        self.assertEqual(result.returncode, 0, result.stderr)
        html = out.read_text()
        self.assertNotRegex(html, r"<(html|body|head)\b")
        self.assertIn('class="tvc"', html)
        self.assertIn('<figure class="tv"', html)

    def test_watch_beats_come_from_the_recorded_trace(self):
        watch = concept_view.build_watch(json.loads(VIEW.read_text())["watch"], VIEW.parent)
        delete, restore_after_empty = watch["beats"][1], watch["beats"][5]

        self.assertEqual(delete["req"], "delete item 1")
        self.assertEqual(delete["tables"]["items"], [{"cells": ["1", "report.pdf", "120", "in the trash"], "flag": "changed"}])
        self.assertFalse(restore_after_empty["ok"])
        self.assertEqual(restore_after_empty["res"], "404 · not_in_trash")

    def test_rows_are_flagged_new_changed_and_gone(self):
        prev = {"t": {1: ["a", "live"], 2: ["b", "live"]}}
        cur = {"t": {1: ["a", "revoked"], 3: ["c", "live"]}}
        flags = {tuple(r["cells"]): r["flag"] for r in concept_view.diff(prev, cur)["t"]}
        self.assertEqual(flags, {("a", "revoked"): "changed", ("c", "live"): "new", ("b", "live"): "gone"})

    def test_cell_formatters(self):
        fmt = concept_view.fmt_cell
        self.assertEqual(fmt("+3600s", {"fmt": "duration"}), "1 h")
        self.assertEqual(fmt("-31s", {"fmt": "duration"}), "31 s")
        self.assertEqual(fmt(["https://example.com/mcp"], {"fmt": "join", "map": {"example.com": "prod"}}), "prod")
        self.assertEqual(fmt(None, {"fmt": "flag", "labels": ["revoked", "live"]}), "live")
        self.assertEqual(fmt("abcdefghijk", {"fmt": "short"}), "abcdef…")

    def test_routes_match_on_method_path_glob_and_params(self):
        routes = [{"method": "POST", "path": "/oauth/token/", "params": {"grant_type": "refresh_token"}, "label": "refresh", "from": "c", "to": "a"},
                  {"method": "POST", "path": "/oauth/token/", "label": "exchange", "from": "c", "to": "a"},
                  {"path": "/items/*/delete/", "label": "delete", "from": "c", "to": "a"}]
        pick = lambda m, p, params=None: concept_view.route_for({"method": m, "path": p, "params": params}, routes)["label"]
        self.assertEqual(pick("POST", "/oauth/token/", {"grant_type": "refresh_token"}), "refresh")
        self.assertEqual(pick("POST", "/oauth/token/", {"grant_type": "authorization_code"}), "exchange")
        self.assertEqual(pick("POST", "/items/7/delete/"), "delete")
        with self.assertRaises(SystemExit):
            pick("GET", "/nowhere/")

    def test_beats_find_their_test_in_any_stacks_naming_style(self):
        find = lambda tests, name: concept_view.find_test(dict.fromkeys(tests, []), name)[0]
        self.assertEqual(find(["TrashTests.test_restore", "TrashTests.test_cannot_restore"], "test_restore"), "TrashTests.test_restore")
        self.assertEqual(find(["test_trash.py::test_restore"], "test_restore"), "test_trash.py::test_restore")
        self.assertEqual(find(["TrashTests › deleted item can be restored"], "test_deleted_item_can_be_restored"),
                         "TrashTests › deleted item can be restored")
        with self.assertRaisesRegex(SystemExit, "ambiguous"):
            find(["A restore", "B restore"], "test_restore")
        with self.assertRaisesRegex(SystemExit, "none"):
            find(["TrashTests.test_restore"], "test_empty")

    def test_provenance_names_the_test_without_its_suite(self):
        name = concept_view.test_name
        self.assertEqual(name("TrashTests.test_restore"), "test_restore")
        self.assertEqual(name("tests/test_trash.py::test_restore"), "test_restore")
        self.assertEqual(name("TrashTests › returns 2.5 items"), "returns 2.5 items")
