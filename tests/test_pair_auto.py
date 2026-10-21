"""Portable pair auto-mode policy, routing, and observed interpretation checks."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAIR = ROOT / 'pair/SKILL.md'
AUTO = ROOT / 'pair/references/auto.md'
CASES = ROOT / 'pair/evals/auto-mode.json'
REPORT = ROOT / 'pair/evals/auto-mode-report.json'


class PairAutoTests(unittest.TestCase):
    def test_explicit_mode_routes_before_guided_pipeline(self):
        pair = PAIR.read_text()
        self.assertIn('(references/auto.md)', pair)
        self.assertIn('leading standalone `--auto`', pair)
        self.assertLess(pair.index('## Invocation modes'), pair.index('## Entry modes'))
        self.assertIn('Without `--auto`, keep the existing guided behavior', pair)
        self.assertIn('Do not fall through into the guided stages', pair)

    def test_auto_policy_keeps_quality_and_permission_boundaries(self):
        policy = AUTO.read_text()
        for marker in ('No grill', 'worktree', 'execution brief', 'independent', 'sequential',
                       'needs-human', 'credentials', 'destructive', 'user-approved',
                       'Do not fabricate', 'No commit, push, PR, merge, deployment',
                       'bounded repair', 'Missing design-pattern files', 'assumptions'):
            self.assertIn(marker, policy)
        for relative in re.findall(r'\]\(([^)]+\.md)\)', policy):
            self.assertTrue((AUTO.parent / relative).is_file(), relative)

    def test_policy_requires_no_harness_specific_runtime(self):
        policy = AUTO.read_text()
        for forbidden in ('/skill:', 'ctx.ui', 'Agent.create(', 'subagent_type:',
                          'claude -p', 'pi.register', 'Task tool'):
            self.assertNotIn(forbidden, policy)
        self.assertIn('read the referenced files directly', policy)

    def test_interpretation_report_matches_current_policy_and_all_cases(self):
        cases = json.loads(CASES.read_text())['cases']
        report = json.loads(REPORT.read_text())
        expected_hashes = {
            'pair': hashlib.sha256(PAIR.read_bytes()).hexdigest(),
            'auto': hashlib.sha256(AUTO.read_bytes()).hexdigest(),
            'cases': hashlib.sha256(CASES.read_bytes()).hexdigest(),
        }
        self.assertEqual(report['source_sha256'], expected_hashes)
        self.assertEqual(report['runner']['evaluator_sha256'],
                         hashlib.sha256((ROOT / 'scripts/evaluate_pair_auto.py').read_bytes()).hexdigest())
        self.assertEqual(set(report['results']), {case['id'] for case in cases})
        self.assertTrue(all(row['passed'] for row in report['results'].values()))
        self.assertEqual(report['scope'], 'instruction interpretation only; no task execution or cross-harness runtime claim')


class InterpretationGraderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('pair_auto_eval', ROOT / 'scripts/evaluate_pair_auto.py')
        cls.evaluator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.evaluator)

    def test_missing_or_wrong_observations_cannot_pass(self):
        cases = [{'id': 'case', 'expected': {'mode': 'auto'}, 'max_questions': 0}]
        for observed in ({}, {'case': {'mode': 'guided', 'questions': []}},
                         {'case': {'mode': 'auto', 'questions': ['Grill?']}}):
            self.assertFalse(self.evaluator.grade(cases, observed)['case']['passed'])
        self.assertTrue(self.evaluator.grade(cases, {'case': {'mode': 'auto', 'questions': []}})['case']['passed'])

    def test_expected_answers_are_not_sent_to_the_model(self):
        cases = json.loads(CASES.read_text())['cases']
        prompt = self.evaluator.prompt_for(cases)
        self.assertNotIn('"expected":', prompt)
        self.assertNotIn('"max_questions":', prompt)
        self.assertIn('Do not use tools or execute any case', prompt)

    def test_plain_and_wrapped_json_responses_are_supported(self):
        result = {'results': {'case': {'mode': 'auto'}}}
        self.assertEqual(self.evaluator.decode(json.dumps(result)), result)
        self.assertEqual(self.evaluator.decode(json.dumps({'result': json.dumps(result)})), result)
        self.assertEqual(self.evaluator.decode(json.dumps({'structured_output': result})), result)


if __name__ == '__main__':
    unittest.main()
