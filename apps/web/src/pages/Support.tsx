import { LifeBuoy, Bug, MessageCircle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Support() {
  const { t } = useTranslation();

  const channels = [
    {
      title: t('supportPage.channels.bug.title'),
      description: t('supportPage.channels.bug.description'),
      href: 'https://github.com/marweb/DockPilot',
    },
    {
      title: t('supportPage.channels.feature.title'),
      description: t('supportPage.channels.feature.description'),
      href: 'https://github.com/marweb/DockPilot',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-sky-50 to-white dark:from-sky-900/20 dark:to-gray-800 p-6">
        <div className="flex items-start gap-3">
          <LifeBuoy className="h-6 w-6 text-sky-600 dark:text-sky-400 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('supportPage.title')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {t('supportPage.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bug className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('supportPage.checklist.title')}
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
            <li>{t('supportPage.checklist.items.0')}</li>
            <li>{t('supportPage.checklist.items.1')}</li>
            <li>{t('supportPage.checklist.items.2')}</li>
            <li>{t('supportPage.checklist.items.3')}</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('supportPage.include.title')}
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
            <li>{t('supportPage.include.items.0')}</li>
            <li>{t('supportPage.include.items.1')}</li>
            <li>{t('supportPage.include.items.2')}</li>
            <li>{t('supportPage.include.items.3')}</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t('supportPage.channelsTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {channels.map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-sky-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-gray-100">{channel.title}</p>
                <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-sky-600" />
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{channel.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
