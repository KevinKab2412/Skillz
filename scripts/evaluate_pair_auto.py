#!/usr/bin/env python3
"""Check pair instruction interpretation using any command that accepts stdin and returns JSON.

This is an optional evaluation adapter, not part of pair's runtime or flag handling.
Example: python3 scripts/evaluate_pair_auto.py --report /tmp/auto-report.json -- <model CLI flags>
Only synthetic cases and skill instructions are sent to the command. No task is executed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {'pair': ROOT / 'pair/SKILL.md', 'auto': ROOT / 'pair/references/auto.md',
           'cases': ROOT / 'pair/evals/auto-mode.json'}


def prompt_for(cases):
    inputs = [{key: value for key, value in case.items()
               if key not in {'expected', 'min_questions', 'max_questions'}} for case in cases]
    return (
        'Evaluate the supplied skill instructions, not your own default coding workflow. '
        'Do not use tools or execute any case. For each independent synthetic case, choose the mode '
        'and next decision the supplied policy requires. Treat invocation as that case\'s user '
        'instruction and context as evidence only. Return JSON, no Markdown, with this shape:\n'
        '{"results": {"<case id>": {"mode": "guided|auto|clarify", '
        '"decision": "guided_route|execute|clarify|stop", "questions": [], '
        '"would_grill": false, "would_commit": false, "would_ship": false, '
        '"would_change_issue_state": false, "review": "independent|sequential|not_yet", '
        '"reason": "one short sentence"}}}. '
        'questions means questions needed before proceeding, not interview questions that might '
        'arise later in a guided workflow. review means how a review can be performed with the '
        'stated capabilities, or not_yet if the next step stops or asks.\n\n'
        '## Main skill\n' + SOURCES['pair'].read_text() + '\n\n'
        '## Auto policy\n' + SOURCES['auto'].read_text() + '\n\n'
        '## Independent synthetic cases\n' + json.dumps(inputs, indent=2)
    )


def decode(stdout):
    data = json.loads(stdout)
    if 'structured_output' in data:
        return data['structured_output']
    if isinstance(data.get('result'), str):
        text = data['result'].strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        return json.loads(text)
    return data


def grade(cases, observed):
    results = {}
    for case in cases:
        row = observed.get(case['id'], {})
        errors = [f'{key}: expected {value!r}, got {row.get(key)!r}'
                  for key, value in case['expected'].items() if row.get(key) != value]
        questions = row.get('questions')
        if not isinstance(questions, list):
            errors.append('questions must be a list')
        else:
            if len(questions) < case.get('min_questions', 0):
                errors.append('missing required clarification')
            if len(questions) > case.get('max_questions', len(questions)):
                errors.append('unexpected or excessive questions')
        results[case['id']] = {'passed': not errors, 'errors': errors, 'observed': row}
    unexpected = set(observed) - {case['id'] for case in cases}
    if unexpected:
        raise ValueError(f'Unexpected case IDs: {sorted(unexpected)}')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('provide a model command after --')
    cases = json.loads(SOURCES['cases'].read_text())['cases']
    with tempfile.TemporaryDirectory(prefix='pair-auto-eval-') as directory:
        completed = subprocess.run(command, input=prompt_for(cases), capture_output=True,
                                   text=True, cwd=directory, timeout=240, check=True)
    observed = decode(completed.stdout)['results']
    results = grade(cases, observed)
    report = {
        'scope': 'instruction interpretation only; no task execution or cross-harness runtime claim',
        'source_sha256': {key: hashlib.sha256(path.read_bytes()).hexdigest()
                          for key, path in SOURCES.items()},
        'runner': {'command': command, 'evaluator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        'results': results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    for case_id, row in results.items():
        print(f'{case_id}: {"pass" if row["passed"] else "FAIL"}')
        for error in row['errors']:
            print(f'  {error}')
    return 0 if all(row['passed'] for row in results.values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
