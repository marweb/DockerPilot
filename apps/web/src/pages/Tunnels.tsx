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
      setActionError('');

      if (!serviceContainerId) {
        throw new Error('Selecciona un microservicio para enlazar el tunel');
      }

      if (!hostname.trim()) {
        throw new Error('Ingresa un hostname publico (ej: api.midominio.com)');
      }

      const selectedContainer = (containers || []).find(
        (container) => container.id === serviceContainerId
      );
      if (!selectedContainer) {
        throw new Error('No se encontro el microservicio seleccionado');
      }

      const linkedTunnel = (tunnels || []).find((tunnel) =>
        (tunnel.connectedServices || []).includes(serviceContainerId)
      );
      if (linkedTunnel) {
        throw new Error(
          `El microservicio ya esta enlazado al tunel "${linkedTunnel.name}". Solo se permite 1 tunel por microservicio.`
        );
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
        throw new Error('No se pudo generar un nombre de tunel valido para el microservicio');
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
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, 'No se pudo iniciar el tunel'));
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tunnels/${id}/stop`),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, 'No se pudo detener el tunel'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tunnels/${id}`),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
    onError: (err: unknown) => {
      setActionError(getErrorMessage(err, 'No se pudo eliminar el tunel'));
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
      setActionError(getErrorMessage(err, 'No se pudo actualizar auto-inicio del tunel'));
    },
  });

  const selectedContainer = (containers || []).find(
    (container) => container.id === serviceContainerId
  );

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
              {actionError && (
                <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-600 dark:text-gray-300">
                Flujo recomendado: 1) selecciona microservicio, 2) hostname publico, 3) crear.
                DockPilot enlaza servicio + ingress, crea DNS CNAME y opcionalmente inicia tunel.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                  <option value="">Microservicio</option>
                  {(containers || []).map((container) => (
                    <option key={container.id} value={container.id}>
                      {container.name} ({container.status})
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  placeholder="Hostname publico (ej: api.midominio.com)"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Puerto interno servicio"
                  value={servicePort}
                  onChange={(e) => setServicePort(e.target.value.replace(/[^0-9]/g, ''))}
                />
                <input
                  className="input"
                  placeholder="Nombre del tunel (opcional)"
                  value={tunnelName}
                  onChange={(e) => setTunnelName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Zone ID (opcional)"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                />
              </div>

              {selectedContainer && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Servicio destino:{' '}
                  <span className="font-mono">
                    http://{selectedContainer.name}:
                    {servicePort || selectedContainer.ports?.[0]?.containerPort || 80}
                  </span>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={autoStartOnBoot}
                  onChange={(e) => setAutoStartOnBoot(e.target.checked)}
                  className="rounded"
                />
                Auto iniciar tunel al crear y cuando DockPilot reinicie
              </label>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => createTunnelMutation.mutate()}
                disabled={!serviceContainerId || !hostname || createTunnelMutation.isLoading}
              >
                <Plus className="h-4 w-4 mr-1" />
                Crear, enlazar e iniciar
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Microservicio
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Hostname
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Auto inicio
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
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {(() => {
                          const linkedId = tunnel.connectedServices?.[0];
                          if (!linkedId) return '-';
                          return (
                            (containers || []).find((container) => container.id === linkedId)
                              ?.name || `${linkedId.slice(0, 12)}...`
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {tunnel.ingressRules?.[0]?.hostname || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        <label className="inline-flex items-center gap-2">
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
                          <span>{tunnel.autoStart ? 'Si' : 'No'}</span>
                        </label>
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
