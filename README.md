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
- `!purge <count>` — Delete recent messages from the channel.
- `!warn @user [reason]` — Record a warning for a member.

## Command Aliases
The bot uses `!` as the prefix for command aliases too. The syntax for commands executed under aliases remains the same as for the base commands.
- `!garant` — Show available moderation commands. (Alias counterpart of `!help`)
- `!phantom` — Kick a member. (Alias counterpart of `!kick`)
- `!violet` — Ban a member. (Alias counterpart of `!ban`)
- `!iris` — Assign a `Muted` role and block messaging/speaking. (Alias counterpart of `!mute`)
- `!iris_revert` — Remove the `Muted` role. (Alias counterpart of `!unmute`)
- `!hydroxide` — Delete the most recent messages from the channel. (Alias counterpart of `!purge`)
- `!seraph` — Record a warning for a member. (Alias counterpart of `!warn`)

**NOTICE:** The Command Aliases feature is known for the bug `selene_moderation_framework_bug_002`. The team is working hard to find a permanent resolution to the issue.

## Notes
- The bot requires appropriate server permissions to manage roles, kick/ban members, and delete messages.
- The `Muted` role is created automatically when the bot mutes a member.
- Warnings are stored in `warnings.json` (ignored from git by `.gitignore`).

## Credits
**ExtremeHydroxides** - Lead Developer

**IrisBitzyy** - Lead Debugger and Developer
