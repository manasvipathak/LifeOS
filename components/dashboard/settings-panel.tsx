'use client';

import { signOut } from 'next-auth/react';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

type Profile = {
  name: string;
  email: string;
  timezone: string;
};

type Theme = 'light' | 'dark';

const themeStorageKey = 'lifeos-theme';
const themeChangeEvent = 'lifeos-theme-change';

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function getThemeSnapshot(): Theme {
  try {
    return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getServerThemeSnapshot(): Theme {
  return 'light';
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(themeChangeEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(themeChangeEvent, callback);
    window.removeEventListener('storage', callback);
  };
}

export function SettingsPanel() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const response = await fetch('/api/settings/profile');
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to load profile settings.');

        if (isMounted) {
          const loadedProfile = result.profile as Profile;
          setProfile(loadedProfile);
          setName(loadedProfile.name);
          setTimezone(loadedProfile.timezone);
        }
      } catch (cause) {
        if (isMounted) setError(cause instanceof Error ? cause.message : 'Unable to load profile settings.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'Unable to save profile settings.');

      setProfile(result.profile as Profile);
      setName(result.profile.name);
      setTimezone(result.profile.timezone);
      setMessage('Profile settings saved.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save profile settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function changeTheme(nextTheme: Theme) {
    setError(null);
    setMessage(null);
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
      window.dispatchEvent(new Event(themeChangeEvent));
      setMessage(`Appearance set to ${nextTheme} mode.`);
    } catch {
      setError('This browser could not save the appearance preference.');
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      setError('Unable to sign out right now. Please try again.');
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-surface p-6 sm:p-8" aria-labelledby="profile-settings-heading">
        <div className="flex items-start gap-3">
          <UserRound className="mt-1 h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <h2 id="profile-settings-heading" className="text-lg font-semibold text-slate-900">Profile</h2>
            <p className="mt-1 text-sm text-slate-600">Update the profile details used by your LifeOS workspace.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-slate-600" role="status">Loading profile settings...</p>
        ) : profile ? (
          <form onSubmit={saveProfile} className="mt-6 max-w-2xl space-y-5">
            <div>
              <label htmlFor="profile-name" className="label-text">Name</label>
              <input
                id="profile-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={80}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="label-text">Email</label>
              <input
                id="profile-email"
                type="email"
                value={profile.email}
                readOnly
                aria-describedby="profile-email-help"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-slate-600"
              />
              <p id="profile-email-help" className="mt-1 text-xs text-slate-500">Email is linked to sign-in and cannot be changed here.</p>
            </div>
            <div>
              <label htmlFor="profile-timezone" className="label-text">Timezone</label>
              <input
                id="profile-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                required
                maxLength={64}
                placeholder="America/Los_Angeles"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500">Use an IANA timezone, such as America/Los_Angeles or UTC.</p>
            </div>
            <button type="submit" disabled={isSaving} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-slate-600">Profile details are unavailable right now. Try reloading this page.</p>
        )}
      </section>

      <section className="card-surface p-6 sm:p-8" aria-labelledby="appearance-settings-heading">
        <div className="flex items-start gap-3">
          {theme === 'dark'
            ? <Moon className="mt-1 h-5 w-5 text-brand-700" aria-hidden="true" />
            : <Sun className="mt-1 h-5 w-5 text-brand-700" aria-hidden="true" />}
          <div className="flex-1">
            <h2 id="appearance-settings-heading" className="text-lg font-semibold text-slate-900">Appearance</h2>
            <p className="mt-1 text-sm text-slate-600">Choose a theme for the dashboard. Your choice is saved in this browser.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => changeTheme('light')}
                aria-pressed={theme === 'light'}
                className={theme === 'light' ? 'btn-primary' : 'btn-secondary'}
              >
                <Sun className="mr-2 h-4 w-4" aria-hidden="true" /> Light
              </button>
              <button
                type="button"
                onClick={() => changeTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={theme === 'dark' ? 'btn-primary' : 'btn-secondary'}
              >
                <Moon className="mr-2 h-4 w-4" aria-hidden="true" /> Dark
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card-surface p-6 sm:p-8" aria-labelledby="account-security-heading">
        <div className="flex items-start gap-3">
          <LogOut className="mt-1 h-5 w-5 text-brand-700" aria-hidden="true" />
          <div className="flex-1">
            <h2 id="account-security-heading" className="text-lg font-semibold text-slate-900">Account and security</h2>
            <p className="mt-1 text-sm text-slate-600">Sign out of this LifeOS session on this device.</p>
            <button type="button" onClick={() => void handleSignOut()} disabled={isSigningOut} className="btn-secondary mt-4 disabled:cursor-not-allowed disabled:opacity-60">
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
            <p className="mt-4 text-xs text-slate-500">Password changes and password resets are not available in this application.</p>
          </div>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p> : null}
    </div>
  );
}
