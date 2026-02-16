# Event Notification Configuration Guide

Learn how to configure automatic event notifications in DockPilot.

## Overview

DockPilot can automatically send notifications when specific events occur in your system. This guide covers how to configure which events trigger notifications and through which channels.

## Event Categories

### Authentication Events

Monitor user authentication activities:

- **Login Success**: Track successful user logins
- **Login Failed**: Detect potential unauthorized access attempts
- **Logout**: Track user session terminations
- **Password Changed**: Security monitoring for credential updates
- **MFA Enabled**: Track two-factor authentication activations

**Recommended Configuration**:

- Enable "Login Failed" with warning severity to Slack/Email
- Enable critical auth events (brute force) to all channels

### System Events

Monitor DockPilot system operations:

- **System Startup**: Notification when DockPilot starts
- **Upgrade Started/Completed/Failed**: Track system updates
- **Backup Completed/Failed**: Monitor backup operations

**Recommended Configuration**:

- Enable "Upgrade Failed" (critical) to all channels
- Enable "Backup Failed" (critical) to email
- Enable "System Startup" (info) to Slack for visibility

### Container Events

Monitor Docker container lifecycle:

- **Container Crashed**: Detect unexpected container failures
- **Container Restarted**: Track automatic restarts
- **Out of Memory**: Detect OOM kills
- **Health Check Failed**: Monitor container health

**Recommended Configuration**:

- Enable "Container Crashed" and "OOM" (critical) to all channels
- Enable "Health Check Failed" (warning) to Slack

### Repository/Deployment Events

Monitor CI/CD operations:

- **Deploy Started/Success/Failed**: Track deployments
- **Deploy Rolled Back**: Monitor rollback operations
- **Webhook Received**: Log incoming webhooks

**Recommended Configuration**:

- Enable "Deploy Failed" (critical) to all channels
- Enable "Deploy Success" (info) to Slack for visibility

### Security Events

Critical security monitoring:

- **Suspicious Activity**: Unusual patterns detected
- **Brute Force Attack**: Multiple failed login attempts
- **Unauthorized Access**: Access violation attempts

**Recommended Configuration**:

- Enable ALL security events (critical) to all channels immediately

## Configuration Steps

### Step 1: Configure Notification Channels

Before setting up events, configure at least one notification channel:

1. Go to **Settings** → **Notifications**
2. Configure your preferred channels:
   - SMTP (Email)
   - Slack
   - Telegram
   - Discord
   - Resend
3. Test each channel with "Send Test"

### Step 2: Enable Events

1. Go to **Settings** → **Events**
2. Expand event categories by clicking on them
3. For each event you want to monitor:
   - Click the toggle in the channel column to enable
   - The toggle turns green when enabled
   - Click again to disable

### Step 3: Configure Severity Filtering

Each rule has a minimum severity level:

- **Info**: All events (includes warnings and critical)
- **Warning**: Warnings and critical only
- **Critical**: Critical events only

**Best Practice**: Set critical events to "critical" severity to reduce noise.

### Step 4: Set Cooldown Periods (Optional)

Prevent notification spam by setting cooldown periods:

- Default: 0 minutes (no cooldown)
- Recommended for high-frequency events: 5-15 minutes

**Example**: Container health check failures with 5-minute cooldown prevents spam if a container is flapping.

## Event Severity Levels

### Critical (Immediate Attention Required)

- System upgrade failed
- Backup failed
- Container crashed
- Out of memory kill
- Security events
- Deployment failed

**Response Time**: Immediate

### Warning (Attention Recommended)

- Failed login attempts
- Container restarted
- Health check failed
- Deployment rolled back
- Upgrade started

**Response Time**: Within 1 hour

### Info (For Awareness)

- Successful logins
- Deployments completed
- System startup
- Webhooks received
- Backup completed

**Response Time**: Review during business hours

## Message Templates

### Container Crash

```
🚨 CRITICAL: Container Crashed

Container: nginx-proxy
Image: nginx:alpine
Exit Code: 1
Time: 2024-01-15 14:30:00 UTC
Host: dockpilot-server-01

Last Logs:
[logs here]
```

### Deployment Failed

```
❌ DEPLOYMENT FAILED

Repository: myapp/backend
Branch: main
Commit: abc123
Time: 2024-01-15 14:30:00 UTC

Error:
[error message]

Action Required:
Check deployment logs in DockPilot UI
```

### Security Alert

```
🔒 SECURITY ALERT

Type: Brute Force Attack Detected
Source IP: 192.168.1.100
Target: admin account
Failed Attempts: 15
Time Window: 5 minutes
Time: 2024-01-15 14:30:00 UTC

Action Taken:
IP temporarily blocked

Recommendation:
Review firewall rules and consider permanent block
```

## Advanced Configuration

### Custom Cooldowns by Event Type

High-frequency events benefit from cooldowns:

| Event               | Recommended Cooldown | Reason                        |
| ------------------- | -------------------- | ----------------------------- |
| Health Check Failed | 5 minutes            | Prevents spam during recovery |
| Container Restarted | 10 minutes           | Groups rapid restarts         |
| Login Failed        | 1 minute             | Brute force detection         |
| Deploy Success      | 0 minutes            | Always notify on success      |

### Multi-Channel Strategies

**Strategy 1: Escalation**

- Info → Slack only
- Warning → Slack + Email
- Critical → All channels (Slack, Email, SMS via Telegram)

**Strategy 2: Role-Based**

- DevOps team → Slack
- Management → Email
- On-call → Telegram/SMS

**Strategy 3: Event-Based**

- Security events → All channels immediately
- Deployments → Slack only
- System events → Email digest

## Troubleshooting

### Events Not Triggering

1. Check if event type is enabled
2. Verify channel configuration is working (send test)
3. Check minimum severity matches event severity
4. Verify cooldown period hasn't blocked recent events
5. Check notification history for errors

### Too Many Notifications

1. Increase cooldown periods
2. Raise minimum severity levels
3. Disable low-priority events
4. Use category filters

### Missing Critical Events

1. Ensure "Critical" severity is selected
2. Verify channels are enabled and configured
3. Check for cooldown blocking
4. Review notification history for failures

### Notification Failures

1. Check channel configuration (credentials, URLs)
2. Verify network connectivity
3. Review service logs for errors
4. Test channel manually

## Best Practices

### 1. Start Conservative

- Enable critical events first
- Add warning events after system stabilization
- Use info events sparingly

### 2. Use Severity Appropriately

- Don't mark everything as critical
- Reserve critical for truly urgent issues
- Use warning for attention-needed items

### 3. Test Your Configuration

- Use "Send Test" on each channel
- Trigger test events when possible
- Verify notifications arrive in expected channels

### 4. Monitor Your Notifications

- Periodically review notification history
- Check for patterns in failures
- Adjust cooldowns based on frequency

### 5. Security First

- Enable all security events
- Use multiple channels for security
- Don't disable security notifications

### 6. Documentation

- Document your event strategy
- Keep severity definitions consistent
- Train team on notification meanings

## API Reference

### List Events

```bash
curl -X GET \
  https://dockpilot.example.com/api/notifications/rules/matrix \
  -H "Authorization: Bearer $TOKEN"
```

### Create Rule

```bash
curl -X POST \
  https://dockpilot.example.com/api/notifications/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "container.crashed",
    "channelId": "channel-uuid",
    "enabled": true,
    "minSeverity": "critical",
    "cooldownMinutes": 5
  }'
```

### Get History

```bash
curl -X GET \
  "https://dockpilot.example.com/api/notifications/history?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

## See Also

- [SMTP Configuration](./smtp.md)
- [Slack Configuration](./slack.md)
- [Security Best Practices](../security.md)
