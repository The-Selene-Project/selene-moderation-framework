# Selene Moderation Framework
The **Selene Moderation Framework (SELMF)** is a Discord application designed for moderation-oriented tasks.
Currently, SELMF is planned to be released only for **The Awesome Team**, a Discord community server.
> The discord link for [The Awesome Team](https://discord.gg/pfzEnYJSKf).

> "Simplifying Moderation, for everybody." - Motto of the Selene Moderation Framework

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

    (Steps 1 and 2 can be skipped, for that you need to ask for a pre-made .env file from the developers.)

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
**NOTICE:** This method is difficult if you set this up incorrectly, unless you have done that before. Contact IrisBitzyy on Discord (username: irisbitzyy) for assistance if needed.

## Remote Codespace startup
To initialize Selene from outside the Codespace using GitHub Codespaces CLI:

```bash
gh codespace exec -- npm run boot
```

This command executes in the Codespace workspace root, so make sure the Codespace is running and you are authenticated.

## Startup announcement

Selene can send a startup announcement message when it becomes ready. Configure one or both of the following environment variables in your `.env` file:

- `STARTUP_ANNOUNCE_CHANNEL_ID` — (optional) channel ID to post the announcement to.
- `STARTUP_ANNOUNCE_GUILD_ID` — (optional) guild ID to prefer when selecting a channel (falls back to system channel or the first writable text channel).

- `STARTUP_ANNOUNCE_TEXT` — (optional) custom message to post when Selene starts. Defaults to: `Selene Moderation Framework initialized successfully. All subcomponents nominal.`

Notes on line breaks:

- If you need multiple lines in your announcement, include `\n` where you want a line break; the bot will convert those sequences into actual newlines when sending the message. Example:

```ini
STARTUP_ANNOUNCE_TEXT=Selene is online.\nAll subsystems nominal.\nHave a great day!
```

- `STARTUP_ANNOUNCE_FORMAT` — (optional) `plain` (default) or `embed`. If set to `embed`, the announcement is sent as an embed (embed descriptions support a subset of Markdown).

Notes:
- The bot will render basic Markdown in plain messages (bold, italic, code blocks, links). For richer presentation, set `STARTUP_ANNOUNCE_FORMAT=embed` and use Markdown-compatible formatting in `STARTUP_ANNOUNCE_TEXT`.

Example `.env` entries:

```ini
STARTUP_ANNOUNCE_CHANNEL_ID=123456789012345678
STARTUP_ANNOUNCE_GUILD_ID=987654321098765432
```

If neither is set, the bot will attempt to send the announcement to each guild's system channel or the first text channel where it has send permissions.

## Commands
The bot supports dynamic Alternate Prefix Handling. When enabled, commands use `$`. When disabled, commands use `!`.

Use these exact toggle sequences (without a command prefix):
- `selmf_core_feature_flag_alternate_prefix_handling = enabled` — enable Alternate Prefix Handling and switch commands to `$`
- `selmf_core_feature_flag_alternate_prefix_handling = disabled` — disable Alternate Prefix Handling and switch commands to `!`

The help text also reports the current prefix and state.

Examples below use the active prefix. If Alternate Prefix Handling is disabled, replace `$` with `!`.
- `$help-sel` — Show available moderation commands.
- `$kick @user [reason]` — Kick a member.
- `$ban @user [reason]` — Ban a member.
- `$mute @user` — Assign a `Muted` role and block messaging/speaking.
- `$unmute @user` — Remove the `Muted` role.
- `$lockdown` — Lock down the current channel so members cannot send messages.
- `$unlock` — Restore send permissions for the current channel.
- `$purge <count>` — Delete recent messages from the channel.
- `$warn @user [reason]` — Record a warning for a member.
- `$restart` — Restart the bot process.
- `$halt` — Shut down the bot process.
- `$help-sel-devparams` — Show developer parameter and feature flag documentation.
- `$elevate_framework_authority` — Grant framework authority to a user so they may execute admin-level commands. Administrator only.
- `$debase_framework_authority` — Revoke previously granted framework authority from a user. Administrator only.
- `$elevate_execution_redline_authority @user` — Grant a user execution redline bypass authority so their commands are not blocked by the simultaneous execution limit. Administrator only.
- `$debase_execution_redline_authority @user` — Revoke execution redline bypass authority from a user. Administrator only.
- `$validate_framework_integrity` — Run an integrity check of core subcomponents and features.
- `$enable_verbose_dialogs` — Enable verbose error dialogs.
- `$disable_verbose_dialogs` — Disable verbose error dialogs.

## Command Aliases
Alias usage also depends on the current active prefix. When Alternate Prefix Handling is enabled, aliases use `$`. When it is disabled, aliases use `!`.
- `$garant` — Show available moderation commands. (Alias counterpart of `$help-sel`)
- `$phantom` — Kick a member. (Alias counterpart of `$kick`)
- `$violet` — Ban a member. (Alias counterpart of `$ban`)
- `$iris` — Assign a `Muted` role and block messaging/speaking. (Alias counterpart of `$mute`)
- `$iris_revert` — Remove the `Muted` role. (Alias counterpart of `$unmute`)
- `$twilight` — Lock down the current channel so members cannot send messages. (Alias counterpart of `$lockdown`)
- `$daybreak` — Restore send permissions for the current channel. (Alias counterpart of `$unlock`)
- `$hydroxide` — Delete the most recent messages from the channel. (Alias counterpart of `$purge`)
- `$seraph` — Record a warning for a member. (Alias counterpart of `$warn`)
- `$reboot` — Restart the bot process. (Alias counterpart of `$restart`)
- `$cease` — Shut down the bot process. (Alias counterpart of `$halt`)
- `$viper` — Run and integrity check of core subcomponents and features. (Alias counterpart of `$validate_framework_integrity`)

## Notes
- The bot requires the Administrator permission to function properly, after Version 1.0.0 Release Candidate 1.
- The `Muted` role is created automatically when the bot mutes a member.
- Warnings are stored in `warnings.json` (ignored from git by `.gitignore`).
- Trusted framework users (users with the Elevated Framework Authority permission) are stored in `trusted_framework_users.json` (ignored from git by `.gitignore`).
- Users granted execution redline bypass authority are stored in `execution_redline_bypass_users.json` (ignored from git by `.gitignore`).
- Initializing multiple instances of SELMF will cause the bug `selene_moderation_framework_bug_002`, internally known as Iris's Aberration of Initialization, in which multiple instances of the framework try to respond to a command simultaneously, resulting in multiple outputs with the same content. An optional fix has been found. Check the next section for more information.

## Running Redis locally (Docker)

To prevent duplicate responses when multiple Selene instances are accidentally started, the bot can use Redis as a short-lived lock/dedupe store. You do not need Redis for normal operation — enable it only when you run multiple instances or in clustered environments.

### Option 1: Run Bot + Redis together with Docker Compose

This is the recommended approach for keeping the bot online indefinitely with automatic restart on crash.

1. Ensure `.env` is configured with your `DISCORD_TOKEN`:
```bash
cp .env.example .env
# Edit .env and add your bot token
```

2. Start both bot and Redis services (from the repository root):
```bash
docker compose up -d
```

This will:
- Start a Redis service on port `6379` (used internally by the bot)
- Start the Selene bot with auto-restart enabled
- Both services restart automatically unless manually stopped

3. Check status anytime:
```bash
docker compose ps
docker compose logs bot
docker compose logs redis
```

4. Stop or restart:
```bash
docker compose stop     # graceful stop
docker compose restart  # restart
docker compose down     # stop and remove containers
```

### Option 2: Start Redis with Docker (without Compose)

If you prefer Docker without Compose:

```bash
docker run -d --name selene-redis -p 6379:6379 redis:7
export REDIS_URL=redis://127.0.0.1:6379
npm start
```

Then the bot will connect to the Redis instance for message deduplication.

## Credits
**ExtremeHydroxides** - Lead Developer

**IrisBitzyy** - Lead Debugger and Developer

## Special Thanks to
**Community of The Awesome Team** - Without them, this project wouldn't be possible. The Selene Project team sincerely thanks them for their support.
