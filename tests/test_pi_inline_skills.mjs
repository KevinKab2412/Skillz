import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import extension, { createSkillProvider, createInlineEditor, expandSkillMentions, skillAliases } from '../pi/extensions/inline-skills.ts';

test('installed Pi integration: loader, Jiti extension loading, native completion and input hook',
  { skip: !process.env.PI_TEST_NODE_MODULES }, async () => {
    const modules = process.env.PI_TEST_NODE_MODULES;
    const fromRuntime = path => import(pathToFileURL(join(modules, path)).href);
    const { CombinedAutocompleteProvider } = await fromRuntime('@earendil-works/pi-tui/dist/autocomplete.js');
    const { loadSkillsFromDir } = await fromRuntime('@earendil-works/pi-coding-agent/dist/core/skills.js');
    const require = createRequire(join(modules, '@earendil-works/pi-coding-agent/package.json'));
    const { createJiti } = require('jiti');
    const loaded = await createJiti(import.meta.url, { alias: {
      '@earendil-works/pi-coding-agent': join(modules, '@earendil-works/pi-coding-agent/dist/index.js'),
    } }).import('../pi/extensions/inline-skills.ts');
    const discovered = loadSkillsFromDir({ dir: new URL('../explain', import.meta.url).pathname, source: 'user' });
    assert.equal(discovered.skills.length, 1);
    const commands = discovered.skills.map(s => ({ name: `skill:${s.name}`, source: 'skill', description: s.description, sourceInfo: s.sourceInfo }));
    const handlers = new Map();
    loaded.default({ on: (name, handler) => handlers.set(name, handler), getCommands: () => commands });
    const native = new CombinedAutocompleteProvider([{ name: 'model' }, { name: 'skill:explain' }], process.cwd());
    let provider, editorFactory;
    await handlers.get('session_start')({}, { mode: 'tui', ui: {
      setEditorComponent: factory => editorFactory = factory,
      addAutocompleteProvider: factory => provider = factory(native),
    } });
    const identity = text => text;
    const theme = { borderColor: identity, selectList: Object.fromEntries(
      ['selectedPrefix', 'selectedText', 'description', 'scrollInfo', 'noMatch'].map(key => [key, identity])) };
    for (const prefix of ['hey ', 'first line\nthen ']) {
      const editor = editorFactory({ requestRender() {}, terminal: { rows: 40, columns: 120 } }, theme, { matches: () => false });
      editor.setAutocompleteProvider(provider);
      editor.setText(prefix);
      for (const char of '/ex') editor.handleInput(char);
      for (let attempt = 0; !editor.isShowingAutocomplete() && attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(editor.getText(), `${prefix}/ex`, 'must not auto-accept');
      assert(editor.isShowingAutocomplete(), 'menu must open without Tab');
      assert(editor.render(120).join('\n').includes('Explain subjects'), 'menu must render the skill description');
      editor.handleInput('\x1b');
      assert(!editor.isShowingAutocomplete(), 'Escape must dismiss the menu');
    }
    for (const line of ['hey /ex', '/ex']) {
      const suggestions = await provider.getSuggestions([line], 0, line.length, options);
      assert.equal(suggestions.items[0].value, '/explain');
      assert.equal(provider.applyCompletion([line], 0, line.length, suggestions.items[0], suggestions.prefix).lines[0],
        line.startsWith('hey') ? 'hey /explain ' : '/explain ');
    }
    const model = await provider.getSuggestions(['/mod'], 0, 4, options);
    assert.equal(provider.applyCompletion(['/mod'], 0, 4, model.items[0], model.prefix).lines[0], '/model ');
    const transformed = await handlers.get('input')({ source: 'interactive', text: 'hey /explain this' }, {});
    assert.equal(transformed.action, 'transform');
    assert(transformed.text.includes('<skill name="explain"'));
    assert(transformed.text.endsWith('hey /explain this'));
  });

const skill = (name, path = '/not-read/SKILL.md') => ({ name: `skill:${name}`, source: 'skill', description: name, sourceInfo: { path } });
const commands = [skill('pair'), skill('explain'), skill('utils')];
const options = { signal: new AbortController().signal };
const fallback = { items: [{ value: 'model', label: '/model' }], prefix: '/mod' };
const base = {
  triggerCharacters: ['#'],
  getSuggestions: async () => fallback,
  applyCompletion: () => 'delegated',
  shouldTriggerFileCompletion: () => false,
};

test('typing an inline skill requests the menu without Tab or automatic acceptance', () => {
  class Base {
    text = '';
    requests = [];
    getText() { return this.text; }
    getLines() { return this.text.split('\n'); }
    getCursor() { const lines = this.getLines(); return { line: lines.length - 1, col: lines.at(-1).length }; }
    handleInput(data) { if (data === '\x1b') return; this.text += data; }
    requestAutocomplete(options) { this.requests.push(options); }
  }
  const Editor = createInlineEditor(Base, () => commands);
  for (const prefix of ['hey ', 'first line\nthen ', '']) {
    const editor = new Editor();
    editor.text = prefix;
    for (const char of '/pa') editor.handleInput(char);
    assert.equal(editor.getText(), `${prefix}/pa`);
    assert.equal(editor.requests.length, 3);
    assert.deepEqual(editor.requests.at(-1), { force: false, explicitTab: false });
    editor.handleInput('\x1b');
    assert.equal(editor.requests.length, 3, 'Escape must not reopen the menu');
  }
  for (const literal of ['hey /tmp/file', 'hey `/pa', 'hey \\/pa', 'https://host/pa']) {
    const editor = new Editor();
    editor.handleInput(literal);
    assert.equal(editor.requests.length, 0, literal);
  }
});

test('short skill names autocomplete inline, at line start, and across lines', async () => {
  const provider = createSkillProvider(base, () => commands);
  for (const [lines, row, col] of [[['hey /pa'], 0, 7], [['/pa'], 0, 3], [['help', 'then /pa'], 1, 8]]) {
    const result = await provider.getSuggestions(lines, row, col, options);
    assert(result.items.some(item => item.value === '/pair'));
    assert.equal(result.prefix, '/pa');
    assert.equal(result.items[0].value, '/pair');
  }
  assert.deepEqual(provider.triggerCharacters, ['#', '/']);
  assert.equal(provider.shouldTriggerFileCompletion([], 0, 0), false);
});

test('completion replaces only the token and preserves surrounding text', () => {
  const provider = createSkillProvider(base, () => commands);
  assert.deepEqual(provider.applyCompletion(['hey /pa now'], 0, 7, { value: '/pair' }, '/pa'),
    { lines: ['hey /pair now'], cursorLine: 0, cursorCol: 9 });
  assert.deepEqual(provider.applyCompletion(['/pa'], 0, 3, { value: '/pair' }, '/pa'),
    { lines: ['/pair '], cursorLine: 0, cursorCol: 6 });
  assert.equal(provider.applyCompletion(['/mod'], 0, 4, { value: 'model' }, '/mod'), 'delegated');
});

test('commands, native skill commands, paths, URLs, escapes and code delegate unchanged', async () => {
  const provider = createSkillProvider(base, () => commands);
  for (const text of ['/mod', '/skill:pa', '/tmp/pa', 'https://host/pa', 'hey \\/pa', '`/pa`', '`` /pa ``', '` /pa', '```\n/pa']) {
    const lines = text.split('\n');
    assert.equal(await provider.getSuggestions(lines, lines.length - 1, lines.at(-1).length, options), fallback, text);
  }
});

test('skill list is refreshed and conflicting command names stay reserved', async () => {
  let current = commands;
  const provider = createSkillProvider(base, () => current);
  current = [skill('new-skill')];
  assert.equal((await provider.getSuggestions(['hey /new-s'], 0, 10, options)).items[0].value, '/new-skill');
  assert.deepEqual(skillAliases([skill('model'), skill('pair'), { name: 'pair', source: 'prompt' }]), []);
});

test('loads each explicitly mentioned skill once, strips frontmatter and preserves request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inline-skills-'));
  try {
    const path = join(dir, 'SKILL.md');
    await writeFile(path, '---\nname: pair\n---\nDo the work.\n');
    const request = 'hey /pair --auto fix it using /utils, then /pair';
    const output = await expandSkillMentions(request, [skill('pair', path), skill('utils', path)]);
    assert.equal((output.match(/<skill /g) ?? []).length, 2);
    assert(output.includes(`References are relative to ${dir}.`));
    assert(output.includes('Do the work.'));
    assert(!output.includes('name: pair'));
    assert(output.endsWith(request));
    for (const native of ['/skill:pair use /utils', '/local-batch /pair']) {
      assert.equal(await expandSkillMentions(native, [skill('pair', path), skill('utils', path),
        { name: 'local-batch', source: 'prompt' }]), native);
    }
    for (const literal of ['`/pair`', '` /pair', '```text\n/pair\n```', '~~~\n/pair\n~~~', '\\ /unknown', '\\/pair', '/pair/file', '/pair-name', 'https://host/pair', '/skill:pair']) {
      assert.equal(await expandSkillMentions(literal, [skill('pair', path)]), literal, literal);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('input hook transforms interactive prompts only and fails closed on unreadable skills', async () => {
  const handlers = new Map();
  extension({ on: (name, handler) => handlers.set(name, handler), getCommands: () => commands });
  const input = handlers.get('input');
  const notices = [];
  let restored;
  const ctx = { ui: { notify: text => notices.push(text), setEditorText: text => restored = text } };
  assert.deepEqual(await input({ text: 'hey /pair', source: 'extension' }, ctx), { action: 'continue' });
  assert.deepEqual(await input({ text: 'hey /pair', source: 'interactive' }, ctx), { action: 'handled' });
  assert.equal(restored, 'hey /pair');
  assert.equal(notices.length, 1);
});
