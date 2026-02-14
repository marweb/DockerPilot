import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Search, RefreshCw, Plus, AlertTriangle, Check } from 'lucide-react';
import type { Volume } from '@dockpilot/types';
import api from '../api/client';
import VolumeList from '../components/volumes/VolumeList';

export default function Volumes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState('');
  const [newVolumeDriver, setNewVolumeDriver] = useState('local');
  const [showPruneModal, setShowPruneModal] = useState(false);
  const [pruneResult, setPruneResult] = useState<{
    deleted: string[];
    spaceReclaimed: number;
  } | null>(null);

  // Fetch volumes
  const {
    data: volumes,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['volumes'],
    queryFn: async () => {
      const response = await api.get('/volumes');
      return response.data.data as Volume[];
    },
    refetchInterval: 10000,
  });

  // Create volume mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; driver: string }) => api.post('/volumes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setShowCreateModal(false);
      setNewVolumeName('');
      setNewVolumeDriver('local');
    },
  });

  // Delete volume mutation
  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/volumes/${name}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
    },
  });

  // Prune volumes mutation
  const pruneMutation = useMutation({
    mutationFn: () => api.post('/volumes/prune'),
    onSuccess: (response) => {
      setPruneResult(response.data.data);
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
    },
  });

  // Filter volumes
  const filteredVolumes = volumes?.filter(
    (volume) =>
      volume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      volume.driver.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateVolume = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVolumeName.trim()) {
      createMutation.mutate({
        name: newVolumeName.trim(),
        driver: newVolumeDriver,
      });
    }
  };

  const handlePrune = () => {
    pruneMutation.mutate();
    setShowPruneModal(false);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const unusedVolumes = volumes?.filter((v) => !v.usageData || v.usageData.refCount === 0) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('volumes.title')}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowPruneModal(true)}
            className="btn btn-secondary btn-sm"
            disabled={unusedVolumes.length === 0}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            {t('volumes.prune')} ({unusedVolumes.length})
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('volumes.create')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('volumes.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Volume List */}
      <VolumeList
        volumes={filteredVolumes || []}
        isLoading={isLoading}
        onDelete={(name) => deleteMutation.mutate(name)}
        isDeleting={deleteMutation.isLoading}
        formatSize={formatSize}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('volumes.createTitle')}
              </h3>
              <form onSubmit={handleCreateVolume} className="space-y-4">
                <div>
                  <label className="label">{t('volumes.name')}</label>
                  <input
                    type="text"
                    value={newVolumeName}
                    onChange={(e) => setNewVolumeName(e.target.value)}
                    placeholder={t('volumes.namePlaceholder')}
                    className="input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">{t('volumes.driver')}</label>
                  <select
                    value={newVolumeDriver}
                    onChange={(e) => setNewVolumeDriver(e.target.value)}
                    className="input"
                  >
                    <option value="local">local</option>
                    <option value="nfs">nfs</option>
                    <option value="tmpfs">tmpfs</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={!newVolumeName.trim() || createMutation.isLoading}
                    className="btn btn-primary"
                  >
                    {createMutation.isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      t('volumes.createButton')
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Prune Modal */}
      {showPruneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t('volumes.pruneTitle')}
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('volumes.pruneMessage', { count: unusedVolumes.length })}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('volumes.pruneWarning')}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowPruneModal(false)} className="btn btn-secondary">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePrune}
                  disabled={pruneMutation.isLoading}
                  className="btn btn-danger"
                >
                  {pruneMutation.isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    t('volumes.pruneButton')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prune Result Modal */}
      {pruneResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Check className="h-6 w-6 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t('volumes.pruneComplete')}
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('volumes.pruneResult', {
                  count: pruneResult.deleted.length,
                  space: formatSize(pruneResult.spaceReclaimed),
                })}
              </p>
              <div className="flex justify-end">
                <button onClick={() => setPruneResult(null)} className="btn btn-primary">
                  {t('common.ok')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
