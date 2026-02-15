import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from 'lucide-react';
import {
  getContainerEnv,
  inspectContainer,
  removeContainer,
  restartContainer,
  startContainer,
  stopContainer,
  updateContainerEnv,
} from '../api/containers';

type EnvRow = {
  key: string;
  value: string;
  secret?: boolean;
};

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value, secret: /(TOKEN|SECRET|PASSWORD|KEY)/i.test(key) }));
}

function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value;
    return acc;
  }, {});
}

export default function ContainerDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [message, setMessage] = useState('');

  const inspectQuery = useQuery({
    queryKey: ['container-detail', id],
    queryFn: () => inspectContainer(id),
    enabled: Boolean(id),
  });

  const envQuery = useQuery({
    queryKey: ['container-env', id],
    queryFn: () => getContainerEnv(id),
    enabled: Boolean(id),
    onSuccess: (data) => {
      setRows(envToRows(data.env));
    },
  });

  const startMutation = useMutation({
    mutationFn: () => startContainer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['container-detail', id] });
      setMessage(t('containerDetailPage.messages.started'));
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopContainer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['container-detail', id] });
      setMessage(t('containerDetailPage.messages.stopped'));
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartContainer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['container-detail', id] });
      setMessage(t('containerDetailPage.messages.restarted'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeContainer(id, true, false),
    onSuccess: () => {
      navigate('/containers');
    },
  });

  const updateEnvMutation = useMutation({
    mutationFn: () =>
      updateContainerEnv(id, {
        env: rowsToEnv(rows),
        recreate: true,
        rollbackOnFailure: true,
        keepRollbackContainer: true,
      }),
    onSuccess: async (data) => {
      setMessage(
        data.rollbackAvailable
          ? t('containerDetailPage.messages.envAppliedBackup', {
              backup: data.rollbackContainerName || t('containerDetailPage.messages.available'),
            })
          : t('containerDetailPage.messages.envApplied')
      );
      await queryClient.invalidateQueries({ queryKey: ['container-detail', id] });
      await queryClient.invalidateQueries({ queryKey: ['container-env', id] });
    },
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('containerDetailPage.messages.envError')
      );
    },
  });

  const containerName = useMemo(() => {
    const raw = inspectQuery.data?.id || id;
    return raw;
  }, [inspectQuery.data?.id, id]);

  if (inspectQuery.isLoading || envQuery.isLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (inspectQuery.isError || envQuery.isError || !inspectQuery.data) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/containers')} className="btn btn-secondary btn-sm">
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('common.back')}
        </button>
        <div className="card">
          <div className="card-body text-red-600 dark:text-red-400">
            {t('containerDetailPage.loadError')}
          </div>
        </div>
      </div>
    );
  }

  const detail = inspectQuery.data;
  const running = detail.state.running;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/containers')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Box className="h-6 w-6 text-primary-600" />
            {t('containerDetailPage.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{containerName}</p>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800 px-3 py-2 text-sm text-primary-700 dark:text-primary-300">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!running ? (
          <button className="btn btn-primary" onClick={() => startMutation.mutate()}>
            <Play className="h-4 w-4 mr-1" />
            {t('containers.actions.start')}
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={() => stopMutation.mutate()}>
            <Square className="h-4 w-4 mr-1" />
            {t('containers.actions.stop')}
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => restartMutation.mutate()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {t('containers.actions.restart')}
        </button>
        <button className="btn btn-danger" onClick={() => removeMutation.mutate()}>
          <Trash2 className="h-4 w-4 mr-1" />
          {t('containers.actions.remove')}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('containerDetailPage.envTitle')}
          </h2>
        </div>
        <div className="card-body space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {t('containerDetailPage.envDescription')}
          </div>

          {rows.map((row, index) => (
            <div key={`${row.key}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <input
                className="input md:col-span-4"
                value={row.key}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, key: e.target.value } : entry
                    )
                  )
                }
              />
              <input
                className="input md:col-span-7"
                type={row.secret ? 'password' : 'text'}
                value={row.value}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, value: e.target.value } : entry
                    )
                  )
                }
              />
              <button
                className="btn btn-danger btn-sm md:col-span-1"
                onClick={() =>
                  setRows((prev) => prev.filter((_, entryIndex) => entryIndex !== index))
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setRows((prev) => [...prev, { key: '', value: '', secret: false }])}
            >
              {t('containerDetailPage.addVariable')}
            </button>
            <button className="btn btn-primary" onClick={() => updateEnvMutation.mutate()}>
              <Save className="h-4 w-4 mr-1" />
              {t('containerDetailPage.saveAndRecreate')}
            </button>
          </div>

          {updateEnvMutation.isSuccess && (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              {t('containerDetailPage.envApplied')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
