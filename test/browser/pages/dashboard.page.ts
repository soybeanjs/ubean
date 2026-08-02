import { BasePage } from './base.page';

/** Page object for the dashboard index (/dashboard) — nested route. */
export class DashboardPage extends BasePage {
  constructor() {
    super('/dashboard');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async goToSettings(): Promise<{ url: string; title: string }> {
    return this.clickNav('a[href="/dashboard/settings"]');
  }

  async goToProfile(): Promise<{ url: string; title: string }> {
    return this.clickNav('a[href="/dashboard/profile"]');
  }
}

/** Page object for /dashboard/settings. */
export class DashboardSettingsPage extends BasePage {
  constructor() {
    super('/dashboard/settings');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}

/** Page object for /dashboard/profile. */
export class DashboardProfilePage extends BasePage {
  constructor() {
    super('/dashboard/profile');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}
