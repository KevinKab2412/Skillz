#!/usr/bin/env python3
"""
Build the experiment dataset from real Claude Code session transcripts.

A human "turn" = a distinct `last-prompt` record (harness's own copy of the
submitted prompt); a new turn begins when `leafUuid` changes. We attribute
every `Skill` tool_use to the turn that was current when it fired. Turns that
loaded nothing become negatives (for the "load nothing" / false-positive check
the video flagged).

Outputs (data/):
  catalog.json   [{name, description}]              -- options a router ranks
  events.json    [{project,session,ts,text,skill,user_invoked}]   positives
  negatives.json [{project,session,ts,text}]        turns that loaded no skill
"""
import json, glob, os, re

PROJECTS_ROOT = os.path.expanduser("~/.claude/projects")
SKILLS_ROOT   = os.path.expanduser("~/.claude/skills")
OUT           = os.path.join(os.path.dirname(__file__), "..", "data")


# ------------------------------------------------------------------ catalog ---
def load_catalog():
    cat = {}
    for smd in glob.glob(os.path.join(SKILLS_ROOT, "*", "SKILL.md")):
        try:
            raw = open(os.path.realpath(smd)).read()
        except Exception:
            continue
        m = re.search(r"^---\s*\n(.*?)\n---", raw, re.S)
        if not m:
            continue
        fm = m.group(1)
        nm = re.search(r"^name:\s*(.+)$", fm, re.M)
        name = nm.group(1).strip() if nm else os.path.basename(os.path.dirname(smd))
        dm = re.search(r"^description:\s*(.*?)(?=^\w[\w-]*:\s|\Z)", fm, re.S | re.M)
        desc = re.sub(r"\s+", " ", dm.group(1).replace(">", " ")).strip() if dm else ""
        cat[name] = {"name": name, "description": desc}
    return cat


# ------------------------------------------------------------------- helpers ---
SLASH_RE = re.compile(r"(?:^|\s)/([a-z0-9][a-z0-9:_-]+)")

def clean(text):
    text = re.sub(r"<system-reminder>.*?</system-reminder>", " ", text, flags=re.S)
    text = re.sub(r"<command-[a-z]+>.*?</command-[a-z]+>", " ", text, flags=re.S)
    return re.sub(r"\s+", " ", text).strip()


def walk(path, project):
    events, negatives = [], []
    cur = None            # {text, ts, leaf, slash:set, hit}
    running_ts = None
    session = os.path.basename(path)

    def close(turn):
        if turn and not turn["hit"] and turn["text"]:
            negatives.append({"project": project, "session": session,
                              "ts": turn["ts"], "text": turn["text"][:600]})

    for line in open(path):
        try:
            o = json.loads(line)
        except Exception:
            continue
        ts = o.get("timestamp")
        if ts:
            running_ts = ts

        if o.get("type") == "last-prompt":
            leaf = o.get("leafUuid")
            if cur is None or leaf != cur["leaf"]:
                close(cur)
                txt = clean(o.get("lastPrompt") or "")
                slash = {m.lower() for m in SLASH_RE.findall(txt)}
                cur = {"text": txt, "ts": running_ts, "leaf": leaf,
                       "slash": slash, "hit": False}
            continue

        m = o.get("message") or {}
        cont = m.get("content") if isinstance(m, dict) else None
        if isinstance(cont, list):
            for b in cont:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Skill":
                    skill = (b.get("input") or {}).get("skill")
                    if skill and cur and cur["text"]:
                        cur["hit"] = True
                        base = skill.split(":")[-1]
                        ui = any(s.split(":")[-1] == base for s in cur["slash"])
                        events.append({"project": project, "session": session,
                                       "ts": cur["ts"], "text": cur["text"][:600],
                                       "skill": skill, "user_invoked": ui})
    close(cur)
    return events, negatives


def main():
    cat = load_catalog()
    events, negatives = [], []
    for pdir in glob.glob(os.path.join(PROJECTS_ROOT, "*")):
        project = os.path.basename(pdir)
        for f in glob.glob(os.path.join(pdir, "*.jsonl")):
            e, n = walk(f, project)
            events += e
            negatives += n

    # dedup positives per (session, text, skill)
    seen, ded = set(), []
    for e in events:
        k = (e["session"], e["text"], e["skill"])
        if k not in seen:
            seen.add(k)
            ded.append(e)
    events = ded

    # every ground-truth skill must be rankable
    for e in events:
        cat.setdefault(e["skill"], {"name": e["skill"],
                                    "description": e["skill"].replace("-", " ").replace(":", " ")})

    os.makedirs(OUT, exist_ok=True)
    json.dump(list(cat.values()), open(os.path.join(OUT, "catalog.json"), "w"), indent=1)
    json.dump(events,    open(os.path.join(OUT, "events.json"), "w"), indent=1)
    json.dump(negatives, open(os.path.join(OUT, "negatives.json"), "w"), indent=1)

    from collections import Counter
    ui = sum(1 for e in events if e["user_invoked"])
    multi = sum(v for v in Counter((e["session"], e["text"]) for e in events).values() if v > 1)
    print(f"catalog skills : {len(cat)}")
    print(f"positives      : {len(events)}  (slash-invoked: {ui}, no-slash/NL: {len(events)-ui})")
    print(f"  in multi-skill turns: {multi}")
    print(f"negatives      : {len(negatives)}")
    print("top skills in ground truth:")
    for k, v in Counter(e["skill"] for e in events).most_common(12):
        print(f"   {v:4d}  {k}")
    print("months covered (by ts):",
          dict(Counter((e["ts"] or "?")[:7] for e in events)))


if __name__ == "__main__":
    main()
