---
name: utils
description: >
  Prepare standup updates, read and search local Meetily meeting transcripts, draft meeting
  follow-up tickets, and run evidence-led coding retrospectives. Use for "write today's standup",
  "summarise my last meeting", "what did Jason ask me to do", "draft tickets from my recent
  meeting notes", "retro on this session/week's PRs", or /utils. Recognise Meetly as Meetily.
  Combine meeting evidence with standups or follow-ups when requested, even without a skill name.
argument-hint: "[standup | meeting | tickets | retro] [request]"
---

# Utils

Route the request to the smallest useful workflow. Read only the modules needed, then follow their
instructions. Resolve module links relative to this file; resolve each module's resources relative
to that module. Other skills may read these modules directly without running this router.

## Choose the workflow

| Intent | Read and execute |
|---|---|
| Daily update, recent work, yesterday/today/blockers | [Standup](references/standup/SKILL.md) |
| Find, read, search, or summarise a recorded meeting, call, 1:1, or sync | [Meetily](references/meetily/SKILL.md) |
| Tickets or action items from meeting notes | Meetily first, then the follow-up steps below |
| Improve the agent environment after a coding session or PRs | [Retro](references/retro/SKILL.md) |

A bare `/utils` asks: "What do you need: a standup, meeting notes, follow-up tickets, or a coding retro?"
When the request is clear, execute it directly without showing a menu. A standup update uses Standup;
a request about what was said in a standup meeting uses Meetily. Clarify only when the distinction
or scope materially changes the work.

## Combine workflows

For "write my standup using yesterday's meeting", read both modules. Use Standup's history window
and format, and Meetily's complete transcript as evidence. Distinguish commitments from completed
work; a meeting assignment alone does not establish that it was done.

For meeting-driven requests, default to the local Meetily source unless the user supplies notes or
names another source. Use supplied notes directly; disclose missing integrations or unavailable
recordings rather than inventing content.

## Meeting follow-ups

1. Find and read the relevant complete transcript using Meetily, or read the supplied notes.
2. Extract actionable asks and decisions. Distinguish explicit assignments from inferred work;
   mark uncertain owners, deadlines, and scope as open questions.
3. Draft each ticket with a title, goal, evidence-backed scope, acceptance criteria, and any stated
   owner or deadline. Label proposed acceptance criteria as proposals when the meeting did not
   establish them. Avoid unnecessary private transcript quotations.
4. Deliver drafts in chat by default. Keep Linear and Jira read-only: never create tickets,
   comment, edit, or change status there, even when requested. Offer paste-ready drafts instead.
   If explicitly asked to create planning issues, use only `K2412/planning`, with
   `-R K2412/planning` on every `gh issue` or `gh label` call; scope API calls to that repo too.
   A request to create Linear tickets does not authorize writing to a different destination.

Stop when the requested artifact is delivered and any selected module's completion steps are done.
Skill Creator remains project-local and outside this bundle.
