# Events Troubleshooting Runbook

Quick troubleshooting guide for common event notification issues.

## Quick Diagnostics

### Check Event Dispatcher Status

```bash
# Check if event dispatcher is running
curl -s http://localhost:3000/api/health | jq '.services'

# Should show: "notifications": "healthy"
```

### Verify Configuration

```bash
# List configured rules
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notifications/rules | jq '.data.rules'

# Check notification history
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/notifications/history?limit=10" | jq '.data.history'
```

## Common Issues

### Issue: No Notifications Received

**Symptoms**: Events occur but no notifications sent

**Diagnostics**:

1. Check if rules exist for the event:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/notifications/rules/matrix | jq '.data.matrix'
   ```

2. Check notification history:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/notifications/history | jq '.data.history[] | {eventType, status, error}'
   ```

3. Verify channels are configured:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/system/notifications/config | jq '.data.channels'
   ```

**Solutions**:

- Enable rules in Settings → Events
- Test channel configuration
- Check severity levels match
- Verify cooldown periods

### Issue: Duplicate Notifications

**Symptoms**: Same event triggers multiple notifications

**Cause**: Multiple rules for same event-channel combination

**Solution**:

1. List all rules:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/notifications/rules | jq '.data.rules[] | {id, eventType, channelId}'
   ```

2. Delete duplicate rules:
   ```bash
   curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/notifications/rules/{duplicate-rule-id}
   ```

### Issue: High Volume of Notifications (Spam)

**Symptoms**: Too many notifications, notification fatigue

**Solutions**:

1. **Add Cooldown Periods**:
   - Container events: 5-10 minutes
   - Health checks: 5 minutes
   - Login failures: 1 minute

2. **Raise Severity Thresholds**:
   - Change from "info" to "warning" or "critical"
   - Disable low-priority events

3. **Consolidate Channels**:
   - Use one primary channel instead of many
   - Reserve secondary channels for critical only

### Issue: Notification Delays

**Symptoms**: Notifications arrive late or out of order

**Possible Causes**:

- Retry mechanism active
- Channel provider delays
- Network issues

**Diagnostics**:

```bash
# Check retry counts in history
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notifications/history | jq '.data.history[] | {eventType, retryCount, status}'
```

**Solutions**:

- Check channel provider status page
- Verify network connectivity
- Review service logs for timeouts

### Issue: Security Events Not Alerting

**Symptoms**: Security incidents occur but no notifications

**Critical Check**:
Security events should NEVER be silenced.

**Immediate Actions**:

1. Enable ALL security event rules
2. Set severity to "critical"
3. Enable ALL channels
4. Set cooldown to 0
5. Test with simulated event

### Issue: Channel-Specific Failures

#### SMTP Failures

```bash
# Test SMTP configuration
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/notifications/test \
  -d '{"provider": "smtp", "testEmail": "test@example.com"}'
```

Common fixes:

- Use app-specific password for Gmail
- Check firewall rules (ports 587, 465)
- Verify TLS/SSL settings

#### Slack Failures

- Verify webhook URL hasn't expired
- Check channel permissions
- Ensure bot is in channel

#### Telegram Failures

- Verify bot token is valid
- Check chat ID is correct
- Ensure bot hasn't been blocked

## Log Analysis

### View Event Dispatcher Logs

```bash
# Docker
docker logs dockpilot-api-gateway | grep "eventDispatcher"

# Systemd
journalctl -u dockpilot -f | grep "event"
```

### Key Log Patterns

**Successful Dispatch**:

```
[INFO] Event dispatched: container.crashed (critical) -> smtp (success)
```

**Retry Attempt**:

```
[WARN] Notification failed, retrying (attempt 1/3): container.crashed
```

**Cooldown Block**:

```
[INFO] Event skipped (cooldown): auth.login.failed
```

**Severity Filter**:

```
[INFO] Event skipped (severity): auth.login.success (info < warning)
```

## Performance Tuning

### Database Queries

Slow queries on notification history:

```sql
-- Add index if missing
CREATE INDEX IF NOT EXISTS idx_notification_history_composite
ON notification_history(event_type, channel_id, created_at);
```

### Cleanup Old History

```bash
# Keep only last 30 days
sqlite3 /data/dockpilot.db "DELETE FROM notification_history WHERE created_at < datetime('now', '-30 days');"
```

### Monitor Dispatcher Queue

```bash
# Check pending notifications
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/notifications/history?status=pending" | jq '.data.history | length'
```

## Emergency Procedures

### Disable All Event Notifications

If notifications are causing issues:

```bash
# Disable all rules
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notifications/rules/bulk-disable
```

Or via database:

```sql
UPDATE notification_rules SET enabled = 0;
```

### Reset to Defaults

```bash
# Delete all custom rules
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notifications/rules

# Recreate default rules
# (Re-run migrations or use setup script)
```

### Get Help

If issues persist:

1. Collect logs: `docker logs dockpilot-api-gateway > logs.txt`
2. Export config: Settings → Export Configuration
3. Create issue: https://github.com/marweb/DockPilot/issues

## Prevention

### Regular Health Checks

Add to monitoring:

```bash
#!/bin/bash
# check-notifications.sh

HEALTH=$(curl -s http://localhost:3000/api/health | jq -r '.services.notifications')
if [ "$HEALTH" != "healthy" ]; then
  echo "Notification service unhealthy" | mail -s "DockPilot Alert" admin@example.com
fi
```

### Review Schedule

Weekly:

- Review notification history for patterns
- Check for failed notifications
- Verify cooldown periods are appropriate

Monthly:

- Review and adjust severity levels
- Clean up old notification history
- Test all channels

## See Also

- [Events Configuration](./events-configuration.md)
- [Main Troubleshooting Guide](../../troubleshooting.md)
