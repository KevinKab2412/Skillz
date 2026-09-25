---
name: meetily
description: >
  Read, search, and summarise meeting transcripts recorded by the local Meetily app, which stores
  them in a SQLite database on this Mac. Lists meetings, finds the right one by date or by what was
  said (a person, a ticket, a topic), dumps the full transcript in time order, and turns it into a
  rundown of decisions, asks, owners, and open questions. Use whenever the user asks about a meeting,
  call, 1:1, standup, or sync they had — "what did Jason and I talk about", "summarise my last
  meeting", "what did we decide on X in Tuesday's call", "find the meeting where we discussed Y",
  "what tasks did I get in my 1:1", "read my Meetily transcripts", "/meetily" — even when they don't
  name Meetily, as long as the meeting was recorded on this machine.
---

# meetily

Meetily records meetings locally and writes transcripts to
`~/Library/Application Support/com.meetily.ai/meeting_minutes.sqlite`. This skill reads that
database without ever writing to it, finds the meeting the user means, and reports what was said.

## Tooling

Always go through the bundled script. It copies the database (and its `-wal`/`-shm` sidecars) to a
temp dir before opening it, which avoids two traps: opening the live file with `sqlite3 -readonly`
fails with "unable to open database file", and `?immutable=1` silently skips data still in the WAL,
so a meeting that just ended can be missing.

```bash
S=~/.agents/skills/meetily/scripts/meetily.py
python3 $S list                        # newest first: date, segments, chars, title, id
python3 $S search "jason" --context 2  # hits across every meeting, with surrounding segments
python3 $S show 2026-09-21             # full transcript; accepts an id, a date prefix, or "latest"
```

Set `MEETILY_DB` to point it at a different file.

## Workflow

1. **Find the meeting.** Titles are just recording timestamps (`Meeting 2026-09-21_13-36-27`), so a
   title never tells you who was there or what it was about. Start with `list`. If the user
   identifies the meeting by content ("the 1:1 with Jason about while he's away"), `search` for two
   or three distinctive phrases a speaker would actually say ("while I'm out", "away", a name), then
   check the candidate dates against what the user said.
2. **Confirm it's the right one.** Several meetings can match. Read the leading candidate in full
   with `show`, and if a second one also fits, say so in the answer and offer to pull it too
   rather than silently picking one.
3. **Read the whole transcript** before summarising. Asks and priorities are often spread out and
   sometimes only come up near the end ("and change those PRs before I go").
4. **Report.** Lead with the date and the context (who, why, any dates such as travel or return).
   Group content by theme in priority order as the speaker gave it, marking what is explicitly the
   user's to own, deadlines, warnings, and decisions. Put open questions and loose ends last.

## Reading the transcripts

- **No speaker labels.** The `speaker` column is empty in practice. Work out who said what from
  context (the person handing out tasks, "while I'm out", who answers "yeah, that makes sense"), and
  hedge where it matters.
- **Transcription errors.** Proper nouns and jargon come through mangled — "runster" for Dagster,
  "BT build" for dbt build, "slot grenades" for "AI slop grenades". Correct them from the user's
  project context when you're confident, and tell the user the transcript is machine-generated so
  they know the names are best guesses.
- **Segments are fragments.** One sentence can be split across rows or be interleaved with
  filler ("Yeah.", "Um"). Summarise meaning; never quote a fragment as though it were a full
  statement.
- Empty meetings (0 segments) are recordings that never captured audio; skip them.

## Boundaries

- Read-only. Never write to, vacuum, or migrate the Meetily database; the script only ever opens a
  temp copy.
- Transcripts are private conversations. Keep excerpts in the chat; don't post them to Slack,
  Linear, GitHub, or a doc unless the user asks for that specifically.
