import assert from 'node:assert/strict';
import { test } from 'node:test';
import extension, { sessionTitle } from '../pi/extensions/auto-session-name.ts';

test('session titles use a short local prompt excerpt', () => {
  assert.equal(sessionTitle('Hey, could you please fix the failing tests?'), 'fix the failing tests');
  for (const text of ['hi', 'thanks!', '/model', '!git status', '...']) assert.equal(sessionTitle(text), undefined);
  const long = sessionTitle('Fix ' + 'the failing tests '.repeat(20));
  assert(Array.from(long).length <= 72);
  assert(long.endsWith('…'));
});

test('auto naming preserves explicit session names and ignores generated input', () => {
  let handler, name;
  extension({ on: (_event, callback) => handler = callback,
    getSessionName: () => name, setSessionName: title => name = title });
  handler({ source: 'extension', text: 'Fix the bug' });
  assert.equal(name, undefined);
  handler({ source: 'interactive', text: 'Fix the bug' });
  assert.equal(name, 'Fix the bug');
  handler({ source: 'interactive', text: 'Other task' });
  assert.equal(name, 'Fix the bug');
});
