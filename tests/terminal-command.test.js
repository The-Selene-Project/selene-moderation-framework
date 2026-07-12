const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTerminalExecutionArgs } = require('../terminal-command-utils');

test('parses terminal command arguments with optional context', () => {
  const result = parseTerminalExecutionArgs([
    '--terminal-command',
    'help-sel',
    '--terminal-guild-id',
    '123456',
    '--terminal-target-id',
    '654321',
    '--terminal-author-id',
    '111222',
    '--terminal-admin'
  ]);

  assert.deepStrictEqual(result, {
    command: 'help-sel',
    guildId: '123456',
    targetId: '654321',
    authorId: '111222',
    allowAdmin: true,
    args: []
  });
});

test('collects positional command arguments after the terminal command', () => {
  const result = parseTerminalExecutionArgs(['--terminal-command', 'warn', '@user', 'spam']);

  assert.deepStrictEqual(result, {
    command: 'warn',
    guildId: null,
    targetId: null,
    authorId: null,
    allowAdmin: false,
    args: ['@user', 'spam']
  });
});

test('returns null command when terminal mode is not requested', () => {
  const result = parseTerminalExecutionArgs(['--version']);
  assert.deepStrictEqual(result, {
    command: null,
    guildId: null,
    targetId: null,
    authorId: null,
    allowAdmin: false,
    args: []
  });
});
