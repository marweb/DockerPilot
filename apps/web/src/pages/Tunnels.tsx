import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { RefreshCw, Play, Square, Trash2, LogIn, LogOut, Plus } from 'lucide-react';
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
};

export default function Tunnels() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [apiToken, setApiToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [tunnelName, setTunnelName] = useState('');
  const [oauthUrl, setOauthUrl] = useState('');
  const [authError, setAuthError] = useState('');
  const [createError, setCreateError] = useState('');

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
        accountId,
      });
      return response.data;
    },
    onSuccess: () => {
      setApiToken('');
      queryClient.invalidateQueries({ queryKey: ['tunnel-auth-status'] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { message?: string })?.message || 'No se pudo autenticar con Cloudflare';
      setAuthError(message);
    },
  });

  const oauthLoginMutation = useMutation({
    mutationFn: async () => {
      setAuthError('');
      const response = await api.post('/tunnels/auth/login/oauth', {});
      return response.data;
    },
    onSuccess: (payload) => {
      const url = payload?.data?.loginUrl || '';
      setOauthUrl(url);
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message || 'No se pudo iniciar OAuth';
      setAuthError(message);
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
        accountId: accountId || authStatus?.accountId,
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
      const message = (err as { message?: string })?.message || 'No se pudo crear el tunel';
      setCreateError(message);
    },
  });

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
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cloudflare Auth</h2>
        </div>
        <div className="card-body space-y-4">
          {authError && <div className="text-sm text-red-600 dark:text-red-400">{authError}</div>}

          {authStatus?.authenticated ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Conectado con cuenta{' '}
                <span className="font-medium">{authStatus.accountId || '-'}</span> via{' '}
                <span className="font-medium">{authStatus.method || 'unknown'}</span>
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
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Inicia sesion con Cloudflare para crear y gestionar tuneles.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="Cloudflare Account ID"
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
                  disabled={!apiToken || !accountId || tokenLoginMutation.isLoading}
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
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
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
