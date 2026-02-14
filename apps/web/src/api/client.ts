import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import type { ApiResponse, ApiError } from '@dockpilot/types';

/**
 * Extended Axios request configuration with retry flag
 */
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/**
 * API base URL from environment or default
 */
function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL || '').trim();

  if (!configured || configured === '/') {
    return '/api';
  }

  if (/^https?:\/\/[^/]+$/i.test(configured)) {
    return `${configured}/api`;
  }

  return configured;
}

const API_BASE_URL = resolveApiBaseUrl();

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 30000;

/**
 * Axios instance with base configuration
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<void> | null = null;

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/setup') ||
    url.includes('/auth/setup-status') ||
    url.includes('/auth/refresh')
  );
}

/**
 * Request interceptor - adds JWT token to all requests
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request timestamp for debugging
    config.headers['X-Request-Time'] = new Date().toISOString();

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handles authentication errors and token refresh
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as ExtendedAxiosRequestConfig;

    // Handle network errors
    if (!error.response) {
      console.error('Network error - no response received');
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your connection.',
        statusCode: 0,
      } as ApiError);
    }

    const { status, data } = error.response;

    // Never try token refresh for auth endpoints themselves
    if (isAuthEndpoint(originalRequest?.url)) {
      const apiError: ApiError = {
        code: data?.error?.code || 'UNAUTHORIZED',
        message: data?.error?.message || 'Authentication failed.',
        statusCode: status,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Handle 401 Unauthorized - attempt token refresh
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Single-flight refresh: avoid parallel refresh storms
        if (!refreshPromise) {
          refreshPromise = useAuthStore
            .getState()
            .refreshTokens()
            .finally(() => {
              refreshPromise = null;
            });
        }

        await refreshPromise;

        // Get new token and retry original request
        const newToken = useAuthStore.getState().token;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return api(originalRequest);
      } catch (refreshError) {
        // Token refresh failed - logout user
        console.error('Token refresh failed:', refreshError);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 Forbidden
    if (status === 403) {
      const apiError: ApiError = {
        code: data?.error?.code || 'FORBIDDEN',
        message: data?.error?.message || 'Access forbidden. Insufficient permissions.',
        statusCode: 403,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Handle 404 Not Found
    if (status === 404) {
      const apiError: ApiError = {
        code: data?.error?.code || 'NOT_FOUND',
        message: data?.error?.message || 'Resource not found.',
        statusCode: 404,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Handle 422 Validation Error
    if (status === 422) {
      const apiError: ApiError = {
        code: data?.error?.code || 'VALIDATION_ERROR',
        message: data?.error?.message || 'Validation failed.',
        statusCode: 422,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Handle 429 Too Many Requests
    if (status === 429) {
      const apiError: ApiError = {
        code: data?.error?.code || 'RATE_LIMIT_EXCEEDED',
        message: data?.error?.message || 'Too many requests. Please try again later.',
        statusCode: 429,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Handle 500+ Server Errors
    if (status >= 500) {
      const apiError: ApiError = {
        code: data?.error?.code || 'INTERNAL_ERROR',
        message: data?.error?.message || 'Internal server error. Please try again later.',
        statusCode: status,
        details: data?.error?.details,
      };
      return Promise.reject(apiError);
    }

    // Generic error handler for other status codes
    const apiError: ApiError = {
      code: data?.error?.code || 'UNKNOWN_ERROR',
      message: data?.error?.message || 'An unexpected error occurred.',
      statusCode: status,
      details: data?.error?.details,
    };

    return Promise.reject(apiError);
  }
);

/**
 * Helper function to extract data from API response
 */
export function extractData<T>(response: { data: ApiResponse<T> }): T {
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Request failed');
  }
  return response.data.data as T;
}

/**
 * Helper function to handle API errors consistently
 */
export function handleApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    return {
      code: error.response?.data?.error?.code || 'API_ERROR',
      message: error.response?.data?.error?.message || error.message,
      statusCode: error.response?.status || 500,
      details: error.response?.data?.error?.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      statusCode: 500,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 500,
  };
}

export default api;
