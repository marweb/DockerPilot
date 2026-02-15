import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  RefreshCw,
  Play,
  Square,
  Trash2,
  LogIn,
  LogOut,
  Plus,
  Bug,
  Globe,
  Server,
  Route,
  Rocket,
  Link2,
} from 'lucide-react';
import api from '../api/client';

type Tunnel = {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error' | 'creating';
  publicUrl?: string;
  ingressRules?: Array<{ hostname?: string; service?: string }>;
  connectedServices?: string[];
  autoStart?: boolean;
};

type ContainerSummary = {
  id: string;
  name: string;
  status: string;
  ports: Array<{ containerPort: number }>;
};

type TunnelAuthStatus = {
  authenticated: boolean;
  method: 'api_token' | 'oauth' | null;
  accountId?: string;
  accountName?: string;
  hasStoredCredentials?: boolean;
  availableAccounts?: Array<{ id: string; name: string }>;
};

type AuthDebugEntry = {
  timestamp: string;
  action: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
};

type ApiLikeError = {
  message?: string;
  details?: unknown;
  code?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as ApiLikeError;
  const details = err?.details;

  if (Array.isArray(details) && details.length > 0) {
    const first = details[0] as { message?: string; path?: string[] };
    if (first?.message) {
      const path = Array.isArray(first.path) ? first.path.join('.') : '';
      return path ? `${first.message} (${path})` : first.message;
    }
  }

  return err?.message || fallback;
}

export default function Tunnels() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [apiToken, setApiToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [tunnelName, setTunnelName] = useState('');
  const [serviceContainerId, setServiceContainerId] = useState('');
  const [hostname, setHostname] = useState('');
  const [servicePort, setServicePort] = useState('');
  const [autoStartOnBoot, setAutoStartOnBoot] = useState(true);
  const [oauthUrl, setOauthUrl] = useState('');
  const [authError, setAuthError] = useState('');
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showDebugLogs, setShowDebugLogs] = useState(true);

  const {
    data: authStatus,
    isLoading: isLoadingAuth,
    refetch: refetchAuth,
  } = useQuery({
    queryKey: ['tunnel-auth-status'],
    queryFn: async () => {
      const response = await api.get('/tunnels/auth/status');
      return response.data?.data as TunnelAuthStatus;
    },
    refetchInterval: 10000,
  });

  const {
    data: authDebugLogs,
    isFetching: loadingAuthLogs,
    refetch: refetchAuthLogs,
  } = useQuery({
    queryKey: ['tunnel-auth-debug-logs'],
    queryFn: async () => {
      const response = await api.get('/tunnels/auth/logs', { params: { limit: 120 } });
      return (response.data?.data?.logs || []) as AuthDebugEntry[];
    },
    refetchInterval: 5000,
  });

  const {
    data: tunnels,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['tunnels'],
    queryFn: async () => {
      const response = await api.get('/tunnels');
      return (response.data?.data || []) as Tunnel[];
    },
    refetchInterval: 10000,
    enabled: Boolean(authStatus?.authenticated),
  });

  const { data: containers } = useQuery({
    queryKey: ['containers-for-tunnels'],
    queryFn: async () => {
      const response = await api.get('/containers');
      return (response.data?.data || []) as ContainerSummary[];
    },
    enabled: Boolean(authStatus?.authenticated),
  });

  const tokenLoginMutation = useMutation({
    mutationFn: async () => {
      setAuthError('');
      setOauthUrl('');
      const response = await api.post('/tunnels/auth/login', {
        apiToken,
        accountId: accountId || undefined,
      });
      return response.data;
    },
    onSuccess: (payload) => {
      setApiToken('');
      setSelectedAccountId(payload?.data?.accountId || '');
      queryClient.invalidateQueries({ queryKey: ['tunnel-auth-status'] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, t('tunnelsPage.errors.authCloudflare'));
      setAuthError(message);
      refetchAuthLogs();
    },
  });

  const oauthLoginMutation = useMutation({
    mutationFn: async () => {
      setAuthError('');
      const response = await api.post('/tunnels/auth/login/oauth', { method: 'oauth' });
      return response.data;
    },
    onSuccess: (payload) => {
      const url = payload?.data?.loginUrl || '';
      setOauthUrl(url);
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, t('tunnelsPage.errors.oauthStart'));
      setAuthError(message);
      refetchAuthLogs();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/tunnels/auth/logout'),
    onSuccess: () => {
      setOauthUrl('');
      queryClient.invalidateQueries({ queryKey: ['tunnel-auth-status'] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
  });

  const createTunnelMutation = useMutation({
    mutationFn: async () => {
      setCreateError('');
      setActionError('');

      if (!serviceContainerId) {
        throw new Error(t('tunnelsPage.errors.selectService'));
      }

      if (!hostname.trim()) {
        throw new Error(t('tunnelsPage.errors.hostnameRequired'));
      }

      const selectedContainer = (containers || []).find(
        (container) => container.id === serviceContainerId
      );
      if (!selectedContainer) {
        throw new Error(t('tunnelsPage.errors.serviceNotFound'));
      }

      const linkedTunnel = (tunnels || []).find((tunnel) =>
        (tunnel.connectedServices || []).includes(serviceContainerId)
      );
      if (linkedTunnel) {
        throw new Error(t('tunnelsPage.errors.serviceAlreadyLinked', { name: linkedTunnel.name }));
      }

      const resolvedPort = Number(servicePort) || selectedContainer.ports?.[0]?.containerPort || 80;
      const normalizedCustomName = tunnelName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63);

      const effectiveTunnelName =
        normalizedCustomName ||
        `${selectedContainer.name}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 63);

      if (!effectiveTunnelName) {
        throw new Error(t('tunnelsPage.errors.invalidTunnelName'));
      }

      const response = await api.post('/tunnels/provision', {
        name: effectiveTunnelName,
        accountId: selectedAccountId || authStatus?.accountId,
        zoneId: zoneId || undefined,
        serviceContainerId,
        serviceName: selectedContainer.name,
        hostname: hostname.trim(),
        localPort: resolvedPort,
        autoStart: autoStartOnBoot,
      });

      return response.data;
    },
    onSuccess: () => {
      setTunnelName('');
      setZoneId('');
      setServiceContainerId('');
      setHostname('');
      setServicePort('');
      setAutoStartOnBoot(true);
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, t('tunnelsPage.errors.createTunnel'));
      setCreateError(message);
    },
  });

  const selectAccountMutation = useMutation({
    mutationFn: async (nextAccountId: string) => {
      const response = await api.post('/tunnels/auth/account/select', { accountId: nextAccountId });
      return response.data;
    },
    onSuccess: (payload) => {
      const next = payload?.data?.accountId || '';
      setSelectedAccountId(next);
      queryClient.invalidateQueries({ queryKey: ['tunnel-auth-status'] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setAuthError(getErrorMessage(err, t('tunnelsPage.errors.changeAccount')));
    },
  });

  const accountOptions = authStatus?.availableAccounts || [];

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tunnels/${id}/start`),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, t('tunnelsPage.errors.startTunnel')));
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tunnels/${id}/stop`),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, t('tunnelsPage.errors.stopTunnel')));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tunnels/${id}`),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, t('tunnelsPage.errors.deleteTunnel')));
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async ({ id, autoStart }: { id: string; autoStart: boolean }) => {
      const response = await api.patch(`/tunnels/${id}/settings`, { autoStart });
      return response.data;
    },
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, t('tunnelsPage.errors.updateAutostart')));
    },
  });

  const selectedContainer = (containers || []).find(
    (container) => container.id === serviceContainerId
  );

  const statusLabel: Record<Tunnel['status'], string> = {
    active: t('tunnelsPage.status.active'),
    creating: t('tunnelsPage.status.creating'),
    inactive: t('tunnelsPage.status.inactive'),
    error: t('tunnelsPage.status.error'),
  };

  const statusBadgeClass: Record<Tunnel['status'], string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    creating: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    inactive: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };

  const getLinkedServiceName = (tunnel: Tunnel) => {
    const linkedId = tunnel.connectedServices?.[0];
    if (!linkedId) return '-';
    return (
      (containers || []).find((container) => container.id === linkedId)?.name ||
      `${linkedId.slice(0, 12)}...`
    );
  };

  const getTunnelHostname = (tunnel: Tunnel) => tunnel.ingressRules?.[0]?.hostname || '-';

  const getTunnelService = (tunnel: Tunnel) => tunnel.ingressRules?.[0]?.service || '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('tunnels.title')}
        </h1>
        <button
          onClick={() => {
            refetchAuth();
            refetch();
          }}
          disabled={isLoading || isLoadingAuth}
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary-600" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {t('tunnelsPage.debug.title')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => refetchAuthLogs()}>
              <RefreshCw className={`h-4 w-4 ${loadingAuthLogs ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDebugLogs((s) => !s)}
              type="button"
            >
              {showDebugLogs ? t('tunnelsPage.debug.hide') : t('tunnelsPage.debug.show')}
            </button>
          </div>
        </div>
        {showDebugLogs && (
          <div className="card-body">
            {(authDebugLogs?.length || 0) === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('tunnelsPage.debug.empty')}
              </p>
            ) : (
              <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('tunnelsPage.debug.columns.time')}</th>
                      <th className="px-3 py-2 text-left">
                        {t('tunnelsPage.debug.columns.action')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('tunnelsPage.debug.columns.status')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('tunnelsPage.debug.columns.message')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(authDebugLogs || []).map((log, idx) => (
                      <tr
                        key={`${log.timestamp}-${idx}`}
                        className="border-t border-gray-100 dark:border-gray-700"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{log.action}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`badge text-xs ${log.success ? 'badge-success' : 'badge-neutral'}`}
                          >
                            {log.success ? t('tunnelsPage.debug.ok') : t('tunnelsPage.debug.error')}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-gray-700 dark:text-gray-300">{log.message}</div>
                          {log.details && (
                            <pre className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('tunnelsPage.auth.title')}
          </h2>
        </div>
        <div className="card-body space-y-4">
          {authError && <div className="text-sm text-red-600 dark:text-red-400">{authError}</div>}

          {authStatus?.authenticated ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {t('tunnelsPage.auth.connectedAs')}{' '}
                <span className="font-medium">{authStatus.accountId || '-'}</span>{' '}
                {t('tunnelsPage.auth.via')}{' '}
                <span className="font-medium">
                  {authStatus.method || t('tunnelsPage.auth.unknown')}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">
                    {t('tunnelsPage.auth.activeAccount')}
                  </label>
                  <select
                    className="input py-2"
                    value={selectedAccountId || authStatus.accountId || ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedAccountId(next);
                      if (next) {
                        selectAccountMutation.mutate(next);
                      }
                    }}
                    disabled={selectAccountMutation.isLoading || accountOptions.length === 0}
                  >
                    {(accountOptions.length > 0
                      ? accountOptions
                      : [{ id: authStatus.accountId || '', name: authStatus.accountId || '-' }]
                    ).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.id})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isLoading}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  {t('tunnelsPage.auth.logout')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('tunnelsPage.auth.loginHelp')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder={t('tunnelsPage.auth.accountIdPlaceholder')}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                />
                <input
                  className="input"
                  placeholder={t('tunnelsPage.auth.tokenPlaceholder')}
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => tokenLoginMutation.mutate()}
                  disabled={!apiToken || tokenLoginMutation.isLoading}
                >
                  <LogIn className="h-4 w-4 mr-1" />
                  {t('tunnelsPage.auth.loginWithToken')}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => oauthLoginMutation.mutate()}
                  disabled={oauthLoginMutation.isLoading}
                >
                  {t('tunnelsPage.auth.startOauth')}
                </button>
              </div>
              {oauthUrl && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {t('tunnelsPage.auth.openOauthLink')}{' '}
                  <a
                    href={oauthUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 underline"
                  >
                    {oauthUrl}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('tunnelsPage.management.title')}
          </h2>
        </div>
        <div className="card-body space-y-4">
          {authStatus?.authenticated && (
            <div className="space-y-3">
              {createError && (
                <div className="text-sm text-red-600 dark:text-red-400">{createError}</div>
              )}
              {actionError && (
                <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>
              )}

              <div className="rounded-xl border border-primary-200/70 bg-gradient-to-r from-primary-50 to-white dark:from-primary-900/20 dark:to-gray-800 p-4">
                <div className="flex items-start gap-3">
                  <Rocket className="h-5 w-5 mt-0.5 text-primary-600 dark:text-primary-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {t('tunnelsPage.management.createTitle')}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {t('tunnelsPage.management.createSubtitle')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white text-xs">
                      1
                    </span>
                    {t('tunnelsPage.management.service')}
                  </div>
                  <select
                    className="input"
                    value={serviceContainerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setServiceContainerId(nextId);
                      const nextContainer = (containers || []).find(
                        (container) => container.id === nextId
                      );
                      if (nextContainer) {
                        setServicePort(String(nextContainer.ports?.[0]?.containerPort || 80));
                        if (!tunnelName) {
                          setTunnelName(
                            nextContainer.name
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, '-')
                              .replace(/-+/g, '-')
                              .replace(/^-|-$/g, '')
                              .slice(0, 63)
                          );
                        }
                      }
                    }}
                  >
                    <option value="">{t('tunnelsPage.management.selectService')}</option>
                    {(containers || []).map((container) => (
                      <option key={container.id} value={container.id}>
                        {container.name} ({container.status})
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder={t('tunnelsPage.management.portPlaceholder')}
                    value={servicePort}
                    onChange={(e) => setServicePort(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white text-xs">
                      2
                    </span>
                    {t('tunnelsPage.management.hostname')}
                  </div>
                  <input
                    className="input"
                    placeholder={t('tunnelsPage.management.hostnamePlaceholder')}
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t('tunnelsPage.management.zonePlaceholder')}
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white text-xs">
                      3
                    </span>
                    {t('tunnelsPage.management.finish')}
                  </div>
                  <input
                    className="input"
                    placeholder={t('tunnelsPage.management.namePlaceholder')}
                    value={tunnelName}
                    onChange={(e) => setTunnelName(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={autoStartOnBoot}
                      onChange={(e) => setAutoStartOnBoot(e.target.checked)}
                      className="rounded"
                    />
                    {t('tunnelsPage.management.autoStart')}
                  </label>
                </div>
              </div>

              {selectedContainer && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-center gap-2 mb-1">
                    <Link2 className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    {t('tunnelsPage.management.preview')}
                  </div>
                  <span className="font-mono text-xs sm:text-sm">
                    http://{selectedContainer.name}:
                    {servicePort || selectedContainer.ports?.[0]?.containerPort || 80}
                  </span>
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={() => createTunnelMutation.mutate()}
                disabled={!serviceContainerId || !hostname || createTunnelMutation.isLoading}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('tunnelsPage.management.createButton')}
              </button>
            </div>
          )}

          {!authStatus?.authenticated ? (
            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              {t('tunnelsPage.auth.requiredWarning')}
            </div>
          ) : (tunnels?.length || 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('tunnels.empty')}</div>
          ) : (
            <div className="space-y-3">
              {(tunnels || []).map((tunnel) => (
                <div
                  key={tunnel.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {tunnel.name}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[tunnel.status]}`}
                        >
                          {statusLabel[tunnel.status]}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {tunnel.id.slice(0, 8)}...{tunnel.id.slice(-6)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" /> {t('tunnelsPage.cards.hostname')}
                          </p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                            {getTunnelHostname(tunnel)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Server className="h-3.5 w-3.5" /> {t('tunnelsPage.cards.service')}
                          </p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {getLinkedServiceName(tunnel)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Route className="h-3.5 w-3.5" /> {t('tunnelsPage.cards.targetService')}
                          </p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                            {getTunnelService(tunnel)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('tunnelsPage.cards.temporaryUrl')}
                          </p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                            {tunnel.publicUrl || t('tunnelsPage.cards.temporaryUrlN/A')}
                          </p>
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={Boolean(tunnel.autoStart)}
                          onChange={(e) =>
                            updateSettingsMutation.mutate({
                              id: tunnel.id,
                              autoStart: e.target.checked,
                            })
                          }
                          className="rounded"
                          disabled={updateSettingsMutation.isLoading}
                        />
                        {t('tunnelsPage.cards.autoStartLabel', {
                          status: tunnel.autoStart
                            ? t('tunnelsPage.cards.autoStartEnabled')
                            : t('tunnelsPage.cards.autoStartDisabled'),
                        })}
                      </label>
                    </div>

                    <div className="flex flex-wrap lg:flex-col gap-2 lg:min-w-[130px]">
                      {tunnel.status !== 'active' ? (
                        <button
                          onClick={() => startMutation.mutate(tunnel.id)}
                          className="btn btn-primary btn-sm"
                          disabled={startMutation.isLoading}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {t('tunnels.start')}
                        </button>
                      ) : (
                        <button
                          onClick={() => stopMutation.mutate(tunnel.id)}
                          className="btn btn-secondary btn-sm"
                          disabled={stopMutation.isLoading}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          {t('tunnels.stop')}
                        </button>
                      )}
                      <button
                        onClick={() => deleteMutation.mutate(tunnel.id)}
                        className="btn btn-danger btn-sm"
                        disabled={deleteMutation.isLoading}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('tunnels.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
