import api, { extractData } from './client';
import type { ApiResponse } from '@dockpilot/types';

/**
 * Notification provider types
 */
export type NotificationProvider = 'smtp' | 'resend' | 'slack' | 'telegram' | 'discord';

/**
 * Base notification channel response
 */
export interface NotificationChannelResponse {
  id: string;
  provider: NotificationProvider;
  name: string;
  enabled: boolean;
  configured: boolean;
  fromName?: string;
  fromAddress?: string;
  toAddresses?: string[];
  webhookUrl?: string;
  apiKey?: string;
  host?: string;
  port?: number;
  username?: string;
  useTLS?: boolean;
  channelId?: string;
  botToken?: string;
  chatId?: string;
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for saving a notification channel
 * Sensitive fields like passwords should not be included in responses
 */
export interface SaveNotificationChannelInput {
  name: string;
  enabled: boolean;
  fromName?: string;
  fromAddress?: string;
  toAddresses?: string[];
  webhookUrl?: string;
  apiKey?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  useTLS?: boolean;
  encryption?: 'none' | 'tls' | 'ssl' | 'starttls';
  channelId?: string;
  botToken?: string;
  chatId?: string;
  iconUrl?: string;
}

/**
 * Input for sending a test notification
 */
export interface SendTestNotificationInput {
  testEmail?: string;
  testMessage?: string;
}

/**
 * Get all notification channel configurations
 * @returns Array of all notification channels
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getNotificationChannels(): Promise<NotificationChannelResponse[]> {
  const response = await api.get<ApiResponse<{ channels: NotificationChannelResponse[] }>>(
    '/system/notifications/config'
  );
  return extractData(response).channels;
}

/**
 * Save configuration for a notification channel
 * @param provider The notification provider type
 * @param config The channel configuration
 * @returns Saved channel configuration
 * @throws ApiError with code FORBIDDEN if user is not admin
 * @throws ApiError with code VALIDATION_ERROR if validation fails
 */
export async function saveNotificationChannel(
  provider: NotificationProvider,
  config: SaveNotificationChannelInput
): Promise<NotificationChannelResponse> {
  // Separate config fields from metadata fields
  const { name, enabled, fromName, fromAddress, ...providerConfig } = config;

  // For email providers, include fromAddress in config as required by backend validation
  if (provider === 'resend' || provider === 'smtp') {
    if (fromAddress) {
      (providerConfig as Record<string, unknown>).fromAddress = fromAddress;
    }
    if (fromName && provider === 'resend') {
      (providerConfig as Record<string, unknown>).fromName = fromName;
    }
  }

  const response = await api.put<ApiResponse<NotificationChannelResponse>>(
    '/system/notifications/config',
    {
      provider,
      name,
      enabled,
      fromName,
      fromAddress,
      config: providerConfig, // Send provider-specific config as nested object
    }
  );
  return extractData(response);
}

/**
 * Send a test notification through a provider
 * @param provider The notification provider to test
 * @param testEmail Optional test email address for email providers
 * @param testMessage Optional custom test message
 * @returns Test result with success status and message
 * @throws ApiError with code FORBIDDEN if user is not admin
 * @throws ApiError with code BAD_REQUEST if provider is not configured
 */
export async function sendTestNotification(
  provider: NotificationProvider,
  testEmail?: string,
  testMessage?: string
): Promise<{ success: boolean; message: string }> {
  const response = await api.post<ApiResponse<{ success: boolean; message: string }>>(
    '/system/notifications/test',
    {
      provider,
      testEmail,
      testMessage,
    }
  );
  return extractData(response);
}

/**
 * Get SMTP configuration
 * @returns SMTP channel configuration or null if not found
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getSMTPConfig(): Promise<NotificationChannelResponse | null> {
  try {
    const channels = await getNotificationChannels();
    return channels.find((ch) => ch.provider === 'smtp') || null;
  } catch (error) {
    // If 404, return null instead of throwing
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get Resend configuration
 * @returns Resend channel configuration or null if not found
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getResendConfig(): Promise<NotificationChannelResponse | null> {
  try {
    const channels = await getNotificationChannels();
    return channels.find((ch) => ch.provider === 'resend') || null;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get Slack configuration
 * @returns Slack channel configuration or null if not found
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getSlackConfig(): Promise<NotificationChannelResponse | null> {
  try {
    const channels = await getNotificationChannels();
    return channels.find((ch) => ch.provider === 'slack') || null;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get Telegram configuration
 * @returns Telegram channel configuration or null if not found
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getTelegramConfig(): Promise<NotificationChannelResponse | null> {
  try {
    const channels = await getNotificationChannels();
    return channels.find((ch) => ch.provider === 'telegram') || null;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get Discord configuration
 * @returns Discord channel configuration or null if not found
 * @throws ApiError with code FORBIDDEN if user is not admin
 */
export async function getDiscordConfig(): Promise<NotificationChannelResponse | null> {
  try {
    const channels = await getNotificationChannels();
    return channels.find((ch) => ch.provider === 'discord') || null;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}
