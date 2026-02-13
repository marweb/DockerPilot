import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Book, Heart } from 'lucide-react';
import api from '../../api/client';

interface FooterProps {
  showVersion?: boolean;
  showLinks?: boolean;
  className?: string;
}

const docLinks = [
  { name: 'documentation', href: 'https://docs.dockpilot.io', external: true },
  { name: 'api', href: 'https://api.dockpilot.io', external: true },
  { name: 'github', href: 'https://github.com/dockpilot', external: true },
];

export default function Footer({
  showVersion = true,
  showLinks = true,
  className = '',
}: FooterProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    api.get('/system/version')
      .then((res) => {
        setAppVersion(res.data?.data?.currentVersion || '...');
      })
      .catch(() => {
        setAppVersion('...');
      });
  }, []);

  return (
    <footer
      className={`border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>© {currentYear} DockPilot</span>
            <span className="hidden sm:inline">·</span>
            <span className="flex items-center gap-1">
              {t('footer.madeWith')} <Heart className="h-3 w-3 text-red-500 fill-red-500" />
            </span>
          </div>

          {showLinks && (
            <div className="flex items-center gap-4">
              {docLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  {t(`footer.${link.name}`)}
                </a>
              ))}
            </div>
          )}

          {showVersion && (
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/dockpilot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://docs.dockpilot.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Documentation"
              >
                <Book className="h-5 w-5" />
              </a>
              <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                v{appVersion}
              </span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
