import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Search, RefreshCw, Plus } from 'lucide-react';
import type { Network as NetworkType } from '@dockpilot/types';
import api from '../api/client';
import NetworkList from '../components/networks/NetworkList';
import NetworkDetails from '../components/networks/NetworkDetails';

export default function Networks() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkDriver, setNewNetworkDriver] = useState('bridge');
  const [newNetworkSubnet, setNewNetworkSubnet] = useState('');
  const [newNetworkGateway, setNewNetworkGateway] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType | null>(null);

  // Fetch networks
  const {
    data: networks,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['networks'],
    queryFn: async () => {
      const response = await api.get('/networks');
      return response.data.data as NetworkType[];
    },
    refetchInterval: 10000,
  });

  // Create network mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; driver: string; subnet?: string; gateway?: string }) =>
      api.post('/networks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      setShowCreateModal(false);
      resetCreateForm();
    },
  });

  // Delete network mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/networks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
    },
  });

  // Filter networks
  const filteredNetworks = networks?.filter(
    (network) =>
      network.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      network.driver.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetCreateForm = () => {
    setNewNetworkName('');
    setNewNetworkDriver('bridge');
    setNewNetworkSubnet('');
    setNewNetworkGateway('');
  };

  const handleCreateNetwork = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNetworkName.trim()) {
      const data: {
        name: string;
        driver: string;
        subnet?: string;
        gateway?: string;
      } = {
        name: newNetworkName.trim(),
        driver: newNetworkDriver,
      };

      if (newNetworkSubnet.trim()) {
        data.subnet = newNetworkSubnet.trim();
      }
      if (newNetworkGateway.trim()) {
        data.gateway = newNetworkGateway.trim();
      }

      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('networks.title')}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('networks.create')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('networks.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Network List */}
      <NetworkList
        networks={filteredNetworks || []}
        isLoading={isLoading}
        onDelete={(id) => deleteMutation.mutate(id)}
        onSelect={setSelectedNetwork}
        isDeleting={deleteMutation.isLoading}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('networks.createTitle')}
              </h3>
              <form onSubmit={handleCreateNetwork} className="space-y-4">
                <div>
                  <label className="label">{t('networks.name')}</label>
                  <input
                    type="text"
                    value={newNetworkName}
                    onChange={(e) => setNewNetworkName(e.target.value)}
                    placeholder={t('networks.namePlaceholder')}
                    className="input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">{t('networks.driver')}</label>
                  <select
                    value={newNetworkDriver}
                    onChange={(e) => setNewNetworkDriver(e.target.value)}
                    className="input"
                  >
                    <option value="bridge">bridge</option>
                    <option value="host">host</option>
                    <option value="none">none</option>
                    <option value="overlay">overlay</option>
                    <option value="macvlan">macvlan</option>
                  </select>
                </div>
                {newNetworkDriver !== 'host' && newNetworkDriver !== 'none' && (
                  <>
                    <div>
                      <label className="label">
                        {t('networks.subnet')} ({t('common.optional')})
                      </label>
                      <input
                        type="text"
                        value={newNetworkSubnet}
                        onChange={(e) => setNewNetworkSubnet(e.target.value)}
                        placeholder="172.20.0.0/16"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">
                        {t('networks.gateway')} ({t('common.optional')})
                      </label>
                      <input
                        type="text"
                        value={newNetworkGateway}
                        onChange={(e) => setNewNetworkGateway(e.target.value)}
                        placeholder="172.20.0.1"
                        className="input"
                      />
                    </div>
                  </>
                )}
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
                    disabled={!newNetworkName.trim() || createMutation.isLoading}
                    className="btn btn-primary"
                  >
                    {createMutation.isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      t('networks.createButton')
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedNetwork && (
        <NetworkDetails network={selectedNetwork} onClose={() => setSelectedNetwork(null)} />
      )}
    </div>
  );
}
