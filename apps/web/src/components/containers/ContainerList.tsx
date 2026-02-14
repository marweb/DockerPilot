import { useTranslation } from 'react-i18next';
import type { Container } from '@dockpilot/types';
import { Play, Square, RotateCw, Trash2, Box, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, es, fr, de, zhCN, ru, ja } from 'date-fns/locale';

interface ContainerListProps {
  containers: Container[];
  isLoading: boolean;
  onSelect: (container: Container) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (container: Container, e?: React.MouseEvent) => void;
  isStarting: boolean;
  isStopping: boolean;
  isRestarting: boolean;
  isDeleting: boolean;
}

const localeMap: Record<string, Locale> = {
  en: enUS,
  es: es,
  fr: fr,
  de: de,
  zh: zhCN,
  ru: ru,
  ja: ja,
};

export default function ContainerList({
  containers,
  isLoading,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onDelete,
  isStarting,
  isStopping,
  isRestarting,
  isDeleting,
}: ContainerListProps) {
  const { t, i18n } = useTranslation();
  const currentLocale = localeMap[i18n.language] || enUS;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'exited':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'created':
        return 'bg-blue-500';
      case 'restarting':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return 'badge-success';
      case 'exited':
        return 'badge-danger';
      case 'paused':
        return 'badge-warning';
      case 'created':
        return 'badge-info';
      case 'restarting':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
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

  if (containers.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="text-center py-12">
            <Box className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
              {t('containers.empty.title')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">{t('containers.empty.description')}</p>
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
                <th className="w-8"></th>
                <th>{t('containers.list.name')}</th>
                <th>{t('containers.list.image')}</th>
                <th>{t('containers.list.status')}</th>
                <th>{t('containers.list.ports')}</th>
                <th>{t('containers.list.created')}</th>
                <th className="text-right">{t('containers.list.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr
                  key={container.id}
                  onClick={() => onSelect(container)}
                  className="cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(container.status)}`} />
                  </td>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      {container.name.replace(/^\//, '')}
                    </div>
                  </td>
                  <td className="text-gray-600 dark:text-gray-400">{container.image}</td>
                  <td>
                    <span className={`badge ${getStatusBadge(container.status)}`}>
                      {container.status}
                    </span>
                  </td>
                  <td className="text-sm text-gray-600 dark:text-gray-400">
                    {container.ports && container.ports.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {container.ports.slice(0, 2).map((port, idx) => (
                          <span key={idx} className="text-xs">
                            {port.hostPort}:{port.containerPort}
                          </span>
                        ))}
                        {container.ports.length > 2 && (
                          <span className="text-xs text-gray-400">
                            +{container.ports.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(container.created * 1000, {
                        addSuffix: true,
                        locale: currentLocale,
                      })}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {container.status !== 'running' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStart(container.id);
                          }}
                          disabled={isStarting}
                          className="btn btn-ghost btn-icon btn-sm"
                          title={t('containers.actions.start')}
                        >
                          <Play className="h-4 w-4 text-green-600" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStop(container.id);
                          }}
                          disabled={isStopping}
                          className="btn btn-ghost btn-icon btn-sm"
                          title={t('containers.actions.stop')}
                        >
                          <Square className="h-4 w-4 text-yellow-600" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestart(container.id);
                        }}
                        disabled={isRestarting}
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('containers.actions.restart')}
                      >
                        <RotateCw className="h-4 w-4 text-blue-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(container, e);
                        }}
                        disabled={isDeleting}
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('containers.actions.remove')}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(container);
                        }}
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('containers.actions.view')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {containers.map((container) => (
          <div
            key={container.id}
            onClick={() => onSelect(container)}
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(container.status)}`} />
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {container.name.replace(/^\//, '')}
                </span>
              </div>
              <span className={`badge ${getStatusBadge(container.status)} text-xs`}>
                {container.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{container.image}</p>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(container.created * 1000, {
                  addSuffix: true,
                  locale: currentLocale,
                })}
              </div>
              {container.ports && container.ports.length > 0 && (
                <span>{container.ports.length} ports</span>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {container.status !== 'running' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart(container.id);
                  }}
                  disabled={isStarting}
                  className="flex-1 btn btn-primary btn-sm"
                >
                  <Play className="h-3 w-3 mr-1" />
                  {t('containers.actions.start')}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop(container.id);
                  }}
                  disabled={isStopping}
                  className="flex-1 btn btn-secondary btn-sm"
                >
                  <Square className="h-3 w-3 mr-1" />
                  {t('containers.actions.stop')}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestart(container.id);
                }}
                disabled={isRestarting}
                className="btn btn-secondary btn-sm"
              >
                <RotateCw className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => onDelete(container, e)}
                disabled={isDeleting}
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
