# Slack Configuration Guide

Configure DockPilot to send notifications to Slack channels.

## Prerequisites

- Slack workspace admin access
- Target channel (public or private)

## Setup Steps

### 1. Create Incoming Webhook

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "DockPilot Notifications"
4. Select your workspace

### 2. Enable Incoming Webhooks

1. In the left sidebar, click "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to On
3. Scroll down and click "Add New Webhook to Workspace"
4. Select the channel where notifications should go
5. Click "Allow"

### 3. Copy Webhook URL

You'll see a URL like:

```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

Copy this URL (keep it secret!).

### 4. Configure DockPilot

Go to Settings → Notifications → Slack

- **Enabled**: Toggle on
- **Webhook URL**: Paste the Slack webhook URL

### 5. Test

Click "Send Test Message" to verify.

## Message Format

DockPilot sends messages in plain text format. You can customize:

- Channel where messages appear
- Bot name and icon in Slack app settings

### Customizing Bot Appearance

1. Go to your app settings at https://api.slack.com/apps
2. Select "DockPilot Notifications"
3. Go to "Basic Information"
4. Under "Display Information":
   - **App Name**: Display name in messages
   - **Short Description**: Brief description
   - **App Icon & Preview**: Upload custom icon (128x128 PNG recommended)
   - **Background Color**: Hex color for app icon

## Security Best Practices

- **Treat webhook URL as a secret** - anyone with the URL can post to your channel
- Use private channels for sensitive notifications
- Rotate webhooks periodically by creating new ones and revoking old
- Use IP allowlisting if available in your Slack plan
- Monitor for unauthorized posts
- Consider using OAuth 2.0 for production (requires custom app development)

## Troubleshooting

### Invalid Webhook

- Webhook may have been revoked
- Re-create webhook in Slack app settings
- Check if the app was uninstalled from the workspace

### Channel Not Found

- Ensure bot is added to the channel
- For private channels, invite the bot user manually
- Verify the channel still exists

### Rate Limited

- Slack limits webhooks to 1 message per second per webhook
- DockPilot will queue and retry automatically
- Consider multiple webhooks for high-volume scenarios

### Messages not appearing

- Check if the app was disabled in workspace settings
- Verify channel permissions allow bot posting
- Look for Slack workspace outages at https://status.slack.com

### Cannot post to private channel

1. Invite the bot to the channel: `/invite @DockPilot Notifications`
2. Or create a new webhook specifically for that channel
3. Ensure you have permission to add apps to private channels

## Advanced: Multiple Channels

To send notifications to multiple channels:

1. Create separate webhooks for each channel
2. Configure multiple Slack integrations in DockPilot
3. Use filters to route different notification types to different channels

Example setup:

- `#alerts-critical` - Production issues
- `#alerts-info` - General notifications
- `#deployments` - Deployment status

## Official Documentation

- Incoming Webhooks: https://api.slack.com/messaging/webhooks
- Rate Limits: https://api.slack.com/docs/rate-limits
- Block Kit Builder: https://api.slack.com/tools/block-kit-builder
- Slack API: https://api.slack.com
