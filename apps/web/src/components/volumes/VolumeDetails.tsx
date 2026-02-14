import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { X, Database, Layers, Copy, Check } from 'lucide-react';
import type { Volume } from '@dockpilot/types';
import api from '../../api/client';

interface VolumeDetailsProps {
  volumeName: string;
  onClose: () => void;
}

export default function VolumeDetails({ volumeName, onClose }: VolumeDetailsProps) {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: volume, isLoading } = useQuery({
    queryKey: ['volume', volumeName],
    queryFn: async () => {
      const response = await api.get(`/volumes/${volumeName}`);
      return response.data.data as Volume;
    },
  });

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!volume) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
          <p className="text-gray-500">{t('volumes.notFound')}</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {volume.name}
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
          <InfoRow
            label={t('volumes.details.driver')}
            value={<span className="badge badge-neutral text-xs">{volume.driver}</span>}
          />
          <InfoRow
            label={t('volumes.details.scope')}
            value={
              <span
                className={`badge ${volume.scope === 'local' ? 'badge-success' : 'badge-info'} text-xs`}
              >
                {volume.scope}
              </span>
            }
          />
          <InfoRow
            label={t('volumes.details.mountpoint')}
            value={volume.mountpoint}
            copyable
            copyValue={volume.mountpoint}
          />
          {volume.createdAt && (
            <InfoRow
              label={t('volumes.details.created')}
              value={new Date(volume.createdAt).toLocaleString()}
            />
          )}

          {/* Usage Info */}
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {t('volumes.details.usage')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('volumes.details.size')}
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatSize(volume.usageData?.size)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('volumes.details.refCount')}
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {volume.usageData?.refCount || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Labels */}
          {volume.labels && Object.keys(volume.labels).length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('volumes.details.labels')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(volume.labels).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          {volume.options && Object.keys(volume.options).length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('volumes.details.options')}
              </h4>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <code className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {JSON.stringify(volume.options, null, 2)}
                </code>
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
