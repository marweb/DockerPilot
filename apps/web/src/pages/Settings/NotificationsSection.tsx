import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import {
  Mail,
  Slack,
  Send,
  MessageSquare,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  Play,
  ChevronDown,
  ChevronUp,
  Server,
  Key,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { useToast } from '../../contexts/ToastContext';
import {
  getNotificationChannels,
  saveNotificationChannel,
  sendTestNotification,
  type NotificationProvider,
  type SaveNotificationChannelInput,
} from '../../api/notifications';

// Utility for tailwind class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Validation Schemas
// ============================================================================

const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().min(1, 'Host is required'),
  port: z.number().min(1).max(65535),
  encryption: z.enum(['none', 'ssl', 'tls', 'starttls']),
  username: z.string().optional(),
  password: z.string().optional(),
  timeout: z.number().optional(),
  fromName: z.string().min(1, 'From name is required'),
  fromAddress: z.string().email('Invalid email address'),
});

const resendSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().min(1, 'API Key is required when enabled'),
  fromAddress: z.string().email('Invalid email address'),
});

const slackSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().min(1, 'Webhook URL is required when enabled'),
});

const telegramSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().min(1, 'Bot Token is required when enabled'),
  chatId: z.string().min(1, 'Chat ID is required when enabled'),
});

const discordSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().min(1, 'Webhook URL is required when enabled'),
});

// ============================================================================
// Types
// ============================================================================

type TabType = 'email' | 'slack' | 'telegram' | 'discord';

interface SMTPFormData {
  enabled: boolean;
  host: string;
  port: number;
  encryption: 'none' | 'ssl' | 'tls' | 'starttls';
  username: string;
  password: string;
  timeout: number;
  fromName: string;
  fromAddress: string;
  configured: boolean;
}

interface ResendFormData {
  enabled: boolean;
  apiKey: string;
  fromAddress: string;
  configured: boolean;
}

interface SlackFormData {
  enabled: boolean;
  webhookUrl: string;
  configured: boolean;
}

interface TelegramFormData {
  enabled: boolean;
  botToken: string;
  chatId: string;
  configured: boolean;
}

interface DiscordFormData {
  enabled: boolean;
  webhookUrl: string;
  configured: boolean;
}

interface TestState {
  isOpen: boolean;
  provider: NotificationProvider | null;
  email?: string;
  message?: string;
  loading: boolean;
  result: { success: boolean; message: string } | null;
}

// ============================================================================
// Helper Components
// ============================================================================

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  configured?: boolean;
  disabled?: boolean;
  error?: string;
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  configured = false,
  disabled = false,
  error,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const displayValue = configured && !value ? '••••••••' : value;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'input w-full pr-10',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface FormInputProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'email' | 'number';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  error,
  suffix,
  min,
  max,
}: FormInputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => {
            if (type === 'number') {
              const num = e.target.value === '' ? '' : Number(e.target.value);
              onChange(num);
            } else {
              onChange(e.target.value);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          className={cn(
            'input w-full',
            suffix && 'pr-16',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ label, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          checked ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

function Select({ label, value, onChange, options, disabled = false }: SelectProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn('input w-full', disabled && 'opacity-50 cursor-not-allowed')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CollapsibleCardProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  configured?: boolean;
}

function CollapsibleCard({
  title,
  icon,
  isOpen,
  onToggle,
  children,
  configured = false,
}: CollapsibleCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-medium text-gray-900 dark:text-gray-100">{title}</span>
          {configured && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Configured
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function NotificationsSection() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('email');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<NotificationProvider | null>(null);
  const [lastTestTime, setLastTestTime] = useState<Record<NotificationProvider, number>>({
    smtp: 0,
    resend: 0,
    slack: 0,
    telegram: 0,
    discord: 0,
  });

  // Test modal state
  const [testState, setTestState] = useState<TestState>({
    isOpen: false,
    provider: null,
    email: '',
    message: '',
    loading: false,
    result: null,
  });

  // Collapsible states
  const [smtpOpen, setSmtpOpen] = useState(true);
  const [resendOpen, setResendOpen] = useState(false);

  // Form states
  const [smtpForm, setSmtpForm] = useState<SMTPFormData>({
    enabled: false,
    host: '',
    port: 587,
    encryption: 'starttls',
    username: '',
    password: '',
    timeout: 30,
    fromName: '',
    fromAddress: '',
    configured: false,
  });

  const [resendForm, setResendForm] = useState<ResendFormData>({
    enabled: false,
    apiKey: '',
    fromAddress: '',
    configured: false,
  });

  const [slackForm, setSlackForm] = useState<SlackFormData>({
    enabled: false,
    webhookUrl: '',
    configured: false,
  });

  const [telegramForm, setTelegramForm] = useState<TelegramFormData>({
    enabled: false,
    botToken: '',
    chatId: '',
    configured: false,
  });

  const [discordForm, setDiscordForm] = useState<DiscordFormData>({
    enabled: false,
    webhookUrl: '',
    configured: false,
  });

  // Original values for change detection
  const [originalSmtp, setOriginalSmtp] = useState<SMTPFormData>(smtpForm);
  const [originalResend, setOriginalResend] = useState<ResendFormData>(resendForm);
  const [originalSlack, setOriginalSlack] = useState<SlackFormData>(slackForm);
  const [originalTelegram, setOriginalTelegram] = useState<TelegramFormData>(telegramForm);
  const [originalDiscord, setOriginalDiscord] = useState<DiscordFormData>(discordForm);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch notification channels on mount
  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const channels = await getNotificationChannels();

      // Map channels to form states
      channels.forEach(
        (channel: {
          provider: string;
          enabled: boolean;
          host?: string;
          port?: number;
          useTLS?: boolean;
          username?: string;
          fromName?: string;
          fromAddress?: string;
          configured: boolean;
          chatId?: string;
        }) => {
          if (channel.provider === 'smtp') {
            const smtpData: SMTPFormData = {
              enabled: channel.enabled,
              host: channel.host || '',
              port: channel.port || 587,
              encryption: (channel.useTLS ? 'tls' : 'starttls') as SMTPFormData['encryption'],
              username: channel.username || '',
              password: '',
              timeout: 30,
              fromName: channel.fromName || '',
              fromAddress: channel.fromAddress || '',
              configured: channel.configured,
            };
            setSmtpForm(smtpData);
            setOriginalSmtp(smtpData);
          } else if (channel.provider === 'resend') {
            const resendData: ResendFormData = {
              enabled: channel.enabled,
              apiKey: '',
              fromAddress: channel.fromAddress || '',
              configured: channel.configured,
            };
            setResendForm(resendData);
            setOriginalResend(resendData);
          } else if (channel.provider === 'slack') {
            const slackData: SlackFormData = {
              enabled: channel.enabled,
              webhookUrl: '',
              configured: channel.configured,
            };
            setSlackForm(slackData);
            setOriginalSlack(slackData);
          } else if (channel.provider === 'telegram') {
            const telegramData: TelegramFormData = {
              enabled: channel.enabled,
              botToken: '',
              chatId: channel.chatId || '',
              configured: channel.configured,
            };
            setTelegramForm(telegramData);
            setOriginalTelegram(telegramData);
          } else if (channel.provider === 'discord') {
            const discordData: DiscordFormData = {
              enabled: channel.enabled,
              webhookUrl: '',
              configured: channel.configured,
            };
            setDiscordForm(discordData);
            setOriginalDiscord(discordData);
          }
        }
      );
    } catch {
      showToast('Failed to load notification channels', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Check if form has changes
  const hasChanges = useCallback((form: object, original: object) => {
    return JSON.stringify(form) !== JSON.stringify(original);
  }, []);

  // Validate and save SMTP
  const saveSMTP = async () => {
    setErrors({});
    const result = smtpSchema.safeParse(smtpForm);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving('smtp');
    try {
      const payload: SaveNotificationChannelInput = {
        name: 'SMTP Server',
        enabled: smtpForm.enabled,
        host: smtpForm.host,
        port: smtpForm.port,
        username: smtpForm.username,
        password: smtpForm.password || undefined,
        encryption: smtpForm.encryption,
        fromName: smtpForm.fromName,
        fromAddress: smtpForm.fromAddress,
      };

      await saveNotificationChannel('smtp', payload);
      setOriginalSmtp(smtpForm);
      showToast('SMTP configuration saved successfully', 'success');
    } catch {
      showToast('Failed to save SMTP configuration', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Validate and save Resend
  const saveResend = async () => {
    setErrors({});
    const result = resendSchema.safeParse(resendForm);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving('resend');
    try {
      const payload: SaveNotificationChannelInput = {
        name: 'Resend',
        enabled: resendForm.enabled,
        apiKey: resendForm.apiKey,
        fromAddress: resendForm.fromAddress,
      };

      await saveNotificationChannel('resend', payload);
      setOriginalResend(resendForm);
      showToast('Resend configuration saved successfully', 'success');
    } catch {
      showToast('Failed to save Resend configuration', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Validate and save Slack
  const saveSlack = async () => {
    setErrors({});
    const result = slackSchema.safeParse(slackForm);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving('slack');
    try {
      const payload: SaveNotificationChannelInput = {
        name: 'Slack',
        enabled: slackForm.enabled,
        webhookUrl: slackForm.webhookUrl,
      };

      await saveNotificationChannel('slack', payload);
      setOriginalSlack(slackForm);
      showToast('Slack configuration saved successfully', 'success');
    } catch {
      showToast('Failed to save Slack configuration', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Validate and save Telegram
  const saveTelegram = async () => {
    setErrors({});
    const result = telegramSchema.safeParse(telegramForm);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving('telegram');
    try {
      const payload: SaveNotificationChannelInput = {
        name: 'Telegram',
        enabled: telegramForm.enabled,
        botToken: telegramForm.botToken,
        chatId: telegramForm.chatId,
      };

      await saveNotificationChannel('telegram', payload);
      setOriginalTelegram(telegramForm);
      showToast('Telegram configuration saved successfully', 'success');
    } catch {
      showToast('Failed to save Telegram configuration', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Validate and save Discord
  const saveDiscord = async () => {
    setErrors({});
    const result = discordSchema.safeParse(discordForm);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err: { path: (string | number)[]; message: string }) => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving('discord');
    try {
      const payload: SaveNotificationChannelInput = {
        name: 'Discord',
        enabled: discordForm.enabled,
        webhookUrl: discordForm.webhookUrl,
      };

      await saveNotificationChannel('discord', payload);
      setOriginalDiscord(discordForm);
      showToast('Discord configuration saved successfully', 'success');
    } catch {
      showToast('Failed to save Discord configuration', 'error');
    } finally {
      setSaving(null);
    }
  };

  // Open test modal
  const openTestModal = (provider: NotificationProvider) => {
    const now = Date.now();
    const lastTest = lastTestTime[provider];
    const timeSinceLastTest = now - lastTest;
    const minInterval = 10000; // 10 seconds

    if (timeSinceLastTest < minInterval) {
      const secondsLeft = Math.ceil((minInterval - timeSinceLastTest) / 1000);
      showToast(`Please wait ${secondsLeft} seconds before testing again`, 'warning');
      return;
    }

    setTestState({
      isOpen: true,
      provider,
      email: '',
      message: '',
      loading: false,
      result: null,
    });
  };

  // Send test notification
  const sendTest = async () => {
    if (!testState.provider) return;

    setTestState((prev) => ({ ...prev, loading: true, result: null }));

    try {
      const isEmailProvider = testState.provider === 'smtp' || testState.provider === 'resend';
      const result = await sendTestNotification(
        testState.provider,
        isEmailProvider ? testState.email : undefined,
        testState.message
      );

      setTestState((prev) => ({
        ...prev,
        loading: false,
        result,
      }));

      if (result.success) {
        setLastTestTime((prev) => ({ ...prev, [testState.provider!]: Date.now() }));
      }
    } catch (error) {
      setTestState((prev) => ({
        ...prev,
        loading: false,
        result: {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      }));
    }
  };

  // Tab configuration
  const tabs = [
    { id: 'email' as TabType, label: 'Transactional Email', icon: Mail },
    { id: 'slack' as TabType, label: 'Slack', icon: Slack },
    { id: 'telegram' as TabType, label: 'Telegram', icon: Send },
    { id: 'discord' as TabType, label: 'Discord', icon: MessageSquare },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure notification channels for alerts and system events
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'group inline-flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Transactional Email
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Instance wide email settings for password resets, invitations, etc.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => openTestModal('smtp')}
                leftIcon={<Play className="h-4 w-4" />}
                disabled={!smtpForm.enabled && !resendForm.enabled}
              >
                Send Test Email
              </Button>
            </div>
          </div>

          {/* General Email Settings */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h4 className="mb-4 text-sm font-medium text-gray-900 dark:text-gray-100">
              General Settings
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="From Name"
                value={smtpForm.fromName}
                onChange={(value) =>
                  setSmtpForm((prev) => ({ ...prev, fromName: value as string }))
                }
                placeholder="DockPilot"
                required
                error={errors.fromName}
              />
              <FormInput
                label="From Address"
                type="email"
                value={smtpForm.fromAddress}
                onChange={(value) =>
                  setSmtpForm((prev) => ({ ...prev, fromAddress: value as string }))
                }
                placeholder="notifications@example.com"
                required
                error={errors.fromAddress}
              />
            </div>
          </div>

          {/* SMTP Server */}
          <CollapsibleCard
            title="SMTP Server"
            icon={<Server className="h-5 w-5 text-blue-500" />}
            isOpen={smtpOpen}
            onToggle={() => setSmtpOpen(!smtpOpen)}
            configured={smtpForm.configured}
          >
            <div className="space-y-4">
              <Toggle
                label="Enabled"
                checked={smtpForm.enabled}
                onChange={(checked) => setSmtpForm((prev) => ({ ...prev, enabled: checked }))}
              />

              {smtpForm.enabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormInput
                      label="Host"
                      value={smtpForm.host}
                      onChange={(value) =>
                        setSmtpForm((prev) => ({ ...prev, host: value as string }))
                      }
                      placeholder="smtp.gmail.com"
                      required
                      disabled={!smtpForm.enabled}
                      error={errors.host}
                    />
                    <FormInput
                      label="Port"
                      type="number"
                      value={smtpForm.port}
                      onChange={(value) =>
                        setSmtpForm((prev) => ({ ...prev, port: value as number }))
                      }
                      placeholder="587"
                      min={1}
                      max={65535}
                      required
                      disabled={!smtpForm.enabled}
                      error={errors.port}
                    />
                  </div>

                  <Select
                    label="Encryption"
                    value={smtpForm.encryption}
                    onChange={(value) =>
                      setSmtpForm((prev) => ({
                        ...prev,
                        encryption: value as SMTPFormData['encryption'],
                      }))
                    }
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'ssl', label: 'SSL' },
                      { value: 'tls', label: 'TLS' },
                      { value: 'starttls', label: 'StartTLS' },
                    ]}
                    disabled={!smtpForm.enabled}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormInput
                      label="SMTP Username"
                      value={smtpForm.username}
                      onChange={(value) =>
                        setSmtpForm((prev) => ({ ...prev, username: value as string }))
                      }
                      placeholder="user@example.com"
                      disabled={!smtpForm.enabled}
                    />
                    <PasswordInput
                      label="SMTP Password"
                      value={smtpForm.password}
                      onChange={(value) => setSmtpForm((prev) => ({ ...prev, password: value }))}
                      placeholder="••••••••"
                      configured={smtpForm.configured}
                      disabled={!smtpForm.enabled}
                      error={errors.password}
                    />
                  </div>

                  <FormInput
                    label="Timeout"
                    type="number"
                    value={smtpForm.timeout}
                    onChange={(value) =>
                      setSmtpForm((prev) => ({ ...prev, timeout: value as number }))
                    }
                    placeholder="30"
                    suffix="seconds"
                    disabled={!smtpForm.enabled}
                  />
                </>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={saveSMTP}
                  loading={saving === 'smtp'}
                  disabled={!hasChanges(smtpForm, originalSmtp)}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save SMTP
                </Button>
              </div>
            </div>
          </CollapsibleCard>

          {/* Resend */}
          <CollapsibleCard
            title="Resend"
            icon={<Key className="h-5 w-5 text-orange-500" />}
            isOpen={resendOpen}
            onToggle={() => setResendOpen(!resendOpen)}
            configured={resendForm.configured}
          >
            <div className="space-y-4">
              <Toggle
                label="Enabled"
                checked={resendForm.enabled}
                onChange={(checked) => setResendForm((prev) => ({ ...prev, enabled: checked }))}
              />

              {resendForm.enabled && (
                <>
                  <FormInput
                    label="From Address"
                    type="email"
                    value={resendForm.fromAddress}
                    onChange={(value) =>
                      setResendForm((prev) => ({ ...prev, fromAddress: value as string }))
                    }
                    placeholder="notifications@example.com"
                    required
                    disabled={!resendForm.enabled}
                    error={errors.fromAddress}
                  />
                  <PasswordInput
                    label="API Key"
                    value={resendForm.apiKey}
                    onChange={(value) => setResendForm((prev) => ({ ...prev, apiKey: value }))}
                    placeholder="re_xxxxxxxx"
                    configured={resendForm.configured}
                    disabled={!resendForm.enabled}
                    error={errors.apiKey}
                  />
                </>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={saveResend}
                  loading={saving === 'resend'}
                  disabled={!hasChanges(resendForm, originalResend)}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Resend
                </Button>
              </div>
            </div>
          </CollapsibleCard>
        </div>
      )}

      {/* Slack Tab */}
      {activeTab === 'slack' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Slack Integration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send notifications to your Slack workspace
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => openTestModal('slack')}
              leftIcon={<Play className="h-4 w-4" />}
              disabled={!slackForm.enabled}
            >
              Send Test Message
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="space-y-4">
              <Toggle
                label="Enabled"
                checked={slackForm.enabled}
                onChange={(checked) => setSlackForm((prev) => ({ ...prev, enabled: checked }))}
              />

              {slackForm.enabled && (
                <PasswordInput
                  label="Webhook URL"
                  value={slackForm.webhookUrl}
                  onChange={(value) => setSlackForm((prev) => ({ ...prev, webhookUrl: value }))}
                  placeholder="https://hooks.slack.com/services/..."
                  configured={slackForm.configured}
                  disabled={!slackForm.enabled}
                  error={errors.webhookUrl}
                />
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={saveSlack}
                  loading={saving === 'slack'}
                  disabled={!hasChanges(slackForm, originalSlack)}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Slack
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Tab */}
      {activeTab === 'telegram' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Telegram Integration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send notifications via Telegram Bot
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => openTestModal('telegram')}
              leftIcon={<Play className="h-4 w-4" />}
              disabled={!telegramForm.enabled}
            >
              Send Test Message
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="space-y-4">
              <Toggle
                label="Enabled"
                checked={telegramForm.enabled}
                onChange={(checked) => setTelegramForm((prev) => ({ ...prev, enabled: checked }))}
              />

              {telegramForm.enabled && (
                <>
                  <PasswordInput
                    label="Bot Token"
                    value={telegramForm.botToken}
                    onChange={(value) => setTelegramForm((prev) => ({ ...prev, botToken: value }))}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    configured={telegramForm.configured}
                    disabled={!telegramForm.enabled}
                    error={errors.botToken}
                  />
                  <FormInput
                    label="Chat ID"
                    value={telegramForm.chatId}
                    onChange={(value) =>
                      setTelegramForm((prev) => ({ ...prev, chatId: value as string }))
                    }
                    placeholder="-1001234567890"
                    required
                    disabled={!telegramForm.enabled}
                    error={errors.chatId}
                  />
                </>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={saveTelegram}
                  loading={saving === 'telegram'}
                  disabled={!hasChanges(telegramForm, originalTelegram)}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Telegram
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discord Tab */}
      {activeTab === 'discord' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Discord Integration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send notifications to your Discord channel
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => openTestModal('discord')}
              leftIcon={<Play className="h-4 w-4" />}
              disabled={!discordForm.enabled}
            >
              Send Test Message
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="space-y-4">
              <Toggle
                label="Enabled"
                checked={discordForm.enabled}
                onChange={(checked) => setDiscordForm((prev) => ({ ...prev, enabled: checked }))}
              />

              {discordForm.enabled && (
                <PasswordInput
                  label="Webhook URL"
                  value={discordForm.webhookUrl}
                  onChange={(value) => setDiscordForm((prev) => ({ ...prev, webhookUrl: value }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  configured={discordForm.configured}
                  disabled={!discordForm.enabled}
                  error={errors.webhookUrl}
                />
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={saveDiscord}
                  loading={saving === 'discord'}
                  disabled={!hasChanges(discordForm, originalDiscord)}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save Discord
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Modal */}
      <Modal
        isOpen={testState.isOpen}
        onClose={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
        title={`Test ${testState.provider?.toUpperCase()}`}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
            >
              Close
            </Button>
            <Button
              variant="primary"
              onClick={sendTest}
              loading={testState.loading}
              disabled={
                (testState.provider === 'smtp' || testState.provider === 'resend') &&
                !testState.email
              }
              leftIcon={<Play className="h-4 w-4" />}
            >
              Send Test
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {(testState.provider === 'smtp' || testState.provider === 'resend') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Test Email Address
              </label>
              <input
                type="email"
                value={testState.email}
                onChange={(e) => setTestState((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="test@example.com"
                className="input w-full"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Custom Message (Optional)
            </label>
            <textarea
              value={testState.message}
              onChange={(e) => setTestState((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Enter a custom test message..."
              className="input w-full h-24 resize-none"
            />
          </div>

          {testState.result && (
            <div
              className={cn(
                'rounded-lg p-4',
                testState.result.success
                  ? 'bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800'
                  : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800'
              )}
            >
              <div className="flex items-start gap-3">
                {testState.result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p
                    className={cn(
                      'font-medium',
                      testState.result.success
                        ? 'text-green-800 dark:text-green-200'
                        : 'text-red-800 dark:text-red-200'
                    )}
                  >
                    {testState.result.success ? 'Test Successful' : 'Test Failed'}
                  </p>
                  <p
                    className={cn(
                      'text-sm mt-1',
                      testState.result.success
                        ? 'text-green-600 dark:text-green-300'
                        : 'text-red-600 dark:text-red-300'
                    )}
                  >
                    {testState.result.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
