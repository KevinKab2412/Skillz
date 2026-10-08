#!/usr/bin/env python3
"""Assemble a to-visual scene (or a step-through walk JSON) into one self-contained HTML file.

    assemble.py --scene my-scene.html --out explanations/visual-my-scene-2026-10-08.html
    assemble.py --walk walk.json --out explanations/explain-x-2026-10-08-walk.html
    assemble.py --scene my-scene.html --mode fragment --out figure.html   # paste into a host page
    assemble.py --view change.view.json --out explanations/concepts-pr-123.html  # concept view of a change

Everything (kit CSS, GSAP, kit JS, the scene) is inlined, so the result opens from file://.
Only Google Fonts load from the network, with system fallbacks when offline.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
FONTS = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;1,400'
    '&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">'
)
HEADER_RE = re.compile(r"<!--\s*to-visual scene\b(.*?)-->", re.S)
SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
ID_RE = re.compile(r"[a-z][a-z0-9-]*")
SLOT_RE = re.compile(r"\{\{TV_([A-Z]+)\}\}")


def asset(name: str) -> str:
    return (ASSETS / name).read_text()


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s if s and s[0].isalpha() else f"v-{s or 'scene'}"


def parse_scene(text: str, fallback_id: str) -> dict:
    """A scene file: an optional `<!-- to-visual scene … -->` header (id, title, kicker),
    then style + markup (placed inside the composition root) and scripts (run after it)."""
    meta = {}
    m = HEADER_RE.search(text)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip()] = value.strip()
        text = text[: m.start()] + text[m.end():]
    scene_id = meta.get("id") or fallback_id
    if not ID_RE.fullmatch(scene_id):
        raise SystemExit(f"assemble: scene id must be lowercase kebab-case, got {scene_id!r}")
    return {
        "id": scene_id,
        "title": meta.get("title", ""),
        "kicker": meta.get("kicker", "Explain"),
        "markup": SCRIPT_RE.sub("", text).strip(),
        "script": "\n".join(SCRIPT_RE.findall(text)).strip(),
        "walk": False,
    }


def parse_walk(data: dict, fallback_id: str) -> dict:
    """The step-through JSON (title, lede, panes, steps) — the schema stepper.html used."""
    if not data.get("steps"):
        raise SystemExit("assemble: walk JSON has no steps")
    scene_id = slug(data.get("id") or data.get("title") or fallback_id)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return {
        "id": scene_id,
        "title": data.get("title", ""),
        "kicker": "Step through",
        "markup": "",
        "script": f'V.walk({payload}, {{ id: "{scene_id}" }});',
        "walk": True,
    }


def head(walk: bool, view: bool = False) -> str:
    parts = [
        FONTS,
        f"<style>\n{asset('kit.css')}\n</style>",
        # Guarded so several fragments on one host page load GSAP once.
        f"<script>if (!window.gsap) {{\n{asset('vendor/gsap.min.js')}\n}}</script>",
        f"<script>\n{asset('kit.js')}\n</script>",
    ]
    if walk:
        parts.append(f"<script>\n{asset('walk.js')}\n</script>")
    if view:
        parts.append(f"<style>\n{asset('concept.css')}\n</style>")
        parts.append(f"<script>\n{asset('trace.js')}\n</script>")
        parts.append(f"<script>\n{asset('concept.js')}\n</script>")
    return "\n".join(parts)


def figure(scene: dict) -> str:
    sid = scene["id"]
    return (
        f'<figure class="tv" data-tv="{sid}">\n'
        '<div class="tv-viewport"><div class="tv-canvas">\n'
        f'<div class="tv-root" id="{sid}" data-composition-id="{sid}" data-start="0" '
        'data-width="1920" data-height="1080">\n'
        f"{scene['markup']}\n"
        "</div>\n</div></div>\n"
        f"<script>\n{scene['script']}\n</script>\n"
        "</figure>"
    )


def fill(template: str, slots: dict) -> str:
    # One pass, so inlined code is never re-scanned for slots.
    return SLOT_RE.sub(lambda m: slots[m.group(1)], template)


def prose(path: str | None) -> str:
    if not path:
        return ""
    return f'<section class="tv-prose">\n{Path(path).read_text().strip()}\n</section>'


def build(scene: dict, mode: str, title: str | None, before: str = "", after: str = "") -> str:
    """before/after are ready HTML (prose sections, or a concept view's inventory, play and check)."""
    view = scene.get("trace", False)
    if mode == "fragment":
        return (
            f"<!-- to-visual fragment: {scene['id']} · paste into the host page's figure slot -->\n"
            f"{head(scene['walk'], view)}\n{before}\n{figure(scene)}\n{after}\n"
        )
    page_title = html.escape(title or scene["title"] or scene["id"])
    # A walk draws its own title inside the frame; a scene's page header names the topic.
    header = "" if scene["walk"] else (
        f'<div class="tv-page-kicker"><b>✱</b> {html.escape(scene["kicker"])}</div>\n  <h1>{page_title}</h1>'
    )
    return fill(
        asset("page.html"),
        {
            "TITLE": page_title,
            "HEADER": header,
            "HEAD": head(scene["walk"], view),
            "BEFORE": before,
            "FIGURE": figure(scene),
            "AFTER": after,
        },
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--scene", help="scene file (header + style + markup + script)")
    src.add_argument("--walk", help="step-through walk JSON")
    src.add_argument("--view", help="concept view spec JSON (inventory · recorded watch · play · check)")
    ap.add_argument("--out", required=True, help="output HTML path")
    ap.add_argument("--mode", choices=["page", "fragment"], default="page")
    ap.add_argument("--title", help="page title (defaults to the scene's)")
    ap.add_argument("--before", help="HTML file with prose shown above the player")
    ap.add_argument("--after", help="HTML file with prose shown below the player")
    args = ap.parse_args(argv)

    before, after = prose(args.before), prose(args.after)
    if args.scene:
        path = Path(args.scene)
        scene = parse_scene(path.read_text(), slug(path.stem.replace(".scene", "")))
    elif args.walk:
        path = Path(args.walk)
        scene = parse_walk(json.loads(path.read_text()), slug(path.stem))
    else:
        from concept_view import build_view  # same directory

        path = Path(args.view)
        view = json.loads(path.read_text())
        if not ID_RE.fullmatch(view.get("id", "")):
            raise SystemExit(f"assemble: view id must be lowercase kebab-case, got {view.get('id')!r}")
        built = build_view(view, path.parent)
        scene = built["scene"]
        before, after = before + built["before"], built["after"] + after

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(scene, args.mode, args.title, before, after))
    print(f"wrote {out} ({args.mode}, scene #{scene['id']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
