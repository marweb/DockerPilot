import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Eye,
  Terminal,
} from 'lucide-react';
import type { Container, ContainerStatus } from '@dockpilot/types';
import api from '../api/client';
import ContainerList from '../components/containers/ContainerList';
import ContainerDetails from '../components/containers/ContainerDetails';
import ContainerLogs from '../components/containers/ContainerLogs';
import ContainerExec from '../components/containers/ContainerExec';
import ContainerStats from '../components/containers/ContainerStats';

export default function Containers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerId = searchParams.get('id');
  const viewParam = searchParams.get('view');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContainerStatus | 'all'>('all');
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [containerToDelete, setContainerToDelete] = useState<Container | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'exec' | 'stats'>('overview');
  const [statsHistory, setStatsHistory] = useState<
    Array<{
      timestamp: number;
      cpuPercent: number;
      cpuCores: number;
      memoryUsed: number;
      memoryTotal: number;
      memoryPercent: number;
      networkRx: number;
      networkTx: number;
      diskRead: number;
      diskWrite: number;
      pids: number;
    }>
  >([]);
  const previousStatsRef = useRef<{
    networkRx: number;
    networkTx: number;
    blockRead: number;
    blockWrite: number;
    timestamp: number;
  } | null>(null);

  // Fetch containers
  const {
    data: containers,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await api.get('/containers');
      return response.data.data as Container[];
    },
    refetchInterval: 5000,
  });

  // Container actions
  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/containers/${id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['container', containerId] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/containers/${id}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['container', containerId] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => api.post(`/containers/${id}/restart`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['container', containerId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/containers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      setShowDeleteModal(false);
      setContainerToDelete(null);
      if (containerId) {
        navigate('/containers');
      }
    },
  });

  const containerStatsQuery = useQuery({
    queryKey: ['container-stats', containerId],
    queryFn: async () => {
      const response = await api.get(`/containers/${containerId}/stats`);
      return response.data.data as {
        cpuPercent: number;
        memoryUsage: number;
        memoryLimit: number;
        memoryPercent: number;
        networkRx: number;
        networkTx: number;
        blockRead: number;
        blockWrite: number;
      };
    },
    enabled: Boolean(containerId && activeTab === 'stats'),
    refetchInterval: 5000,
  });

  // Filter containers
  const filteredContainers = containers?.filter((container) => {
    const matchesSearch =
      container.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      container.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
      container.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || container.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle container selection
  const handleSelectContainer = (container: Container) => {
    setSearchParams({ id: container.id });
    setSelectedContainer(container);
    setActiveTab('overview');
  };

  // Handle back to list
  const handleBackToList = () => {
    navigate('/containers');
    setSelectedContainer(null);
  };

  // Handle delete confirmation
  const handleDeleteClick = (container: Container, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setContainerToDelete(container);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (containerToDelete) {
      removeMutation.mutate(containerToDelete.id);
    }
  };

  // Load container details when ID changes
  useEffect(() => {
    if (containerId && containers) {
      const container = containers.find((c) => c.id === containerId);
      if (container) {
        setSelectedContainer(container);
      }
    } else {
      setSelectedContainer(null);
    }

    if (viewParam) {
      setActiveTab(viewParam as 'overview' | 'logs' | 'exec' | 'stats');
    }
  }, [containerId, containers, viewParam]);

  useEffect(() => {
    if (!containerId) {
      setStatsHistory([]);
      previousStatsRef.current = null;
      return;
    }

    setStatsHistory([]);
    previousStatsRef.current = null;
  }, [containerId]);

  useEffect(() => {
    if (!containerStatsQuery.data) {
      return;
    }

    const now = Date.now();
    const prev = previousStatsRef.current;

    let networkRxPerSec = 0;
    let networkTxPerSec = 0;
    let diskReadPerSec = 0;
    let diskWritePerSec = 0;

    if (prev) {
      const seconds = Math.max((now - prev.timestamp) / 1000, 1);
      networkRxPerSec = Math.max(
        (containerStatsQuery.data.networkRx - prev.networkRx) / seconds,
        0
      );
      networkTxPerSec = Math.max(
        (containerStatsQuery.data.networkTx - prev.networkTx) / seconds,
        0
      );
      diskReadPerSec = Math.max((containerStatsQuery.data.blockRead - prev.blockRead) / seconds, 0);
      diskWritePerSec = Math.max(
        (containerStatsQuery.data.blockWrite - prev.blockWrite) / seconds,
        0
      );
    }

    previousStatsRef.current = {
      networkRx: containerStatsQuery.data.networkRx,
      networkTx: containerStatsQuery.data.networkTx,
      blockRead: containerStatsQuery.data.blockRead,
      blockWrite: containerStatsQuery.data.blockWrite,
      timestamp: now,
    };

    setStatsHistory((prevHistory) => {
      const nextPoint = {
        timestamp: now,
        cpuPercent: containerStatsQuery.data.cpuPercent,
        cpuCores: Math.max(containerStatsQuery.data.cpuPercent / 100, 0.01),
        memoryUsed: containerStatsQuery.data.memoryUsage / (1024 * 1024),
        memoryTotal: containerStatsQuery.data.memoryLimit / (1024 * 1024),
        memoryPercent: containerStatsQuery.data.memoryPercent,
        networkRx: networkRxPerSec,
        networkTx: networkTxPerSec,
        diskRead: diskReadPerSec,
        diskWrite: diskWritePerSec,
        pids: 0,
      };

      return [...prevHistory.slice(-287), nextPoint];
    });
  }, [containerStatsQuery.data]);

  const statusOptions: { value: ContainerStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('containers.filter.all') },
    { value: 'running', label: t('containers.status.running') },
    { value: 'exited', label: t('containers.status.exited') },
    { value: 'paused', label: t('containers.status.paused') },
    { value: 'created', label: t('containers.status.created') },
    { value: 'restarting', label: t('containers.status.restarting') },
  ];

  // Show container details view
  if (selectedContainer && containerId) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={handleBackToList} className="btn btn-ghost btn-sm">
              ← {t('common.back')}
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {selectedContainer.name}
            </h1>
            <span
              className={`badge ${
                selectedContainer.status === 'running'
                  ? 'badge-success'
                  : selectedContainer.status === 'exited'
                    ? 'badge-danger'
                    : selectedContainer.status === 'paused'
                      ? 'badge-warning'
                      : 'badge-neutral'
              }`}
            >
              {selectedContainer.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedContainer.status !== 'running' && (
              <button
                onClick={() => startMutation.mutate(selectedContainer.id)}
                disabled={startMutation.isLoading}
                className="btn btn-primary btn-sm"
                title={t('containers.actions.start')}
              >
                <Play className="h-4 w-4 mr-1" />
                {t('containers.actions.start')}
              </button>
            )}
            {selectedContainer.status === 'running' && (
              <button
                onClick={() => stopMutation.mutate(selectedContainer.id)}
                disabled={stopMutation.isLoading}
                className="btn btn-secondary btn-sm"
                title={t('containers.actions.stop')}
              >
                <Square className="h-4 w-4 mr-1" />
                {t('containers.actions.stop')}
              </button>
            )}
            <button
              onClick={() => restartMutation.mutate(selectedContainer.id)}
              disabled={restartMutation.isLoading}
              className="btn btn-secondary btn-sm"
              title={t('containers.actions.restart')}
            >
              <RotateCw className="h-4 w-4 mr-1" />
              {t('containers.actions.restart')}
            </button>
            <button
              onClick={() => handleDeleteClick(selectedContainer)}
              disabled={removeMutation.isLoading}
              className="btn btn-danger btn-sm"
              title={t('containers.actions.remove')}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t('containers.actions.remove')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: t('containers.tabs.overview'), icon: Eye },
              { id: 'logs', label: t('containers.tabs.logs'), icon: null },
              { id: 'exec', label: t('containers.tabs.exec'), icon: Terminal },
              { id: 'stats', label: t('containers.tabs.stats'), icon: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === 'overview' && <ContainerDetails containerId={selectedContainer.id} />}
          {activeTab === 'logs' && <ContainerLogs containerId={selectedContainer.id} />}
          {activeTab === 'exec' && <ContainerExec containerId={selectedContainer.id} />}
          {activeTab === 'stats' && (
            <ContainerStats
              containerId={selectedContainer.id}
              containerName={selectedContainer.name}
              data={statsHistory}
              isLoading={containerStatsQuery.isLoading && statsHistory.length === 0}
              isRealTime
            />
          )}
        </div>
      </div>
    );
  }

  // Show container list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('containers.title')}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('containers.create')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('containers.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContainerStatus | 'all')}
            className="input w-40"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Container List */}
      <ContainerList
        containers={filteredContainers || []}
        isLoading={isLoading}
        onSelect={handleSelectContainer}
        onStart={(id) => startMutation.mutate(id)}
        onStop={(id) => stopMutation.mutate(id)}
        onRestart={(id) => restartMutation.mutate(id)}
        onDelete={handleDeleteClick}
        isStarting={startMutation.isLoading}
        isStopping={stopMutation.isLoading}
        isRestarting={restartMutation.isLoading}
        isDeleting={removeMutation.isLoading}
      />

      {/* Delete Modal */}
      {showDeleteModal && containerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('containers.delete.title')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('containers.delete.message', { name: containerToDelete.name })}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="btn btn-secondary">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={removeMutation.isLoading}
                  className="btn btn-danger"
                >
                  {removeMutation.isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    t('common.delete')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
