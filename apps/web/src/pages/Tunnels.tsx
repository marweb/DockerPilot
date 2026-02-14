import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { RefreshCw, Play, Square, Trash2, LogIn, LogOut, Plus, Bug } from 'lucide-react';
import api from '../api/client';

type Tunnel = {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error' | 'creating';
  publicUrl?: string;
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
  const [oauthUrl, setOauthUrl] = useState('');
  const [authError, setAuthError] = useState('');
  const [createError, setCreateError] = useState('');
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
      const message = getErrorMessage(err, 'No se pudo autenticar con Cloudflare');
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
      const message = getErrorMessage(err, 'No se pudo iniciar OAuth');
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
      const response = await api.post('/tunnels', {
        name: tunnelName,
        accountId: selectedAccountId || authStatus?.accountId,
        zoneId: zoneId || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      setTunnelName('');
      setZoneId('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, 'No se pudo crear el tunel');
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
      setAuthError(getErrorMessage(err, 'No se pudo cambiar la cuenta activa'));
    },
  });

  const accountOptions = authStatus?.availableAccounts || [];

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tunnels/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tunnels'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tunnels/${id}/stop`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tunnels'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tunnels/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tunnels'] }),
  });

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
              Diagnostico de login Cloudflare
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
              {showDebugLogs ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>
        {showDebugLogs && (
          <div className="card-body">
            {(authDebugLogs?.length || 0) === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sin eventos aun. Intenta login y recarga para ver detalles.
              </p>
            ) : (
              <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left">Hora</th>
                      <th className="px-3 py-2 text-left">Accion</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Mensaje</th>
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
                            {log.success ? 'ok' : 'error'}
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
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cloudflare Auth</h2>
        </div>
        <div className="card-body space-y-4">
          {authError && <div className="text-sm text-red-600 dark:text-red-400">{authError}</div>}

          {authStatus?.authenticated ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Conectado con cuenta{' '}
                <span className="font-medium">{authStatus.accountId || '-'}</span> via{' '}
                <span className="font-medium">{authStatus.method || 'unknown'}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Cuenta activa</label>
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
                  Cerrar sesion Cloudflare
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Inicia sesion con Cloudflare para crear y gestionar tuneles.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="Cloudflare Account ID (opcional)"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Cloudflare API Token"
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
                  Login con API Token
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => oauthLoginMutation.mutate()}
                  disabled={oauthLoginMutation.isLoading}
                >
                  Iniciar OAuth
                </button>
              </div>
              {oauthUrl && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Abre este enlace para completar OAuth:{' '}
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
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Gestion de tuneles</h2>
        </div>
        <div className="card-body space-y-4">
          {authStatus?.authenticated && (
            <div className="space-y-3">
              {createError && (
                <div className="text-sm text-red-600 dark:text-red-400">{createError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className="input"
                  placeholder="Nombre del tunel"
                  value={tunnelName}
                  onChange={(e) => setTunnelName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Account ID (opcional)"
                  value={selectedAccountId || authStatus?.accountId || ''}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Zone ID (opcional)"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => createTunnelMutation.mutate()}
                disabled={!tunnelName || createTunnelMutation.isLoading}
              >
                <Plus className="h-4 w-4 mr-1" />
                Crear tunel
              </button>
            </div>
          )}

          {!authStatus?.authenticated ? (
            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              Debes autenticarte con Cloudflare para ver/crear tuneles.
            </div>
          ) : (tunnels?.length || 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('tunnels.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('tunnels.name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('tunnels.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      URL
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {t('tunnels.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(tunnels || []).map((tunnel) => (
                    <tr key={tunnel.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {tunnel.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {tunnel.status}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {tunnel.publicUrl || '-'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
