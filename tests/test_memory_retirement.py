"""The retired memory experiment must not return through skill sync."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class MemoryRetirementTests(unittest.TestCase):
    def test_installer_has_no_memory_service_or_model_gate(self):
        installer = (ROOT / 'install.sh').read_text()
        for token in ('agent-memory', 'AGENT_MEMORY', 'workflow_memory_release',
                      'validate_install_evidence'):
            self.assertNotIn(token, installer)

    def test_no_memory_policy_is_injected_or_called(self):
        self.assertFalse((ROOT / 'shared/memory').exists())
        self.assertFalse((ROOT / 'workflow_memory_release').exists())
        for path in ROOT.glob('*/references/.shared'):
            self.assertNotIn('memory', path.read_text().splitlines(), str(path))
        for path in (ROOT / 'pair').rglob('*.md'):
            for token in ('workflow-memory', 'workflow memory', 'memory session',
                          'memory/workflow-memory.md'):
                self.assertNotIn(token, path.read_text(), str(path))


if __name__ == '__main__':
    unittest.main()
