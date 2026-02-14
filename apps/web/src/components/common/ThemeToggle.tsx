import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '../../stores/theme';
import clsx from 'clsx';

interface ThemeToggleProps {
  variant?: 'icon' | 'segmented' | 'dropdown';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

type Theme = 'light' | 'dark' | 'system';

const themes: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

export default function ThemeToggle({
  variant = 'icon',
  size = 'md',
  className,
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, setTheme, initTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const currentTheme = themes.find((t) => t.value === theme) || themes[2];
  const CurrentIcon = currentTheme.icon;

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  if (variant === 'icon') {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

    return (
      <button
        onClick={() => handleThemeChange(nextTheme)}
        className={clsx(
          'rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
          'focus:outline-none focus:ring-2 focus:ring-primary-500',
          'transition-colors',
          sizeClasses[size],
          className
        )}
        aria-label={`Switch to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
      >
        <CurrentIcon className={iconSizes[size]} />
      </button>
    );
  }

  if (variant === 'segmented') {
    return (
      <div
        className={clsx(
          'inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1',
          className
        )}
      >
        {themes.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => handleThemeChange(value)}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              theme === value
                ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
            aria-pressed={theme === value}
            title={label}
          >
            <Icon className="h-4 w-4" />
            {showLabel && <span>{label}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
          'focus:outline-none focus:ring-2 focus:ring-primary-500',
          'transition-colors',
          sizeClasses[size]
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentIcon className={iconSizes[size]} />
        {showLabel && <span className="text-sm font-medium">{currentTheme.label}</span>}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
            role="listbox"
          >
            {themes.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={clsx(
                  'flex items-center w-full text-left px-4 py-2 text-sm',
                  theme === value
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                role="option"
                aria-selected={theme === value}
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
