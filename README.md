# Selene Server Moderation System
The **Selene Server Moderation System (SEL-SMODSYS)** is a Discord application designed for moderation-oriented tasks.
Currently, SEL-SMODSYS is planned to be released only for **The Awesome Team**, a Discord community server.
> The discord link for [The Awesome Team](https://discord.gg/pfzEnYJSKf).

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and add your bot token:
   ```bash
   cp .env.example .env
   ```
3. Set `DISCORD_TOKEN` in `.env`.
4. Start the bot:
   ```bash
   npm start
   ```

## Commands
The bot uses `!` as the prefix.
- `!help` — Show available moderation commands.
- `!kick @user [reason]` — Kick a member.
- `!ban @user [reason]` — Ban a member.
- `!mute @user` — Assign a `Muted` role and block messaging/speaking.
- `!unmute @user` — Remove the `Muted` role.
- `!lockdown` (alias: `!twilight`) — Lock down the current channel so members cannot send messages.
- `!unlock` (alias: `!daybreak`) — Restore send permissions for the current channel.
- `!purge <count>` — Delete recent messages from the channel.
- `!warn @user [reason]` — Record a warning for a member.

## Notes
- The bot requires appropriate server permissions to manage roles, kick/ban members, and delete messages.
- The `Muted` role is created automatically when the bot mutes a member.
- Warnings are stored in `warnings.json` (ignored from git by `.gitignore`).

## Credits
**ExtremeHydroxides** - Lead Developer
**IrisBitzyy** - Lead Debugger and Developer
