import {
  Play,
  Square,
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';

type StatusType = 'running' | 'stopped' | 'error' | 'warning' | 'pending' | 'success' | 'info';

interface StatusBadgeProps {
  status: StatusType;
  text?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  pulse?: boolean;
}

const statusConfig: Record<
  StatusType,
  {
    icon: React.ElementType;
    bgColor: string;
    textColor: string;
    borderColor: string;
    defaultText: string;
  }
> = {
  running: {
    icon: Play,
    bgColor: 'bg-green-100 dark:bg-green-900/20',
    textColor: 'text-green-800 dark:text-green-400',
    borderColor: 'border-green-200 dark:border-green-800',
    defaultText: 'Running',
  },
  stopped: {
    icon: Square,
    bgColor: 'bg-gray-100 dark:bg-gray-700/50',
    textColor: 'text-gray-800 dark:text-gray-400',
    borderColor: 'border-gray-200 dark:border-gray-600',
    defaultText: 'Stopped',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    textColor: 'text-red-800 dark:text-red-400',
    borderColor: 'border-red-200 dark:border-red-800',
    defaultText: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    textColor: 'text-yellow-800 dark:text-yellow-400',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    defaultText: 'Warning',
  },
  pending: {
    icon: Clock,
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-800 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
    defaultText: 'Pending',
  },
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-100 dark:bg-green-900/20',
    textColor: 'text-green-800 dark:text-green-400',
    borderColor: 'border-green-200 dark:border-green-800',
    defaultText: 'Success',
  },
  info: {
    icon: Loader2,
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-800 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
    defaultText: 'Info',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-sm',
};

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

export default function StatusBadge({
  status,
  text,
  showIcon = true,
  size = 'md',
  className,
  pulse = false,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const displayText = text || config.defaultText;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeClasses[size],
        pulse && status === 'running' && 'animate-pulse',
        className
      )}
    >
      {showIcon && (
        <Icon className={clsx(iconSizeClasses[size], status === 'pending' && 'animate-spin')} />
      )}
      {displayText}
    </span>
  );
}
