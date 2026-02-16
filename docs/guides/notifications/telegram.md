# Telegram Configuration Guide

Configure DockPilot to send notifications via Telegram Bot.

## Prerequisites

- Telegram account
- Ability to create bots via @BotFather

## Setup Steps

### 1. Create Bot

1. Open Telegram and search for @BotFather
2. Start chat and send `/newbot`
3. Follow prompts:
   - Name: "DockPilot Notifications"
   - Username: must end in "bot" (e.g., dockpilot_alerts_bot)
4. Copy the API token (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Get Chat ID

#### For Personal Notifications:

1. Send any message to your bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789` — this is your Chat ID

#### For Group Notifications:

1. Add bot to your group
2. Send a test message in the group
3. Use same API method above
4. Chat ID for groups starts with `-` (e.g., `-1001234567890`)

#### Using Bot Commands (Alternative):

Add this command to your bot via @BotFather:

```
myid - Get your chat ID
```

Then implement a simple bot that responds with the chat ID when users send `/myid`.

### 3. Configure DockPilot

Go to Settings → Notifications → Telegram

- **Enabled**: Toggle on
- **Bot Token**: Paste your bot token
- **Chat ID**: Paste the chat ID

### 4. Test

Click "Send Test Message" to verify.

## Privacy Mode

By default, bots only see messages that:

- Start with `/` command
- Are replies to bot's messages
- Mention the bot by @username

### Disabling Privacy Mode

For group notifications, you may need to disable privacy mode:

1. Message @BotFather
2. Send `/mybots`
3. Select your bot
4. Select "Bot Settings"
5. Select "Group Privacy"
6. Turn off "Privacy mode"

⚠️ **Warning**: This allows the bot to see all messages in groups, which has privacy implications.

## Security Best Practices

- Store bot tokens securely - they grant full control over your bot
- Use separate bots for different environments (dev/staging/prod)
- Don't share bot tokens in code repositories
- Rotate tokens periodically via @BotFather
- Be cautious with group privacy settings
- Monitor bot activity for unauthorized usage

## Troubleshooting

### Bot not responding

- Verify token is correct (copy-paste carefully)
- Ensure bot hasn't been blocked by @BotFather
- Check if bot was deleted or banned
- Verify bot is not in privacy mode if it needs to see group messages

### Chat not found

- Chat ID format: personal (123456789) or group (-1001234567890)
- Ensure you've messaged the bot first (for personal chats)
- For groups, ensure bot is a member of the group
- Check if the group was converted to a supergroup (chat ID changes)

### Message not delivered

- Bot may be blocked by user
- Group permissions may restrict bots
- Check @BotFather for bot status
- Verify the chat still exists

### Can't add bot to group

- Ensure you have admin rights in the group
- Check group settings don't restrict bot additions
- Try adding via "Add Members" → search for bot username

## Message Formatting

Telegram supports basic HTML formatting:

- `<b>bold</b>`
- `<i>italic</i>`
- `<code>code</code>`
- `<a href="url">link</a>`
- `<pre>preformatted text</pre>`

DockPilot uses plain text by default for maximum compatibility, but you can customize message templates if needed.

### Markdown Formatting (Alternative)

Telegram also supports Markdown:

- `*bold*`
- `_italic_`
- `` `code` ``
- `[link text](url)`

## Advanced: Channel Notifications

For large-scale notifications, consider using Telegram Channels:

1. Create a channel in Telegram
2. Add your bot as an administrator
3. Use the channel's chat ID (starts with `-100`)
4. Members can subscribe without seeing each other

## Official Documentation

- Bot API: https://core.telegram.org/bots/api
- BotFather: https://core.telegram.org/bots#6-botfather
- Getting Updates: https://core.telegram.org/bots/api#getting-updates
- Webhooks: https://core.telegram.org/bots/webhooks
