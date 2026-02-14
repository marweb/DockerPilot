import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Volume } from '@dockpilot/types';
import { HardDrive, Database, Layers, Trash2, Copy, Check, AlertCircle } from 'lucide-react';

interface VolumeListProps {
  volumes: Volume[];
  isLoading: boolean;
  onDelete: (name: string) => void;
  isDeleting: boolean;
  formatSize: (bytes?: number) => string;
}

export default function VolumeList({
  volumes,
  isLoading,
  onDelete,
  isDeleting,
  formatSize,
}: VolumeListProps) {
  const { t } = useTranslation();
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [deletingVolume, setDeletingVolume] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedName(text);
    setTimeout(() => setCopiedName(null), 2000);
  };

  const handleDelete = (volume: Volume) => {
    if (volume.usageData && volume.usageData.refCount > 0) {
      if (!window.confirm(t('volumes.deleteInUseConfirm', { name: volume.name }))) {
        return;
      }
    }
    setDeletingVolume(volume.name);
    onDelete(volume.name);
    setTimeout(() => setDeletingVolume(null), 1000);
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (volumes.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="text-center py-12">
            <HardDrive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
              {t('volumes.empty.title')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">{t('volumes.empty.description')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block card overflow-hidden">
        <div className="table-container">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>{t('volumes.list.name')}</th>
                <th>{t('volumes.list.driver')}</th>
                <th>{t('volumes.list.scope')}</th>
                <th>{t('volumes.list.mountpoint')}</th>
                <th>{t('volumes.list.size')}</th>
                <th>{t('volumes.list.usage')}</th>
                <th className="text-right">{t('volumes.list.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((volume) => (
                <tr key={volume.name}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      {volume.name}
                      <button
                        onClick={() => copyToClipboard(volume.name)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {copiedName === volume.name ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-neutral text-xs">{volume.driver}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${volume.scope === 'local' ? 'badge-success' : 'badge-info'} text-xs`}
                    >
                      {volume.scope}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate max-w-xs">
                    {volume.mountpoint}
                  </td>
                  <td className="text-gray-600 dark:text-gray-400">
                    {formatSize(volume.usageData?.size)}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      <span
                        className={
                          volume.usageData && volume.usageData.refCount > 0
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }
                      >
                        {volume.usageData?.refCount || 0}
                      </span>
                      {volume.usageData && volume.usageData.refCount > 0 && (
                        <AlertCircle className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => handleDelete(volume)}
                      disabled={isDeleting || deletingVolume === volume.name}
                      className="btn btn-ghost btn-icon btn-sm"
                      title={t('volumes.actions.remove')}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {volumes.map((volume) => (
          <div key={volume.name} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{volume.name}</span>
              </div>
              <span
                className={`badge ${volume.scope === 'local' ? 'badge-success' : 'badge-info'} text-xs`}
              >
                {volume.scope}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
              <div>
                <span className="badge badge-neutral text-xs">{volume.driver}</span>
              </div>
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {volume.usageData?.refCount || 0} {t('volumes.containers')}
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 font-mono truncate">
              {volume.mountpoint}
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {formatSize(volume.usageData?.size)}
              </span>
              <button
                onClick={() => handleDelete(volume)}
                disabled={isDeleting || deletingVolume === volume.name}
                className="btn btn-danger btn-sm"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
