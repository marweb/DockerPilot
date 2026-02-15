import React, { useEffect, useRef, useState, forwardRef, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { Loader2, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';

type ChartType = 'line' | 'bar' | 'area' | 'pie';

interface ChartDataPoint {
  [key: string]: string | number;
}

interface ChartOptions {
  title?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  colors?: string[];
  xAxisKey?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  smooth?: boolean;
  stacked?: boolean;
  pieInnerRadius?: number;
  pieOuterRadius?: number;
}

interface ChartProps {
  type: ChartType;
  data: ChartDataPoint[];
  options?: ChartOptions;
  height?: number | string;
  width?: number | string;
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  customTooltip?: (props: TooltipProps<number, string>) => React.ReactNode;
}

const defaultColors = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

const darkThemeColors = {
  grid: '#374151',
  text: '#9ca3af',
  background: '#1f2937',
};

const lightThemeColors = {
  grid: '#e5e7eb',
  text: '#6b7280',
  background: '#ffffff',
};

const Chart = forwardRef<HTMLDivElement, ChartProps>(
  (
    {
      type,
      data,
      options = {},
      height = 300,
      width = '100%',
      className,
      isLoading = false,
      isEmpty = false,
      emptyMessage = 'No data available',
      loadingMessage = 'Loading chart data...',
      customTooltip,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
      const checkDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark');
        setIsDarkMode(isDark);
      };

      checkDarkMode();

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            checkDarkMode();
          }
        });
      });

      observer.observe(document.documentElement, { attributes: true });

      return () => observer.disconnect();
    }, []);

    const themeColors = isDarkMode ? darkThemeColors : lightThemeColors;
    const colors = options.colors || defaultColors;

    const dataKeys = useMemo(() => {
      if (data.length === 0) return [];
      const keys = Object.keys(data[0]).filter((key) => key !== (options.xAxisKey || 'name'));
      return keys;
    }, [data, options.xAxisKey]);

    const renderChart = () => {
      const commonProps = {
        data,
        margin: { top: 10, right: 30, left: 0, bottom: 0 },
      };

      const axisProps = {
        xAxis: (
          <XAxis
            dataKey={options.xAxisKey || 'name'}
            stroke={themeColors.text}
            tick={{ fill: themeColors.text, fontSize: 12 }}
            tickLine={{ stroke: themeColors.grid }}
            axisLine={{ stroke: themeColors.grid }}
            label={
              options.xAxisLabel
                ? { value: options.xAxisLabel, position: 'insideBottom', offset: -5 }
                : undefined
            }
          />
        ),
        yAxis: (
          <YAxis
            stroke={themeColors.text}
            tick={{ fill: themeColors.text, fontSize: 12 }}
            tickLine={{ stroke: themeColors.grid }}
            axisLine={{ stroke: themeColors.grid }}
            label={
              options.yAxisLabel
                ? { value: options.yAxisLabel, angle: -90, position: 'insideLeft' }
                : undefined
            }
          />
        ),
        grid: options.showGrid !== false && (
          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
        ),
        tooltip: customTooltip ? (
          <Tooltip content={customTooltip} />
        ) : (
          <Tooltip
            contentStyle={{
              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              border: `1px solid ${themeColors.grid}`,
              borderRadius: '6px',
              color: isDarkMode ? '#f9fafb' : '#111827',
            }}
            labelStyle={{ color: isDarkMode ? '#f9fafb' : '#111827' }}
          />
        ),
        legend: options.showLegend !== false && (
          <Legend
            verticalAlign={options.legendPosition === 'top' ? 'top' : 'bottom'}
            height={36}
            iconType="circle"
          />
        ),
      };

      switch (type) {
        case 'line':
          return (
            <LineChart {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tooltip}
              {axisProps.legend}
              {dataKeys.map((key, index) => (
                <Line
                  key={key}
                  type={options.smooth ? 'monotone' : 'linear'}
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={1000}
                  animationEasing="ease-in-out"
                />
              ))}
            </LineChart>
          );

        case 'bar':
          return (
            <BarChart {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tooltip}
              {axisProps.legend}
              {dataKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index % colors.length]}
                  animationDuration={1000}
                  animationEasing="ease-in-out"
                  stackId={options.stacked ? 'stack' : undefined}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          );

        case 'area':
          return (
            <AreaChart {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tooltip}
              {axisProps.legend}
              {dataKeys.map((key, index) => (
                <Area
                  key={key}
                  type={options.smooth ? 'monotone' : 'linear'}
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.3}
                  strokeWidth={2}
                  animationDuration={1000}
                  animationEasing="ease-in-out"
                  stackId={options.stacked ? 'stack' : undefined}
                />
              ))}
            </AreaChart>
          );

        case 'pie':
          return (
            <PieChart>
              {axisProps.tooltip}
              {axisProps.legend}
              <Pie
                data={data}
                dataKey={dataKeys[0] || 'value'}
                nameKey={options.xAxisKey || 'name'}
                cx="50%"
                cy="50%"
                innerRadius={options.pieInnerRadius || 0}
                outerRadius={options.pieOuterRadius || 80}
                paddingAngle={2}
                animationDuration={1000}
                animationEasing="ease-in-out"
                label
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          );

        default:
          return null;
      }
    };

    if (isLoading) {
      return (
        <div
          ref={ref || containerRef}
          className={clsx(
            'flex flex-col items-center justify-center',
            'bg-white dark:bg-gray-800',
            'rounded-lg border border-gray-200 dark:border-gray-700',
            'p-8',
            className
          )}
          style={{ height, width }}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{loadingMessage}</p>
        </div>
      );
    }

    if (isEmpty || data.length === 0) {
      return (
        <div
          ref={ref || containerRef}
          className={clsx(
            'flex flex-col items-center justify-center',
            'bg-white dark:bg-gray-800',
            'rounded-lg border border-gray-200 dark:border-gray-700',
            'p-8',
            className
          )}
          style={{ height, width }}
        >
          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div
        ref={ref || containerRef}
        className={clsx(
          'bg-white dark:bg-gray-800',
          'rounded-lg border border-gray-200 dark:border-gray-700',
          'p-4',
          className
        )}
        style={{ height, width }}
      >
        {options.title && (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {options.title}
          </h3>
        )}
        <ResponsiveContainer width="100%" height={options.title ? '85%' : '100%'}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    );
  }
);

Chart.displayName = 'Chart';

export default Chart;
