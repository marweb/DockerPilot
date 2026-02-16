# SMTP Configuration Guide

Configure DockPilot to send transactional emails via SMTP.

## Prerequisites

- SMTP server credentials
- Valid email address for "From"

## Supported Providers

- Gmail/Google Workspace
- Outlook/Office 365
- AWS SES
- Mailgun
- SendGrid
- Custom SMTP servers

## Configuration Steps

### 1. Enable SMTP

Go to Settings → Notifications → Transactional Email

### 2. Configure Fields

- **Host**: Your SMTP server hostname (e.g., smtp.gmail.com)
- **Port**: Usually 587 (STARTTLS) or 465 (SSL)
- **Encryption**: Choose based on your provider:
  - StartTLS: Port 587 (recommended)
  - SSL: Port 465
  - TLS: Port 587
  - None: Port 25 (not recommended)
- **Username**: Your email address
- **Password**: Your email password or app-specific password
- **From Name**: Display name (e.g., "DockPilot")
- **From Address**: Sender email (e.g., "notifications@example.com")

### 3. Provider-Specific Instructions

#### Gmail/Google Workspace

⚠️ **Important**: You must use an App Password, not your regular password.

1. Enable 2-Factor Authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character password in DockPilot

```
Host: smtp.gmail.com
Port: 587
Encryption: StartTLS
```

#### Outlook/Office 365

```
Host: smtp.office365.com
Port: 587
Encryption: StartTLS
```

⚠️ Modern Authentication may require app-specific setup.

#### AWS SES

1. Verify your domain in AWS SES Console
2. Create SMTP credentials in SES → SMTP Settings
3. Use generated username/password

```
Host: email-smtp.{region}.amazonaws.com
Port: 587
Encryption: StartTLS
```

#### Mailgun

1. Sign up at https://www.mailgun.com
2. Verify your domain
3. Create SMTP credentials in Domain Settings

```
Host: smtp.mailgun.org
Port: 587
Encryption: StartTLS
Username: postmaster@yourdomain.com
```

#### SendGrid

1. Sign up at https://sendgrid.com
2. Create an API key with "Mail Send" permissions
3. Use the API key as the password

```
Host: smtp.sendgrid.net
Port: 587
Encryption: StartTLS
Username: apikey
Password: Your SendGrid API Key
```

### 4. Test Configuration

Click "Send Test Email" to verify your setup.

## Security Best Practices

- Use app-specific passwords instead of main account passwords
- Enable 2-Factor Authentication when available
- Use encrypted connections (StartTLS/TLS) - never use unencrypted port 25
- Rotate SMTP credentials periodically
- Monitor for unauthorized access attempts

## Troubleshooting

### Authentication Failed

- Verify username/password
- Check if 2FA requires app password
- Ensure "Less secure apps" is enabled if applicable (legacy accounts)
- Verify the account hasn't been locked or suspended

### Connection Timeout

- Check firewall rules (port 587/465 must be open)
- Verify hostname spelling
- Try different encryption method
- Test SMTP connectivity: `telnet smtp.gmail.com 587`

### Emails not received

- Check spam/junk folder
- Verify "From" address is authorized with your provider
- Check SMTP logs for bounces
- Confirm the recipient address is valid

### SSL/TLS Errors

- Verify your system has updated CA certificates
- Try a different encryption method
- Check if your provider requires specific TLS versions

## Official Documentation

- Gmail: https://support.google.com/mail/answer/185833
- Outlook: https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040
- AWS SES: https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html
- Mailgun: https://documentation.mailgun.com/en/latest/user_manual.html#sending-via-smtp
- SendGrid: https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api
