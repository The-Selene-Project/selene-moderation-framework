const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, ActivityType, ChannelType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const ALTERNATE_PREFIX_COMMAND = '$';
const DEFAULT_PREFIX_COMMAND = '!';
const ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE = 'selmf_core_feature_flag_alternate_prefix_handling = enabled';
const ALTERNATE_PREFIX_HANDLING_DISABLE_SEQUENCE = 'selmf_core_feature_flag_alternate_prefix_handling = disabled';
const APHS_STATUS_CONFIG_ENABLED = 'selmf_core_feature_aphs = enabled_perm';
const APHS_STATUS_CONFIG_DISABLED = 'selmf_core_feature_aphs = disabled_perm';
let alternatePrefixHandlingEnabled = true;
let PREFIX = ALTERNATE_PREFIX_COMMAND;
const WARNING_FILE = path.join(__dirname, 'warnings.json');
const TRUSTED_USERS_FILE = path.join(__dirname, 'trusted_framework_users.json');

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

let trustedUsers = {};
try {
  trustedUsers = JSON.parse(fs.readFileSync(TRUSTED_USERS_FILE, 'utf8') || '{}');
} catch (error) {
  trustedUsers = {};
  console.warn(`err_selene_mod_trusted_users_read: Could not read or parse trusted users file: ${error.message}`);
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

  if (message.content === 'TST is cool') {
    return message.channel.send('The community deserves to enjoy their time without technical issues. - ExtremeHydroxides, Technical Operations Manager');
  }

  const normalizedFlagMessage = message.content.trim().toLowerCase();
  if (normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE || normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_DISABLE_SEQUENCE) {
    if (!hasAdminAuthority(message.member)) {
      return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_PREFIX_HANDLING, 'You need Administrator permission or elevated framework authority to change alternate prefix handling state.'));
    }

    const enable = normalizedFlagMessage === ALTERNATE_PREFIX_HANDLING_ENABLE_SEQUENCE;
    if (enable === alternatePrefixHandlingEnabled) {
      return replyOnce(message, `Alternate Prefix Handling is already ${enable ? 'enabled' : 'disabled'}. Commands are already using the ${PREFIX} prefix.`);
    }

    alternatePrefixHandlingEnabled = enable;
    PREFIX = enable ? ALTERNATE_PREFIX_COMMAND : DEFAULT_PREFIX_COMMAND;
    return replyOnce(message, `Alternate Prefix Handling ${enable ? 'enabled' : 'disabled'}. Commands now use the ${PREFIX} prefix.`);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = normalizeCommand(args.shift().toLowerCase());

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
      default:
        return replyOnce(message, formatErrorMessage(ERROR_CODES.UNKNOWN_COMMAND, `Unknown command action. Use \`${PREFIX}help-sel\` for a list of moderation command actions.`));
    }
  } catch (error) {
    console.error(`An error occurred while processing command '${command}': ${error.message}`);
    return message.reply(formatErrorMessage(ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred while processing your command.', error));
  }
});

function getHelpText() {
  const statusLine = alternatePrefixHandlingEnabled
    ? `Alternate Prefix Handling enabled (${APHS_STATUS_CONFIG_ENABLED})`
    : `Alternate Prefix Handling disabled (${APHS_STATUS_CONFIG_DISABLED})`;

  return `Selene Moderation Framework - Commands:\n` +
    `${statusLine}\n` +
    `Current command prefix: ${PREFIX}\n` +
    `Use \`selmf_core_feature_flag_alternate_prefix_handling = enabled\` to enable alternate prefix handling and use the $ prefix.\n` +
    `Use \`selmf_core_feature_flag_alternate_prefix_handling = disabled\` to disable alternate prefix handling and use the ! prefix.\n` +
    `\`${PREFIX}help-sel\` (alias: \`${PREFIX}garant\`) — Show this help message.\n` +
    `\`${PREFIX}kick @user [reason]\` (alias: \`${PREFIX}phantom\`) — Kick a user from the server.\n` +
    `\`${PREFIX}ban @user [reason]\` (alias: \`${PREFIX}violet\`) — Ban a user from the server.\n` +
    `\`${PREFIX}mute @user\` (alias: \`${PREFIX}iris\`) — Mute a user by assigning a Muted role.\n` +
    `\`${PREFIX}unmute @user\` (alias: \`${PREFIX}iris_revert\`) — Remove the Muted role.\n` +
    `\`${PREFIX}lockdown\` (alias: \`${PREFIX}twilight\`) — Lock down the current channel so members can no longer send messages.\n` +
    `\`${PREFIX}unlock\` (alias: \`${PREFIX}daybreak\`) — Restore send permissions for the current channel.\n` +
    `\`${PREFIX}purge <count>\` (alias: \`${PREFIX}hydroxide\`) — Delete the most recent messages.\n` +
    `\`${PREFIX}warn @user [reason]\` (alias: \`${PREFIX}seraph\`) — Record a warning for a user.\n` +
    `\`${PREFIX}restart\` (alias: \`${PREFIX}reboot\`) — Restart the bot process. DO NOT USE UNLESS ABSOLUTELY NECESSARY!\n` +
    `\`${PREFIX}halt\` (alias: \`${PREFIX}cease\`) — Shut down the bot process. Use this when you want Selene to stop running. Used by developers for maintenance and updating purposes.\n` +
    `\`${PREFIX}elevate_framework_authority\` — Grant framework authority to a user so they may execute admin-only commands. Administrator only.\n` +
    `\`${PREFIX}debase_framework_authority\` — Revoke previously granted framework authority from a user. Administrator only.\n` +
    `\`${PREFIX}validate_framework_integrity\` (alias: \`${PREFIX}viper\`) — Run an integrity check of core subcomponents and features.\n` +
    `\`${PREFIX}enable_verbose_dialogs\` — Enable verbose error dialogs. Use only for debugging purposes.\n` +
    `\`${PREFIX}disable_verbose_dialogs\` — Disable verbose error dialogs. Recommended for normal operation.`;
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
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_KICK, `You need Kick Members permission to execute this command action. To bypass, ask an administrator to grant you elevated framework authority, which allows execution of admin-level commands within this bot without needing the corresponding Discord permissions. Elevated framework authority can be granted using the command \`${PREFIX}elevate_framework_authority\`.`));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_KICK, 'Please mention a user to kick.'));
  if (!target.kickable) return replyOnce(message, formatErrorMessage(ERROR_CODES.UNABLE_TO_KICK, `An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "${PREFIX}kick" impossible.`));

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.kick(reason);
  return replyOnce(message, `Kicked ${target.user.tag}. Reason: ${reason}`);
}

async function handleBan(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
    return replyOnce(message, formatErrorMessage(ERROR_CODES.NO_PERMISSION_BAN, `You need Ban Members permission to execute this command action. To bypass, ask an administrator to grant you elevated framework authority, which allows execution of admin-level commands within this bot without needing the corresponding Discord permissions. Elevated framework authority can be granted using the command \`${PREFIX}elevate_framework_authority\`.`));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return replyOnce(message, formatErrorMessage(ERROR_CODES.MISSING_TARGET_BAN, 'Please mention a user to ban.'));
  if (!target.bannable) return replyOnce(message, formatErrorMessage(ERROR_CODES.UNABLE_TO_BAN, `An error has occurred while executing the command action: Role hierarchy or permissions rendering moderation action "${PREFIX}ban" impossible.`));

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
  if (!hasAdminAuthority(message.member)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_VERBOSE_DIALOGS, 'You need Administrator permission or elevated framework authority to change verbose dialog mode.'));
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
  if (!hasAdminAuthority(message.member)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_RESTART, 'You need Administrator permission or elevated framework authority to restart the bot.'));
  }

  await message.reply('Restarting Selene moderation framework...');
  restartProcess();
  await client.destroy();
  process.exit(0);
}

async function handleHalt(message) {
  if (!hasAdminAuthority(message.member)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_HALT, 'You need Administrator permission or elevated framework authority to halt the bot.'));
  }

  await message.reply('Shutting down Selene Moderation Framework...');
  await client.destroy();
  process.exit(0);
}

async function handleElevateFrameworkAuthority(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.Administrator)) {
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_ELEVATE, 'You need Administrator permission to grant framework authority.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(formatErrorMessage(ERROR_CODES.MISSING_TARGET_WARN, 'Please mention a user to elevate.'));
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
    return message.reply(formatErrorMessage(ERROR_CODES.NO_PERMISSION_DEBASE, 'You need Administrator permission to revoke framework authority.'));
  }

  const target = getTargetMember(message, args[0]);
  if (!target) {
    return message.reply(formatErrorMessage(ERROR_CODES.MISSING_TARGET_WARN, 'Please mention a user to debase.'));
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
