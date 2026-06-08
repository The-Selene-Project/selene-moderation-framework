const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, ActivityType, ChannelType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

// Optional Redis client for distributed message deduplication to avoid
// multiple running instances responding to the same incoming message.
const REDIS_URL = process.env.REDIS_URL || null;
let redisClient = null;
if (REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(REDIS_URL);
    redisClient.on('error', (err) => console.warn(`Redis error: ${err.message}`));
    redisClient.on('connect', () => console.log('Connected to Redis for message dedupe.'));
  } catch (err) {
    console.warn('Failed to initialize Redis client for message dedupe:', err.message);
    redisClient = null;
  }
}

/**
 * Try to claim a short-lived lock for the given message so only one
 * bot instance processes it. If Redis is not configured or an error
 * occurs, we fall back to allowing processing so functionality is
 * unchanged.
 * @param {Message} message
 * @param {number} ttlMs
 * @returns {Promise<boolean>} true if this instance should process
 */
async function shouldProcessMessage(message, ttlMs = 5000) {
  if (!redisClient) return true;
  try {
    const key = `selene:msglock:${message.guild ? message.guild.id : 'global'}:${message.id}`;
    // SET key PX ttl NX -> returns 'OK' when set, or null otherwise
    const res = await redisClient.set(key, '1', 'PX', ttlMs, 'NX');
    return res === 'OK';
  } catch (err) {
    console.warn('Redis lock check failed, allowing processing:', err.message);
    return true;
  }
}

const TOKEN = process.env.DISCORD_TOKEN;
const ALTERNATE_PREFIX_COMMAND = '$';
const DEFAULT_PREFIX_COMMAND = '!';
const ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE = 'selmf_core_feature_flag_alternate_prefix_handling = enabled';
const ALTERNATE_PREFIX_HANDLING_DISABLE_SEQUENCE = 'selmf_core_feature_flag_alternate_prefix_handling = disabled';
const APHS_STATUS_CONFIG_ENABLED = 'selmf_core_feature_aphs = enabled_perm';
const APHS_STATUS_CONFIG_DISABLED = 'selmf_core_feature_aphs = disabled_perm';
let alternatePrefixHandlingEnabled = true;
let PREFIX = ALTERNATE_PREFIX_COMMAND;
const REDLINE_PARAM_PREFIX = 'selmf_core_parameter_simultaneous_command_execution_redline = redline_numerical.';
let simultaneousCommandExecutionRedline = Number.NaN; // NaN => not set (no enforced redline). Use 0 to explicitly disable.
let activeCommandExecutions = 0;
const WARNING_FILE = path.join(__dirname, 'warnings.json');
const TRUSTED_USERS_FILE = path.join(__dirname, 'trusted_framework_users.json');
const EXECUTION_REDLINE_BYPASS_FILE = path.join(__dirname, 'execution_redline_bypass_users.json');

const COMMAND_ALIASES = {
  garant: 'help-sel',
  phantom: 'kick',
  violet: 'ban',
  iris: 'mute',
  iris_revert: 'unmute',
  hydroxide: 'purge',
  seraph: 'warn',
  twilight: 'lockdown',
  daybreak: 'unlock',
  reboot: 'restart',
  cease: 'halt',
  viper: 'validate_framework_integrity'
};

const ERROR_CODES = {
  MISSING_TOKEN: 'err_selene_mod_missing_token',
  WARNING_FILE_READ: 'err_selene_mod_warning_file_read',
  NO_PERMISSION_KICK: 'err_selene_mod_no_permission_kick',
  NO_PERMISSION_BAN: 'err_selene_mod_no_permission_ban',
  NO_PERMISSION_MUTE: 'err_selene_mod_no_permission_mute',
  NO_PERMISSION_UNMUTE: 'err_selene_mod_no_permission_unmute',
  NO_PERMISSION_PURGE: 'err_selene_mod_no_permission_purge',
  NO_PERMISSION_WARN: 'err_selene_mod_no_permission_warn',
  NO_PERMISSION_LOCKDOWN: 'err_selene_mod_no_permission_lockdown',
  NO_PERMISSION_UNLOCK: 'err_selene_mod_no_permission_unlock',
  NO_PERMISSION_RESTART: 'err_selene_mod_no_permission_restart',
  NO_PERMISSION_HALT: 'err_selene_mod_no_permission_halt',
  NO_PERMISSION_ELEVATE: 'err_selene_mod_no_permission_elevate',
  NO_PERMISSION_DEBASE: 'err_selene_mod_no_permission_debase',
  NO_PERMISSION_PREFIX_HANDLING: 'err_selene_mod_no_permission_prefix_handling',
  NO_PERMISSION_VERBOSE_DIALOGS: 'err_selene_mod_no_permission_verbose_dialogs',
  INTERNAL_ERROR: 'err_selene_mod_internal_error',
  MISSING_TARGET_KICK: 'err_selene_mod_missing_target_kick',
  MISSING_TARGET_BAN: 'err_selene_mod_missing_target_ban',
  MISSING_TARGET_MUTE: 'err_selene_mod_missing_target_mute',
  MISSING_TARGET_UNMUTE: 'err_selene_mod_missing_target_unmute',
  MISSING_TARGET_WARN: 'err_selene_mod_missing_target_warn',
  UNABLE_TO_KICK: 'err_selene_mod_kick_failure',
  UNABLE_TO_BAN: 'err_selene_mod_ban_failure',
  USER_ALREADY_MUTED: 'err_selene_mod_user_already_muted',
  USER_NOT_MUTED: 'err_selene_mod_user_not_muted',
  INVALID_PURGE_AMOUNT: 'err_selene_mod_purge_amount_not_within_redlines',
  WARNING_SAVE_FAILURE: 'err_selene_mod_warning_save_failure',
  UNKNOWN_COMMAND: 'err_selene_mod_command_unknown',
  NO_PERMISSION_EXECUTION_REDLINE: 'err_selene_mod_no_permission_execution_redline',
  ROLE_PERMISSION_UPDATE_FAILURE: 'err_selene_mod_role_permission_update_failure',
  COMMANDS_SIMULTANEOUS_EXCEEDED: 'err_selene_mod_simultaneous_command_redline_exceeded'
};

function formatErrorMessage(code, text) {
  return `[${code}] ${text}`;
}

// Error message generator with verbose and short versions
function getErrorMessage(code, context = {}) {
  const { shortMsg, verboseMsg } = ERROR_MESSAGES[code] || { shortMsg: 'An error occurred.', verboseMsg: 'An error occurred.' };
  const msg = typeof shortMsg === 'function' ? shortMsg(context) : shortMsg;
  const verbose = typeof verboseMsg === 'function' ? verboseMsg(context) : verboseMsg;
  return formatErrorMessage(code, verboseDialogs ? verbose : msg);
}

const ERROR_MESSAGES = {
  [ERROR_CODES.NO_PERMISSION_KICK]: {
    shortMsg: `You need Kick Members permission to execute this command action.`,
    verboseMsg: () => `You need Kick Members permission to execute this command action. To bypass, ask an administrator to grant you elevated framework authority, which allows execution of admin-level commands within this bot without needing the corresponding Discord permissions. Elevated framework authority can be granted using the command \`${PREFIX}elevate_framework_authority\`.`
  },
  [ERROR_CODES.MISSING_TARGET_KICK]: {
    shortMsg: 'Please mention a user to kick.',
    verboseMsg: 'Kick command requires a target user mention. Usage: `$kick @user [reason]`.'
  },
  [ERROR_CODES.UNABLE_TO_KICK]: {
    shortMsg: 'Unable to kick user due to role hierarchy or permissions.',
    verboseMsg: () => `An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "${PREFIX}kick" impossible.`
  },
  [ERROR_CODES.NO_PERMISSION_BAN]: {
    shortMsg: `You need Ban Members permission to execute this command action.`,
    verboseMsg: () => `You need Ban Members permission to execute this command action. To bypass, ask an administrator to grant you elevated framework authority, which allows execution of admin-level commands within this bot without needing the corresponding Discord permissions. Elevated framework authority can be granted using the command \`${PREFIX}elevate_framework_authority\`.`
  },
  [ERROR_CODES.MISSING_TARGET_BAN]: {
    shortMsg: 'Please mention a user to ban.',
    verboseMsg: 'Ban command requires a target user mention. Usage: `$ban @user [reason]`.'
  },
  [ERROR_CODES.UNABLE_TO_BAN]: {
    shortMsg: 'Unable to ban user due to role hierarchy or permissions.',
    verboseMsg: () => `An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "${PREFIX}ban" impossible.`
  },
  [ERROR_CODES.NO_PERMISSION_MUTE]: {
    shortMsg: 'You need Manage Roles permission to execute this command action.',
    verboseMsg: 'Mute requires Manage Roles permission to assign the Muted role. Current permissions insufficient.'
  },
  [ERROR_CODES.MISSING_TARGET_MUTE]: {
    shortMsg: 'Please mention a user to mute.',
    verboseMsg: 'Mute command requires a target user mention. Usage: `$mute @user`.'
  },
  [ERROR_CODES.USER_ALREADY_MUTED]: {
    shortMsg: (ctx) => `${ctx.userTag || 'User'} is already muted.`,
    verboseMsg: (ctx) => `${ctx.userTag || 'User'} already has the Muted role. Cannot mute a user who is already muted.`
  },
  [ERROR_CODES.NO_PERMISSION_UNMUTE]: {
    shortMsg: 'You need Manage Roles permission to execute this command action.',
    verboseMsg: 'Unmute requires Manage Roles permission to remove the Muted role. Current permissions insufficient.'
  },
  [ERROR_CODES.MISSING_TARGET_UNMUTE]: {
    shortMsg: 'Please mention a user to unmute.',
    verboseMsg: 'Unmute command requires a target user mention. Usage: `$unmute @user`.'
  },
  [ERROR_CODES.USER_NOT_MUTED]: {
    shortMsg: (ctx) => `${ctx.userTag || 'User'} is not muted.`,
    verboseMsg: (ctx) => `${ctx.userTag || 'User'} does not have the Muted role. Cannot unmute a user who is not muted.`
  },
  [ERROR_CODES.NO_PERMISSION_PURGE]: {
    shortMsg: 'You need Manage Messages permission to execute this command action.',
    verboseMsg: 'Purge requires Manage Messages permission to delete messages. Current permissions insufficient.'
  },
  [ERROR_CODES.INVALID_PURGE_AMOUNT]: {
    shortMsg: 'Message count is not within valid range (1-100).',
    verboseMsg: 'Message count must be between 1 and 100 (inclusive). Redline Range: 1 to 100.'
  },
  [ERROR_CODES.NO_PERMISSION_LOCKDOWN]: {
    shortMsg: 'You need Manage Channels permission to use this command.',
    verboseMsg: 'Lockdown requires Manage Channels permission to modify channel permissions. Current permissions insufficient.'
  },
  [ERROR_CODES.NO_PERMISSION_UNLOCK]: {
    shortMsg: 'You need Manage Channels permission to use this command.',
    verboseMsg: 'Unlock requires Manage Channels permission to modify channel permissions. Current permissions insufficient.'
  },
  [ERROR_CODES.NO_PERMISSION_WARN]: {
    shortMsg: 'You need Manage Messages permission to execute this command action.',
    verboseMsg: 'Warn requires Manage Messages permission to record user warnings. Current permissions insufficient.'
  },
  [ERROR_CODES.MISSING_TARGET_WARN]: {
    shortMsg: 'Please mention a user.',
    verboseMsg: 'Command requires a target user mention.'
  },
  [ERROR_CODES.COMMANDS_SIMULTANEOUS_EXCEEDED]: {
    shortMsg: 'Command execution capacity exceeded. Try again later.',
    verboseMsg: () => `Simultaneous command execution redline exceeded. Active: ${activeCommandExecutions}. Redline: ${simultaneousCommandExecutionRedline}.`
  },
  [ERROR_CODES.NO_PERMISSION_PREFIX_HANDLING]: {
    shortMsg: 'You need Administrator permission or elevated framework authority.',
    verboseMsg: 'You need Administrator permission or elevated framework authority to change bot configuration.'
  },
  [ERROR_CODES.NO_PERMISSION_VERBOSE_DIALOGS]: {
    shortMsg: 'You need Administrator permission or elevated framework authority.',
    verboseMsg: 'You need Administrator permission or elevated framework authority to change verbose dialog mode.'
  },
  [ERROR_CODES.NO_PERMISSION_EXECUTION_REDLINE]: {
    shortMsg: 'You need Administrator permission.',
    verboseMsg: 'You need Administrator permission to manage execution redline bypass authority.'
  },
  [ERROR_CODES.NO_PERMISSION_RESTART]: {
    shortMsg: 'You need Administrator permission or elevated framework authority.',
    verboseMsg: 'You need Administrator permission or elevated framework authority to restart the bot.'
  },
  [ERROR_CODES.NO_PERMISSION_HALT]: {
    shortMsg: 'You need Administrator permission or elevated framework authority.',
    verboseMsg: 'You need Administrator permission or elevated framework authority to halt the bot.'
  },
  [ERROR_CODES.NO_PERMISSION_ELEVATE]: {
    shortMsg: 'You need Administrator permission.',
    verboseMsg: 'You need Administrator permission to grant framework authority.'
  },
  [ERROR_CODES.NO_PERMISSION_DEBASE]: {
    shortMsg: 'You need Administrator permission.',
    verboseMsg: 'You need Administrator permission to revoke framework authority.'
  },
  [ERROR_CODES.UNKNOWN_COMMAND]: {
    shortMsg: () => `Unknown command action. Use \`${PREFIX}help-sel\` for a list of moderation command actions.`,
    verboseMsg: () => `Unknown command action. Use \`${PREFIX}help-sel\` for a list of moderation command actions.`
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    shortMsg: 'An internal error occurred while processing your command.',
    verboseMsg: (ctx) => `Internal error: ${ctx.errorMsg || 'An internal error occurred while processing your command.'}`
  }
};

const repliedMessages = new WeakSet();
function replyOnce(message, content) {
  if (repliedMessages.has(message)) return Promise.resolve(null);
  repliedMessages.add(message);

  if (typeof content === 'string' && content.length > 2000) {
    const chunks = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= 2000) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n', 2000);
      if (splitAt <= 0 || splitAt > 2000) {
        splitAt = 2000;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }

    return message.reply(chunks.shift()).then(async (firstReply) => {
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        await message.channel.send({ content: chunk }).catch(() => {});
      }
      return firstReply;
    }).catch(() => null);
  }

  return message.reply(content).catch(() => null);
}

function normalizeCommand(command) {
  return COMMAND_ALIASES[command] || command;
}

function hasExecutionRedlineBypass(member) {
  if (!member) return false;
  return Boolean(executionRedlineBypassUsers[member.id]);
}

function canStartCommandExecution(member) {
  if (hasExecutionRedlineBypass(member)) return true;
  return Number.isNaN(simultaneousCommandExecutionRedline) || simultaneousCommandExecutionRedline === 0 || activeCommandExecutions < simultaneousCommandExecutionRedline;
}

function getCommandExecutionRedlineMessage() {
  return getErrorMessage(ERROR_CODES.COMMANDS_SIMULTANEOUS_EXCEEDED);
}

function beginCommandExecution() {
  activeCommandExecutions++;
}

function endCommandExecution() {
  activeCommandExecutions = Math.max(0, activeCommandExecutions - 1);
}

if (!TOKEN) {
  console.error(`${ERROR_CODES.MISSING_TOKEN}: Missing DISCORD_TOKEN in .env or environment variables.`);
  process.exit(1);
}

let warnings = {};
let verboseDialogs = false;
try {
  warnings = JSON.parse(fs.readFileSync(WARNING_FILE, 'utf8') || '{}');
} catch (error) {
  warnings = {};
  console.warn(`${ERROR_CODES.WARNING_FILE_READ}: Could not read or parse warnings file: ${error.message}`);
}

let trustedUsers = {};
try {
  trustedUsers = JSON.parse(fs.readFileSync(TRUSTED_USERS_FILE, 'utf8') || '{}');
} catch (error) {
  trustedUsers = {};
  console.warn(`err_selene_mod_trusted_users_read: Could not read or parse trusted users file: ${error.message}`);
}

let executionRedlineBypassUsers = {};
try {
  executionRedlineBypassUsers = JSON.parse(fs.readFileSync(EXECUTION_REDLINE_BYPASS_FILE, 'utf8') || '{}');
} catch (error) {
  executionRedlineBypassUsers = {};
  console.warn(`err_selene_mod_redline_bypass_read: Could not read or parse execution redline bypass file: ${error.message}`);
}

function saveWarnings() {
  try {
    fs.writeFileSync(WARNING_FILE, JSON.stringify(warnings, null, 2));
  } catch (error) {
    console.warn(`${ERROR_CODES.WARNING_SAVE_FAILURE}: Could not save warnings file: ${error.message}`);
  }
}

function saveTrustedUsers() {
  try {
    fs.writeFileSync(TRUSTED_USERS_FILE, JSON.stringify(trustedUsers, null, 2));
  } catch (error) {
    console.warn(`err_selene_mod_trusted_users_save: Could not save trusted users file: ${error.message}`);
  }
}

function saveExecutionRedlineBypassUsers() {
  try {
    fs.writeFileSync(EXECUTION_REDLINE_BYPASS_FILE, JSON.stringify(executionRedlineBypassUsers, null, 2));
  } catch (error) {
    console.warn(`err_selene_mod_redline_bypass_save: Could not save execution redline bypass file: ${error.message}`);
  }
}

function isElevatedUser(member) {
  if (!member) return false;
  return Boolean(trustedUsers[member.id]);
}

function hasAdminAuthority(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || isElevatedUser(member);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

client.once('ready', async () => {
  console.log(`Selene Moderation Framework ready as ${client.user.tag}`);

  const BOT_STATUS_NAME = process.env.BOT_STATUS_NAME || 'Protecting the server';
  const BOT_STATUS_TYPE = ActivityType[process.env.BOT_STATUS_TYPE?.toUpperCase()] || ActivityType.Watching;
  const BOT_STATUS = process.env.BOT_STATUS || 'online';

  try {
    await client.user.setPresence({
      activities: [{ name: BOT_STATUS_NAME, type: BOT_STATUS_TYPE }],
      status: BOT_STATUS
    });
  } catch (presenceError) {
    console.warn('Failed to set bot presence:', presenceError);
  }

  // Send a startup announcement to a configured channel or a sensible default
  (async () => {
    const rawText = process.env.STARTUP_ANNOUNCE_TEXT || 'Selene Moderation Framework initialized successfully. All subcomponents nominal.';
    // Convert escaped \n sequences into actual line breaks so users can configure multiline messages in .env
    const text = String(rawText).replace(/\\n/g, '\n');
    const channelId = process.env.STARTUP_ANNOUNCE_CHANNEL_ID;
    const guildId = process.env.STARTUP_ANNOUNCE_GUILD_ID;

    try {
      let channel = null;

      if (channelId) {
        channel = await client.channels.fetch(channelId).catch(() => null);
      }

      if (!channel && guildId) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased && c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages));
        }
      }

      if (!channel) {
        for (const guild of client.guilds.cache.values()) {
          const sys = guild.systemChannel;
          if (sys && sys.isTextBased && sys.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)) {
            channel = sys;
            break;
          }

          const found = guild.channels.cache.find(c => c.isTextBased && c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages));
          if (found) {
            channel = found;
            break;
          }
        }
      }

      const format = (process.env.STARTUP_ANNOUNCE_FORMAT || '').toLowerCase();

      if (channel) {
        if (format === 'embed') {
          try {
            const embed = new EmbedBuilder().setTitle('Selene Initialized').setDescription(text).setColor(0x57F287).setTimestamp();
            // Discord embed descriptions support a subset of markdown
            await channel.send({ embeds: [embed] }).catch(() => {});
          } catch (e) {
            // fallback to plain text
            await channel.send(text).catch(() => {});
          }
        } else {
          // plain text (supports markdown by default)
          await channel.send({ content: text }).catch(() => {});
        }
      } else {
        console.warn('No suitable channel found to send startup announcement.');
      }
    } catch (err) {
      console.warn('Failed to send startup announcement:', err && err.message ? err.message : err);
    }
  })();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Distributed dedupe: ensure only one instance processes this message
  if (!await shouldProcessMessage(message)) return;

  if (message.content === 'TST is cool') {
    return message.channel.send('The community deserves to enjoy their time without technical issues. - ExtremeHydroxides, Technical Operations Manager');
  }

  const normalizedFlagMessage = message.content.trim().toLowerCase();
  if (normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE || normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_DISABLE_SEQUENCE) {
    if (!hasAdminAuthority(message.member)) {
      return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_PREFIX_HANDLING));
    }

    const enable = normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE;
    if (enable === alternatePrefixHandlingEnabled) {
      return replyOnce(message, `Alternate Prefix Handling is already ${enable ? 'enabled' : 'disabled'}. Commands are already using the ${PREFIX} prefix.`);
    }

    alternatePrefixHandlingEnabled = enable;
    PREFIX = enable ? ALTERNATE_PREFIX_COMMAND : DEFAULT_PREFIX_COMMAND;
    return replyOnce(message, `Alternate Prefix Handling ${enable ? 'enabled' : 'disabled'}. Commands now use the ${PREFIX} prefix.`);
  }

  // Handle simultaneous command execution redline parameter messages
  if (message.content.trim().startsWith(REDLINE_PARAM_PREFIX)) {
    if (!hasAdminAuthority(message.member)) {
      return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_PREFIX_HANDLING));
    }

    const trailing = message.content.trim().slice(REDLINE_PARAM_PREFIX.length);
    if (/^nan$/i.test(trailing)) {
      simultaneousCommandExecutionRedline = Number.NaN;
      return replyOnce(message, 'Simultaneous command execution redline cleared (NaN). No enforced concurrent limit.');
    }

    const num = Number(trailing);
    if (!Number.isFinite(num) || num < 0) {
      return replyOnce(message, getErrorMessage(ERROR_CODES.INTERNAL_ERROR, {errorMsg: 'Invalid redline value. Use 0 to disable or a non-negative number.'}));
    }

    simultaneousCommandExecutionRedline = num;
    return replyOnce(message, `Simultaneous command execution redline set to ${num}. Use 0 to disable enforcement or NaN to clear.`);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = normalizeCommand(args.shift().toLowerCase());
  if (!canStartCommandExecution(message.member)) {
    return replyOnce(message, getCommandExecutionRedlineMessage());
  }

  beginCommandExecution();
  try {
    switch (command) {
      case 'help-sel':
        return replyOnce(message, getHelpText());
      case 'kick':
        return await handleKick(message, args);
      case 'ban':
        return await handleBan(message, args);
          case 'mute':
        return await handleMute(message, args);
      case 'unmute':
        return await handleUnmute(message, args);
      case 'lockdown':
        return await handleLockdown(message);
      case 'unlock':
        return await handleUnlock(message);
      case 'purge':
        return await handlePurge(message, args);
      case 'warn':
        return await handleWarn(message, args);
      case 'restart':
        return await handleRestart(message);
      case 'halt':
        return await handleHalt(message);
      case 'elevate_framework_authority':
        return await handleElevateFrameworkAuthority(message, args);
      case 'debase_framework_authority':
        return await handleDebaseFrameworkAuthority(message, args);
      case 'validate_framework_integrity':
        return await handleValidateFrameworkIntegrity(message);
      case 'enable_verbose_dialogs':
        return await handleVerboseDialogs(message, true);
      case 'disable_verbose_dialogs':
        return await handleVerboseDialogs(message, false);
      case 'debug_simultaneous_command_execution':
        return await handleDebugSimultaneousCommands(message, args);
      case 'help-sel-devparams':
        return replyOnce(message, getDevParamsHelpText());
      case 'elevate_execution_redline_authority':
        return await handleElevateExecutionRedlineAuthority(message, args);
      case 'debase_execution_redline_authority':
        return await handleDebaseExecutionRedlineAuthority(message, args);
      default:
        return replyOnce(message, getErrorMessage(ERROR_CODES.UNKNOWN_COMMAND));
    }
  } catch (error) {
    console.error(`An error occurred while processing command '${command}': ${error.message}`);
    return message.reply(getErrorMessage(ERROR_CODES.INTERNAL_ERROR, {errorMsg: error.message}));
  } finally {
    endCommandExecution();
  }
});

function getHelpText() {
  const statusLine = alternatePrefixHandlingEnabled
    ? `Alternate Prefix Handling enabled (${APHS_STATUS_CONFIG_ENABLED})`
    : `Alternate Prefix Handling disabled (${APHS_STATUS_CONFIG_DISABLED})`;

  return `Selene Moderation Framework - Commands:\n` +
    `${statusLine}\n` +
    `Current command prefix: ${PREFIX}\n` +
    `Use \`${PREFIX}help-sel-devparams\` to show developer parameter and feature flag documentation.\n` +
    `\`${PREFIX}help-sel\` (alias: \`${PREFIX}garant\`) — Show this help message.\n` +
    `\`${PREFIX}kick @user [reason]\` (alias: \`${PREFIX}phantom\`) — Kick a user from the server.\n` +
    `\`${PREFIX}ban @user [reason]\` (alias: \`${PREFIX}violet\`) — Ban a user from the server.\n` +
    `\`${PREFIX}mute @user\` (alias: \`${PREFIX}iris\`) — Mute a user by assigning a Muted role.\n` +
    `\`${PREFIX}lockdown\` (alias: \`${PREFIX}twilight\`) — Lock down the current channel so members can no longer send messages.\n` +
    `\`${PREFIX}unlock\` (alias: \`${PREFIX}daybreak\`) — Restore send permissions for the current channel.\n` +
    `\`${PREFIX}purge <count>\` (alias: \`${PREFIX}hydroxide\`) — Delete the most recent messages.\n` +
    `\`${PREFIX}warn @user [reason]\` (alias: \`${PREFIX}seraph\`) — Record a warning for a user.\n` +
    `\`${PREFIX}restart\` (alias: \`${PREFIX}reboot\`) — Restart the bot process. DO NOT USE UNLESS ABSOLUTELY NECESSARY!\n` +
    `\`${PREFIX}halt\` (alias: \`${PREFIX}cease\`) — Shut down the bot process. Do not use, this command is deprecated and will be removed in a future release.\n` +
    `\`${PREFIX}elevate_framework_authority\` — Grant framework authority to a user so they may execute admin-only commands. Administrator only.\n` +
    `\`${PREFIX}debase_framework_authority\` — Revoke previously granted framework authority from a user. Administrator only.\n` +
    `\`${PREFIX}elevate_execution_redline_authority @user\` — Grant execution redline bypass authority to a user. Administrator only.\n` +
    `\`${PREFIX}debase_execution_redline_authority @user\` — Revoke execution redline bypass authority from a user. Administrator only.\n` +
    `\`${PREFIX}debug_simultaneous_command_execution <count> [duration_ms]\` — Run multiple internal command execution simulations in parallel to test the redline limit. Administrator only.\n` +
    `\`${PREFIX}validate_framework_integrity\` (alias: \`${PREFIX}viper\`) — Run an integrity check of core subcomponents and features.\n` +
    `\`${PREFIX}enable_verbose_dialogs\` — Enable verbose error dialogs. Use only for debugging purposes.\n` +
    `\`${PREFIX}disable_verbose_dialogs\` — Disable verbose error dialogs. Recommended for normal operation.`;
}

function getDevParamsHelpText() {
  return `Selene Developer Parameters:\n` +
    `Developer parameter messages are sent directly without the standard command prefix.\n` +
    `\`selmf_core_feature_flag_alternate_prefix_handling = enabled\` — Enable Alternate Prefix Handling and switch commands to the $ prefix.\n` +
    `\`selmf_core_feature_flag_alternate_prefix_handling = disabled\` — Disable Alternate Prefix Handling and switch commands to the ! prefix.\n` +
    `\`selmf_core_parameter_simultaneous_command_execution_redline = redline_numerical.NaN\` — Clear any execution redline and remove enforced concurrent command limits.\n` +
    `\`selmf_core_parameter_simultaneous_command_execution_redline = redline_numerical.0\` — Disable redline enforcement while keeping the parameter configured.\n` +
    `\`selmf_core_parameter_simultaneous_command_execution_redline = redline_numerical.<number>\` — Set a numeric simultaneous command execution limit. Replace <number> with the desired threshold.`;
}

function getTargetMember(message, mentionOrId) {
  if (!mentionOrId) return null;

  const mentionMatch = mentionOrId.match(/^<@!?(\d+)>$/);
  const id = mentionMatch ? mentionMatch[1] : mentionOrId;
  return message.guild.members.cache.get(id) || null;
}

function hasPermission(member, permission) {
  return member.permissions.has(permission);
}

async function ensureMutedRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === 'Muted');
  if (!role) {
    role = await guild.roles.create({
      name: 'Muted',
      color: 'Grey',
      permissions: []
    });

    const channels = guild.channels.cache.filter((channel) => [
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildAnnouncement
    ].includes(channel.type));

    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(role, {
          SendMessages: false,
          AddReactions: false,
          Speak: false,
          Connect: false
        });
      } catch (error) {
        console.warn(`${ERROR_CODES.ROLE_PERMISSION_UPDATE_WARNING}: Unable to update permissions for channel ${channel.id}: ${error.message}`);
      }
    }
  }

  return role;
}

async function handleKick(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.KickMembers)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_KICK));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, getErrorMessage(ERROR_CODES.MISSING_TARGET_KICK));
  if (!target.kickable) return replyOnce(message, getErrorMessage(ERROR_CODES.UNABLE_TO_KICK));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.kick(reason);
  return replyOnce(message, `Kicked ${target.user.tag}. Reason: ${reason}`);
}

async function handleBan(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_BAN));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, getErrorMessage(ERROR_CODES.MISSING_TARGET_BAN));
  if (!target.bannable) return replyOnce(message, getErrorMessage(ERROR_CODES.UNABLE_TO_BAN));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.ban({ reason });
  return replyOnce(message, `Banned ${target.user.tag}. Reason: ${reason}`);
}

async function handleMute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_MUTE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, getErrorMessage(ERROR_CODES.MISSING_TARGET_MUTE));

  const muteRole = await ensureMutedRole(message.guild);
  if (target.roles.cache.has(muteRole.id)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.USER_ALREADY_MUTED, {userTag: target.user.tag}));
  }

  await target.roles.add(muteRole, 'Muted by Selene Moderation Framework');
  return replyOnce(message, `${target.user.tag} has been muted.`);
}

async function handleUnmute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_UNMUTE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, getErrorMessage(ERROR_CODES.MISSING_TARGET_UNMUTE));

  const muteRole = await ensureMutedRole(message.guild);
  if (!target.roles.cache.has(muteRole.id)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.USER_NOT_MUTED, {userTag: target.user.tag}));
  }

  await target.roles.remove(muteRole, 'Unmuted by Selene Moderation Framework');
  return replyOnce(message, `${target.user.tag} has been unmuted.`);
}

async function handlePurge(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_PURGE));
  }

  const amount = parseInt(args[0], 10);
  if (Number.isNaN(amount) || amount < 1 || amount > 100) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.INVALID_PURGE_AMOUNT));
  }

  const deleted = await message.channel.bulkDelete(amount + 1, true);
  const reply = await replyOnce(message, `Deleted ${deleted.size - 1} message(s).`);
  if (reply) {
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  }
  return reply;
}

async function handleLockdown(message) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_LOCKDOWN));
  }

  const channel = message.channel;
  const everyoneRole = message.guild.roles.everyone;
  const overwrite = {};

  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)) {
    overwrite.SendMessages = false;
    overwrite.AddReactions = false;
  } else if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    overwrite.Connect = false;
    overwrite.Speak = false;
  } else {
    return replyOnce(message, 'Unable to lock down this channel type. Use this command in a guild text or voice channel.');
  }

  await channel.permissionOverwrites.edit(everyoneRole, overwrite);
  return replyOnce(message, `Channel ${channel.toString()} is now locked down.`);
}

async function handleUnlock(message) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_UNLOCK));
  }

  const channel = message.channel;
  const everyoneRole = message.guild.roles.everyone;
  const overwrite = {};

  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)) {
    overwrite.SendMessages = null;
    overwrite.AddReactions = null;
  } else if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    overwrite.Connect = null;
    overwrite.Speak = null;
  } else {
    return replyOnce(message, 'Unable to unlock this channel type. Use this command in a guild text or voice channel.');
  }

  await channel.permissionOverwrites.edit(everyoneRole, overwrite);
  return replyOnce(message, `Channel ${channel.toString()} has been unlocked.`);
}

async function handleWarn(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
    return replyOnce(message, getErrorMessage(ERROR_CODES.NO_PERMISSION_WARN));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, getErrorMessage(ERROR_CODES.MISSING_TARGET_WARN));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  const userId = target.id;
  warnings[userId] = warnings[userId] || [];
  warnings[userId].push({ issuer: message.author.id, reason, date: new Date().toISOString() });
  saveWarnings();

  return replyOnce(message, `Warned ${target.user.tag}. Total warnings: ${warnings[userId].length}`);
}

async function handleVerboseDialogs(message, enabled) {
  if (!hasAdminAuthority(message.member)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_VERBOSE_DIALOGS));
  }

  verboseDialogs = enabled;
  return message.reply(`Verbose error dialogs ${enabled ? 'enabled' : 'disabled'}.`);
}

async function handleElevateExecutionRedlineAuthority(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_EXECUTION_REDLINE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(getErrorMessage(ERROR_CODES.MISSING_TARGET_WARN));
  }

  if (target.user.bot) {
    return message.reply('Bots cannot be granted execution redline bypass authority.');
  }

  if (hasExecutionRedlineBypass(target)) {
    return message.reply(`${target.user.tag} already has execution redline bypass authority.`);
  }

  executionRedlineBypassUsers[target.id] = {
    grantedBy: message.author.id,
    grantedAt: new Date().toISOString()
  };
  saveExecutionRedlineBypassUsers();

  return message.reply(`${target.user.tag} has been granted execution redline bypass authority. Their commands will not be blocked by the simultaneous command execution redline.`);
}

async function handleDebaseExecutionRedlineAuthority(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_EXECUTION_REDLINE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(getErrorMessage(ERROR_CODES.MISSING_TARGET_WARN));
  }

  if (!hasExecutionRedlineBypass(target)) {
    return message.reply(`${target.user.tag} does not currently have execution redline bypass authority.`);
  }

  delete executionRedlineBypassUsers[target.id];
  saveExecutionRedlineBypassUsers();

  return message.reply(`${target.user.tag} has had execution redline bypass authority revoked.`);
}

async function handleDebugSimultaneousCommands(message, args) {
  if (!hasAdminAuthority(message.member)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_PREFIX_HANDLING));
  }

  const count = parseInt(args[0], 10);
  const duration = args[1] ? parseInt(args[1], 10) : 5000;
  if (Number.isNaN(count) || count < 1 || count > 50) {
    return replyOnce(message, `Usage: ${PREFIX}debug_simultaneous_command_execution <count> [duration_ms]. Count must be between 1 and 50.`);
  }

  if (Number.isNaN(duration) || duration < 0 || duration > 120000) {
    return replyOnce(message, `Duration must be between 0 and 120000 milliseconds.`);
  }

  let started = 0;
  for (let i = 0; i < count; i += 1) {
    if (!canStartCommandExecution()) {
      break;
    }

    beginCommandExecution();
    started += 1;

    (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, duration));
      } finally {
        endCommandExecution();
      }
    })();
  }

  const blocked = count - started;
  return replyOnce(message, `Debug simulation started ${started} internal command execution(s) for ${duration}ms.${blocked ? ` ${blocked} execution(s) were blocked by the redline.` : ''} Active command execution count is now ${activeCommandExecutions}.`);
}

function restartProcess() {
  const nodeBinary = process.execPath;
  const scriptArgs = process.argv.slice(1);
  const child = spawn(nodeBinary, scriptArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('error', (error) => {
    console.error(`Failed to restart Selene: ${error.message}`);
  });
}

async function handleRestart(message) {
  if (!hasAdminAuthority(message.member)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_RESTART));
  }

  await message.reply('Restarting Selene moderation framework...');
  restartProcess();
  await client.destroy();
  process.exit(0);
}

async function handleHalt(message) {
  if (!hasAdminAuthority(message.member)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_HALT));
  }

  await message.reply('Shutting down Selene Moderation Framework...');
  await client.destroy();
  process.exit(0);
}

async function handleElevateFrameworkAuthority(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_ELEVATE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(getErrorMessage(ERROR_CODES.MISSING_TARGET_WARN));
  }

  if (target.user.bot) {
    return message.reply('Bots cannot be granted framework authority.');
  }

  if (isElevatedUser(target)) {
    return message.reply(`${target.user.tag} already has elevated framework authority.`);
  }

  trustedUsers[target.id] = {
    grantedBy: message.author.id,
    grantedAt: new Date().toISOString()
  };
  saveTrustedUsers();

  return message.reply(`${target.user.tag} has been granted elevated framework authority. They may now execute admin-level commands when this bot validates authority.`);
}

async function handleDebaseFrameworkAuthority(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(getErrorMessage(ERROR_CODES.NO_PERMISSION_DEBASE));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(getErrorMessage(ERROR_CODES.MISSING_TARGET_WARN));
  }

  if (!isElevatedUser(target)) {
    return message.reply(`${target.user.tag} does not currently have elevated framework authority.`);
  }

  delete trustedUsers[target.id];
  saveTrustedUsers();

  return message.reply(`${target.user.tag} has had elevated framework authority revoked.`);
}

async function handleValidateFrameworkIntegrity(message) {
  const checks = [];

  // 1) Gateway / client ready
  try {
    const gatewayOk = Boolean(client.isReady && client.isReady());
    checks.push({ name: 'Gateway', ok: gatewayOk });
  } catch (e) {
    checks.push({ name: 'Gateway', ok: false });
  }

  // 2) Warnings file accessibility
  try {
    fs.accessSync(WARNING_FILE, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({ name: 'Warnings file (warnings.json)', ok: true });
  } catch (e) {
    checks.push({ name: 'Warnings file (warnings.json)', ok: false });
  }

  // 3) Trusted users file accessibility (can be created)
  try {
    fs.accessSync(TRUSTED_USERS_FILE, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({ name: 'Trusted users persistence', ok: true });
  } catch (e) {
    // if file missing, try writing an empty file (non-destructive test)
    try {
      if (!fs.existsSync(TRUSTED_USERS_FILE)) {
        fs.writeFileSync(TRUSTED_USERS_FILE, JSON.stringify(trustedUsers || {}, null, 2));
        fs.unlinkSync(TRUSTED_USERS_FILE);
        checks.push({ name: 'Trusted users persistence', ok: true });
      } else {
        checks.push({ name: 'Trusted users persistence', ok: false });
      }
    } catch (e2) {
      checks.push({ name: 'Trusted users persistence', ok: false });
    }
  }

  // 4) Can send messages in at least one channel
  let canSend = false;
  try {
    for (const guild of client.guilds.cache.values()) {
      const sys = guild.systemChannel;
      if (sys && sys.isTextBased && sys.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)) {
        canSend = true;
        break;
      }

      const found = guild.channels.cache.find(c => c.isTextBased && c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages));
      if (found) {
        canSend = true;
        break;
      }
    }
  } catch (e) {
    canSend = false;
  }
  checks.push({ name: 'Outbound messaging', ok: canSend });

  // 5) Manage Roles permission in at least one guild
  let manageRoles = false;
  try {
    for (const guild of client.guilds.cache.values()) {
      if (guild.members.me && guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        manageRoles = true;
        break;
      }
    }
  } catch (e) {
    manageRoles = false;
  }
  checks.push({ name: 'Manage roles', ok: manageRoles });

  // 6) Manage Messages permission in at least one guild
  let manageMessages = false;
  try {
    for (const guild of client.guilds.cache.values()) {
      if (guild.members.me && guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        manageMessages = true;
        break;
      }
    }
  } catch (e) {
    manageMessages = false;
  }
  checks.push({ name: 'Manage messages', ok: manageMessages });

  // 7) Trusted authority runtime
  checks.push({ name: 'Trusted authority (runtime)', ok: typeof trustedUsers === 'object' });

  // 8) Startup announcement configuration / ability
  const startupConfigured = Boolean(process.env.STARTUP_ANNOUNCE_CHANNEL_ID || process.env.STARTUP_ANNOUNCE_GUILD_ID || canSend);
  checks.push({ name: 'Startup announcement', ok: startupConfigured });

  // Build reply
  const lines = checks.map(c => `- **${c.name}**: ${c.ok ? 'Nominal.' : 'Fail.'}`);
  const header = 'Selene Moderation Framework - Integrity Validation:\n';
  const body = lines.join('\n');

  return message.reply(`${header}${body}`);
}

client.login(TOKEN);
