"""Portable Pi restores configuration without exporting private runtime state."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PiSetupTests(unittest.TestCase):
    def test_snapshot_is_allowlisted_and_portable(self):
        expected = {
            'README.md', 'version', 'setup.sh', 'settings.json', 'models.json', 'mcp.json',
            'prompts/local-batch.md', 'templates/local-batch-brief.md',
            'extensions/inline-skills.ts', 'extensions/auto-session-name.ts',
        }
        files = {str(p.relative_to(ROOT / 'pi')) for p in (ROOT / 'pi').rglob('*') if p.is_file()}
        self.assertEqual(files, expected)
        for name in files:
            self.assertNotIn('/Users/', (ROOT / 'pi' / name).read_text())
        settings = json.loads((ROOT / 'pi/settings.json').read_text())
        self.assertNotIn('deviceId', settings)
        self.assertNotIn('lastChangelogVersion', settings)
        model = json.loads((ROOT / 'pi/models.json').read_text())
        self.assertEqual(model['providers']['ollama']['apiKey'], 'ollama')
        self.assertEqual(model['providers']['ollama']['models'][0]['contextWindow'], 16384)
        mcp = json.loads((ROOT / 'pi/mcp.json').read_text())
        self.assertEqual(set(mcp['mcpServers']), {'slack', 'linear', 'sentry', 'posthog', 'experts'})
        self.assertEqual(mcp['mcpServers']['slack']['oauth']['clientSecret'], '${SLACK_CLIENT_SECRET}')

    def test_restore_backup_and_repeat(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo, home, dest = base / 'repo', base / 'home', base / 'custom-pi'
            repo.mkdir()
            for name in ('install.sh', 'retired-skills.txt'):
                shutil.copy2(ROOT / name, repo / name)
            for name in ('pi', 'scripts', 'shared', 'instructions', 'utils', 'explain'):
                shutil.copytree(ROOT / name, repo / name)
            dest.mkdir()
            original = {'deviceId': 'local-only', 'lastChangelogVersion': '1.3.0', 'theme': 'dark'}
            (dest / 'settings.json').write_text(json.dumps(original))
            (dest / 'models.json').write_text('{"providers": {}}')
            (dest / 'auth.json').write_text('private sentinel')
            (dest / 'mcp-auth.json').write_text('private MCP token sentinel')
            original_mcp = {'mcpServers': {
                'slack': {'url': 'https://mcp.slack.com/mcp', 'oauth': {
                    'clientId': '9175632525108.12387349572786', 'clientSecret': 'local secret sentinel'}},
                'unrelated': {'command': 'keep-me'},
            }}
            (dest / 'mcp.json').write_text(json.dumps(original_mcp))
            (dest / 'trust.json').write_text('private trust sentinel')
            (dest / 'prompts').mkdir()
            (dest / 'prompts/unrelated.md').write_text('keep me')
            (dest / 'extensions').mkdir()
            (dest / 'extensions/unrelated.ts').write_text('// keep me')
            (dest / 'extensions/inline-skills.ts').write_text('// previous extension')
            environment = dict(os.environ, HOME=str(home), PI_HOME=str(dest),
                               AGENTS_HOME=str(base / 'agents'))
            for _ in range(2):
                subprocess.run(['bash', str(repo / 'pi/setup.sh')], env=environment,
                               check=True, capture_output=True, text=True)
            restored = json.loads((dest / 'settings.json').read_text())
            self.assertEqual(restored['deviceId'], 'local-only')
            self.assertEqual(restored['defaultModel'], 'gpt-6.1-sol')
            self.assertNotIn('theme', restored)
            self.assertEqual((dest / 'auth.json').read_text(), 'private sentinel')
            self.assertEqual((dest / 'trust.json').read_text(), 'private trust sentinel')
            self.assertEqual((dest / 'mcp-auth.json').read_text(), 'private MCP token sentinel')
            mcp = json.loads((dest / 'mcp.json').read_text())['mcpServers']
            self.assertEqual(mcp['slack']['oauth']['clientSecret'], 'local secret sentinel')
            self.assertEqual(mcp['unrelated'], {'command': 'keep-me'})
            self.assertEqual(mcp['experts']['args'][1], str((home / 'Documents/Experts').resolve()))
            self.assertEqual(mcp['experts']['env']['PYTHONPATH'], str((home / 'Documents/Experts/src').resolve()))
            self.assertEqual((dest / 'mcp.json').stat().st_mode & 0o777, 0o600)
            self.assertIn(original_mcp, [json.loads(p.read_text()) for p in
                                       (dest / 'backups').glob('skillz-*/mcp.json')])
            self.assertEqual((dest / 'prompts/unrelated.md').read_text(), 'keep me')
            self.assertTrue((dest / 'prompts/local-batch.md').is_file())
            self.assertTrue((dest / 'templates/local-batch-brief.md').is_file())
            self.assertEqual((dest / 'extensions/unrelated.ts').read_text(), '// keep me')
            self.assertEqual((dest / 'extensions/auto-session-name.ts').read_text(),
                             (ROOT / 'pi/extensions/auto-session-name.ts').read_text())
            self.assertEqual((dest / 'extensions/inline-skills.ts').read_text(),
                             (ROOT / 'pi/extensions/inline-skills.ts').read_text())
            extension_backups = list((dest / 'backups').glob('skillz-*/extensions/inline-skills.ts'))
            self.assertEqual(len(extension_backups), 2)
            self.assertIn('// previous extension', [p.read_text() for p in extension_backups])
            self.assertTrue((base / 'agents/skills/explain/SKILL.md').is_file())
            self.assertFalse((home / '.config/opencode').exists())
            backups = list((dest / 'backups').glob('skillz-*/settings.json'))
            self.assertEqual(len(backups), 2)
            self.assertIn(original, [json.loads(p.read_text()) for p in backups])

    def test_fresh_restore_and_experts_overrides(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo, home, dest = base / 'repo', base / 'home', base / 'pi'
            repo.mkdir()
            for name in ('install.sh', 'retired-skills.txt'):
                shutil.copy2(ROOT / name, repo / name)
            for name in ('pi', 'scripts', 'shared', 'instructions', 'utils', 'explain'):
                shutil.copytree(ROOT / name, repo / name)
            environment = dict(os.environ, HOME=str(home), PI_HOME=str(dest),
                               AGENTS_HOME=str(base / 'agents'), EXPERTS_DIR=str(base / 'Experts'),
                               UV_BIN='/custom/bin/uv')
            subprocess.run(['bash', str(repo / 'pi/setup.sh')], env=environment,
                           check=True, capture_output=True, text=True)
            mcp = json.loads((dest / 'mcp.json').read_text())['mcpServers']
            self.assertEqual(mcp['slack']['oauth']['clientSecret'], '${SLACK_CLIENT_SECRET}')
            self.assertEqual(mcp['experts']['command'], '/custom/bin/uv')
            self.assertEqual(mcp['experts']['args'][1], str((base / 'Experts').resolve()))
            self.assertEqual(mcp['experts']['env']['PYTHONPATH'], str((base / 'Experts/src').resolve()))
            for filename in ('auth.json', 'mcp-auth.json', 'trust.json'):
                self.assertFalse((dest / filename).exists())


if __name__ == '__main__':
    unittest.main()
