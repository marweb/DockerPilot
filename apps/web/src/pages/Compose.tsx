import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useMemo, useState } from 'react';
import { RefreshCw, Square, Trash2, CheckCircle2, Rocket, FileCode2 } from 'lucide-react';
import api from '../api/client';

type ComposeStack = {
  name: string;
  status: 'running' | 'stopped' | 'partial';
  services: Array<{ name: string; status: string }>;
};

export default function Compose() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stackName, setStackName] = useState('');
  const [composeYaml, setComposeYaml] = useState(
    'services:\n  app:\n    image: nginx:alpine\n    restart: unless-stopped\n    ports:\n      - "8080:80"\n'
  );
  const [selectedStackLogs, setSelectedStackLogs] = useState('');
  const [actionError, setActionError] = useState('');

  const trimmedName = stackName.trim();
  const canValidate = composeYaml.trim().length > 0;
  const canDeploy = canValidate && trimmedName.length > 0;

  const {
    data: stacks,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['compose-stacks'],
    queryFn: async () => {
      const response = await api.get('/compose/stacks');
      return (response.data?.data || []) as ComposeStack[];
    },
    refetchInterval: 10000,
  });

  const downMutation = useMutation({
    mutationFn: (name: string) => api.post('/compose/down', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compose-stacks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/compose/${name}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compose-stacks'] }),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      setActionError('');
      const response = await api.post('/compose/validate', { yaml: composeYaml });
      return response.data;
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message || 'No se pudo validar el compose';
      setActionError(message);
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      setActionError('');
      const response = await api.post('/compose/up', {
        name: trimmedName,
        yaml: composeYaml,
        detach: true,
        build: false,
        removeOrphans: true,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compose-stacks'] });
      setSelectedStackLogs(trimmedName);
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message || 'No se pudo ejecutar compose up';
      setActionError(message);
    },
  });

  const {
    data: logsResponse,
    refetch: refetchLogs,
    isFetching: isFetchingLogs,
  } = useQuery({
    queryKey: ['compose-logs', selectedStackLogs],
    queryFn: async () => {
      const response = await api.get(`/compose/${selectedStackLogs}/logs`, {
        params: { tail: 200 },
      });
      return response.data?.data as string;
    },
    enabled: selectedStackLogs.length > 0,
    refetchInterval: selectedStackLogs.length > 0 ? 5000 : false,
  });

  const validationMessage = useMemo(() => {
    if (!validateMutation.data) return '';
    if (validateMutation.data.success) return 'YAML valido. Puedes ejecutar el stack.';
    return validateMutation.data.error || 'El YAML no es valido.';
  }, [validateMutation.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('compose.title')}
        </h1>
        <button onClick={() => refetch()} disabled={isLoading} className="btn btn-secondary btn-sm">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="card">
        <div className="card-header flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-primary-600" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Compose raw YAML</h2>
        </div>
        <div className="card-body space-y-4">
          {actionError && (
            <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>
          )}
          <input
            className="input"
            placeholder="Nombre del stack (ej: openclaw)"
            value={stackName}
            onChange={(e) => setStackName(e.target.value)}
          />
          <textarea
            className="input min-h-[260px] font-mono text-xs"
            value={composeYaml}
            onChange={(e) => setComposeYaml(e.target.value)}
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary btn-sm"
              disabled={!canValidate || validateMutation.isLoading}
              onClick={() => validateMutation.mutate()}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Validar YAML
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!canDeploy || deployMutation.isLoading}
              onClick={() => deployMutation.mutate()}
            >
              <Rocket className="h-4 w-4 mr-1" />
              Guardar y ejecutar
            </button>
          </div>
          {validationMessage && (
            <div
              className={`text-sm ${validateMutation.data?.success ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {validationMessage}
            </div>
          )}
          {deployMutation.data?.message && (
            <div className="text-sm text-green-700 dark:text-green-400">
              {deployMutation.data.message}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {(stacks?.length || 0) === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{t('compose.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('compose.name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('compose.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('compose.services')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {t('compose.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(stacks || []).map((stack) => (
                    <tr key={stack.name} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {stack.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {stack.status}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {stack.services.length}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => downMutation.mutate(stack.name)}
                          className="btn btn-secondary btn-sm"
                          disabled={downMutation.isLoading}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          {t('compose.stop')}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStackLogs(stack.name);
                            refetchLogs();
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Logs
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(stack.name)}
                          className="btn btn-danger btn-sm"
                          disabled={deleteMutation.isLoading}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {t('compose.delete')}
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

      {selectedStackLogs && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Logs de stack: {selectedStackLogs}
            </h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => refetchLogs()}
              disabled={isFetchingLogs}
            >
              <RefreshCw className={`h-4 w-4 ${isFetchingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="card-body">
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-auto max-h-[320px]">
              {logsResponse || 'Sin logs disponibles'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
