# Selene Moderation Framework
The **Selene Moderation Framework (SELMF)** is a Discord application designed for moderation-oriented tasks.
Currently, SELMF is planned to be released only for **The Awesome Team**, a Discord community server.
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

## Run from repository root
Always run startup commands from the repo root where `package.json` lives.
In this workspace, that is:
```bash
cd /workspaces/selene-server-moderation-system
```

If you are already in the repo root, simply run the startup commands directly.

## Start locally
From Linux/macOS or Windows, you can start Selene using one of these commands:

```bash
npm start
# or
npm run boot
```

## Cross-platform startup scripts
There are helper scripts for each platform:

From Linux/macOS:
```bash
./start-selene.sh
```

From Windows (Command Prompt or PowerShell):
```powershell
start-selene.cmd
```

## Remote Codespace startup
To initialize Selene from outside the Codespace using GitHub Codespaces CLI:

```bash
gh codespace exec -- npm run boot
```

This command executes in the Codespace workspace root, so make sure the Codespace is running and you are authenticated.

## Commands
The bot uses `!` as the prefix.
- `!help` — Show available moderation commands.
- `!kick @user [reason]` — Kick a member.
- `!ban @user [reason]` — Ban a member.
- `!mute @user` — Assign a `Muted` role and block messaging/speaking.
- `!unmute @user` — Remove the `Muted` role.
- `!lockdown` — Lock down the current channel so members cannot send messages.
- `!unlock` — Restore send permissions for the current channel.
- `!purge <count>` — Delete recent messages from the channel.
- `!warn @user [reason]` — Record a warning for a member.
- `!restart` — Restart the bot process.
- `!enable_verbose_dialogs` — Enable verbose error dialogs.
- `!disable_verbose_dialogs` — Disable verbose error dialogs.

## Command Aliases
The bot uses `!` as the prefix for command aliases too. The syntax for commands executed under aliases remains the same as for the base commands.
- `!garant` — Show available moderation commands. (Alias counterpart of `!help`)
- `!phantom` — Kick a member. (Alias counterpart of `!kick`)
- `!violet` — Ban a member. (Alias counterpart of `!ban`)
- `!iris` — Assign a `Muted` role and block messaging/speaking. (Alias counterpart of `!mute`)
- `!iris_revert` — Remove the `Muted` role. (Alias counterpart of `!unmute`)
- `!twilight` — Lock down the current channel so members cannot send messages. (Alias counterpart of `!lockdown`)
- `!daybreak` — Restore send permissions for the current channel. (Alias counterpart of `!unlock`)
- `!hydroxide` — Delete the most recent messages from the channel. (Alias counterpart of `!purge`)
- `!seraph` — Record a warning for a member. (Alias counterpart of `!warn`)
- `!reboot` — Restart the bot process. (Alias counterpart of `!restart`)

**NOTICE:** The Command Aliases feature is known for the bug `selene_moderation_framework_bug_002`. The team is working hard to find a permanent resolution to the issue.

## Notes
- The bot requires appropriate server permissions to manage roles, kick/ban members, and delete messages.
- The `Muted` role is created automatically when the bot mutes a member.
- Warnings are stored in `warnings.json` (ignored from git by `.gitignore`).

## Credits
**ExtremeHydroxides** - Lead Developer

**IrisBitzyy** - Lead Debugger and Developer
