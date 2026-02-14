import { useState, useEffect, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import { Loader2, Wifi } from 'lucide-react';

type TimeRange = '1h' | '6h' | '24h' | '7d';

interface ResourceDataPoint {
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  networkRx: number;
  networkTx: number;
}

interface ResourceChartProps {
  data?: ResourceDataPoint[];
  isLoading?: boolean;
  isRealTime?: boolean;
  onTimeRangeChange?: (range: TimeRange) => void;
  className?: string;
}

const timeRangeConfig: Record<TimeRange, { label: string; points: number; interval: number }> = {
  '1h': { label: 'Last 1 hour', points: 60, interval: 60000 },
  '6h': { label: 'Last 6 hours', points: 72, interval: 300000 },
  '24h': { label: 'Last 24 hours', points: 96, interval: 900000 },
  '7d': { label: 'Last 7 days', points: 84, interval: 3600000 },
};

const generateMockData = (points: number, timeRange: TimeRange): ResourceDataPoint[] => {
  const now = Date.now();
  const interval = timeRangeConfig[timeRange].interval;
  const data: ResourceDataPoint[] = [];

  for (let i = points - 1; i >= 0; i--) {
    const timestamp = now - i * interval;
    data.push({
      timestamp,
      cpu: Math.random() * 40 + 20 + Math.sin(i / 10) * 15,
      memory: Math.random() * 30 + 40 + Math.cos(i / 8) * 10,
      disk: Math.random() * 5 + 60,
      networkRx: Math.random() * 50 + 10,
      networkTx: Math.random() * 40 + 5,
    });
  }

  return data;
};

const formatTimestamp = (timestamp: number, range: TimeRange): string => {
  const date = new Date(timestamp);
  switch (range) {
    case '1h':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case '6h':
    case '24h':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case '7d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleTimeString();
  }
};

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number | string;
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
              {Number(entry.value).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const ResourceChart: React.FC<ResourceChartProps> = ({
  data: externalData,
  isLoading = false,
  isRealTime = false,
  onTimeRangeChange,
  className,
}) => {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1h');
  const [internalData, setInternalData] = useState<ResourceDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize data
  useEffect(() => {
    if (!externalData) {
      const { points } = timeRangeConfig[selectedRange];
      setInternalData(generateMockData(points, selectedRange));
    }
  }, [selectedRange, externalData]);

  // Simulate real-time WebSocket updates
  useEffect(() => {
    if (!isRealTime) return;

    setIsConnected(true);
    const interval = setInterval(() => {
      setInternalData((prevData) => {
        const newDataPoint: ResourceDataPoint = {
          timestamp: Date.now(),
          cpu: Math.random() * 40 + 20,
          memory: Math.random() * 30 + 40,
          disk: 60 + Math.random() * 5,
          networkRx: Math.random() * 50 + 10,
          networkTx: Math.random() * 40 + 5,
        };

        const newData = [...prevData.slice(1), newDataPoint];
        return newData;
      });
    }, 5000);

    return () => {
      clearInterval(interval);
      setIsConnected(false);
    };
  }, [isRealTime]);

  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      setSelectedRange(range);
      onTimeRangeChange?.(range);
    },
    [onTimeRangeChange]
  );

  const chartData = useMemo(() => {
    const data = externalData || internalData;
    return data.map((point) => ({
      ...point,
      time: formatTimestamp(point.timestamp, selectedRange),
    }));
  }, [externalData, internalData, selectedRange]);

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
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading resource data...</p>
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
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Resources</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {timeRangeConfig[selectedRange].label}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time indicator */}
          {isRealTime && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20">
              <Wifi
                className={clsx(
                  'w-4 h-4',
                  isConnected ? 'text-green-500 animate-pulse' : 'text-gray-400'
                )}
              />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Live</span>
            </div>
          )}

          {/* Time range selector */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(Object.keys(timeRangeConfig) as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200',
                  selectedRange === range
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
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
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
              className="dark:tick:fill-gray-400 dark:axisLine:stroke-gray-700"
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#6b7280"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            <Area
              type="monotone"
              dataKey="cpu"
              name="CPU"
              stroke="#3b82f6"
              fill="url(#cpuGradient)"
              strokeWidth={2}
              animationDuration={1000}
            />
            <Area
              type="monotone"
              dataKey="memory"
              name="Memory"
              stroke="#10b981"
              fill="url(#memoryGradient)"
              strokeWidth={2}
              animationDuration={1000}
            />
            <Line
              type="monotone"
              dataKey="disk"
              name="Disk"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              animationDuration={1000}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Network I/O mini chart */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Network I/O</h4>
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                }}
                formatter={(value: number | string | Array<number | string> | undefined) => [
                  `${Number(value).toFixed(1)} MB/s`,
                  '',
                ]}
              />
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
    </div>
  );
};

export default ResourceChart;
