import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Box, Image, HardDrive, Network, Activity, Cpu, MemoryStick } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../contexts/ToastContext';

export default function Dashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: dockerInfo } = useQuery('docker-info', () =>
    api.get('/info').then((res) => res.data.data)
  );

  const { data: containers } = useQuery('containers', () =>
    api.get('/containers').then((res) => res.data.data)
  );

  const { data: images } = useQuery('images', () =>
    api.get('/images').then((res) => res.data.data)
  );

  const { data: volumes } = useQuery('volumes', () =>
    api.get('/volumes').then((res) => res.data.data)
  );

  const { data: networks } = useQuery('networks', () =>
    api.get('/networks').then((res) => res.data.data)
  );

  const runningContainers =
    containers?.filter((c: { status: string }) => c.status === 'running').length || 0;
  const totalContainers = containers?.length || 0;
  const totalImages = images?.length || 0;
  const totalVolumes = volumes?.length || 0;
  const totalNetworks = networks?.length || 0;

  const pruneMutation = useMutation({
    mutationFn: async () => {
      const [containersResult, imagesResult, volumesResult, networksResult] = await Promise.all([
        api.post('/containers/prune'),
        api.post('/images/prune'),
        api.post('/volumes/prune'),
        api.post('/networks/prune'),
      ]);

      return {
        containersDeleted: containersResult.data?.data?.containersDeleted?.length || 0,
        imagesDeleted: imagesResult.data?.data?.imagesDeleted?.length || 0,
        volumesDeleted: volumesResult.data?.data?.volumesDeleted?.length || 0,
        networksDeleted: networksResult.data?.data?.networksDeleted?.length || 0,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      queryClient.invalidateQueries({ queryKey: ['networks'] });

      const total =
        result.containersDeleted +
        result.imagesDeleted +
        result.volumesDeleted +
        result.networksDeleted;

      showToast(t('dashboard.pruneSuccess', { total }), 'success');
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || t('dashboard.pruneError');
      showToast(message, 'error');
    },
  });

  const handlePruneSystem = () => {
    const confirmed = window.confirm(
      `${t('dashboard.prune')}\n\n${t('dashboard.pruneConfirmBody')}`
    );

    if (!confirmed) {
      return;
    }

    pruneMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('dashboard.title')}
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('dashboard.containers')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {runningContainers} / {totalContainers}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.running')}</p>
            </div>
            <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
              <Box className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.images')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalImages}</p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Image className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.volumes')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalVolumes}</p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <HardDrive className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.networks')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalNetworks}</p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Network className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('dashboard.systemInfo')}
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.cpus')}</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {dockerInfo?.cpus || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MemoryStick className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.memory')}</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {dockerInfo?.memoryLimit ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.os')}</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {dockerInfo?.operatingSystem || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Box className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.version')}</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {dockerInfo?.serverVersion || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('dashboard.quickActions')}
          </h2>
        </div>
        <div className="card-body">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => navigate('/images?action=pull')}>
              {t('dashboard.pullImage')}
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/compose')}>
              {t('dashboard.createContainer')}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handlePruneSystem}
              disabled={pruneMutation.isLoading}
            >
              {t('dashboard.prune')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
