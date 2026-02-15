import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { CheckCircle2, Copy, GitBranch, KeyRound, Play, RefreshCw, Shield } from 'lucide-react';
import api from '../api/client';

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
  hasHttpsToken: boolean;
};

export default function Repositories() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
  const [message, setMessage] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [githubDevice, setGithubDevice] = useState<null | {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval?: number;
  }>(null);
  const [gitlabDevice, setGitlabDevice] = useState<null | {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval?: number;
  }>(null);

  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: async () => {
      const response = await api.get('/repos');
      return (response.data?.data || []) as Repository[];
    },
  });

  const { data: oauthStatus } = useQuery({
    queryKey: ['repos-oauth-status'],
    queryFn: async () => {
      const response = await api.get('/repos/oauth/status');
      return response.data?.data as {
        hasPublicUrl: boolean;
        githubAppConfigured: boolean;
        gitlabOAuthConfigured: boolean;
      };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      setMessage('');
      const response = await api.post('/repos', {
        ...form,
        httpsToken: form.authType === 'https_token' ? form.httpsToken : undefined,
      });
      return response.data?.data as Repository;
    },
    onSuccess: () => {
      setMessage(t('repositoriesPage.messages.created'));
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: (error: unknown) => {
      setMessage((error as { message?: string })?.message || t('repositoriesPage.errors.create'));
    },
  });

  const testMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.post(`/repos/${repoId}/test-connection`);
      return response.data;
    },
    onSuccess: () => setMessage(t('repositoriesPage.messages.connectionOk')),
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('repositoriesPage.errors.connection')
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.post(`/repos/${repoId}/sync`);
      return response.data;
    },
    onSuccess: () => setMessage(t('repositoriesPage.messages.synced')),
    onError: (error: unknown) => {
      setMessage((error as { message?: string })?.message || t('repositoriesPage.errors.sync'));
    },
  });

  const deployMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.post(`/repos/${repoId}/deploy`, {
        stackName: stackName || undefined,
      });
      return response.data;
    },
    onSuccess: (data: { message?: string }) => {
      setMessage(data?.message || t('repositoriesPage.messages.deployDone'));
    },
    onError: (error: unknown) => {
      setMessage((error as { message?: string })?.message || t('repositoriesPage.errors.deploy'));
    },
  });

  const loadPublicKeyMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.get(`/repos/${repoId}/public-key`);
      return response.data?.data?.publicKey as string;
    },
    onSuccess: (key) => {
      setPublicKey(key);
      setMessage(t('repositoriesPage.messages.sshReady'));
    },
    onError: (error: unknown) => {
      setMessage((error as { message?: string })?.message || t('repositoriesPage.errors.sshKey'));
    },
  });

  const githubStartMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/repos/oauth/github/device/start');
      return response.data?.data as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval?: number;
      };
    },
    onSuccess: (data) => {
      setGithubDevice(data);
      setMessage(t('repositoriesPage.messages.githubStarted'));
      queryClient.invalidateQueries({ queryKey: ['repos-oauth-status'] });
    },
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('repositoriesPage.errors.githubStart')
      );
    },
  });

  const githubPollMutation = useMutation({
    mutationFn: async () => {
      if (!githubDevice) throw new Error(t('repositoriesPage.errors.githubNotStarted'));
      const response = await api.post('/repos/oauth/github/device/poll', {
        deviceCode: githubDevice.device_code,
      });
      return response.data?.data as {
        pending?: boolean;
        error?: string;
        connection?: { username: string };
      };
    },
    onSuccess: (data) => {
      if (data.pending) {
        setMessage(
          t('repositoriesPage.messages.githubPending', {
            error: data.error || 'authorization_pending',
          })
        );
        return;
      }
      setMessage(
        t('repositoriesPage.messages.githubConnected', {
          username: data.connection?.username || 'ok',
        })
      );
      setGithubDevice(null);
    },
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('repositoriesPage.errors.githubPoll')
      );
    },
  });

  const gitlabStartMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/repos/oauth/gitlab/device/start');
      return response.data?.data as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval?: number;
      };
    },
    onSuccess: (data) => {
      setGitlabDevice(data);
      setMessage(t('repositoriesPage.messages.gitlabStarted'));
      queryClient.invalidateQueries({ queryKey: ['repos-oauth-status'] });
    },
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('repositoriesPage.errors.gitlabStart')
      );
    },
  });

  const gitlabPollMutation = useMutation({
    mutationFn: async () => {
      if (!gitlabDevice) throw new Error(t('repositoriesPage.errors.gitlabNotStarted'));
      const response = await api.post('/repos/oauth/gitlab/device/poll', {
        deviceCode: gitlabDevice.device_code,
      });
      return response.data?.data as {
        pending?: boolean;
        error?: string;
        connection?: { username: string };
      };
    },
    onSuccess: (data) => {
      if (data.pending) {
        setMessage(
          t('repositoriesPage.messages.gitlabPending', {
            error: data.error || 'authorization_pending',
          })
        );
        return;
      }
      setMessage(
        t('repositoriesPage.messages.gitlabConnected', {
          username: data.connection?.username || 'ok',
        })
      );
      setGitlabDevice(null);
    },
    onError: (error: unknown) => {
      setMessage(
        (error as { message?: string })?.message || t('repositoriesPage.errors.gitlabPoll')
      );
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('repositoriesPage.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('repositoriesPage.subtitle')}
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('repositoriesPage.oauth.title')}
          </h2>
        </div>
        <div className="card-body text-sm text-gray-600 dark:text-gray-300 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-600" />
            {t('repositoriesPage.oauth.publicUrl')}:{' '}
            {oauthStatus?.hasPublicUrl ? t('common.yes') : t('common.no')}
          </div>
          <div>
            {t('repositoriesPage.oauth.githubConfigured')}:{' '}
            {oauthStatus?.githubAppConfigured ? t('common.yes') : t('common.no')}
          </div>
          <div>
            {t('repositoriesPage.oauth.gitlabConfigured')}:{' '}
            {oauthStatus?.gitlabOAuthConfigured ? t('common.yes') : t('common.no')}
          </div>
          {!oauthStatus?.hasPublicUrl && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-amber-700 dark:text-amber-300">
              {t('repositoriesPage.oauth.noPublicUrlWarning')}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => githubStartMutation.mutate()}
              disabled={!oauthStatus?.githubAppConfigured || githubStartMutation.isLoading}
            >
              {t('repositoriesPage.oauth.connectGithub')}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => gitlabStartMutation.mutate()}
              disabled={!oauthStatus?.gitlabOAuthConfigured || gitlabStartMutation.isLoading}
            >
              {t('repositoriesPage.oauth.connectGitlab')}
            </button>
          </div>

          {githubDevice && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 mt-2">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('repositoriesPage.oauth.githubDeviceTitle')}
              </p>
              <p className="text-xs mt-1">
                {t('repositoriesPage.oauth.openUrl')}: {githubDevice.verification_uri}
              </p>
              <p className="text-xs">
                {t('repositoriesPage.oauth.code')}: {githubDevice.user_code}
              </p>
              <button
                className="btn btn-secondary btn-sm mt-2"
                onClick={() => githubPollMutation.mutate()}
              >
                {t('repositoriesPage.oauth.verifyGithub')}
              </button>
            </div>
          )}

          {gitlabDevice && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 mt-2">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('repositoriesPage.oauth.gitlabDeviceTitle')}
              </p>
              <p className="text-xs mt-1">
                {t('repositoriesPage.oauth.openUrl')}: {gitlabDevice.verification_uri}
              </p>
              <p className="text-xs">
                {t('repositoriesPage.oauth.code')}: {gitlabDevice.user_code}
              </p>
              <button
                className="btn btn-secondary btn-sm mt-2"
                onClick={() => gitlabPollMutation.mutate()}
              >
                {t('repositoriesPage.oauth.verifyGitlab')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('repositoriesPage.newRepo.title')}
          </h2>
        </div>
        <div className="card-body space-y-3">
          {message && (
            <div className="text-sm text-primary-700 dark:text-primary-300">{message}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="input"
              placeholder={t('repositoriesPage.newRepo.name')}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <select
              className="input"
              value={form.provider}
              onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
            >
              <option value="generic">{t('repositoriesPage.newRepo.providerGeneric')}</option>
              <option value="github">{t('repositoriesPage.newRepo.providerGithub')}</option>
              <option value="gitlab">{t('repositoriesPage.newRepo.providerGitlab')}</option>
            </select>
            <input
              className="input md:col-span-2"
              placeholder={t('repositoriesPage.newRepo.repoUrl')}
              value={form.repoUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, repoUrl: e.target.value }))}
            />
            <input
              className="input"
              placeholder={t('repositoriesPage.newRepo.branch')}
              value={form.branch}
              onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
            />
            <input
              className="input"
              placeholder={t('repositoriesPage.newRepo.composePath')}
              value={form.composePath}
              onChange={(e) => setForm((prev) => ({ ...prev, composePath: e.target.value }))}
            />
            <select
              className="input"
              value={form.visibility}
              onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))}
            >
              <option value="public">{t('repositoriesPage.newRepo.visibilityPublic')}</option>
              <option value="private">{t('repositoriesPage.newRepo.visibilityPrivate')}</option>
            </select>
            <select
              className="input"
              value={form.authType}
              onChange={(e) => setForm((prev) => ({ ...prev, authType: e.target.value }))}
            >
              <option value="none">{t('repositoriesPage.newRepo.authNone')}</option>
              <option value="ssh">{t('repositoriesPage.newRepo.authSsh')}</option>
              <option value="https_token">{t('repositoriesPage.newRepo.authHttpsToken')}</option>
            </select>
            {form.authType === 'https_token' && (
              <input
                className="input md:col-span-2"
                placeholder={t('repositoriesPage.newRepo.httpsToken')}
                type="password"
                value={form.httpsToken}
                onChange={(e) => setForm((prev) => ({ ...prev, httpsToken: e.target.value }))}
              />
            )}
            <label className="text-sm text-gray-700 dark:text-gray-300 inline-flex items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={form.autoDeploy}
                onChange={(e) => setForm((prev) => ({ ...prev, autoDeploy: e.target.checked }))}
              />
              {t('repositoriesPage.newRepo.autoDeploy')}
            </label>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isLoading}
          >
            {t('repositoriesPage.newRepo.createButton')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('repositoriesPage.registered.title')}
          </h2>
        </div>
        <div className="card-body p-0">
          {(repos?.length || 0) === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              {isLoading
                ? t('repositoriesPage.registered.loading')
                : t('repositoriesPage.registered.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('repositoriesPage.registered.columns.name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('repositoriesPage.registered.columns.repo')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('repositoriesPage.registered.columns.branch')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('repositoriesPage.registered.columns.auth')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {t('repositoriesPage.registered.columns.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(repos || []).map((repo) => (
                    <tr key={repo.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {repo.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 break-all">
                        {repo.repoUrl}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="h-3.5 w-3.5" />
                          {repo.branch}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {repo.authType}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => testMutation.mutate(repo.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {t('repositoriesPage.actions.test')}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => syncMutation.mutate(repo.id)}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          {t('repositoriesPage.actions.sync')}
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setSelectedRepo(repo.id);
                            deployMutation.mutate(repo.id);
                          }}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {t('repositoriesPage.actions.deploy')}
                        </button>
                        {repo.authType === 'ssh' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => loadPublicKeyMutation.mutate(repo.id)}
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            {t('repositoriesPage.actions.sshKey')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('repositoriesPage.quickDeploy.title')}
          </h2>
        </div>
        <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="input"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
          >
            <option value="">{t('repositoriesPage.quickDeploy.selectRepo')}</option>
            {(repos || []).map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder={t('repositoriesPage.quickDeploy.stackName')}
            value={stackName}
            onChange={(e) => setStackName(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!selectedRepo || deployMutation.isLoading}
            onClick={() => deployMutation.mutate(selectedRepo)}
          >
            {t('repositoriesPage.quickDeploy.button')}
          </button>
        </div>
      </div>

      {publicKey && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {t('repositoriesPage.ssh.title')}
            </h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(publicKey);
                setMessage(t('repositoriesPage.messages.sshCopied'));
              }}
            >
              <Copy className="h-4 w-4 mr-1" />
              {t('repositoriesPage.ssh.copy')}
            </button>
          </div>
          <div className="card-body">
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-auto">
              {publicKey}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
