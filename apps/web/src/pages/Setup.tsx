import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setup, setupComplete, checkSetupStatus } = useAuthStore();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const check = async () => {
      await checkSetupStatus();
      setChecking(false);
    };
    check();
  }, [checkSetupStatus]);

  useEffect(() => {
    if (!checking && setupComplete === true) {
      navigate('/login', { replace: true });
    }
  }, [checking, setupComplete, navigate]);

  // Password strength checks
  const passwordChecks = useMemo(
    () => [
      { key: 'length', pass: password.length >= 8, label: t('setup.reqMinLength') },
      { key: 'upper', pass: /[A-Z]/.test(password), label: t('setup.reqUppercase') },
      { key: 'lower', pass: /[a-z]/.test(password), label: t('setup.reqLowercase') },
      { key: 'number', pass: /[0-9]/.test(password), label: t('setup.reqNumber') },
      {
        key: 'special',
        pass: /[^A-Za-z0-9]/.test(password),
        label: t('setup.reqSpecial'),
      },
    ],
    [password, t]
  );

  const allChecksPassed = passwordChecks.every((c) => c.pass);
  const passwordsMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('setup.passwordMismatch'));
      return;
    }

    if (!allChecksPassed) {
      const failing = passwordChecks.filter((c) => !c.pass).map((c) => c.label);
      setError(failing.join('. '));
      return;
    }

    setLoading(true);

    try {
      await setup(username, password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const apiError = err as { message?: string; details?: string[] };
      if (apiError?.details && Array.isArray(apiError.details)) {
        setError(apiError.details.join('. '));
      } else if (apiError?.message) {
        setError(apiError.message);
      } else {
        setError(t('setup.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="DockPilot"
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">DockPilot</h1>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t('setup.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('setup.description')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6">
            {/* Error */}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('setup.username')}
                </label>
                <div className="relative">
                  <div className="input-icon-left">
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="input input-has-left-icon"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('setup.password')}
                </label>
                <div className="relative">
                  <div className="input-icon-left">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="input input-has-left-icon input-has-right-icon"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="input-icon-right-btn"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Requirements - Checklist */}
                {password.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
                    <ul className="space-y-1.5">
                      {passwordChecks.map((check) => (
                        <li key={check.key} className="flex items-center gap-2">
                          {check.pass ? (
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                          ) : (
                            <X className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                          )}
                          <span
                            className={`text-xs ${
                              check.pass
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {check.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('setup.confirmPassword')}
                </label>
                <div className="relative">
                  <div className="input-icon-left">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    className={`input input-has-left-icon input-has-right-icon ${
                      confirmPassword.length > 0
                        ? passwordsMatch
                          ? 'border-green-400 focus:ring-green-500'
                          : 'border-red-400 focus:ring-red-500'
                        : ''
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="input-icon-right-btn"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                    <X className="h-3 w-3" />
                    {t('setup.passwordMismatch')}
                  </p>
                )}
                {passwordsMatch && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <Check className="h-3 w-3" />
                    {t('setup.passwordsMatch')}
                  </p>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !allChecksPassed || !passwordsMatch}
              className="btn btn-primary w-full mt-6 py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('setup.creating')}
                </>
              ) : (
                t('setup.create')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
