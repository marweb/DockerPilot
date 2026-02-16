# Resend Configuration Guide

Configure DockPilot to send emails via Resend (resend.com).

## Prerequisites

- Resend account (free tier available)
- Verified domain

## Setup Steps

### 1. Create Resend Account

Sign up at https://resend.com

### 2. Add and Verify Domain

1. Go to Domains → Add Domain
2. Add your domain (e.g., example.com)
3. Add DNS records as instructed:
   - **MX Record**: For receiving emails (optional for sending only)
   - **SPF Record**: TXT record for sender authentication
   - **DKIM Record**: TXT record for email signing
   - **DMARC Record**: TXT record for policy enforcement
4. Wait for verification (usually instant to a few hours)

### 3. Generate API Key

1. Go to API Keys → Create API Key
2. Name: "DockPilot"
3. Permissions: "Full Access" or "Sending Access"
4. Copy the API key (starts with `re_`)

### 4. Configure DockPilot

Go to Settings → Notifications → Resend

- **Enabled**: Toggle on
- **API Key**: Paste your Resend API key
- **From Address**: Use format `name@yourdomain.com`

⚠️ The from address domain must match your verified domain in Resend.

### 5. Test

Click "Send Test Email" to verify.

## Domain Verification Checklist

After adding DNS records, verify they propagate:

```bash
# Check SPF record
dig TXT yourdomain.com

# Check DKIM record
dig TXT resend._domainkey.yourdomain.com

# Check DMARC record
dig TXT _dmarc.yourdomain.com
```

## Security Best Practices

- Store API keys securely - treat them like passwords
- Use separate API keys for different environments (dev/staging/prod)
- Rotate API keys periodically
- Use the minimum required permissions ("Sending Access" is sufficient)
- Enable audit logging if available

## Troubleshooting

### Unauthorized Error

- API key may be invalid or revoked
- Check key permissions include "sending"
- Verify API key format (starts with `re_`)

### Domain not verified

- Ensure domain status is "Active" in Resend
- Check DNS records are correctly configured
- Wait for DNS propagation (can take up to 48 hours)
- Verify no typos in DNS record values

### Emails marked as spam

- Set up SPF, DKIM, and DMARC records correctly
- Warm up your domain gradually (start with small volumes)
- Use consistent "From" address
- Avoid spam trigger words in content
- Monitor sender reputation

### API Rate Limiting

Resend limits requests based on your plan:

- Free: 100 emails/day
- Paid: Higher limits apply

DockPilot will queue and retry automatically if rate limited.

## Pricing

| Plan       | Price  | Emails/Month    | Features                         |
| ---------- | ------ | --------------- | -------------------------------- |
| Free       | $0     | 3,000 (100/day) | Basic sending, API access        |
| Starter    | $20    | 50,000          | Priority support, webhooks       |
| Pro        | $80    | 200,000         | Advanced analytics, dedicated IP |
| Enterprise | Custom | Custom          | SLA, dedicated support           |

See https://resend.com/pricing for current pricing.

## Official Documentation

- Resend Docs: https://resend.com/docs
- API Reference: https://resend.com/docs/api-reference
- Webhooks: https://resend.com/docs/webhooks
