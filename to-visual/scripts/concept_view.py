"""Build a concept view (inventory · recorded watch · play · check) from a view spec.

The watch part comes from a trace written by a recorder in ``recorders/``: each beat is one recorded
request and each table row one recorded database row. The spec only says how to *read*
the trace: which requests go between which actors (routes), which model fields become
which columns (tables), and which steps to show with which captions (beats).
"""
from __future__ import annotations

import fnmatch
import html
import json
import re
from pathlib import Path


class SpecError(SystemExit):
    pass


# ---------------------------------------------------------------- trace reading
def load_trace(path: Path) -> dict:
    data = json.loads(path.read_text())
    return data["tests"] if "tests" in data else data  # legacy: {test: [steps]}


SEPARATORS = (".", "::", " › ")


def _words(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def find_test(tests: dict, name: str) -> tuple[str, list]:
    """Find a beat's test across naming styles, strictest tier first.

    Exact id; then the id's last part (``Class.test_x``, ``file.py::test_x``, ``Suite › test x``); then
    the same words, so ``test_deleted_item_can_be_restored`` also finds the Jest test
    ``TrashTests deleted item can be restored``.
    """
    words = re.sub(r"^test ", "", _words(name))
    tiers = (
        lambda t: t == name,
        lambda t: any(t.endswith(sep + name) for sep in SEPARATORS),
        lambda t: bool(words) and (" " + _words(t)).endswith(" " + words),
    )
    for matches in tiers:
        found = [t for t in tests if matches(t)]
        if len(found) == 1:
            return found[0], tests[found[0]]
        if found:
            raise SpecError(f"concept view: test {name!r} is ambiguous, it matches {sorted(found)}")
    raise SpecError(f"concept view: test {name!r} matched none of the recorded tests: {sorted(tests)}")


def test_name(test_id: str) -> str:
    """The test's own name, without its class, module or suite (a description may hold dots)."""
    for sep in (" › ", "::"):
        test_id = test_id.rsplit(sep, 1)[-1]
    _, dot, tail = test_id.rpartition(".")
    return tail if dot and " " not in tail else test_id


# ---------------------------------------------------------------- formatting
class _Context(dict):
    def __missing__(self, key):
        return ""


def context(step: dict) -> _Context:
    ctx = _Context(status=step.get("status", ""), method=step.get("method", ""), path=step.get("path", ""))
    for prefix, src in (("p_", step.get("params")), ("r_", step.get("response")), ("q_", (step.get("redirect") or {}).get("query"))):
        if isinstance(src, dict):
            for k, v in src.items():
                ctx[prefix + k] = ", ".join(map(str, v)) if isinstance(v, list) else ("" if v is None else v)
    return ctx


def fmt_cell(value, col: dict) -> str:
    kind = col.get("fmt", "value")
    if kind == "duration":
        if not value:
            text = "—"
        else:
            secs = abs(int(str(value).rstrip("s")))
            text = f"{round(secs / 86400)} d" if secs >= 86400 else f"{round(secs / 3600)} h" if secs >= 3600 else f"{secs} s"
    elif kind == "join":
        text = ", ".join(map(str, value)) if isinstance(value, list) and value else "—"
    elif kind == "flag":
        labels = col.get("labels", ["yes", "no"])
        text = labels[0] if value not in (None, "", False, [], 0) else labels[1]
    elif kind == "short":
        s = "" if value is None else str(value)
        text = s if len(s) <= 8 else s[:6] + "…"
    else:
        text = "—" if value in (None, "") else str(value)
    for needle, replacement in (col.get("map") or {}).items():
        if text == needle or needle in text:
            return replacement
    return text


def route_for(step: dict, routes: list) -> dict:
    for route in routes:
        if route.get("method") and route["method"].upper() != step.get("method"):
            continue
        if route.get("path") and not fnmatch.fnmatchcase(step.get("path", ""), route["path"]):
            continue
        params = step.get("params") or {}
        if any(params.get(k) != v for k, v in (route.get("params") or {}).items()):
            continue
        return route
    raise SpecError(f"concept view: no route matches {step.get('method')} {step.get('path')}")


def default_response(step: dict) -> str:
    status, body, query = step.get("status"), step.get("response") or {}, (step.get("redirect") or {}).get("query") or {}
    if isinstance(body, dict) and body.get("error"):
        return f"{status} · {body['error']}"
    if query.get("error"):
        return f"{status} · {query['error']}"
    if status == 404:
        return "404 · not found"
    if isinstance(body, dict) and body:
        parts = [f"{k} {', '.join(map(str, v)) if isinstance(v, list) else v}" for k, v in list(body.items())[:2]]
        return f"{status} · " + " · ".join(parts)
    return str(status)


def rows_of(state: dict, tables: list) -> dict:
    out = {}
    for table in tables:
        key = table.get("key", "id")
        out[table["id"]] = {
            row.get(key): [fmt_cell(row.get(col["field"]), col) for col in table["cols"]]
            for row in state.get(table["model"], [])
        }
    return out


def diff(prev: dict, cur: dict) -> dict:
    out = {}
    for table_id, rows in cur.items():
        before = prev.get(table_id, {})
        listed = [{"cells": cells, "flag": "new" if rid not in before else ("changed" if before[rid] != cells else "")}
                  for rid, cells in rows.items()]
        listed += [{"cells": cells, "flag": "gone"} for rid, cells in before.items() if rid not in rows]
        out[table_id] = listed
    return out


# ---------------------------------------------------------------- the watch part
def build_watch(watch: dict, base: Path) -> dict:
    tests = load_trace(base / watch["trace"])
    tables, routes = watch["tables"], watch["routes"]
    beats = []
    for beat in watch["beats"]:
        test_id, steps = find_test(tests, beat["test"])
        n = int(beat["step"])
        if not 1 <= n <= len(steps):
            raise SpecError(f"concept view: {test_id} has {len(steps)} steps, beat asks for step {n}")
        step = steps[n - 1]
        prev = rows_of(steps[n - 2]["state"], tables) if n > 1 else {}
        route, ctx = route_for(step, routes), context(step)
        ok = step["status"] < 400 and not ((step.get("redirect") or {}).get("query") or {}).get("error")
        beats.append({
            "caption": beat["caption"],
            "prov": f"recorded · {test_name(test_id)} · step {n}/{len(steps)}",
            "from": route["from"], "to": route["to"],
            "req": (beat.get("label") or route.get("label") or "{method} {path}").format_map(ctx),
            "res": (beat.get("res") or route.get("res") or "").format_map(ctx) or default_response(step),
            "ok": ok, "trap": bool(beat.get("trap")),
            "tables": diff(prev, rows_of(step["state"], tables)),
        })
    return {
        "kicker": watch.get("kicker", ""), "headline": watch.get("headline", ""),
        "divider": watch.get("divider", "OTHER RECORDED TESTS"),
        "actors": watch["actors"],
        "tables": [{"id": t["id"], "title": t["title"], "cols": [c.get("label", c["field"]) for c in t["cols"]],
                    "widths": t.get("widths")} for t in tables],
        "beats": beats,
    }


# ---------------------------------------------------------------- page sections
def _json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def build_view(view: dict, base: Path) -> dict:
    """Return the pieces assemble.py needs: scene (watch), before/after HTML, title, kicker."""
    vid = view["id"]
    watch = build_watch(view["watch"], base)
    esc = html.escape
    before = [
        f'<section class="tvc"><p class="tvc-lede">{view.get("lede", "")}</p>',
        f'<h2>{esc(view.get("concepts_title", "Concepts this change touches"))}</h2><div class="tvc-inventory" id="{vid}-inventory"></div>',
        f'<script>V.inventory(document.getElementById("{vid}-inventory"), {_json({"concepts": view.get("concepts", []), "syncs": view.get("syncs", []), "order": view.get("order", [])})});</script>',
        f'<h2>{esc(view.get("watch_title", "Watch"))}</h2><p class="tvc-intro">{view["watch"].get("intro", "")}</p></section>',
    ]
    after = []
    play = view.get("play")
    if play:
        script = (base / play["script"]).read_text()
        after.append(f'<section class="tvc"><h2>{esc(play.get("title", "Play: run the concept yourself"))}</h2>'
                     f'<p class="tvc-intro">{play.get("intro", "")}</p><div class="tvc-machine" id="{vid}-machine"></div>'
                     f'<script>(function () {{ var MACHINE = document.getElementById("{vid}-machine");\n{script}\n}})();</script></section>')
    if view.get("check"):
        after.append(f'<section class="tvc"><h2>Check</h2><p class="tvc-intro">{view.get("check_intro", "")}</p>'
                     f'<div class="tvc-quiz" id="{vid}-quiz"></div>'
                     f'<script>V.quiz(document.getElementById("{vid}-quiz"), {_json(view["check"])});</script></section>')
    return {
        "scene": {"id": vid, "title": view.get("title", ""), "kicker": view.get("kicker", "Concept view"),
                  "markup": "", "script": f'V.trace({_json(watch)}, {{ id: "{vid}" }});', "walk": False, "trace": True},
        "before": "\n".join(before), "after": "\n".join(after),
    }
