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
            'README.md', 'version', 'setup.sh', 'settings.json', 'models.json',
            'prompts/local-batch.md', 'templates/local-batch-brief.md',
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

    def test_restore_backup_and_repeat(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo, home, dest = base / 'repo', base / 'home', base / 'custom-pi'
            repo.mkdir()
            for name in ('install.sh', 'retired-skills.txt'):
                shutil.copy2(ROOT / name, repo / name)
            for name in ('pi', 'scripts', 'shared', 'instructions', 'standup', 'explain'):
                shutil.copytree(ROOT / name, repo / name)
            dest.mkdir()
            original = {'deviceId': 'local-only', 'lastChangelogVersion': '1.3.0', 'theme': 'dark'}
            (dest / 'settings.json').write_text(json.dumps(original))
            (dest / 'models.json').write_text('{"providers": {}}')
            (dest / 'auth.json').write_text('private sentinel')
            (dest / 'trust.json').write_text('private trust sentinel')
            (dest / 'prompts').mkdir()
            (dest / 'prompts/unrelated.md').write_text('keep me')
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
            self.assertEqual((dest / 'prompts/unrelated.md').read_text(), 'keep me')
            self.assertTrue((dest / 'prompts/local-batch.md').is_file())
            self.assertTrue((dest / 'templates/local-batch-brief.md').is_file())
            self.assertTrue((base / 'agents/skills/explain/SKILL.md').is_file())
            self.assertFalse((home / '.config/opencode').exists())
            backups = list((dest / 'backups').glob('skillz-*/settings.json'))
            self.assertEqual(len(backups), 2)
            self.assertIn(original, [json.loads(p.read_text()) for p in backups])


if __name__ == '__main__':
    unittest.main()
