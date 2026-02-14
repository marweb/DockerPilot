import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
} from 'recharts';
import { Cpu, MemoryStick, Network, HardDrive, Activity, Wifi, Loader2 } from 'lucide-react';

interface ContainerStatsDataPoint {
  timestamp: number;
  cpuPercent: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  diskRead: number;
  diskWrite: number;
  pids: number;
}

interface ContainerStatsProps {
  containerId?: string;
  containerName?: string;
  data?: ContainerStatsDataPoint[];
  isLoading?: boolean;
  isRealTime?: boolean;
  className?: string;
}

const generateMockData = (points: number = 288): ContainerStatsDataPoint[] => {
  const now = Date.now();
  const interval = 300000; // 5 minutes
  const data: ContainerStatsDataPoint[] = [];

  for (let i = points - 1; i >= 0; i--) {
    const timestamp = now - i * interval;
    data.push({
      timestamp,
      cpuPercent: Math.random() * 60 + 10 + Math.sin(i / 20) * 20,
      cpuCores: Math.random() * 0.5 + 0.1,
      memoryUsed: Math.random() * 512 + 256 + Math.cos(i / 15) * 100,
      memoryTotal: 1024,
      memoryPercent: Math.random() * 40 + 30,
      networkRx: Math.random() * 1000 + 100,
      networkTx: Math.random() * 800 + 50,
      diskRead: Math.random() * 500 + 20,
      diskWrite: Math.random() * 300 + 10,
      pids: Math.floor(Math.random() * 20 + 5),
    });
  }

  return data;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number | string;
  unit?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600 dark:text-gray-400 capitalize">{entry.name}:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {Number(entry.value).toFixed(2)}
              {entry.unit || ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ title, value, subtitle, icon, trend }) => {
  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-gray-500',
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        <div className={trendColors[trend || 'neutral']}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
};

const ContainerStats: React.FC<ContainerStatsProps> = ({
  containerId,
  containerName = 'Container',
  data: externalData,
  isLoading = false,
  isRealTime = false,
  className,
}) => {
  const [internalData, setInternalData] = useState<ContainerStatsDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize data
  useEffect(() => {
    if (!externalData) {
      setInternalData(generateMockData());
    }
  }, [externalData]);

  // Simulate real-time updates
  useEffect(() => {
    if (!isRealTime) return;

    setIsConnected(true);
    const interval = setInterval(() => {
      setInternalData((prevData) => {
        const newDataPoint: ContainerStatsDataPoint = {
          timestamp: Date.now(),
          cpuPercent: Math.random() * 60 + 10,
          cpuCores: Math.random() * 0.5 + 0.1,
          memoryUsed: Math.random() * 512 + 256,
          memoryTotal: 1024,
          memoryPercent: Math.random() * 40 + 30,
          networkRx: Math.random() * 1000 + 100,
          networkTx: Math.random() * 800 + 50,
          diskRead: Math.random() * 500 + 20,
          diskWrite: Math.random() * 300 + 10,
          pids: Math.floor(Math.random() * 20 + 5),
        };

        return [...prevData.slice(1), newDataPoint];
      });
    }, 5000);

    return () => {
      clearInterval(interval);
      setIsConnected(false);
    };
  }, [isRealTime]);

  const chartData = useMemo(() => {
    const data = externalData || internalData;
    return data.map((point) => ({
      ...point,
      time: formatTimestamp(point.timestamp),
      memoryUsedFormatted: (point.memoryUsed / 1024).toFixed(2),
    }));
  }, [externalData, internalData]);

  const currentStats = chartData[chartData.length - 1] || {
    cpuPercent: 0,
    cpuCores: 0,
    memoryUsed: 0,
    memoryTotal: 1024,
    memoryPercent: 0,
    networkRx: 0,
    networkTx: 0,
    diskRead: 0,
    diskWrite: 0,
    pids: 0,
  };

  if (isLoading) {
    return (
      <div
        className={clsx(
          'bg-white dark:bg-gray-800',
          'rounded-xl border border-gray-200 dark:border-gray-700',
          'p-6 h-96',
          'flex flex-col items-center justify-center',
          className
        )}
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading container stats...</p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800',
        'rounded-xl border border-gray-200 dark:border-gray-700',
        'p-6',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <Activity className="w-6 h-6 text-primary-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{containerName}</h3>
            {containerId && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {containerId.substring(0, 12)}
              </p>
            )}
          </div>
        </div>

        {isRealTime && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20 w-fit">
            <Wifi
              className={clsx(
                'w-4 h-4',
                isConnected ? 'text-green-500 animate-pulse' : 'text-gray-400'
              )}
            />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Live Monitoring
            </span>
          </div>
        )}
      </div>

      {/* Current Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="CPU Usage"
          value={`${currentStats.cpuPercent.toFixed(1)}%`}
          subtitle={`${currentStats.cpuCores.toFixed(2)} cores`}
          icon={<Cpu className="w-5 h-5" />}
          trend={currentStats.cpuPercent > 80 ? 'up' : 'neutral'}
        />
        <StatCard
          title="Memory"
          value={`${currentStats.memoryPercent.toFixed(1)}%`}
          subtitle={`${formatBytes(currentStats.memoryUsed * 1024 * 1024)} / ${formatBytes(
            currentStats.memoryTotal * 1024 * 1024
          )}`}
          icon={<MemoryStick className="w-5 h-5" />}
          trend={currentStats.memoryPercent > 80 ? 'up' : 'neutral'}
        />
        <StatCard
          title="Network I/O"
          value={`${formatBytes(currentStats.networkRx)}/s`}
          subtitle={`TX: ${formatBytes(currentStats.networkTx)}/s`}
          icon={<Network className="w-5 h-5" />}
          trend="neutral"
        />
        <StatCard
          title="Processes"
          value={currentStats.pids.toString()}
          subtitle="Active PIDs"
          icon={<HardDrive className="w-5 h-5" />}
          trend="neutral"
        />
      </div>

      {/* CPU & Memory Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          CPU & Memory (24h)
        </h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="cpuContainerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memoryContainerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis
                dataKey="time"
                stroke="#6b7280"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="cpuPercent"
                name="CPU %"
                stroke="#3b82f6"
                fill="url(#cpuContainerGradient)"
                strokeWidth={2}
                animationDuration={1000}
              />
              <Area
                type="monotone"
                dataKey="memoryPercent"
                name="Memory %"
                stroke="#10b981"
                fill="url(#memoryContainerGradient)"
                strokeWidth={2}
                animationDuration={1000}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Network I/O Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Network className="w-4 h-4" />
          Network I/O (24h)
        </h4>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis dataKey="time" hide />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(value: number) => formatBytes(value)}
              />
              <Tooltip
                content={<CustomTooltip />}
                formatter={(value: number | string | Array<number | string> | undefined) => [
                  formatBytes(Number(value)),
                  '',
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="networkRx"
                name="RX"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="networkTx"
                name="TX"
                stroke="#ec4899"
                strokeWidth={2}
                dot={false}
                animationDuration={1000}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Disk I/O Chart */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4" />
          Disk I/O (24h)
        </h4>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis dataKey="time" hide />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(value: number) => formatBytes(value)}
              />
              <Tooltip
                content={<CustomTooltip />}
                formatter={(value: number | string | Array<number | string> | undefined) => [
                  formatBytes(Number(value)),
                  '',
                ]}
              />
              <Legend />
              <Bar
                dataKey="diskRead"
                name="Read"
                fill="#f59e0b"
                radius={[2, 2, 0, 0]}
                animationDuration={1000}
              />
              <Bar
                dataKey="diskWrite"
                name="Write"
                fill="#ef4444"
                radius={[2, 2, 0, 0]}
                animationDuration={1000}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ContainerStats;
