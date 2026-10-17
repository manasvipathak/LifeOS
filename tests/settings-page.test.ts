/// <reference types="vitest/globals" />

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

import SettingsPage from '@/app/(dashboard)/dashboard/settings/page';

describe('dashboard Settings page', () => {
  it('renders the functional settings panel instead of a placeholder', () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('Profile');
    expect(markup).toContain('Appearance');
    expect(markup).toContain('Account and security');
    expect(markup).toContain('Loading profile settings...');
    expect(markup).toContain('Light');
    expect(markup).toContain('Dark');
    expect(markup).toContain('Sign out');
    expect(markup).not.toMatch(/coming soon/i);
  });
});
