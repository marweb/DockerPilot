import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Box,
  Image,
  HardDrive,
  Network,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../../api/client';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

// Navigation items
const navigation = [
  { name: 'dashboard', href: '/', icon: Home },
  { name: 'containers', href: '/containers', icon: Box },
  { name: 'images', href: '/images', icon: Image },
  { name: 'volumes', href: '/volumes', icon: HardDrive },
  { name: 'networks', href: '/networks', icon: Network },
  { name: 'settings', href: '/settings', icon: Settings },
];

export default function Sidebar({
  isOpen = true,
  onClose,
  collapsible = true,
  defaultCollapsed = false,
}: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [isMobile, setIsMobile] = useState(false);
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    api.get('/system/version')
      .then((res) => {
        setAppVersion(res.data?.data?.currentVersion || '...');
      })
      .catch(() => {
        setAppVersion('...');
      });
  }, []);

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        {!collapsed && (
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
              DockPilot
            </span>
          </Link>
        )}
        {collapsed && (
          <Link to="/" className="mx-auto">
            <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
          </Link>
        )}
        {collapsible && !isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={collapsed ? t('common.expand') : t('common.collapse')}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => isMobile && onClose?.()}
              className={clsx(
                'flex items-center rounded-lg transition-colors',
                collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5',
                active
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200'
              )}
              title={collapsed ? t(`nav.${item.name}`) : undefined}
            >
              <Icon className={clsx('h-5 w-5 flex-shrink-0', collapsed ? '' : 'mr-3')} />
              {!collapsed && <span className="text-sm font-medium">{t(`nav.${item.name}`)}</span>}
              {active && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-600" />
              )}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('sidebar.version')} {appVersion}</p>
          </div>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <div
          className={clsx(
            'fixed inset-0 z-40 bg-gray-600/75 transition-opacity lg:hidden',
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onClose}
        />
        <div
          className={clsx(
            'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:hidden',
            'bg-white dark:bg-gray-800 flex flex-col',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  return (
    <div
      className={clsx(
        'hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col',
        'bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'lg:w-16' : 'lg:w-64'
      )}
    >
      {sidebarContent}
    </div>
  );
}
