import { BookOpen, ExternalLink, TerminalSquare, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Documentation() {
  const { t } = useTranslation();

  const quickLinks = [
    {
      title: t('documentationPage.links.api.title'),
      description: t('documentationPage.links.api.description'),
      href: 'https://api.dockpilot.io',
    },
    {
      title: t('documentationPage.links.github.title'),
      description: t('documentationPage.links.github.description'),
      href: 'https://github.com/marweb/DockPilot',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-white dark:from-primary-900/20 dark:to-gray-800 p-6">
        <div className="flex items-start gap-3">
          <BookOpen className="h-6 w-6 text-primary-600 dark:text-primary-400 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('documentationPage.title')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {t('documentationPage.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TerminalSquare className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('documentationPage.commandsTitle')}
            </h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 font-mono">
            <p>docker system df</p>
            <p>docker logs -f dockpilot-tunnel-control</p>
            <p>
              docker compose -f scripts/docker-compose.yml -f scripts/docker-compose.prod.yml up -d
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('documentationPage.bestPracticesTitle')}
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
            <li>{t('documentationPage.bestPractices.items.0')}</li>
            <li>{t('documentationPage.bestPractices.items.1')}</li>
            <li>{t('documentationPage.bestPractices.items.2')}</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t('documentationPage.linksTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quickLinks.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-gray-100">{link.title}</p>
                <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-primary-600" />
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{link.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
