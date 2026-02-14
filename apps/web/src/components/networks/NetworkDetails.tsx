import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from 'react-query';
import { X, Network as NetworkIcon, Link as LinkIcon, Unlink, Copy, Check } from 'lucide-react';
import type { Network as NetworkType } from '@dockpilot/types';
import api from '../../api/client';

interface NetworkDetailsProps {
  network: NetworkType;
  onClose: () => void;
}

export default function NetworkDetails({ network, onClose }: NetworkDetailsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [containerToConnect, setContainerToConnect] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const connectMutation = useMutation({
    mutationFn: (containerId: string) =>
      api.post(`/networks/${network.id}/connect`, { containerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      setContainerToConnect('');
      setShowConnectForm(false);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (containerId: string) =>
      api.post(`/networks/${network.id}/disconnect`, { containerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
    },
  });

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (containerToConnect.trim()) {
      connectMutation.mutate(containerToConnect.trim());
    }
  };

  const handleDisconnect = (containerId: string) => {
    if (window.confirm(t('networks.disconnectConfirm'))) {
      disconnectMutation.mutate(containerId);
    }
  };

  const InfoRow = ({
    label,
    value,
    copyable = false,
    copyValue = '',
  }: {
    label: string;
    value: React.ReactNode;
    copyable?: boolean;
    copyValue?: string;
  }) => (
    <div className="py-3 flex flex-col sm:flex-row sm:items-center border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 sm:w-1/3 mb-1 sm:mb-0">
        {label}
      </span>
      <div className="flex items-center gap-2 sm:w-2/3">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
          {value}
        </span>
        {copyable && copyValue && (
          <button
            onClick={() => copyToClipboard(copyValue, label)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {copiedField === label ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );

  const containers = network.containers ? Object.entries(network.containers) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <NetworkIcon className="h-5 w-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {network.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Basic Info */}
          <div className="card mb-6">
            <div className="card-header">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t('networks.details.basicInfo')}
              </h4>
            </div>
            <div className="card-body">
              <InfoRow
                label={t('networks.details.id')}
                value={network.id.substring(0, 12)}
                copyable
                copyValue={network.id}
              />
              <InfoRow
                label={t('networks.details.driver')}
                value={<span className="badge badge-info text-xs">{network.driver}</span>}
              />
              <InfoRow
                label={t('networks.details.scope')}
                value={
                  <span
                    className={`badge ${network.scope === 'local' ? 'badge-success' : 'badge-info'} text-xs`}
                  >
                    {network.scope}
                  </span>
                }
              />
              {network.ipam?.config?.[0]?.subnet && (
                <InfoRow
                  label={t('networks.details.subnet')}
                  value={network.ipam.config[0].subnet}
                />
              )}
              {network.ipam?.config?.[0]?.gateway && (
                <InfoRow
                  label={t('networks.details.gateway')}
                  value={network.ipam.config[0].gateway}
                />
              )}
            </div>
          </div>

          {/* Connected Containers */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  {t('networks.details.connectedContainers')} ({containers.length})
                </h4>
                <button
                  onClick={() => setShowConnectForm(!showConnectForm)}
                  className="btn btn-primary btn-sm"
                >
                  {showConnectForm ? t('common.cancel') : t('networks.connect')}
                </button>
              </div>
            </div>
            <div className="card-body">
              {/* Connect Form */}
              {showConnectForm && (
                <form
                  onSubmit={handleConnect}
                  className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={containerToConnect}
                      onChange={(e) => setContainerToConnect(e.target.value)}
                      placeholder={t('networks.containerIdPlaceholder')}
                      className="flex-1 input"
                    />
                    <button
                      type="submit"
                      disabled={!containerToConnect.trim() || connectMutation.isLoading}
                      className="btn btn-primary"
                    >
                      {connectMutation.isLoading ? (
                        <span className="animate-spin">...</span>
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Container List */}
              {containers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  {t('networks.noContainers')}
                </p>
              ) : (
                <div className="space-y-2">
                  {containers.map(([containerId, container]) => (
                    <div
                      key={containerId}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          {container.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {container.ipv4Address}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {containerId.substring(0, 12)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDisconnect(containerId)}
                        disabled={disconnectMutation.isLoading}
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('networks.disconnect')}
                      >
                        <Unlink className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Labels */}
          {network.labels && Object.keys(network.labels).length > 0 && (
            <div className="card mt-6">
              <div className="card-header">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {t('networks.details.labels')}
                </h4>
              </div>
              <div className="card-body">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(network.labels).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="w-full btn btn-secondary">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
