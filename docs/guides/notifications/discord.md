# Discord Configuration Guide

Configure DockPilot to send notifications to Discord channels.

## Prerequisites

- Discord server admin or "Manage Webhooks" permission
- Target channel (text channel)

## Setup Steps

### 1. Create Webhook

1. In Discord, go to your server
2. Right-click the target text channel
3. Select "Server Settings" → "Integrations"
4. Click "Webhooks" → "New Webhook"
5. Name: "DockPilot Notifications"
6. Optional: Upload custom avatar
7. Click "Copy Webhook URL"

The URL looks like:

```
https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz
```

### 2. Configure DockPilot

Go to Settings → Notifications → Discord

- **Enabled**: Toggle on
- **Webhook URL**: Paste the Discord webhook URL

### 3. Test

Click "Send Test Message" to verify.

## Message Format

Discord supports Markdown formatting:

- **Bold** with `**text**`
- _Italic_ with `*text*`
- `Code` with `` `text` ``
- [Links](url) with `[text](url)`
- ~~Strikethrough~~ with `~~text~~`

DockPilot sends plain text with basic formatting by default.

### Rich Embeds

Discord webhooks support rich embeds with:

- Colored side bars
- Title and description
- Fields and inline fields
- Images and thumbnails
- Timestamps

DockPilot uses simple text messages, but you can customize templates if needed.

## Security

- **Webhook URLs are secrets** — anyone with the URL can post
- Use channel-specific permissions to control who sees notifications
- Consider using private channels for sensitive alerts
- Regenerate webhook URLs periodically if you suspect compromise
- Be careful where you paste webhook URLs (avoid public logs/gists)

## Customization

You can customize the webhook in Discord:

- Change bot name per-server
- Change avatar per-server
- These override DockPilot defaults

### Steps to Customize

1. Go to Server Settings → Integrations → Webhooks
2. Find your "DockPilot Notifications" webhook
3. Click to edit
4. Change name and/or upload avatar
5. Save changes

## Troubleshooting

### Invalid Webhook

- Webhook may have been deleted
- URL may be malformed or truncated
- Re-create webhook in Discord
- Check if the integration was disabled

### Channel Not Found

- Webhook may have been moved to different channel
- Re-create or update webhook channel
- Verify the channel still exists
- Check channel permissions

### Rate Limited

- Discord limits: 5 requests per 2 seconds per webhook
- DockPilot handles rate limiting automatically with exponential backoff
- For high-volume scenarios, consider multiple webhooks

### Messages not appearing

- Check channel permissions allow webhook posting
- Ensure webhook hasn't been disabled
- Verify channel isn't in slow mode that affects bots
- Check Discord status at https://discordstatus.com

### Cannot create webhook

- Verify you have "Manage Webhooks" permission
- Check server settings don't restrict integrations
- Some server types (Community) may have different settings

## Advanced: Thread Support

Discord webhooks can post to threads:

1. Create a thread in your channel
2. Copy the thread ID (right-click thread → Copy ID, enable Developer Mode first)
3. Append `?thread_id=THREAD_ID` to the end of webhook URL

Example:

```
https://discord.com/api/webhooks/123456789/abc...xyz?thread_id=987654321
```

Requirements:

- Thread must exist
- Webhook must have access to the thread
- Thread must not be archived

## Multiple Webhooks

To send different notification types to different channels:

1. Create separate webhooks for each channel
2. Configure multiple Discord integrations in DockPilot
3. Use notification filters to route appropriately

Example setup:

- `#general-alerts` - All notifications
- `#critical-alerts` - Only critical issues
- `#deployment-log` - Deployment updates only

## Official Documentation

- Webhooks: https://discord.com/developers/docs/resources/webhook
- Markdown: https://discord.com/developers/docs/reference#message-formatting
- Rate Limits: https://discord.com/developers/docs/topics/rate-limits
- Discord Developer Portal: https://discord.com/developers/applications
