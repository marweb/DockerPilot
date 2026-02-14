import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Box, Play, Square, Trash2, RefreshCw } from 'lucide-react';

/**
 * Página de detalle de contenedor
 * Muestra información detallada de un contenedor específico
 */
export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header con navegación */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/containers')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Box className="h-6 w-6 text-primary-600" />
            Container Details
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{id}</p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex items-center gap-2">
          <Play className="h-4 w-4" />
          Start
        </button>
        <button className="btn btn-secondary flex items-center gap-2">
          <Square className="h-4 w-4" />
          Stop
        </button>
        <button className="btn btn-secondary flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Restart
        </button>
        <button className="btn btn-danger flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
      </div>

      {/* Información del contenedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              General Information
            </h2>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                <p className="text-gray-900 dark:text-gray-100">Running</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                <p className="text-gray-900 dark:text-gray-100">2 days ago</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Image</p>
                <p className="text-gray-900 dark:text-gray-100">nginx:latest</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Platform</p>
                <p className="text-gray-900 dark:text-gray-100">linux/amd64</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Network</h2>
          </div>
          <div className="card-body">
            <p className="text-gray-500 dark:text-gray-400">
              Network information will be displayed here.
            </p>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Logs</h2>
          </div>
          <div className="card-body">
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm h-64 overflow-auto">
              <p>Container logs will be displayed here...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
