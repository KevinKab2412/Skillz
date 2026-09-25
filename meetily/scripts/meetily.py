#!/usr/bin/env python3
"""Read-only access to the local Meetily meeting-transcript database.

Usage:
  meetily.py list [--limit N]            Meetings newest first, with segment and character counts
  meetily.py show <meeting>              Full transcript of one meeting, in time order
  meetily.py search <term> [--context N] Matching segments across all meetings, with N segments of context

<meeting> is a meeting id, a date prefix such as 2026-09-21 (newest match wins),
or "latest".

The database is copied (with its -wal/-shm sidecars) to a temp dir before opening,
so the live file is never locked or written and un-checkpointed WAL data is still seen.
Override the location with MEETILY_DB.
"""
import argparse
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

DEFAULT_DB = Path.home() / "Library/Application Support/com.meetily.ai/meeting_minutes.sqlite"


def connect() -> sqlite3.Connection:
    src = Path(os.environ.get("MEETILY_DB", DEFAULT_DB))
    if not src.exists():
        sys.exit(f"Meetily database not found at {src} (set MEETILY_DB to override)")
    tmp = Path(tempfile.mkdtemp(prefix="meetily-"))
    for suffix in ("", "-wal", "-shm"):
        part = Path(f"{src}{suffix}")
        if part.exists():
            shutil.copy2(part, tmp / f"{src.name}{suffix}")
    conn = sqlite3.connect(tmp / src.name)
    conn.row_factory = sqlite3.Row
    return conn


def resolve(conn: sqlite3.Connection, ref: str) -> sqlite3.Row:
    if ref == "latest":
        row = conn.execute("select * from meetings order by created_at desc limit 1").fetchone()
    else:
        row = conn.execute(
            "select * from meetings where id = ? or title like ? or created_at like ? "
            "order by created_at desc limit 1",
            (ref, f"%{ref}%", f"{ref}%"),
        ).fetchone()
    if row is None:
        sys.exit(f"No meeting matches {ref!r}; run `list` to see what exists")
    return row


def segments(conn: sqlite3.Connection, meeting_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        "select transcript, speaker, audio_start_time, timestamp from transcripts "
        "where meeting_id = ? order by audio_start_time, timestamp",
        (meeting_id,),
    ).fetchall()


def fmt(seg: sqlite3.Row) -> str:
    start = seg["audio_start_time"]
    stamp = f"[{int(start // 60):02d}:{int(start % 60):02d}] " if start is not None else ""
    speaker = f"{seg['speaker']}: " if seg["speaker"] else ""
    return f"{stamp}{speaker}{seg['transcript'].strip()}"


def cmd_list(conn, args):
    rows = conn.execute(
        "select m.id, m.title, m.created_at, count(t.id) segs, coalesce(sum(length(t.transcript)), 0) chars "
        "from meetings m left join transcripts t on t.meeting_id = m.id "
        "group by m.id order by m.created_at desc limit ?",
        (args.limit,),
    ).fetchall()
    for r in rows:
        print(f"{r['created_at'][:16]}  {r['segs']:>4} segs  {r['chars']:>6} chars  {r['title']}  ({r['id']})")


def cmd_show(conn, args):
    m = resolve(conn, args.meeting)
    print(f"# {m['title']}  ({m['created_at']})  id={m['id']}\n")
    notes = conn.execute("select * from meeting_notes where meeting_id = ?", (m["id"],)).fetchall() \
        if "meeting_notes" in tables(conn) else []
    for seg in segments(conn, m["id"]):
        print(fmt(seg))
    if notes:
        print("\n## Meetily notes")
        for n in notes:
            print({k: n[k] for k in n.keys() if k not in ("meeting_id",)})


def cmd_search(conn, args):
    term = args.term.lower()
    for m in conn.execute("select * from meetings order by created_at desc"):
        segs = segments(conn, m["id"])
        hits = [i for i, s in enumerate(segs) if term in s["transcript"].lower()]
        if not hits:
            continue
        print(f"\n# {m['title']}  ({m['id']})  {len(hits)} hit(s)")
        shown = set()
        for i in hits:
            window = range(max(0, i - args.context), min(len(segs), i + args.context + 1))
            if shown and min(window) > max(shown) + 1:
                print("  ...")
            for j in window:
                if j not in shown:
                    print(("> " if j == i else "  ") + fmt(segs[j]))
                    shown.add(j)


def tables(conn) -> set[str]:
    return {r[0] for r in conn.execute("select name from sqlite_master where type = 'table'")}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("list"); pl.add_argument("--limit", type=int, default=50); pl.set_defaults(fn=cmd_list)
    ps = sub.add_parser("show"); ps.add_argument("meeting"); ps.set_defaults(fn=cmd_show)
    pq = sub.add_parser("search"); pq.add_argument("term"); pq.add_argument("--context", type=int, default=2)
    pq.set_defaults(fn=cmd_search)
    args = p.parse_args()
    args.fn(connect(), args)


if __name__ == "__main__":
    main()
