function parseTerminalExecutionArgs(argv = process.argv.slice(2)) {
  const result = {
    command: null,
    guildId: null,
    targetId: null,
    authorId: null,
    allowAdmin: false,
    args: []
  };

  if (!Array.isArray(argv)) {
    return result;
  }

  const args = [...argv];
  const flags = {
    '--terminal-guild-id': 'guildId',
    '--terminal-target-id': 'targetId',
    '--terminal-author-id': 'authorId',
    '--terminal-admin': 'allowAdmin'
  };

  let sawTerminalCommand = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--terminal-command') {
      const command = args[index + 1];
      result.command = typeof command === 'string' && command.trim() ? command.trim() : null;
      sawTerminalCommand = true;
      index += 1;
      continue;
    }

    if (flags[arg]) {
      if (arg === '--terminal-admin') {
        result.allowAdmin = true;
        continue;
      }

      const value = args[index + 1];
      if (typeof value === 'string' && value.trim()) {
        result[flags[arg]] = value.trim();
      }
      index += 1;
      continue;
    }

    if (sawTerminalCommand && result.command) {
      result.args.push(arg);
    }
  }

  if (!result.command) {
    result.command = null;
    result.args = [];
  }

  return result;
}

module.exports = {
  parseTerminalExecutionArgs
};
