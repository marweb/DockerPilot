import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Download, Trash2, Clock, Filter } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

interface ContainerLogsProps {
  containerId: string;
}

export default function ContainerLogs({ containerId }: ContainerLogsProps) {
  const { t } = useTranslation();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { token } = useAuthStore();

  const [logs, setLogs] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [tail, setTail] = useState(100);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState('');

  // Connect to WebSocket
  useEffect(() => {
    const query = new URLSearchParams({
      follow: String(isFollowing),
      timestamps: String(showTimestamps),
      tail: String(tail),
      ...(token ? { token } : {}),
    });

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/containers/${containerId}/logs?${query.toString()}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          data?: string;
          message?: string;
          error?: string;
        };

        if (data.type === 'log') {
          setLogs((prev) => [...prev, data.data || data.message || '']);
        }
      } catch {
        setLogs((prev) => [...prev, String(event.data)]);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [containerId, isFollowing, showTimestamps, tail, token]);

  // Auto-scroll to bottom when following
  useEffect(() => {
    if (isFollowing && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isFollowing]);

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `container-${containerId.substring(0, 12)}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = filter
    ? logs.filter((log) => log.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('containers.logs.title')}
            </h3>
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Controls */}
            <button
              onClick={() => setIsFollowing(!isFollowing)}
              className={`btn btn-sm ${isFollowing ? 'btn-primary' : 'btn-secondary'}`}
              title={isFollowing ? t('containers.logs.pause') : t('containers.logs.follow')}
            >
              {isFollowing ? (
                <Square className="h-3 w-3 mr-1" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              {isFollowing ? t('containers.logs.following') : t('containers.logs.follow')}
            </button>

            <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
              <Clock className="h-3 w-3" />
              <input
                type="checkbox"
                checked={showTimestamps}
                onChange={(e) => setShowTimestamps(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700 dark:text-gray-300">
                {t('containers.logs.timestamps')}
              </span>
            </label>

            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              className="input w-24 text-sm py-1.5"
            >
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>

            <button
              onClick={clearLogs}
              className="btn btn-secondary btn-sm"
              title={t('containers.logs.clear')}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {t('containers.logs.clear')}
            </button>

            <button
              onClick={downloadLogs}
              className="btn btn-secondary btn-sm"
              title={t('containers.logs.download')}
            >
              <Download className="h-3 w-3 mr-1" />
              {t('containers.logs.download')}
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="mt-4">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('containers.logs.filterPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input pl-10 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Logs Display */}
      <div className="card-body p-0">
        <div className="bg-gray-900 rounded-b-lg">
          <div
            className="p-4 font-mono text-sm overflow-auto"
            style={{ maxHeight: '600px', minHeight: '400px' }}
          >
            {filteredLogs.length === 0 ? (
              <p className="text-gray-500 italic">{t('containers.logs.empty')}</p>
            ) : (
              filteredLogs.map((log, idx) => (
                <div key={idx} className="text-gray-300 hover:bg-gray-800 px-1 py-0.5 rounded">
                  <span className="text-gray-500 select-none">
                    {(idx + 1).toString().padStart(4, '0')}
                  </span>{' '}
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {t('containers.logs.showing', { count: filteredLogs.length, total: logs.length })}
          </span>
          <span>
            {isConnected ? t('containers.logs.connected') : t('containers.logs.disconnected')}
          </span>
        </div>
      </div>
    </div>
  );
}
