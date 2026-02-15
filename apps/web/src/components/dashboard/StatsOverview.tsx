import { useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Container,
  Box,
  Image,
  Database,
  Network,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import MetricCard from '../common/MetricCard';

interface ContainerStats {
  running: number;
  stopped: number;
  total: number;
}

interface ImageStats {
  total: number;
  totalSize: string;
}

interface VolumeStats {
  count: number;
  usedSpace: string;
}

interface NetworkStats {
  count: number;
}

interface BuildStats {
  success: number;
  failed: number;
  pending: number;
}

interface StatsOverviewProps {
  containers?: ContainerStats;
  images?: ImageStats;
  volumes?: VolumeStats;
  networks?: NetworkStats;
  builds?: BuildStats;
  className?: string;
}

const defaultContainerStats: ContainerStats = {
  running: 12,
  stopped: 5,
  total: 17,
};

const defaultImageStats: ImageStats = {
  total: 45,
  totalSize: '12.5 GB',
};

const defaultVolumeStats: VolumeStats = {
  count: 23,
  usedSpace: '8.2 GB',
};

const defaultNetworkStats: NetworkStats = {
  count: 8,
};

const defaultBuildStats: BuildStats = {
  success: 156,
  failed: 8,
  pending: 3,
};

const generateSparklineData = (baseValue: number, variance: number, points: number = 10) => {
  return Array.from({ length: points }, (_, i) => ({
    value: baseValue + Math.random() * variance - variance / 2 + (Math.sin(i / 2) * variance) / 4,
  }));
};

const StatsOverview: React.FC<StatsOverviewProps> = ({
  containers = defaultContainerStats,
  images = defaultImageStats,
  volumes = defaultVolumeStats,
  networks = defaultNetworkStats,
  builds = defaultBuildStats,
  className,
}) => {
  const containerSparkline = useMemo(
    () => generateSparklineData(containers.running, 3),
    [containers.running]
  );

  const imageSparkline = useMemo(() => generateSparklineData(images.total, 5), [images.total]);

  const volumeSparkline = useMemo(() => generateSparklineData(volumes.count, 2), [volumes.count]);

  const buildSparkline = useMemo(() => generateSparklineData(builds.success, 10), [builds.success]);
  const pendingTrend: 'up' | 'neutral' = builds.pending > 0 ? 'up' : 'neutral';

  const metrics = [
    // Containers
    {
      id: 'containers-running',
      title: 'Containers Running',
      value: containers.running,
      unit: 'active',
      change: 8.5,
      sparklineData: containerSparkline,
      icon: Container,
      trend: 'up' as const,
    },
    {
      id: 'containers-stopped',
      title: 'Containers Stopped',
      value: containers.stopped,
      unit: 'inactive',
      change: -12.3,
      sparklineData: generateSparklineData(containers.stopped, 2),
      icon: Box,
      trend: 'down' as const,
    },
    {
      id: 'containers-total',
      title: 'Total Containers',
      value: containers.total,
      change: 2.1,
      sparklineData: generateSparklineData(containers.total, 4),
      icon: Container,
      trend: 'neutral' as const,
    },
    // Images
    {
      id: 'images-total',
      title: 'Docker Images',
      value: images.total,
      unit: 'images',
      change: 5.7,
      sparklineData: imageSparkline,
      icon: Image,
      trend: 'up' as const,
    },
    {
      id: 'images-size',
      title: 'Images Size',
      value: images.totalSize,
      change: -3.2,
      sparklineData: generateSparklineData(12.5, 1),
      icon: Database,
      trend: 'down' as const,
    },
    // Volumes
    {
      id: 'volumes-count',
      title: 'Volumes',
      value: volumes.count,
      unit: 'volumes',
      change: 1.5,
      sparklineData: volumeSparkline,
      icon: Database,
      trend: 'up' as const,
    },
    {
      id: 'volumes-space',
      title: 'Volume Space Used',
      value: volumes.usedSpace,
      change: 4.8,
      sparklineData: generateSparklineData(8.2, 0.5),
      icon: Database,
      trend: 'up' as const,
    },
    // Networks
    {
      id: 'networks-count',
      title: 'Networks',
      value: networks.count,
      unit: 'networks',
      change: 0,
      sparklineData: generateSparklineData(networks.count, 0),
      icon: Network,
      trend: 'neutral' as const,
    },
    // Builds
    {
      id: 'builds-success',
      title: 'Successful Builds',
      value: builds.success,
      change: 15.3,
      sparklineData: buildSparkline,
      icon: CheckCircle2,
      trend: 'up' as const,
    },
    {
      id: 'builds-failed',
      title: 'Failed Builds',
      value: builds.failed,
      change: -25.0,
      sparklineData: generateSparklineData(builds.failed, 1),
      icon: XCircle,
      trend: 'down' as const,
    },
    {
      id: 'builds-pending',
      title: 'Pending Builds',
      value: builds.pending,
      unit: 'in queue',
      change: builds.pending > 0 ? 100 : 0,
      sparklineData: generateSparklineData(builds.pending, 0.5),
      icon: Clock,
      trend: pendingTrend,
    },
  ];

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Section: Containers */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Container className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Containers</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics
            .filter((m) => m.id.startsWith('containers-'))
            .map((metric) => (
              <MetricCard key={metric.id} {...metric} />
            ))}
        </div>
      </section>

      {/* Section: Images & Volumes */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Image className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Storage</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics
            .filter((m) => m.id.startsWith('images-') || m.id.startsWith('volumes-'))
            .map((metric) => (
              <MetricCard key={metric.id} {...metric} />
            ))}
        </div>
      </section>

      {/* Section: Networks & Builds */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Networks & Builds</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics
            .filter((m) => m.id.startsWith('networks-') || m.id.startsWith('builds-'))
            .map((metric) => (
              <MetricCard key={metric.id} {...metric} />
            ))}
        </div>
      </section>
    </div>
  );
};

export default StatsOverview;
