import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { Box, Hash, Command, HardDrive, Tag, Copy, Check } from 'lucide-react';
import type { ContainerInspect } from '@dockpilot/types';
import api from '../../api/client';

interface ContainerDetailsProps {
  containerId: string;
}

export default function ContainerDetails({ containerId }: ContainerDetailsProps) {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: details, isLoading } = useQuery({
    queryKey: ['container', containerId],
    queryFn: async () => {
      const response = await api.get(`/containers/${containerId}`);
      return response.data.data as ContainerInspect;
    },
    refetchInterval: 5000,
  });

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="card p-6">
        <p className="text-gray-500 dark:text-gray-400">{t('containers.details.notFound')}</p>
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
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('containers.details.basicInfo')}
            </h3>
          </div>
        </div>
        <div className="card-body">
          <InfoRow
            label={t('containers.details.id')}
            value={details.id.substring(0, 12)}
            copyable
            copyValue={details.id}
          />
          <InfoRow label={t('containers.details.image')} value={details.config.image} />
          <InfoRow
            label={t('containers.details.command')}
            value={details.path + ' ' + details.args.join(' ')}
          />
          <InfoRow
            label={t('containers.details.created')}
            value={new Date(details.created).toLocaleString()}
          />
          <InfoRow label={t('containers.details.status')} value={details.state.status} />
        </div>
      </div>

      {/* State Information */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('containers.details.state')}
            </h3>
          </div>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('containers.details.running')}
              </span>
              <p
                className={`font-medium ${details.state.running ? 'text-green-600' : 'text-red-600'}`}
              >
                {details.state.running ? t('common.yes') : t('common.no')}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('containers.details.pid')}
              </span>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {details.state.pid || '-'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('containers.details.exitCode')}
              </span>
              <p
                className={`font-medium ${details.state.exitCode !== 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}
              >
                {details.state.exitCode}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('containers.details.startedAt')}
              </span>
              <p className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                {details.state.startedAt ? new Date(details.state.startedAt).toLocaleString() : '-'}
              </p>
            </div>
          </div>
          {details.state.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{details.state.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Command className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('containers.details.configuration')}
            </h3>
          </div>
        </div>
        <div className="card-body">
          <InfoRow label={t('containers.details.hostname')} value={details.config.hostname} />
          <InfoRow
            label={t('containers.details.workingDir')}
            value={details.config.workingDir || '/'}
          />
          <InfoRow label={t('containers.details.user')} value={details.config.user || 'root'} />
          <InfoRow
            label={t('containers.details.tty')}
            value={details.config.tty ? t('common.enabled') : t('common.disabled')}
          />
          {details.config.env && details.config.env.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('containers.details.environment')}
              </h4>
              <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                <code className="text-sm text-green-400 whitespace-pre">
                  {details.config.env.join('\n')}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mounts */}
      {details.mounts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('containers.details.mounts')}
              </h3>
            </div>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>{t('containers.mounts.type')}</th>
                    <th>{t('containers.mounts.source')}</th>
                    <th>{t('containers.mounts.destination')}</th>
                    <th>{t('containers.mounts.mode')}</th>
                  </tr>
                </thead>
                <tbody>
                  {details.mounts.map((mount, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="badge badge-neutral text-xs">{mount.type}</span>
                      </td>
                      <td className="font-mono text-xs">{mount.source}</td>
                      <td className="font-mono text-xs">{mount.destination}</td>
                      <td>
                        <span
                          className={`badge ${mount.rw ? 'badge-success' : 'badge-neutral'} text-xs`}
                        >
                          {mount.rw ? 'RW' : 'RO'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Labels */}
      {Object.keys(details.config.labels).length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('containers.details.labels')}
              </h3>
            </div>
          </div>
          <div className="card-body">
            <div className="flex flex-wrap gap-2">
              {Object.entries(details.config.labels).map(([key, value]) => (
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
  );
}
