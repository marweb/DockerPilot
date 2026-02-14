import { useTranslation } from 'react-i18next';
import type { Image } from '@dockpilot/types';
import { Trash2, Image as ImageIcon, Clock, Layers, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, es, fr, de, zhCN, ru, ja } from 'date-fns/locale';
import { useState } from 'react';

interface ImageListProps {
  images: Image[];
  isLoading: boolean;
  onDelete: (image: Image) => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
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

export default function ImageList({
  images,
  isLoading,
  onDelete,
  isDeleting,
  formatSize,
}: ImageListProps) {
  const { t, i18n } = useTranslation();
  const currentLocale = localeMap[i18n.language] || enUS;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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

  if (images.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="text-center py-12">
            <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
              {t('images.empty.title')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">{t('images.empty.description')}</p>
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
                <th>{t('images.list.repository')}</th>
                <th>{t('images.list.tag')}</th>
                <th>{t('images.list.id')}</th>
                <th>{t('images.list.size')}</th>
                <th>{t('images.list.created')}</th>
                <th>{t('images.list.containers')}</th>
                <th className="text-right">{t('images.list.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {images.map((image) => (
                <tr key={image.id}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-gray-400" />
                      {image.repository}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{image.tag}</span>
                  </td>
                  <td className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      {image.id.substring(7, 19)}
                      <button
                        onClick={() => copyToClipboard(image.id, image.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {copiedId === image.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="text-gray-600 dark:text-gray-400">{formatSize(image.size)}</td>
                  <td className="text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(image.created * 1000, {
                        addSuffix: true,
                        locale: currentLocale,
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {image.containers}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => onDelete(image)}
                      disabled={isDeleting}
                      className="btn btn-ghost btn-icon btn-sm"
                      title={t('images.actions.remove')}
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
        {images.map((image) => (
          <div key={image.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {image.repository}
                </span>
              </div>
              <span className="badge badge-info text-xs">{image.tag}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {image.id.substring(7, 19)}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
              <div>{formatSize(image.size)}</div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(image.created * 1000, {
                  addSuffix: true,
                  locale: currentLocale,
                })}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <Layers className="h-3 w-3" />
                {image.containers} {t('images.containers')}
              </div>
              <button
                onClick={() => onDelete(image)}
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
