const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '!';
const WARNING_FILE = path.join(__dirname, 'warnings.json');

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env or environment variables.');
  process.exit(1);
}

let warnings = {};
try {
  warnings = JSON.parse(fs.readFileSync(WARNING_FILE, 'utf8') || '{}');
} catch (error) {
  warnings = {};
}

function saveWarnings() {
  fs.writeFileSync(WARNING_FILE, JSON.stringify(warnings, null, 2));
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
  console.log(`Selene moderation bot ready as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'help':
      return message.reply(getHelpText());
    case 'kick':
      return handleKick(message, args);
    case 'ban':
      return handleBan(message, args);
    case 'mute':
      return handleMute(message, args);
    case 'unmute':
      return handleUnmute(message, args);
    case 'purge':
      return handlePurge(message, args);
    case 'warn':
      return handleWarn(message, args);
    default:
      return message.reply(`Unknown command action. Use \`${PREFIX}help\` for a list of moderation commands.`);
  }
});

function getHelpText() {
  return `Selene Moderation Commands:\n` +
    `\`${PREFIX}help\` — Show this help message.\n` +
    `\`${PREFIX}kick @user [reason]\` — Kick a user from the server.\n` +
    `\`${PREFIX}ban @user [reason]\` — Ban a user from the server.\n` +
    `\`${PREFIX}mute @user\` — Mute a user by assigning a Muted role.\n` +
    `\`${PREFIX}unmute @user\` — Remove the Muted role.\n` +
    `\`${PREFIX}purge <count>\` — Delete the most recent messages.\n` +
    `\`${PREFIX}warn @user [reason]\` — Record a warning for a user.`;
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
        console.warn(`Unable to update permissions for channel ${channel.id}: ${error.message}`);
      }
    }
  }

  return role;
}

async function handleKick(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.KickMembers)) {
    return message.reply('You need Kick Members permission to use this command.');
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return message.reply('Please mention a user to kick.');
  if (!target.kickable) return message.reply('I cannot kick that member.');

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.kick(reason);
  return message.reply(`Kicked ${target.user.tag}. Reason: ${reason}`);
}

async function handleBan(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) {
    return message.reply('You need Ban Members permission to use this command.');
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return message.reply('Please mention a user to ban.');
  if (!target.bannable) return message.reply('I cannot ban that member.');

  const reason = args.slice(1).join(' ') || 'No reason provided';
  await target.ban({ reason });
  return message.reply(`Banned ${target.user.tag}. Reason: ${reason}`);
}

async function handleMute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return message.reply('You need Manage Roles permission to use this command.');
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return message.reply('Please mention a user to mute.');

  const muteRole = await ensureMutedRole(message.guild);
  if (target.roles.cache.has(muteRole.id)) {
    return message.reply(`${target.user.tag} is already muted.`);
  }

  await target.roles.add(muteRole, 'Muted by Selene moderation bot');
  return message.reply(`${target.user.tag} has been muted.`);
}

async function handleUnmute(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageRoles)) {
    return message.reply('You need Manage Roles permission to use this command.');
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return message.reply('Please mention a user to unmute.');

  const muteRole = await ensureMutedRole(message.guild);
  if (!target.roles.cache.has(muteRole.id)) {
    return message.reply(`${target.user.tag} is not muted.`);
  }

  await target.roles.remove(muteRole, 'Unmuted by Selene moderation bot');
  return message.reply(`${target.user.tag} has been unmuted.`);
}

async function handlePurge(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
    return message.reply('You need Manage Messages permission to use this command.');
  }

  const amount = parseInt(args[0], 10);
  if (Number.isNaN(amount) || amount < 1 || amount > 100) {
    return message.reply('Please specify a number between 1 and 100.');
  }

  const deleted = await message.channel.bulkDelete(amount + 1, true);
  return message.reply(`Deleted ${deleted.size - 1} message(s).`).then((reply) => {
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  });
}

async function handleWarn(message, args) {
  if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
    return message.reply('You need Manage Messages permission to use this command.');
  }

  const target = getTargetMember(message, args[0]);
  if (!target) return message.reply('Please mention a user to warn.');

  const reason = args.slice(1).join(' ') || 'No reason provided';
  const userId = target.id;
  warnings[userId] = warnings[userId] || [];
  warnings[userId].push({ issuer: message.author.id, reason, date: new Date().toISOString() });
  saveWarnings();

  return message.reply(`Warned ${target.user.tag}. Total warnings: ${warnings[userId].length}`);
}

client.login(TOKEN);
