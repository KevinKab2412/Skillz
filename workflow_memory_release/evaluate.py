from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).with_name("fixtures")
WORKFLOWS = ("pair",)
CONTRACTS = {
    "recall": "memory.recall/v1",
    "remember": "memory.remember/v1",
    "correct": "memory.correct/v1",
    "forget": "memory.forget/v1",
    "flush": "memory.flush/v1",
}
MEMORY_OPERATIONS = set(CONTRACTS)
REQUIRED_WORKFLOW_CHECKS = {
    "authority",
    "top_five",
    "scope",
    "lifecycle",
    "strict_capture",
    "correction",
    "fail_open",
    "one_warning",
    "nesting",
    "flush",
}


class GateRefused(RuntimeError):
    pass


def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_release_tree(root: Path = ROOT) -> dict[str, Any]:
    release = _json(root / "shared/memory/release.json")
    enabled = tuple(release.get("workflows", []))
    if release.get("schema_version") != "workflow-memory-release/v1":
        raise GateRefused("unknown release schema")
    if release.get("active") is not True or enabled != WORKFLOWS:
        raise GateRefused("automatic memory must activate for exactly the tracked workflows")
    protocol = (root / "shared/memory/workflow-memory.md").read_text()
    if "ordinary runs are active" not in protocol or "evaluation-only" in protocol:
        raise GateRefused("shared protocol is not active")
    for workflow in WORKFLOWS:
        manifest = (root / workflow / "references/.shared").read_text().splitlines()
        modules = [line.split("#", 1)[0].strip() for line in manifest]
        if modules.count("memory") != 1:
            raise GateRefused(f"{workflow} does not request exactly one memory reference")
        skill = (root / workflow / "SKILL.md").read_text()
        if "Workflow memory lifecycle (automatic)" not in skill or "evaluation-only" in skill:
            raise GateRefused(f"{workflow} is not active")
    for workflow in ("pair/references/grill", "pair/references/experts", "code-review"):
        manifest = root / workflow / "references/.shared"
        if manifest.exists() and "memory" in manifest.read_text().splitlines():
            raise GateRefused(f"excluded workflow activated: {workflow}")
        if "Workflow memory lifecycle (automatic)" in (root / workflow / "SKILL.md").read_text():
            raise GateRefused(f"excluded workflow activated: {workflow}")
    return {"active": True, "workflows": list(enabled)}


def validate_install_evidence(root: Path = ROOT) -> dict[str, Any]:
    activation = validate_release_tree(root)
    report_path = root / "workflow_memory_release/report.json"
    if not report_path.exists():
        raise GateRefused("automatic workflow memory release report is missing")
    report = _json(report_path)
    if (
        report.get("schema_version") != "workflow-memory-release-report/v1"
        or report.get("outcome") != "pass"
        or report.get("activation") != activation
    ):
        raise GateRefused("automatic workflow memory release report did not pass")
    workflow_fixture = root / "workflow_memory_release/fixtures/workflows-v1.json"
    retrieval_fixture = root / "workflow_memory_release/fixtures/retrieval-v1.json"
    workflow_suites = report.get("workflow_suites", {})
    if workflow_suites.get("fixture", {}).get("sha256") != _sha256(workflow_fixture):
        raise GateRefused("automatic workflow memory workflow evidence is stale")
    if report.get("retrieval", {}).get("fixture", {}).get("seed_sha256") != _sha256(
        retrieval_fixture
    ):
        raise GateRefused("automatic workflow memory retrieval evidence is stale")
    harness = workflow_suites.get("runner", {}).get("harness_sha256", {})
    if harness != {
        "evaluator": _sha256(root / "workflow_memory_release/evaluate.py"),
        "fake_server": _sha256(root / "workflow_memory_release/fake_memory_server.py"),
    }:
        raise GateRefused("automatic workflow memory runner evidence is stale")
    observed = workflow_suites.get("workflows", {})
    if set(observed) != set(WORKFLOWS) or any(
        set(result.get("checks", {})) != REQUIRED_WORKFLOW_CHECKS
        or not all(result["checks"].values())
        or result.get("warning_count") not in {0, 1}
        for result in observed.values()
    ):
        raise GateRefused("automatic workflow memory workflow evidence failed")
    artifacts = workflow_suites.get("artifacts", {})
    if artifacts != {
        "protocol_sha256": _sha256(root / "shared/memory/workflow-memory.md"),
        "skill_sha256": {
            workflow: _sha256(root / workflow / "SKILL.md") for workflow in WORKFLOWS
        },
    }:
        raise GateRefused("automatic workflow memory evaluated instructions are stale")
    score = report.get("retrieval", {}).get("score", {})
    if (
        score.get("recall_at_five", 0) < 0.9
        or score.get("project_leaks") != 0
        or score.get("inactive_leaks") != 0
        or score.get("passed") is not True
    ):
        raise GateRefused("automatic workflow memory retrieval gate failed")
    return activation


def _between(
    events: list[dict[str, Any]], start: str, end: str
) -> list[dict[str, Any]]:
    try:
        start_index = next(
            index
            for index, event in enumerate(events)
            if event["operation"] in {"mark", "harness_mark"}
            and event["arguments"]["phase"] == start
        )
        end_index = next(
            index
            for index, event in enumerate(events[start_index + 1 :], start_index + 1)
            if event["operation"] in {"mark", "harness_mark"}
            and event["arguments"]["phase"] == end
        )
    except (KeyError, StopIteration) as error:
        raise GateRefused(f"observed workflow trace is missing {start} or {end}") from error
    return events[start_index + 1 : end_index]


def score_workflow_trace(
    workflow: str,
    scenario: dict[str, Any],
    events: list[dict[str, Any]],
    tool_trace: list[dict[str, Any]],
) -> dict[str, Any]:
    completion = _between(events, "boundary:completion:begin", "boundary:completion:end")
    normal_memory = [event for event in completion if event["operation"] in MEMORY_OPERATIONS]
    normal_outcome = next(
        (event for event in completion if event["operation"] == "record_outcome"), None
    )
    if normal_outcome is None:
        raise GateRefused(f"observed workflow trace has no normal outcome for {workflow}")
    nested = (
        _between(events, "nested:begin", "nested:end")
        if scenario["nested_markers"]
        else []
    )
    nested_memory = [
        event["operation"] for event in nested if event["operation"] in MEMORY_OPERATIONS
    ]
    expected_nested = ["remember"] if scenario["nested_capture_kind"] else []
    failure_segments = {
        mode: _between(events, f"failure:{mode}:begin", f"failure:{mode}:end")
        for mode in ("incompatible", "absent")
    }
    failure_memory = {
        mode: [
            event["operation"]
            for event in segment
            if event["operation"] in MEMORY_OPERATIONS
        ]
        for mode, segment in failure_segments.items()
    }
    incompatible_outcome = next(
        (
            event
            for event in failure_segments["incompatible"]
            if event["operation"] == "record_outcome"
        ),
        None,
    )
    absent_output = next(
        (
            event["arguments"].get("text", "")
            for event in failure_segments["absent"]
            if event["operation"] == "assistant_output"
        ),
        "",
    )
    if incompatible_outcome is None:
        raise GateRefused(f"observed workflow trace has no failure outcome for {workflow}")
    absent_lines = [
        line.strip()
        for line in absent_output.splitlines()
        if line.strip() and line.strip() != "WORKFLOW_CONTINUED"
    ]

    boundary_ok = True
    for boundary in scenario["close_boundaries"]:
        segment = _between(events, f"boundary:{boundary}:begin", f"boundary:{boundary}:end")
        operations = [event["operation"] for event in segment if event["operation"] in MEMORY_OPERATIONS]
        if boundary == "completion":
            boundary_ok = boundary_ok and bool(operations)
            boundary_ok = boundary_ok and operations[0] == "recall" and operations[-1] == "flush"
            boundary_ok = boundary_ok and operations.count("recall") == 1
            boundary_ok = boundary_ok and operations.count("flush") == 1
        else:
            boundary_ok = boundary_ok and operations == ["recall", "flush"]

    read_index = next(
        (
            index
            for index, call in enumerate(tool_trace)
            if call["name"] == "Read" and call["input"].get("file_path", "").endswith("authority.json")
        ),
        -1,
    )
    recall_index = next(
        (
            index
            for index, call in enumerate(tool_trace)
            if call["name"].endswith("__recall")
        ),
        -1,
    )
    recalled = [event for event in events if event["operation"] == "recall"]
    captured_kinds = {
        event["arguments"].get("claim_kind")
        for event in normal_memory
        if event["operation"] == "remember"
    }
    rejected = set(scenario["rejected_kinds"])
    all_written_kinds = {
        event["arguments"].get("claim_kind")
        for event in events
        if event["operation"] in {"remember", "correct"}
    }
    global_kinds = set(scenario["global_kinds"])
    writes = [
        event for event in completion if event["operation"] in {"remember", "correct"}
    ]
    scope_ok = all(
        event["arguments"].get("project_id") == scenario["project_id"]
        for event in recalled
    )
    for event in writes:
        arguments = event["arguments"]
        if event["operation"] == "remember" and arguments.get("claim_kind") in global_kinds:
            scope_ok = scope_ok and arguments.get("scope") == "global"
            scope_ok = scope_ok and arguments.get("project_id") is None
        else:
            scope_ok = scope_ok and arguments.get("scope") == "project"
            scope_ok = scope_ok and arguments.get("project_id") == scenario["project_id"]
    checks = {
        "authority": read_index >= 0
        and recall_index > read_index
        and normal_outcome["arguments"].get("selected_authority") == scenario["authority"],
        "top_five": bool(recalled) and all(event["arguments"].get("limit") == 5 for event in recalled),
        "scope": scope_ok,
        "lifecycle": boundary_ok,
        "strict_capture": set(scenario["capture_kinds"]) <= captured_kinds
        and not (rejected & all_written_kinds),
        "correction": sum(
            event["operation"] == "correct"
            and event["arguments"].get("target_memory_id") == "mem-7"
            for event in normal_memory
        )
        == 1,
        "fail_open": failure_memory["incompatible"] == ["recall"]
        and failure_memory["absent"] == []
        and incompatible_outcome["arguments"].get("selected_authority")
        == scenario["authority"]
        and "WORKFLOW_CONTINUED" in absent_output,
        "one_warning": len(incompatible_outcome["arguments"].get("warnings", [])) == 1
        and "private-provider-detail"
        not in " ".join(incompatible_outcome["arguments"].get("warnings", []))
        and len(absent_lines) == 1
        and scenario["project_id"] not in absent_lines[0]
        and "private-provider-detail" not in absent_lines[0],
        "nesting": nested_memory == expected_nested,
        "flush": boundary_ok,
    }
    if not all(checks.values()):
        failed = ", ".join(name for name, passed in checks.items() if not passed)
        observed = [
            event["arguments"].get("phase", event["operation"])
            if event["operation"] == "mark"
            else event["operation"]
            for event in events
        ]
        observed_scope = [
            {
                "operation": event["operation"],
                "kind": event["arguments"].get("claim_kind"),
                "scope": event["arguments"].get("scope"),
                "project_id": event["arguments"].get("project_id"),
            }
            for event in events
            if event["operation"] in {"recall", "remember", "correct"}
        ]
        raise GateRefused(
            f"observed workflow guard failed for {workflow}: {failed}; trace={observed}; "
            f"written_kinds={sorted(str(kind) for kind in all_written_kinds)}; "
            f"scope={observed_scope}; outcomes="
            f"{incompatible_outcome['arguments']}; absent_output={absent_output!r}"
        )
    return {
        "checks": checks,
        "observed_memory_calls": sum(
            event["operation"] in MEMORY_OPERATIONS for event in events
        ),
        "warning_count": max(
            len(incompatible_outcome["arguments"]["warnings"]), len(absent_lines)
        ),
        "filtered_conflicts": 1,
        "rejected_candidates": len(scenario["rejected_kinds"]),
    }


def _workflow_prompt(workflow: str, scenario: dict[str, Any], authority_path: Path) -> str:
    captures = ", ".join(scenario["capture_kinds"])
    rejected = ", ".join(scenario["rejected_kinds"])
    global_kinds = ", ".join(scenario["global_kinds"]) or "none"
    claims = {
        "preference": "Prefer ASCII-only source edits across projects",
        "constraint": "Keep workflow evidence minimal",
        "decision": "Use the approved shared protocol",
        "lesson": "Manifest injection prevents policy copies",
    }
    durable_events = "; ".join(
        f'{kind}: "{claims[kind]}"' for kind in scenario["capture_kinds"]
    )
    nested_event = (
        f'a qualified {scenario["nested_capture_kind"]} event occurs'
        if scenario["nested_capture_kind"]
        else "no event qualifies for generic memory"
    )
    nested_scenario = (
        f"call mark `nested:begin`, invoke a memory-aware nested stage where {nested_event}, then "
        "call mark `nested:end`"
        if scenario["nested_markers"]
        else f"invoke a memory-aware nested stage where {nested_event}"
    )
    extra_boundaries = [
        boundary for boundary in scenario["close_boundaries"] if boundary != "completion"
    ]
    return f"""Run the automatic workflow-memory evaluation scenario for {workflow}. Follow the
installed workflow and shared protocol supplied in the system prompt. Do not ask questions, edit
files, or explain the result. Call exactly one tool at a time and wait for its result before calling
the next tool; never issue parallel tool calls. Derive every memory operation, ordering rule, scope,
limit, warning, and close behavior from the installed instructions rather than from this scenario.

Read {authority_path} with the Read tool and treat it as the workflow's authoritative state for
project `{scenario['project_id']}`.

Call mark `boundary:completion:begin`, then run one ordinary standalone session. During that session:
- separate stable durable events occur for these exact claim kinds: {captures}, represented by these
  separate events: {durable_events}. Process every listed event;
- these kinds are explicitly cross-project: {global_kinds}; every other event has ambiguous scope;
- the user explicitly replaces recalled memory `mem-7` with the project preference "Use direct,
  concise status updates";
- these non-durable events also occur and must be classified: {rejected};
- {nested_scenario};
- the standalone workflow reaches normal completion.
After applying the installed lifecycle behavior, call record_outcome with the authoritative sources
actually selected and the exact warnings emitted in this session. For this evaluator-only bookkeeping
call, copy the JSON `authority` array exactly as read, preserving every item and its order. Do not
summarize, add, remove, rename, or reorder its items.
Then call mark `boundary:completion:end`. These evaluator bookkeeping calls are mandatory.

For each additional outer boundary in this exact order, {json.dumps(extra_boundaries)}, call mark
`boundary:<name>:begin`, run a fresh standalone session using the same authority until that named
explicit boundary occurs, apply the installed lifecycle behavior, and call mark
`boundary:<name>:end`. No candidate events occur in these sessions. Finish one boundary before
starting the next.
"""


def _failure_prompt(
    workflow: str, scenario: dict[str, Any], authority_path: Path, mode: str
) -> str:
    if mode == "absent":
        return f"""Run only the absent-memory scenario for {workflow}. Follow the installed workflow
and shared protocol supplied in the system prompt. Do not ask questions or edit files.

Read {authority_path} with Read and treat it as authoritative state for project
`{scenario['project_id']}`. Start one fresh standalone workflow session normally. The memory operations
are genuinely absent from the available tool set. Follow the installed failure policy, preserve the
authoritative workflow, and continue to completion. In the final response output exactly two lines:
the single privacy-safe warning required by the installed protocol, then `WORKFLOW_CONTINUED`.
"""
    failure = (
        "its opening memory result declares an incompatible v2 contract"
        if mode == "incompatible"
        else "memory is unavailable"
    )
    discovery = (
        "Call the installed open procedure normally; only the recall result will reveal incompatibility."
        if mode == "incompatible"
        else "The memory operations are genuinely absent from the available tool set."
    )
    return f"""Run only the {mode} memory scenario for {workflow}. Follow the installed workflow
and shared protocol supplied in the system prompt. Do not ask questions, edit files, or explain the
result. Call exactly one tool at a time and wait for its result.

Read {authority_path} with Read and treat it as authoritative state for project
`{scenario['project_id']}`. Call mark `failure:{mode}:begin`, then start one fresh standalone workflow
session normally. {discovery} The workflow itself discovers that {failure}. No candidate events occur. Continue
according to the installed failure policy. Regardless of the workflow result, finish evaluator
bookkeeping by calling record_outcome with the authoritative sources actually selected, the exact
warnings emitted in this session. For this evaluator-only bookkeeping call, copy the JSON `authority`
array exactly as read, preserving every item and its order. Do not summarize, add, remove, rename, or
reorder its items. Evaluator tools `mark` and `record_outcome` remain available and are not memory
tools; call them even when memory tools are absent. Then call mark
`failure:{mode}:end`.
"""


def _tool_trace(output: str) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for line in output.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "assistant":
            continue
        for item in event.get("message", {}).get("content", []):
            if item.get("type") == "tool_use":
                calls.append({"name": item["name"], "input": item.get("input", {})})
    return calls


def _assistant_text(output: str) -> str:
    text: list[str] = []
    for line in output.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "assistant":
            continue
        text.extend(
            item.get("text", "")
            for item in event.get("message", {}).get("content", [])
            if item.get("type") == "text"
        )
    combined = "\n".join(part for part in text if part)
    lines = [line.strip() for line in combined.splitlines() if line.strip()]
    if lines and lines[-1] == "WORKFLOW_CONTINUED" and len(lines) >= 2:
        return "\n".join(lines[-2:])
    return combined


def _memory_lifecycle_instructions(skill_text: str, protocol_text: str) -> str:
    start = skill_text.index("## Workflow memory lifecycle (automatic)")
    end = skill_text.find("\n## ", start + 3)
    lifecycle = skill_text[start : end if end >= 0 else None]
    return lifecycle + "\n\n" + protocol_text


def _execute_workflow_prompt(
    claude: str,
    agent_memory_source: Path,
    workflow: str,
    scenario: dict[str, Any],
    failure_mode: str | None,
    instruction_override: str | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    server_path = Path(__file__).with_name("fake_memory_server.py")
    operations = ("mark", "record_outcome")
    if failure_mode != "absent":
        operations = (*CONTRACTS, *operations)
    allowed = [
        "Read",
        *[f"mcp__workflow-memory-eval__{operation}" for operation in operations],
    ]
    with tempfile.TemporaryDirectory(prefix=f"workflow-memory-{workflow}-") as directory:
        workspace = Path(directory)
        authority_path = workspace / "authority.json"
        authority_path.write_text(json.dumps({"authority": scenario["authority"]}, indent=2))
        log_path = workspace / "calls.jsonl"
        config_path = workspace / "mcp.json"
        config_path.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "workflow-memory-eval": {
                            "command": "uv",
                            "args": [
                                "run",
                                "--project",
                                str(agent_memory_source),
                                "python",
                                str(server_path),
                            ],
                            "env": {
                                "WORKFLOW_MEMORY_EVAL_LOG": str(log_path),
                                "WORKFLOW_MEMORY_FAIL": (
                                    "1" if failure_mode == "incompatible" else "0"
                                ),
                                "WORKFLOW_MEMORY_EXPOSE": (
                                    "0" if failure_mode == "absent" else "1"
                                ),
                            },
                        }
                    }
                }
            )
        )
        materialized = workspace / "installed" / workflow
        shutil.copytree(ROOT / workflow, materialized)
        shutil.copytree(ROOT / "shared/memory", materialized / "references/memory")
        skill_text = (materialized / "SKILL.md").read_text()
        protocol_text = (materialized / "references/memory/workflow-memory.md").read_text()
        if instruction_override:
            installed = instruction_override
        elif failure_mode:
            installed = _memory_lifecycle_instructions(skill_text, protocol_text)
        else:
            installed = skill_text + "\n\n" + protocol_text
        command = [
            claude,
            "-p",
            (
                _failure_prompt(workflow, scenario, authority_path, failure_mode)
                if failure_mode
                else _workflow_prompt(workflow, scenario, authority_path)
            ),
            "--append-system-prompt",
            "Follow these installed workflow instructions exactly:\n\n" + installed,
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            "haiku",
            "--max-budget-usd",
            "1",
            "--permission-mode",
            "dontAsk",
            "--disable-slash-commands",
            "--strict-mcp-config",
            "--mcp-config",
            str(config_path),
            "--allowedTools",
            *allowed,
            "--no-session-persistence",
        ]
        env = {key: value for key, value in os.environ.items() if key != "CLAUDECODE"}
        scenario_name = "mutation" if instruction_override else failure_mode or "normal"
        print(
            f"workflow={workflow} scenario={scenario_name} status=started",
            file=sys.stderr,
            flush=True,
        )
        started = time.perf_counter()
        process = subprocess.Popen(
            command,
            cwd=workspace,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(timeout=240)
        except subprocess.TimeoutExpired as error:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate(timeout=15)
            raise GateRefused(f"skill runner timed out for {workflow}") from error
        run = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
        duration = round((time.perf_counter() - started) * 1000)
        print(
            f"workflow={workflow} scenario={scenario_name} status=finished "
            f"returncode={run.returncode} duration_ms={duration}",
            file=sys.stderr,
            flush=True,
        )
        if run.returncode != 0:
            raise GateRefused(f"skill runner failed for {workflow}")
        if not log_path.exists() and failure_mode != "absent":
            raise GateRefused(f"skill runner made no observable calls for {workflow}")
        events = (
            [json.loads(line) for line in log_path.read_text().splitlines()]
            if log_path.exists()
            else []
        )
        if failure_mode == "absent":
            events = [
                {
                    "operation": "harness_mark",
                    "arguments": {"phase": "failure:absent:begin"},
                },
                *events,
                {
                    "operation": "assistant_output",
                    "arguments": {"text": _assistant_text(run.stdout)},
                },
                {
                    "operation": "harness_mark",
                    "arguments": {"phase": "failure:absent:end"},
                },
            ]
        return events, _tool_trace(run.stdout), duration


def _run_workflow_once(
    claude: str,
    agent_memory_source: Path,
    workflow: str,
    scenario: dict[str, Any],
    instruction_override: str | None = None,
) -> tuple[dict[str, Any], int]:
    def validated_run(mode: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
        last_error: GateRefused | None = None
        for attempt in range(1, 4):
            try:
                run = _execute_workflow_prompt(
                    claude,
                    agent_memory_source,
                    workflow,
                    scenario,
                    mode,
                    instruction_override,
                )
            except GateRefused as error:
                last_error = error
                print(
                    f"workflow={workflow} scenario={mode or 'normal'} attempt={attempt} "
                    f"status=rejected reason={last_error}",
                    file=sys.stderr,
                    flush=True,
                )
                continue
            events = run[0]
            try:
                if mode is None:
                    completion = _between(
                        events, "boundary:completion:begin", "boundary:completion:end"
                    )
                    for boundary in scenario["close_boundaries"]:
                        segment = _between(
                            events,
                            f"boundary:{boundary}:begin",
                            f"boundary:{boundary}:end",
                        )
                        operations = [
                            event["operation"]
                            for event in segment
                            if event["operation"] in MEMORY_OPERATIONS
                        ]
                        if operations != ["recall", "flush"] and not (
                            boundary == "completion"
                            and operations
                            and operations[0] == "recall"
                            and operations[-1] == "flush"
                            and operations.count("recall") == 1
                            and operations.count("flush") == 1
                        ):
                            raise GateRefused(f"{boundary} lifecycle calls were {operations}")
                    outcome = next(
                        event
                        for event in completion
                        if event["operation"] == "record_outcome"
                    )
                    if (
                        outcome["arguments"].get("selected_authority") != scenario["authority"]
                        or outcome["arguments"].get("warnings") != []
                    ):
                        raise GateRefused(
                            "normal outcome did not preserve quiet authority: "
                            f"{outcome['arguments']}"
                        )
                    writes = [
                        event
                        for event in completion
                        if event["operation"] in {"remember", "correct"}
                    ]
                    global_kinds = set(scenario["global_kinds"])
                    for event in writes:
                        arguments = event["arguments"]
                        is_global = (
                            event["operation"] == "remember"
                            and arguments.get("claim_kind") in global_kinds
                        )
                        expected_scope = "global" if is_global else "project"
                        expected_project = None if is_global else scenario["project_id"]
                        if (
                            arguments.get("scope") != expected_scope
                            or arguments.get("project_id") != expected_project
                        ):
                            raise GateRefused(
                                f"normal write used invalid scope: {event['operation']} "
                                f"{arguments.get('claim_kind')} {arguments.get('scope')} "
                                f"{arguments.get('project_id')}"
                            )
                    if scenario["nested_markers"]:
                        nested = _between(events, "nested:begin", "nested:end")
                        nested_calls = [
                            event["operation"]
                            for event in nested
                            if event["operation"] in MEMORY_OPERATIONS
                        ]
                        expected_nested = (
                            ["remember"] if scenario["nested_capture_kind"] else []
                        )
                        if nested_calls != expected_nested:
                            raise GateRefused(f"nested calls were {nested_calls}")
                else:
                    segment = _between(
                        events, f"failure:{mode}:begin", f"failure:{mode}:end"
                    )
                    operations = [
                        event["operation"]
                        for event in segment
                        if event["operation"] in MEMORY_OPERATIONS
                    ]
                    expected = ["recall"] if mode == "incompatible" else []
                    if operations != expected:
                        raise GateRefused(f"{mode} memory calls were {operations}")
                    if mode == "incompatible":
                        outcome = next(
                            event
                            for event in segment
                            if event["operation"] == "record_outcome"
                        )
                        if (
                            outcome["arguments"].get("selected_authority")
                            != scenario["authority"]
                            or len(outcome["arguments"].get("warnings", [])) != 1
                        ):
                            raise GateRefused(f"{mode} outcome did not fail open once")
                    else:
                        output = next(
                            event["arguments"].get("text", "")
                            for event in segment
                            if event["operation"] == "assistant_output"
                        )
                        warning_lines = [
                            line.strip()
                            for line in output.splitlines()
                            if line.strip() and line.strip() != "WORKFLOW_CONTINUED"
                        ]
                        if "WORKFLOW_CONTINUED" not in output or len(warning_lines) != 1:
                            raise GateRefused(
                                f"absent output did not fail open once: {output!r}"
                            )
            except (GateRefused, StopIteration) as error:
                last_error = GateRefused(str(error))
                print(
                    f"workflow={workflow} scenario={mode or 'normal'} attempt={attempt} "
                    f"status=rejected reason={last_error}",
                    file=sys.stderr,
                    flush=True,
                )
                continue
            return run
        raise GateRefused(
            f"{mode or 'normal'} scenario failed after three attempts: {last_error}"
        )

    normal_events, normal_trace, normal_duration = validated_run(None)
    failure_runs = [validated_run(mode) for mode in ("incompatible", "absent")]
    return (
        score_workflow_trace(
            workflow,
            scenario,
            normal_events + [event for run in failure_runs for event in run[0]],
            normal_trace + [call for run in failure_runs for call in run[1]],
        ),
        normal_duration + sum(run[2] for run in failure_runs),
    )


def run_instruction_mutation(
    claude: str, agent_memory_source: Path, scenario: dict[str, Any]
) -> dict[str, Any]:
    skill = (ROOT / "pair/SKILL.md").read_text()
    protocol = (ROOT / "shared/memory/workflow-memory.md").read_text()
    mutated_skill = skill.replace(
        "Those stages inherit it: they\nmay capture their own qualified durable events but do not open or close memory again.",
        "Those stages must open their own memory session with recall and flush before returning.",
    )
    mutated_protocol = protocol.replace(
        "A nested memory-aware workflow inherits that active session. It may capture its own qualified durable\nevents, but it does not recall, flush, or start another warning budget.",
        "A nested memory-aware workflow must call recall on entry and flush before returning.",
    ).replace(
        "2. If this is a nested session, inherit the active session and stop the open procedure.",
        "2. If this is a nested session, continue the open procedure and call recall.",
    ).replace(
        "A nested workflow never flushes.",
        "A nested workflow always flushes before returning.",
    )
    if mutated_skill == skill or mutated_protocol == protocol:
        raise GateRefused("nested-session instruction mutation target is stale")
    mutation_source = _memory_lifecycle_instructions(mutated_skill, mutated_protocol)
    events, _, duration = _execute_workflow_prompt(
        claude,
        agent_memory_source,
        "pair",
        scenario,
        None,
        mutation_source,
    )
    nested = _between(events, "nested:begin", "nested:end")
    calls = [
        event["operation"]
        for event in nested
        if event["operation"] in MEMORY_OPERATIONS
    ]
    if "recall" not in calls or "flush" not in calls:
        raise GateRefused("nested-session instruction mutation did not change the observed trace")
    return {
        "name": "nested-session-recall-and-flush",
        "rejected": True,
        "observed_nested_calls": calls,
        "duration_ms": duration,
    }


def run_observed_workflows(
    agent_memory_source: Path,
    path: Path = FIXTURES / "workflows-v1.json",
    workflows: tuple[str, ...] = WORKFLOWS,
    cache_dir: Path | None = None,
) -> dict[str, Any]:
    fixture = _json(path)
    if fixture.get("schema_version") != "workflow-memory-scenarios/v1":
        raise GateRefused("unknown workflow fixture schema")
    claude = shutil.which("claude")
    if claude is None:
        raise GateRefused("Claude Code skill runner is unavailable")
    version = subprocess.run(
        [claude, "--version"], capture_output=True, text=True, check=True
    ).stdout.strip()
    results: dict[str, Any] = {}
    durations: dict[str, int] = {}
    attempts: dict[str, int] = {}
    cache_hits: list[str] = []
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
    common_fingerprint = {
        "fixture": _sha256(path),
        "protocol": _sha256(ROOT / "shared/memory/workflow-memory.md"),
        "evaluator": _sha256(Path(__file__)),
        "fake_server": _sha256(Path(__file__).with_name("fake_memory_server.py")),
        "runner": version,
    }
    for workflow in workflows:
        fingerprint = {
            **common_fingerprint,
            "workflow": workflow,
            "skill": _sha256(ROOT / workflow / "SKILL.md"),
        }
        cache_path = cache_dir / f"{workflow}.json" if cache_dir is not None else None
        if cache_path is not None and cache_path.exists():
            cached = _json(cache_path)
            if cached.get("fingerprint") == fingerprint:
                results[workflow] = cached["result"]
                durations[workflow] = cached["duration_ms"]
                attempts[workflow] = cached["attempt"]
                cache_hits.append(workflow)
                print(
                    f"workflow={workflow} status=cached",
                    file=sys.stderr,
                    flush=True,
                )
                continue
        last_error: GateRefused | None = None
        for attempt in range(1, 2):
            try:
                result, duration = _run_workflow_once(
                    claude, agent_memory_source, workflow, fixture["workflows"][workflow]
                )
            except GateRefused as error:
                last_error = error
                print(
                    f"workflow={workflow} attempt={attempt} status=rejected reason={error}",
                    file=sys.stderr,
                    flush=True,
                )
                continue
            results[workflow] = result
            durations[workflow] = duration
            attempts[workflow] = attempt
            if cache_path is not None:
                cache_path.write_text(
                    json.dumps(
                        {
                            "fingerprint": fingerprint,
                            "result": result,
                            "duration_ms": duration,
                            "attempt": attempt,
                        },
                        indent=2,
                        sort_keys=True,
                    )
                    + "\n"
                )
            break
        else:
            raise GateRefused(
                f"skill runner failed for {workflow}: {last_error}"
            )
    mutation_result = run_instruction_mutation(
        claude, agent_memory_source, fixture["workflows"]["pair"]
    )
    return {
        "fixture": {
            "schema_version": fixture["schema_version"],
            "sha256": _sha256(path),
        },
        "artifacts": {
            "protocol_sha256": _sha256(ROOT / "shared/memory/workflow-memory.md"),
            "skill_sha256": {
                workflow: _sha256(ROOT / workflow / "SKILL.md") for workflow in WORKFLOWS
            },
        },
        "runner": {
            "name": "claude-code-print",
            "version": version,
            "model": "haiku",
            "harness_sha256": {
                "evaluator": _sha256(Path(__file__)),
                "fake_server": _sha256(Path(__file__).with_name("fake_memory_server.py")),
            },
            "duration_ms": durations,
            "attempts": attempts,
            "cache_hits": cache_hits,
            "instruction_mutation": mutation_result,
        },
        "workflows": results,
    }


def score_retrieval(
    fixture: dict[str, Any],
    query_results: dict[str, list[str]],
    leaked_project_ids: set[str],
    leaked_inactive_ids: set[str],
) -> dict[str, Any]:
    expected = sum(len(query["expected"]) for query in fixture["queries"])
    recalled = sum(
        len(set(query["expected"]) & set(query_results.get(query["id"], [])[:5]))
        for query in fixture["queries"]
    )
    rate = recalled / expected if expected else 0.0
    return {
        "relevant_recalled_at_five": recalled,
        "relevant_total": expected,
        "recall_at_five": rate,
        "project_leaks": len(leaked_project_ids),
        "inactive_leaks": len(leaked_inactive_ids),
        "passed": rate >= 0.9 and not leaked_project_ids and not leaked_inactive_ids,
    }


def _candidate(seed: dict[str, Any], index: int) -> dict[str, Any]:
    project_id = seed["project_id"]
    request = {
        "claim": seed["claim"],
        "claim_kind": seed["claim_kind"],
        "scope": seed["scope"],
        "evidence": {
            "excerpt": seed["claim"],
            "source": "workflow-memory-release-fixture/v1",
            "session_id": "task-1052-release-fixture",
            "observed_at": f"2026-08-24T12:{index:02d}:00Z",
        },
        "provenance": {
            "actor": "workflow-memory-release",
            "recorded_at": f"2026-08-24T12:{index:02d}:01Z",
            "extractor_version": "curated-seed/v1",
        },
        "entities": [{"kind": "concept", "value": seed["key"]}],
        "idempotency_key": f"task-1052:{seed['key']}",
        "category": "general",
        "durability": "durable",
        "assertion": "accepted_decision",
    }
    if project_id is not None:
        request["project_id"] = project_id
    return request


async def _exercise_daemon(endpoint: str, fixture: dict[str, Any]) -> dict[str, Any]:
    from mcp import Client

    memory_ids: dict[str, str] = {}
    contracts: dict[str, str] = {}
    inactive_ids = {"mem_04_superseded"}
    foreign_ids = {"mem_03_other_project"}
    latencies: list[float] = []
    query_report: list[dict[str, Any]] = []
    async with Client(endpoint) as client:
        tools = await client.list_tools()
        if {tool.name for tool in tools.tools} != set(CONTRACTS):
            raise GateRefused("real daemon does not expose the five-operation contract")
        for tool in tools.tools:
            declared = tool.output_schema.get("properties", {}).get("contract_version", {}).get("const")
            if declared != CONTRACTS[tool.name]:
                raise GateRefused(f"incompatible public contract: {tool.name}")
            contracts[tool.name] = declared
        for index, seed in enumerate(fixture["seeds"]):
            request = _candidate(seed, index)
            if "corrects" in seed:
                request["target_memory_id"] = memory_ids[seed["corrects"]]
                outcome = await client.call_tool("correct", request)
                inactive_ids.add(memory_ids[seed["corrects"]])
            else:
                outcome = await client.call_tool("remember", request)
            payload = outcome.structured_content
            if outcome.is_error or payload is None or payload.get("status") != "accepted":
                raise GateRefused(f"curated seed rejected: {seed['key']}")
            operation = "correct" if "corrects" in seed else "remember"
            contracts[operation] = payload["contract_version"]
            memory_ids[seed["key"]] = payload["memory_id"]
            if seed["project_id"] == fixture["other_project_id"]:
                foreign_ids.add(payload["memory_id"])

        query_results: dict[str, list[str]] = {}
        leaked_project: set[str] = set()
        leaked_inactive: set[str] = set()
        model: str | None = None
        dimensions: int | None = None
        packages: dict[str, str] = {}
        for query in fixture["queries"]:
            started = time.perf_counter()
            result = await client.call_tool(
                "recall",
                {"query": query["text"], "project_id": fixture["project_id"], "limit": 5},
            )
            latencies.append((time.perf_counter() - started) * 1000)
            payload = result.structured_content
            if result.is_error or payload is None:
                raise GateRefused(f"recall failed: {query['id']}")
            contracts["recall"] = payload["contract_version"]
            packages = payload["diagnostics"]["packages"]
            keys = []
            ranks = []
            reverse_ids = {value: key for key, value in memory_ids.items()}
            for item in payload["memories"]:
                memory_id = item["memory_id"]
                key = reverse_ids.get(memory_id, memory_id)
                keys.append(key)
                ranks.append({"seed": key, "position": item["ranking"]["position"]})
                model = item["ranking"]["model"]
                dimensions = item["ranking"]["dimensions"]
                if memory_id in foreign_ids or (
                    item["scope"] == "project" and item["project_id"] != fixture["project_id"]
                ):
                    leaked_project.add(memory_id)
                if memory_id in inactive_ids:
                    leaked_inactive.add(memory_id)
            query_results[query["id"]] = keys
            query_report.append({"query_id": query["id"], "ranks": ranks})

        smoke = _candidate(
            {
                "key": "lifecycle-smoke",
                "claim": "Automatic workflow memory lifecycle smoke candidate.",
                "claim_kind": "lesson",
                "scope": "project",
                "project_id": fixture["project_id"],
            },
            30,
        )
        opened = await client.call_tool(
            "recall", {"query": "automatic workflow lifecycle", "project_id": fixture["project_id"], "limit": 5}
        )
        captured = await client.call_tool("remember", smoke)
        captured_payload = captured.structured_content
        if captured_payload is None:
            raise GateRefused("lifecycle capture returned no public outcome")
        correction = {**smoke, "target_memory_id": captured_payload["memory_id"]}
        correction["claim"] = "Automatic workflow memory lifecycle smoke was corrected."
        correction["claim_kind"] = "correction"
        correction["idempotency_key"] = "task-1052:lifecycle-smoke:correction"
        corrected = await client.call_tool("correct", correction)
        closed = await client.call_tool("flush", {})
        for operation, result in (
            ("recall", opened), ("remember", captured), ("correct", corrected), ("flush", closed)
        ):
            payload = result.structured_content
            if result.is_error or payload is None or payload["contract_version"] != CONTRACTS[operation]:
                raise GateRefused(f"lifecycle smoke failed: {operation}")
            contracts[operation] = payload["contract_version"]

    score = score_retrieval(fixture, query_results, leaked_project, leaked_inactive)
    if not score["passed"]:
        raise GateRefused("retrieval threshold or leak guard failed")
    return {
        "fixture": {
            "schema_version": fixture["schema_version"],
            "seed_revision": fixture["seed_revision"],
            "seed_sha256": _sha256(FIXTURES / "retrieval-v1.json"),
        },
        "reproducibility": {
            "embedding_model": model,
            "dimensions": dimensions,
            "contract_versions": contracts,
            "report_schema_version": "workflow-memory-release-report/v1",
            "ranking": fixture["ranking"],
            "packages": packages,
        },
        "score": score,
        "queries": query_report,
        "latency_ms": {
            "count": len(latencies),
            "minimum": min(latencies),
            "maximum": max(latencies),
            "mean": sum(latencies) / len(latencies),
        },
        "lifecycle_smoke": {"open": True, "capture": True, "correct": True, "close": True},
    }


def _keychain(action: str, service: str, account: str, secret: str | None = None) -> None:
    command = ["security", f"{action}-generic-password", "-s", service, "-a", account]
    if action == "add":
        command.extend(["-U", "-w", secret or secrets.token_hex(32)])
    subprocess.run(command, check=action == "add", capture_output=True)


def _wait_for_daemon(process: subprocess.Popen[str]) -> None:
    started = time.monotonic()
    while time.monotonic() - started < 45:
        if process.poll() is not None:
            raise GateRefused("isolated real daemon exited during startup")
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(0.1)
            if connection.connect_ex(("127.0.0.1", 8765)) == 0:
                return
        time.sleep(0.05)
    raise GateRefused("isolated real daemon did not start")


def _service_running() -> bool:
    status = subprocess.run(
        ["agent-memory-service", "status"], capture_output=True, text=True, check=False
    )
    return status.returncode == 0 and "running" in status.stdout


def _restore_service() -> None:
    subprocess.run(["agent-memory-service", "start"], check=True, capture_output=True)
    stable_checks = 0
    started = time.monotonic()
    while time.monotonic() - started < 15:
        if _service_running():
            stable_checks += 1
            if stable_checks == 3:
                return
        else:
            stable_checks = 0
        time.sleep(0.25)
    raise GateRefused("normal agent-memory LaunchAgent was not restored")


def run_real_daemon(agent_memory_source: Path, state_dir: Path) -> dict[str, Any]:
    fixture = _json(FIXTURES / "retrieval-v1.json")
    was_running = _service_running()
    service = f"org.k2412.agent-memory.release.{uuid.uuid4()}"
    process: subprocess.Popen[str] | None = None
    if was_running:
        subprocess.run(["agent-memory-service", "stop"], check=True, capture_output=True)
    try:
        _keychain("add", service, "canonical-database")
        _keychain("add", service, "encrypted-outbox")
        env = {
            **os.environ,
            "AGENT_MEMORY_STATE_PATH": str(state_dir / "memory.db"),
            "AGENT_MEMORY_OUTBOX_PATH": str(state_dir / "memory.outbox"),
            "AGENT_MEMORY_KEYCHAIN_SERVICE": service,
        }
        process = subprocess.Popen(
            ["uv", "run", "agent-memory-daemon"],
            cwd=agent_memory_source,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        _wait_for_daemon(process)
        return asyncio.run(_exercise_daemon("http://127.0.0.1:8765/mcp", fixture))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.communicate(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=5)
        _keychain("delete", service, "canonical-database")
        _keychain("delete", service, "encrypted-outbox")
        if was_running:
            _restore_service()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-memory-source", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--workflow-cache", type=Path)
    args = parser.parse_args()
    args.state_dir.mkdir(parents=True, exist_ok=False)
    try:
        workflow_suites = run_observed_workflows(
            args.agent_memory_source.resolve(), cache_dir=args.workflow_cache
        )
        retrieval = run_real_daemon(args.agent_memory_source.resolve(), args.state_dir)
        report = {
            "schema_version": "workflow-memory-release-report/v1",
            "task": 1052,
            "activation": validate_release_tree(),
            "workflow_suites": workflow_suites,
            "retrieval": retrieval,
            "outcome": "pass",
        }
    except GateRefused as error:
        report = {
            "schema_version": "workflow-memory-release-report/v1",
            "task": 1052,
            "outcome": "refuse",
            "reason": str(error),
        }
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        return 1
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
