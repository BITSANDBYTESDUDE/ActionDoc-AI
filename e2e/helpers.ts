import { expect, type Page } from '@playwright/test';

export interface TestAccount {
  email: string;
  password: string;
  name: string;
}

/** Unique account details per run so repeated runs never collide. */
export function buildAccount(prefix = 'e2e'): TestAccount {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return {
    name: `E2E User ${stamp}`,
    email: `${prefix}-${stamp}@example.test`,
    password: 'E2EPassword123!',
  };
}

/**
 * Register a brand-new account through the real UI.
 *
 * The register form creates the user's first organization inline, so a
 * successful registration lands the user inside their new workspace with no
 * separate onboarding step.
 */
export async function registerAccount(
  page: Page,
  account: TestAccount,
  organizationName: string,
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/your name/i).fill(account.name);
  await page.getByLabel(/^organization$/i).fill(organizationName);
  await page.getByLabel(/work email/i).fill(account.email);
  await page.getByLabel(/^password/i).fill(account.password);

  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).not.toHaveURL(/\/register$/, { timeout: 30_000 });
}

export async function login(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(account.email);
  await page.getByLabel(/^password/i).fill(account.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

/** Sign out via the user menu so the next test starts clean. */
export async function logout(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /account|profile|user menu/i }).first();
  if (await trigger.count()) {
    await trigger.click();
    const signOut = page.getByRole('menuitem', { name: /sign out|log out/i }).first();
    if (await signOut.count()) {
      await signOut.click();
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 }).catch(() => undefined);
    }
  }
}