import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  RefreshCw,
  Rocket,
  ScrollText,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react';
import api from '../api/client';

type ComposeStack = {
  name: string;
  status: 'running' | 'stopped' | 'partial';
  services: Array<{ name: string; status: string }>;
  createdAt?: string;
};

type PreflightResult = {
  valid: boolean;
  normalizedName: string;
  errors: string[];
  warnings: string[];
  fingerprint: string;
};

type EnvRow = {
  key: string;
  value: string;
  secret?: boolean;
};

const STARTER_YAML = `services:
  app:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "8080:80"
`;

const tabDefs = [
  { id: 'source', icon: FileCode2, labelKey: 'composePage.tabs.source' },
  { id: 'env', icon: Settings2, labelKey: 'composePage.tabs.env' },
  { id: 'validate', icon: ShieldCheck, labelKey: 'composePage.tabs.validate' },
  { id: 'deploy', icon: Rocket, labelKey: 'composePage.tabs.deploy' },
] as const;

function toEnvObject(rows: EnvRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value;
    return acc;
  }, {});
}

export default function Compose() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof tabDefs)[number]['id']>('source');
  const [stackName, setStackName] = useState('');
  const [yaml, setYaml] = useState(STARTER_YAML);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [selectedStackLogs, setSelectedStackLogs] = useState('');
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const envObject = useMemo(() => toEnvObject(envRows), [envRows]);
  const tabs = useMemo(() => tabDefs.map((tab) => ({ ...tab, label: t(tab.labelKey) })), [t]);
  const canValidate = stackName.trim().length > 1 && yaml.trim().length > 0;

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

  const preflightMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage('');
      const response = await api.post('/compose/preflight', {
        name: stackName,
        yaml,
        env: envObject,
        mode: 'create',
      });
      return response.data?.data as PreflightResult;
    },
    onSuccess: (data) => {
      setPreflightResult(data);
      if (data.normalizedName && data.normalizedName !== stackName) {
        setStackName(data.normalizedName);
      }
      setActiveTab('deploy');
    },
    onError: (error: unknown) => {
      setErrorMessage(
        (error as { message?: string })?.message || t('composePage.errors.validateFailed')
      );
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage('');
      const response = await api.post('/compose/up', {
        name: stackName,
        yaml,
        env: envObject,
        preflightFingerprint: preflightResult?.fingerprint,
        detach: true,
        removeOrphans: true,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compose-stacks'] });
      setSelectedStackLogs(stackName);
    },
    onError: (error: unknown) => {
      setErrorMessage(
        (error as { message?: string })?.message || t('composePage.errors.deployFailed')
      );
    },
  });

  const downMutation = useMutation({
    mutationFn: (name: string) => api.post('/compose/down', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compose-stacks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/compose/${name}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compose-stacks'] }),
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
    refetchInterval: selectedStackLogs ? 5000 : false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('composePage.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('composePage.subtitle')}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isLoading} className="btn btn-secondary btn-sm">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="card">
        <div className="card-body space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {errorMessage && (
            <div className="text-sm text-red-600 dark:text-red-400">{errorMessage}</div>
          )}

          {activeTab === 'source' && (
            <div className="space-y-3">
              <input
                className="input"
                placeholder={t('composePage.placeholders.stackName')}
                value={stackName}
                onChange={(e) => setStackName(e.target.value)}
              />
              <textarea
                className="input min-h-[280px] font-mono text-xs"
                spellCheck={false}
                value={yaml}
                onChange={(e) => setYaml(e.target.value)}
              />
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-3">
              {envRows.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {t('composePage.env.empty')}
                </div>
              )}
              {envRows.map((row, index) => (
                <div key={`${row.key}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <input
                    className="input md:col-span-4"
                    placeholder="KEY"
                    value={row.key}
                    onChange={(e) => {
                      setEnvRows((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, key: e.target.value } : entry
                        )
                      );
                    }}
                  />
                  <input
                    className="input md:col-span-6"
                    placeholder="value"
                    type={row.secret ? 'password' : 'text'}
                    value={row.value}
                    onChange={(e) => {
                      setEnvRows((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value: e.target.value } : entry
                        )
                      );
                    }}
                  />
                  <label className="md:col-span-1 inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={Boolean(row.secret)}
                      onChange={(e) => {
                        setEnvRows((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, secret: e.target.checked } : entry
                          )
                        );
                      }}
                    />
                    {t('composePage.env.secret')}
                  </label>
                  <button
                    className="btn btn-danger btn-sm md:col-span-1"
                    onClick={() =>
                      setEnvRows((prev) => prev.filter((_, entryIndex) => entryIndex !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setEnvRows((prev) => [...prev, { key: '', value: '', secret: false }])
                }
              >
                {t('composePage.env.addVariable')}
              </button>
            </div>
          )}

          {activeTab === 'validate' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-300">
                {t('composePage.validate.description')}
              </div>
              <button
                className="btn btn-secondary"
                disabled={!canValidate || preflightMutation.isLoading}
                onClick={() => preflightMutation.mutate()}
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                {t('composePage.validate.button')}
              </button>
              {preflightResult && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="text-sm">
                    {t('composePage.validate.resultLabel')}{' '}
                    <span className={preflightResult.valid ? 'text-green-600' : 'text-red-600'}>
                      {preflightResult.valid
                        ? t('composePage.validate.valid')
                        : t('composePage.validate.invalid')}
                    </span>
                  </div>
                  {preflightResult.errors.length > 0 && (
                    <ul className="text-sm text-red-600 dark:text-red-400 list-disc pl-5">
                      {preflightResult.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                  {preflightResult.warnings.length > 0 && (
                    <ul className="text-sm text-amber-600 dark:text-amber-400 list-disc pl-5">
                      {preflightResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'deploy' && (
            <div className="space-y-3">
              {!preflightResult ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  {t('composePage.deploy.needsPreflight')}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                  {t('composePage.deploy.preflightReady')}{' '}
                  {preflightResult.fingerprint.slice(0, 20)}...
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={!preflightResult?.valid || deployMutation.isLoading}
                onClick={() => deployMutation.mutate()}
              >
                <Rocket className="h-4 w-4 mr-1" />
                {t('composePage.deploy.button')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {(stacks?.length || 0) === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              {t('composePage.stacks.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('composePage.stacks.stack')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('composePage.stacks.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('composePage.stacks.services')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('composePage.stacks.created')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {t('composePage.stacks.actions')}
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
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {stack.createdAt ? new Date(stack.createdAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => downMutation.mutate(stack.name)}
                          className="btn btn-secondary btn-sm"
                          disabled={downMutation.isLoading}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          {t('composePage.actions.stop')}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedStackLogs(stack.name);
                            refetchLogs();
                          }}
                        >
                          <ScrollText className="h-4 w-4 mr-1" />
                          {t('composePage.actions.logs')}
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(stack.name)}
                          className="btn btn-danger btn-sm"
                          disabled={deleteMutation.isLoading}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {t('composePage.actions.delete')}
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
              {t('composePage.logs.title', { stack: selectedStackLogs })}
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
              {logsResponse || t('composePage.logs.empty')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
