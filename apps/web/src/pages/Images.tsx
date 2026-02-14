import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Download } from 'lucide-react';
import type { Image as DockerImage } from '@dockpilot/types';
import api from '../api/client';
import ImageList from '../components/images/ImageList';
import ImagePull from '../components/images/ImagePull';

export default function Images() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [showPullModal, setShowPullModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<DockerImage | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'pull') {
      setShowPullModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch images
  const {
    data: images,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['images'],
    queryFn: async () => {
      const response = await api.get('/images');
      return response.data.data as DockerImage[];
    },
    refetchInterval: 10000,
  });

  // Delete image mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/images/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      setShowDeleteModal(false);
      setImageToDelete(null);
    },
  });

  // Filter images
  const filteredImages = images?.filter((image) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      image.repository.toLowerCase().includes(searchLower) ||
      image.tag.toLowerCase().includes(searchLower) ||
      image.id.toLowerCase().includes(searchLower)
    );
  });

  const handleDeleteClick = (image: DockerImage) => {
    setImageToDelete(image);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (imageToDelete) {
      deleteMutation.mutate(imageToDelete.id);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = images?.reduce((acc, img) => acc + img.size, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('images.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('images.totalSize', { size: formatSize(totalSize) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowPullModal(true)} className="btn btn-primary btn-sm">
            <Download className="h-4 w-4 mr-1" />
            {t('images.pullButton')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('images.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Image List */}
      <ImageList
        images={filteredImages || []}
        isLoading={isLoading}
        onDelete={handleDeleteClick}
        isDeleting={deleteMutation.isLoading}
        formatSize={formatSize}
      />

      {/* Pull Modal */}
      {showPullModal && (
        <ImagePull
          onClose={() => setShowPullModal(false)}
          onSuccess={() => {
            setShowPullModal(false);
            queryClient.invalidateQueries({ queryKey: ['images'] });
          }}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && imageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('images.delete.title')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('images.delete.message', {
                  repository: imageToDelete.repository,
                  tag: imageToDelete.tag,
                })}
              </p>
              {imageToDelete.containers > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    {t('images.delete.warning', { count: imageToDelete.containers })}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="btn btn-secondary">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteMutation.isLoading}
                  className="btn btn-danger"
                >
                  {deleteMutation.isLoading ? (
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
