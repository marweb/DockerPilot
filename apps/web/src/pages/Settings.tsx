import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Download,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings as SettingsIcon,
  Shield,
  Clock,
  ArrowUpCircle,
  Loader2,
  Info,
  KeyRound,
  PartyPopper,
} from 'lucide-react';
import api from '../api/client';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  checkedAt: string;
}

interface SystemSettings {
  autoUpdate: boolean;
}

interface UpgradeStatus {
  inProgress: boolean;
  completed?: boolean;
  exitCode?: number;
  targetVersion?: string;
  containerId?: string;
  startedAt?: string;
}

export default function Settings() {
  const { t } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({ autoUpdate: false });
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showUpgradeConfirmModal, setShowUpgradeConfirmModal] = useState(false);
  const [showUpgradeSuccessModal, setShowUpgradeSuccessModal] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState(0);
  const [upgradeStepKey, setUpgradeStepKey] = useState('settings.upgradeProgressPreparing');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch current version info
  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const response = await api.get('/system/check-update');
      setVersionInfo(response.data.data);
    } catch {
      setError(t('settings.updateCheckFailed'));
    } finally {
      setChecking(false);
    }
  }, [t]);

  // Fetch system settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get('/system/settings');
      setSettings(response.data.data);
    } catch {
      // Settings may not exist yet, use defaults
    }
  }, []);

  // Save auto-update setting
  const saveAutoUpdate = async (enabled: boolean) => {
    setSavingSettings(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await api.put('/system/settings', { autoUpdate: enabled });
      setSettings(response.data.data);
      setSuccessMessage(t('settings.settingsSaved'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch {
      setError(t('settings.settingsSaveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const changePassword = async () => {
    setError('');
    setSuccessMessage('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError(t('settings.passwordAllRequired'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('settings.passwordMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('settings.passwordMinLength'));
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMessage(t('settings.passwordChanged'));
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('settings.passwordChangeFailed'));
    } finally {
      setChangingPassword(false);
    }
  };

  // Trigger upgrade
  const triggerUpgrade = async () => {
    if (!versionInfo?.latestVersion) return;

    setShowUpgradeConfirmModal(false);

    setUpgrading(true);
    setUpgradeProgress(12);
    setUpgradeStepKey('settings.upgradeProgressPreparing');
    setError('');
    try {
      await api.post('/system/upgrade', {
        version: versionInfo.latestVersion,
      });
      setUpgradeStatus({
        inProgress: true,
        targetVersion: versionInfo.latestVersion,
      });
      setUpgradeProgress(24);
      setUpgradeStepKey('settings.upgradeProgressDownloading');
      // Start polling for upgrade status
      pollUpgradeStatus();
    } catch (err: unknown) {
      const apiErr = err as { message?: string; code?: string };
      if (apiErr?.code === 'UPGRADE_IN_PROGRESS') {
        setError(t('settings.upgradeAlreadyInProgress'));
      } else {
        setError(apiErr?.message || t('settings.upgradeFailed'));
      }
      setUpgradeProgress(0);
      setUpgrading(false);
    }
  };

  // Poll upgrade status
  const pollUpgradeStatus = useCallback(async () => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (every 5s)

    const poll = async () => {
      attempts++;
      try {
        const response = await api.get('/system/upgrade-status');
        const status = response.data.data as UpgradeStatus;
        setUpgradeStatus(status);

        if (status.inProgress && attempts < maxAttempts) {
          const estimated = Math.min(92, 24 + attempts * 6);
          setUpgradeProgress((prev) => Math.max(prev, estimated));
          setUpgradeStepKey('settings.upgradeProgressDownloading');
          setTimeout(poll, 5000);
        } else {
          setUpgrading(false);
          if (status.completed) {
            setUpgradeProgress(100);
            setUpgradeStepKey('settings.upgradeProgressFinalizing');
            setSuccessMessage(t('settings.upgradeComplete'));
            setShowUpgradeSuccessModal(true);
            setTimeout(() => {
              window.location.reload();
            }, 4500);
          } else if (status.exitCode && status.exitCode !== 0) {
            setError(t('settings.upgradeFailed'));
            setUpgradeProgress(0);
          }
        }
      } catch {
        // If we can't reach the API, the upgrade may be restarting containers
        if (attempts < maxAttempts) {
          setUpgradeStepKey('settings.upgradeProgressRestarting');
          setUpgradeProgress((prev) => Math.max(prev, 94));
          setTimeout(poll, 5000);
        } else {
          setUpgrading(false);
          // Try refreshing to see if the upgrade succeeded
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        }
      }
    };

    setTimeout(poll, 3000); // Wait 3s before first check
  }, [checkForUpdates, t]);

  useEffect(() => {
    checkForUpdates();
    fetchSettings();
  }, [checkForUpdates, fetchSettings]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('settings.title')}
        </h1>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <p className="text-sm text-green-700 dark:text-green-400">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Version & Updates Section */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('settings.versionAndUpdates')}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Version */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('settings.currentVersion')}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {versionInfo?.currentVersion || '...'}
              </p>
            </div>
            <button
              onClick={checkForUpdates}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {t('settings.checkForUpdates')}
            </button>
          </div>

          {/* Update Available Banner */}
          {versionInfo?.updateAvailable && !upgrading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="h-6 w-6 text-blue-500" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      {t('settings.updateAvailable')}
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      {t('settings.newVersionAvailable', {
                        version: versionInfo.latestVersion,
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUpgradeConfirmModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  {t('settings.upgradeNow')}
                </button>
              </div>
            </div>
          )}

          {/* No Update Banner */}
          {versionInfo && !versionInfo.updateAvailable && !upgrading && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300">
                    {t('settings.upToDate')}
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {t('settings.runningLatest')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade In Progress */}
          {upgrading && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-300">
                    {t('settings.upgradeInProgress')}
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    {t('settings.upgradeInProgressDescription', {
                      version: upgradeStatus?.targetVersion || versionInfo?.latestVersion,
                    })}
                  </p>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-yellow-200 dark:bg-yellow-900/40">
                  <div
                    className="h-full rounded-full bg-yellow-500 transition-all duration-700"
                    style={{ width: `${upgradeProgress}%` }}
                  />
                </div>
                <div className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                  {upgradeProgress}%
                </div>
                <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t(upgradeStepKey)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-yellow-100 p-3 dark:bg-yellow-900/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    {t('settings.upgradeWarning')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Last Check Time */}
          {versionInfo?.checkedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('settings.lastChecked')} {new Date(versionInfo.checkedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Auto-Update Section */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('settings.autoUpdate')}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('settings.autoUpdateLabel')}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('settings.autoUpdateDescription')}
              </p>
            </div>
            <button
              onClick={() => saveAutoUpdate(!settings.autoUpdate)}
              disabled={savingSettings}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                settings.autoUpdate ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              } ${savingSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
              role="switch"
              aria-checked={settings.autoUpdate}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.autoUpdate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {settings.autoUpdate && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {t('settings.autoUpdateActive')}
                </p>
              </div>
            </div>
          )}

          {!settings.autoUpdate && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
              <div className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('settings.autoUpdateDisabled')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('settings.changePassword')}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="label">{t('settings.currentPassword')}</label>
            <input
              type="password"
              className="input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('settings.currentPassword')}
            />
          </div>
          <div>
            <label className="label">{t('settings.newPassword')}</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('settings.newPassword')}
            />
          </div>
          <div>
            <label className="label">{t('settings.confirmNewPassword')}</label>
            <input
              type="password"
              className="input"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder={t('settings.confirmNewPassword')}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={changePassword}
              disabled={changingPassword}
              className="btn btn-primary"
              type="button"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.changingPassword')}
                </>
              ) : (
                t('settings.saveNewPassword')
              )}
            </button>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('settings.systemInfo')}
            </h2>
          </div>
        </div>

        <div className="p-6">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('settings.installedVersion')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {versionInfo?.currentVersion || '...'}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('settings.latestVersion')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {versionInfo?.latestVersion || '...'}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('settings.autoUpdateStatus')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {settings.autoUpdate ? (
                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t('settings.enabled')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <XCircle className="h-3.5 w-3.5" />
                    {t('settings.disabled')}
                  </span>
                )}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('settings.updateSchedule')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {settings.autoUpdate ? t('settings.dailyAtMidnight') : t('settings.manualOnly')}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <Modal
        isOpen={showUpgradeConfirmModal}
        onClose={() => setShowUpgradeConfirmModal(false)}
        title={t('settings.upgradeModalTitle')}
        description={t('settings.upgradeModalDescription')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowUpgradeConfirmModal(false)}>
              {t('settings.upgradeCancel')}
            </Button>
            <Button
              variant="primary"
              onClick={triggerUpgrade}
              leftIcon={<ArrowUpCircle className="h-4 w-4" />}
            >
              {t('settings.upgradeConfirmButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/40">
            <span className="font-medium">{t('settings.upgradeModalCurrent')}:</span>{' '}
            {versionInfo?.currentVersion}
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <span className="font-medium">{t('settings.upgradeModalTarget')}:</span>{' '}
            {versionInfo?.latestVersion}
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{t('settings.upgradeModalImpact')}</span>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showUpgradeSuccessModal}
        onClose={() => setShowUpgradeSuccessModal(false)}
        title={t('settings.upgradeSuccessTitle')}
        description={t('settings.upgradeSuccessDescription', {
          version: upgradeStatus?.targetVersion || versionInfo?.latestVersion || '',
        })}
        size="md"
        footer={
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t('errors.goHome')}
          </Button>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          <PartyPopper className="h-5 w-5" />
          <div className="text-sm">
            <p className="font-medium">{t('settings.upgradeSuccessTitle')}</p>
            <p className="text-xs opacity-90">{t('settings.upgradeSuccessReloading')}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
