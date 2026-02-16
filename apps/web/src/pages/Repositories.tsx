import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  CheckCircle2,
  Copy,
  GitBranch,
  KeyRound,
  Play,
  RefreshCw,
  Globe,
  Webhook,
  Settings,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from 'lucide-react';
import api from '../api/client';
import { useToast } from '../contexts/ToastContext';

type Repository = {
  id: string;
  name: string;
  provider: 'github' | 'gitlab' | 'generic';
  repoUrl: string;
  branch: string;
  composePath: string;
  visibility: 'public' | 'private';
  authType: 'none' | 'ssh' | 'https_token';
  autoDeploy: boolean;
  webhookEnabled: boolean;
  webhookUrl?: string;
  hasWebhookSecret: boolean;
  hasHttpsToken: boolean;
};

type SystemSettings = {
  publicUrl: string;
};

export default function Repositories() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [webhookConfig, setWebhookConfig] = useState<
    Record<
      string,
      {
        enabled: boolean;
        secret: string;
        showSecret: boolean;
      }
    >
  >({});
  const [form, setForm] = useState({
    name: '',
    provider: 'generic',
    repoUrl: '',
    branch: 'main',
    composePath: 'docker-compose.yml',
    visibility: 'public',
    authType: 'none',
    httpsToken: '',
    autoDeploy: false,
  });
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [stackName, setStackName] = useState('');
  const [publicKey, setPublicKey] = useState('');

  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: async () => {
      const response = await api.get('/repos');
      return (response.data?.data || []) as Repository[];
    },
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const response = await api.get('/system/settings');
      return response.data?.data as SystemSettings;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/repos', {
        ...form,
        httpsToken: form.authType === 'https_token' ? form.httpsToken : undefined,
      });
      return response.data?.data as Repository;
    },
    onSuccess: () => {
      showToast(t('repositories.messages.created'), 'success');
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      setForm({
        name: '',
        provider: 'generic',
        repoUrl: '',
        branch: 'main',
        composePath: 'docker-compose.yml',
        visibility: 'public',
        authType: 'none',
        httpsToken: '',
        autoDeploy: false,
      });
    },
    onError: (error: unknown) => {
      showToast(
        (error as { message?: string })?.message || t('repositories.errors.create'),
        'error'
      );
    },
  });

  const updateWebhookMutation = useMutation({
    mutationFn: async ({
      repoId,
      enabled,
      secret,
    }: {
      repoId: string;
      enabled: boolean;
      secret?: string;
    }) => {
      const response = await api.post(`/repos/${repoId}/webhook`, {
        webhookEnabled: enabled,
        webhookSecret: secret,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast(t('repositories.messages.webhookUpdated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: (error: unknown) => {
      showToast(
        (error as { message?: string })?.message || t('repositories.errors.webhookUpdate'),
        'error'
      );
    },
  });

  const deployMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.post(`/repos/${repoId}/deploy`, {
        stackName: stackName || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast(t('repositories.messages.deployDone'), 'success');
    },
    onError: (error: unknown) => {
      showToast(
        (error as { message?: string })?.message || t('repositories.errors.deploy'),
        'error'
      );
    },
  });

  const loadPublicKeyMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.get(`/repos/${repoId}/public-key`);
      return response.data?.data?.publicKey as string;
    },
    onSuccess: (key) => {
      setPublicKey(key);
      showToast(t('repositories.messages.sshReady'), 'success');
    },
    onError: (error: unknown) => {
      showToast(
        (error as { message?: string })?.message || t('repositories.errors.sshKey'),
        'error'
      );
    },
  });

  const toggleRepoExpansion = (repoId: string) => {
    setExpandedRepo(expandedRepo === repoId ? null : repoId);
    if (expandedRepo !== repoId && repos) {
      const repo = repos.find((r) => r.id === repoId);
      if (repo) {
        setWebhookConfig((prev) => ({
          ...prev,
          [repoId]: {
            enabled: repo.webhookEnabled,
            secret: '',
            showSecret: false,
          },
        }));
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t('common.copied'), 'success');
  };

  const getWebhookInstructions = (provider: string) => {
    const baseUrl = systemSettings?.publicUrl || '{your-public-url}';
    const webhookUrl = `${baseUrl}/api/repos/webhooks/${provider === 'generic' ? 'github' : provider}`;

    switch (provider) {
      case 'github':
        return {
          title: t('repositories.webhooks.github.title'),
          steps: [
            t('repositories.webhooks.github.step1'),
            t('repositories.webhooks.github.step2', { url: webhookUrl }),
            t('repositories.webhooks.github.step3'),
            t('repositories.webhooks.github.step4'),
          ],
          contentType: 'application/json',
          events: ['push', 'pull_request'],
        };
      case 'gitlab':
        return {
          title: t('repositories.webhooks.gitlab.title'),
          steps: [
            t('repositories.webhooks.gitlab.step1'),
            t('repositories.webhooks.gitlab.step2', { url: webhookUrl }),
            t('repositories.webhooks.gitlab.step3'),
          ],
          events: ['Push events', 'Merge request events'],
        };
      default:
        return {
          title: t('repositories.webhooks.generic.title'),
          steps: [
            t('repositories.webhooks.generic.step1', { url: webhookUrl }),
            t('repositories.webhooks.generic.step2'),
          ],
          events: ['push'],
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('repositories.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('repositories.description')}
          </p>
        </div>
      </div>

      {/* Public URL Status */}
      {systemSettings?.publicUrl ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-green-800 dark:text-green-200 font-medium">
              {t('repositories.publicUrl.configured')}
            </span>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1 ml-7">
            {systemSettings.publicUrl}
          </p>
        </div>
      ) : (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-800 dark:text-yellow-200 font-medium">
              {t('repositories.publicUrl.missing')}
            </span>
          </div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 ml-7">
            {t('repositories.publicUrl.description')}
          </p>
        </div>
      )}

      {/* Create Repository Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          {t('repositories.newRepository')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.name')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('repositories.form.namePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.provider')}
            </label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="generic">Generic (Any Git)</option>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.repoUrl')}
            </label>
            <input
              type="url"
              value={form.repoUrl}
              onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
              placeholder="https://github.com/username/repo.git"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.branch')}
            </label>
            <input
              type="text"
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              placeholder="main"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.composePath')}
            </label>
            <input
              type="text"
              value={form.composePath}
              onChange={(e) => setForm({ ...form, composePath: e.target.value })}
              placeholder="docker-compose.yml"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.visibility')}
            </label>
            <select
              value={form.visibility}
              onChange={(e) =>
                setForm({ ...form, visibility: e.target.value as 'public' | 'private' })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="public">{t('repositories.form.public')}</option>
              <option value="private">{t('repositories.form.private')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('repositories.form.authType')}
            </label>
            <select
              value={form.authType}
              onChange={(e) =>
                setForm({ ...form, authType: e.target.value as 'none' | 'ssh' | 'https_token' })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="none">{t('repositories.form.noAuth')}</option>
              <option value="ssh">SSH Key</option>
              <option value="https_token">HTTPS Token</option>
            </select>
          </div>

          {form.authType === 'https_token' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('repositories.form.httpsToken')}
              </label>
              <input
                type="password"
                value={form.httpsToken}
                onChange={(e) => setForm({ ...form, httpsToken: e.target.value })}
                placeholder="ghp_xxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          <div className="md:col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="autoDeploy"
              checked={form.autoDeploy}
              onChange={(e) => setForm({ ...form, autoDeploy: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="autoDeploy" className="text-sm text-gray-700 dark:text-gray-300">
              {t('repositories.form.autoDeploy')}
            </label>
          </div>
        </div>

        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isLoading || !form.name || !form.repoUrl}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {createMutation.isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {t('repositories.createButton')}
        </button>
      </div>

      {/* Repository List */}
      {repos && repos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {t('repositories.list.title')}
          </h2>

          {repos.map((repo) => (
            <div
              key={repo.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
            >
              {/* Repo Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => toggleRepoExpansion(repo.id)}
              >
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{repo.name}</h3>
                    <p className="text-sm text-gray-500">{repo.repoUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {repo.webhookEnabled && (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                        <Webhook className="w-3 h-3" />
                        {t('repositories.webhook.enabled')}
                      </span>
                    )}
                    {repo.autoDeploy && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                        <Play className="w-3 h-3" />
                        {t('repositories.autoDeploy.enabled')}
                      </span>
                    )}
                  </div>
                  {expandedRepo === repo.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              {expandedRepo === repo.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
                  {/* Webhook Configuration */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Webhook className="w-5 h-5 text-primary-600" />
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {t('repositories.webhook.title')}
                      </h4>
                    </div>

                    {systemSettings?.publicUrl ? (
                      <div className="space-y-4">
                        {/* Webhook URL */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('repositories.webhook.url')}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={
                                repo.webhookUrl ||
                                `${systemSettings.publicUrl}/api/repos/webhooks/${repo.provider === 'generic' ? 'github' : repo.provider}`
                              }
                              className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md text-sm text-gray-600 dark:text-gray-300"
                            />
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  repo.webhookUrl ||
                                    `${systemSettings.publicUrl}/api/repos/webhooks/${repo.provider === 'generic' ? 'github' : repo.provider}`
                                )
                              }
                              className="px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md"
                              title={t('common.copy')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Webhook Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {webhookConfig[repo.id]?.enabled || repo.webhookEnabled ? (
                              <ToggleRight className="w-6 h-6 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400" />
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t('repositories.webhook.enable')}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const newEnabled = !(
                                webhookConfig[repo.id]?.enabled ?? repo.webhookEnabled
                              );
                              setWebhookConfig((prev) => ({
                                ...prev,
                                [repo.id]: { ...prev[repo.id], enabled: newEnabled },
                              }));
                            }}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                              (webhookConfig[repo.id]?.enabled ?? repo.webhookEnabled)
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {(webhookConfig[repo.id]?.enabled ?? repo.webhookEnabled)
                              ? t('common.enabled')
                              : t('common.disabled')}
                          </button>
                        </div>

                        {/* Webhook Secret */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('repositories.webhook.secret')}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type={webhookConfig[repo.id]?.showSecret ? 'text' : 'password'}
                              value={webhookConfig[repo.id]?.secret || ''}
                              onChange={(e) =>
                                setWebhookConfig((prev) => ({
                                  ...prev,
                                  [repo.id]: { ...prev[repo.id], secret: e.target.value },
                                }))
                              }
                              placeholder={
                                repo.hasWebhookSecret
                                  ? '••••••••••••'
                                  : t('repositories.webhook.secretPlaceholder')
                              }
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <button
                              onClick={() =>
                                setWebhookConfig((prev) => ({
                                  ...prev,
                                  [repo.id]: {
                                    ...prev[repo.id],
                                    showSecret: !prev[repo.id]?.showSecret,
                                  },
                                }))
                              }
                              className="px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md"
                            >
                              {webhookConfig[repo.id]?.showSecret
                                ? t('common.hide')
                                : t('common.show')}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {t('repositories.webhook.secretHelp')}
                          </p>
                        </div>

                        {/* Save Webhook Config */}
                        <button
                          onClick={() =>
                            updateWebhookMutation.mutate({
                              repoId: repo.id,
                              enabled: webhookConfig[repo.id]?.enabled ?? repo.webhookEnabled,
                              secret: webhookConfig[repo.id]?.secret || undefined,
                            })
                          }
                          disabled={updateWebhookMutation.isLoading}
                          className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {updateWebhookMutation.isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {t('repositories.webhook.saveConfig')}
                        </button>

                        {/* Webhook Instructions */}
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                          <h5 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                            {getWebhookInstructions(repo.provider).title}
                          </h5>
                          <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
                            {getWebhookInstructions(repo.provider).steps.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('repositories.webhook.publicUrlRequired')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quick Deploy */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('repositories.stackName')}
                      </label>
                      <input
                        type="text"
                        value={selectedRepo === repo.id ? stackName : ''}
                        onChange={(e) => {
                          setSelectedRepo(repo.id);
                          setStackName(e.target.value);
                        }}
                        placeholder={t('repositories.stackNamePlaceholder')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={() => deployMutation.mutate(repo.id)}
                      disabled={deployMutation.isLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 mt-6"
                    >
                      {deployMutation.isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {t('repositories.deploy')}
                    </button>
                  </div>

                  {/* SSH Key */}
                  {repo.authType === 'ssh' && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <button
                        onClick={() => loadPublicKeyMutation.mutate(repo.id)}
                        disabled={loadPublicKeyMutation.isLoading}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
                      >
                        <KeyRound className="w-4 h-4" />
                        {t('repositories.showPublicKey')}
                      </button>

                      {publicKey && selectedRepo === repo.id && (
                        <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                          <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                            {publicKey}
                          </pre>
                          <button
                            onClick={() => copyToClipboard(publicKey)}
                            className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            {t('common.copy')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {repos && repos.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
          <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">{t('repositories.empty')}</p>
        </div>
      )}
    </div>
  );
}
