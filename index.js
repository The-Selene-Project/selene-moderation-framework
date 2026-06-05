const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '!';
const WARNING_FILE = path.join(__dirname, 'warnings.json');

const COMMAND_ALIASES = {
  garant: 'help',
  phantom: 'kick',
  violet: 'ban',
  iris: 'mute',
  iris_revert: 'unmute',
  hydroxide: 'purge',
  seraph: 'warn',
  twilight: 'lockdown',
  daybreak: 'unlock',
  reboot: 'restart'
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
  ROLE_PERMISSION_UPDATE_FAILURE: 'err_selene_mod_role_permission_update_failure'
};

function formatErrorMessage(code, text) {
  return `[${code}] ${text}`;
}

const repliedMessages = new WeakSet();
function replyOnce(message, content) {
  if (repliedMessages.has(message)) return Promise.resolve(null);
  repliedMessages.add(message);
  return message.reply(content);
}

function normalizeCommand(command) {
  return COMMAND_ALIASES[command] || command;
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

function saveWarnings() {
  try {
    fs.writeFileSync(WARNING_FILE, JSON.stringify(warnings, null, 2));
  } catch (error) {
    console.warn(`${ERROR_CODES.WARNING_SAVE_FAILED}: Could not save warnings file: ${error.message}`);
  }
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

client.once('ready', () => {
  console.log(`Selene Moderation Framework ready as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = normalizeCommand(args.shift().toLowerCase());

  try {
    switch (command) {
      case 'help':
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
      case 'enable_verbose_dialogs':
        return await handleVerboseDialogs(message, true);
      case 'disable_verbose_dialogs':
        return await handleVerboseDialogs(message, false);
      default:
        return replyOnce(message, formatErrorMessage(ERROR_CODES.UNKNOWN_COMMAND, `Unknown command action. Use \`${PREFIX}help\` for a list of moderation command actions.`));
    }
  } catch (error) {
    console.error(`An error occurred while processing command '${command}': ${error.message}`);
    return message.reply(formatErrorMessage(ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred while processing your command.', error));
  }
});

function getHelpText() {
  return `Selene Moderation Framework - Commands:\n` +
    `\`${PREFIX}help\` (alias: \`${PREFIX}garant\`) — Show this help message.\n` +
    `\`${PREFIX}kick @user [reason]\` (alias: \`${PREFIX}phantom\`) — Kick a user from the server.\n` +
    `\`${PREFIX}ban @user [reason]\` (alias: \`${PREFIX}violet\`) — Ban a user from the server.\n` +
    `\`${PREFIX}mute @user\` (alias: \`${PREFIX}iris\`) — Mute a user by assigning a Muted role.\n` +
    `\`${PREFIX}unmute @user\` (alias: \`${PREFIX}iris_revert\`) — Remove the Muted role.\n` +
    `\`${PREFIX}lockdown\` (alias: \`${PREFIX}twilight\`) — Lock down the current channel so members can no longer send messages.\n` +
    `\`${PREFIX}unlock\` (alias: \`${PREFIX}daybreak\`) — Restore send permissions for the current channel.\n` +
    `\`${PREFIX}purge <count>\` (alias: \`${PREFIX}hydroxide\`) — Delete the most recent messages.\n` +
    `\`${PREFIX}warn @user [reason]\` (alias: \`${PREFIX}seraph\`) — Record a warning for a user.\n` +
    `\`${PREFIX}restart\` (alias: \`${PREFIX}reboot\`) — Restart the bot process.\n` +
    `\`${PREFIX}enable_verbose_dialogs\` — Enable verbose error dialogs.\n` +
    `\`${PREFIX}disable_verbose_dialogs\` — Disable verbose error dialogs.`;
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
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_KICK, 'You need Kick Members permission to execute this command action.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_KICK, 'Please mention a user to kick.'));
  if (!target.kickable) return replyOnce(message, formatErrorMessage(ERROR_CODES.UNABLE_TO_KICK, 'An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "!kick" impossible.'));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.kick(reason);
  return replyOnce(message, `Kicked ${target.user.tag}. Reason: ${reason}`);
}

async function handleBan(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_BAN, 'You need Ban Members permission to execute this command action.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_BAN, 'Please mention a user to ban.'));
  if (!target.bannable) return replyOnce(message, formatErrorMessage(ERROR_CODES.UNABLE_TO_BAN, 'An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "!ban" impossible.'));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.ban({ reason });
  return replyOnce(message, `Banned ${target.user.tag}. Reason: ${reason}`);
}

async function handleMute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_MUTE, 'You need Manage Roles permission to execute this command action.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_MUTE, 'Please mention a user to mute.'));

  const muteRole = await ensureMutedRole(message.guild);
  if (target.roles.cache.has(muteRole.id)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.USER_ALREADY_MUTED, `${target.user.tag} is already muted.`));
  }

  await target.roles.add(muteRole, 'Muted by Selene Moderation Framework');
  return replyOnce(message, `${target.user.tag} has been muted.`);
}

async function handleUnmute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_UNMUTE, 'You need Manage Roles permission to execute this command action.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_UNMUTE, 'Please mention a user to unmute.'));

  const muteRole = await ensureMutedRole(message.guild);
  if (!target.roles.cache.has(muteRole.id)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.USER_NOT_MUTED, `${target.user.tag} is not muted.`));
  }

  await target.roles.remove(muteRole, 'Unmuted by Selene Moderation Framework');
  return replyOnce(message, `${target.user.tag} has been unmuted.`);
}

async function handlePurge(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_PURGE, 'You need Manage Messages permission to execute this command action.'));
  }

  const amount = parseInt(args[0], 10);
  if (Number.isNaN(amount) || amount < 1 || amount > 100) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.INVALID_PURGE_AMOUNT, 'An error has occurred while executing the command action: Amount of purged messages is not within the numerical redline range. Redline Range: 1 to 100.'));
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
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_LOCKDOWN, 'You need Manage Channels permission to use this command.'));
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
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_UNLOCK, 'You need Manage Channels permission to use this command.'));
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
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_WARN, 'You need Manage Messages permission to execute this command action.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_WARN, 'Please mention a user to warn.'));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  const userId = target.id;
  warnings[userId] = warnings[userId] || [];
  warnings[userId].push({ issuer: message.author.id, reason, date: new Date().toISOString() });
  saveWarnings();

  return replyOnce(message, `Warned ${target.user.tag}. Total warnings: ${warnings[userId].length}`);
}

async function handleVerboseDialogs(message, enabled) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_VERBOSE_DIALOGS, 'You need Administrator permission to change verbose dialog mode.'));
  }

  verboseDialogs = enabled;
  return message.reply(`Verbose error dialogs ${enabled ? 'enabled' : 'disabled'}.`);
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
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_RESTART, 'You need Administrator permission to restart the bot.'));
  }

  await message.reply('Restarting Selene moderation framework...');
  restartProcess();
  await client.destroy();
  process.exit(0);
}

async function handleVerboseDialogs(message, enabled) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_VERBOSE_DIALOGS, 'You need Administrator permission to change verbose dialog mode.'));
  }

  verboseDialogs = enabled;
  return message.reply(`Verbose error dialogs ${enabled ? 'enabled' : 'disabled'}.`);
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
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_RESTART, 'You need Administrator permission to restart the bot.'));
  }

  await message.reply('Restarting Selene moderation framework...');
  restartProcess();
  await client.destroy();
  process.exit(0);
}

client.login(TOKEN);
