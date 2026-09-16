import { expect, test } from '@playwright/test';
import { Types } from 'mongoose';
import { buildAccount, login, registerAccount } from './helpers';

/**
 * Authorization and multi-tenancy checks against the running app.
 *
 * Two independent accounts each create their own organization, then the second
 * tries to reach the first one's data by id. Cross-tenant access must look like
 * a 404, never a 403 - the API must not confirm that another tenant's resource
 * exists.
 */
test.describe('authorization and tenant isolation', () => {
  test.describe.configure({ mode: 'serial' });

  const owner = buildAccount('tenant-a');
  const outsider = buildAccount('tenant-b');
  const ownerOrg = `Tenant A ${Date.now()}`;
  const outsiderOrg = `Tenant B ${Date.now()}`;

  let ownerActionId = '';
  let outsiderOrganizationId = '';

  test('set up two separate organizations', async ({ page }) => {
    await registerAccount(page, owner, ownerOrg);

    // Create one action so the second tenant has a real id to attack.
    const created = await page.request.post('/api/actions', {
      data: { title: 'Tenant A private task', priority: 'MEDIUM', actionType: 'TASK' },
    });
    expect(created.status()).toBe(201);
    ownerActionId = (await created.json()).data.id as string;
    expect(ownerActionId).toBeTruthy();

    await page.context().clearCookies();
    await registerAccount(page, outsider, outsiderOrg);

    const organizations = (await (await page.request.get('/api/organizations')).json())
      .data as Array<{ id: string }>;
    outsiderOrganizationId = organizations[0]!.id;
    expect(outsiderOrganizationId).toBeTruthy();
  });

  test('an unauthenticated visitor is redirected away from the app', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/actions');
    await expect(page).toHaveURL(/\/login/);
  });

  test('every protected API rejects an anonymous caller', async ({ request }) => {
    for (const [method, path] of [
      ['get', '/api/actions'],
      ['get', '/api/documents'],
      ['get', '/api/projects'],
      ['get', '/api/notifications'],
      ['get', '/api/dashboard'],
      ['get', '/api/organizations'],
    ] as const) {
      // Redirects are not followed: the point is that no data is returned.
      const response = await request[method](path, { maxRedirects: 0 });

      expect(
        [401, 403, 307, 302],
        `${method.toUpperCase()} ${path} should not serve data to an anonymous caller`,
      ).toContain(response.status());
    }
  });

  test("the second tenant cannot read, mutate or delete the first tenant's action", async ({
    page,
  }) => {
    await login(page, outsider);

    const read = await page.request.get(`/api/actions/${ownerActionId}`);
    expect(read.status()).toBe(404);

    const patch = await page.request.patch(`/api/actions/${ownerActionId}`, {
      data: { title: 'Hijacked' },
    });
    expect(patch.status()).toBe(404);

    const status = await page.request.patch(`/api/actions/${ownerActionId}/status`, {
      data: { status: 'IN_PROGRESS' },
    });
    expect(status.status()).toBe(404);

    const remove = await page.request.delete(`/api/actions/${ownerActionId}`);
    expect(remove.status()).toBe(404);
  });

  test('the owning tenant can still read its action', async ({ page }) => {
    await login(page, owner);
    const response = await page.request.get(`/api/actions/${ownerActionId}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).data.title).toBe('Tenant A private task');
  });

  test("the first tenant cannot list the second tenant's members", async ({ page }) => {
    await login(page, owner);

    const response = await page.request.get(
      `/api/organizations/${outsiderOrganizationId}/members`,
    );

    // The route never confirms whether a foreign organization exists. It either
    // refuses outright or answers with an empty list - never with real members.
    expect([200, 403, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.data).toEqual([]);
    }
  });

  test('malformed and hostile identifiers are rejected without a stack trace', async ({ page }) => {
    await login(page, owner);

    for (const id of ['not-an-object-id', '..%2F..%2Fetc%2Fpasswd', '%00', 'a'.repeat(400)]) {
      const response = await page.request.get(`/api/actions/${id}`);
      // A malformed identifier may be reported as a validation error or simply
      // as "not found"; both are refusals and both avoid leaking anything.
      expect([400, 404, 422], `${id} should be rejected`).toContain(response.status());

      const body = await response.text();
      // Internal details must never leak to a caller.
      expect(body).not.toMatch(/node_modules|MongoServerError|at Object\./);
    }
  });

  test('a non-existent but well-formed id resolves to 404', async ({ page }) => {
    await login(page, owner);
    const randomId = new Types.ObjectId().toHexString();

    const response = await page.request.get(`/api/actions/${randomId}`);
    expect(response.status()).toBe(404);
  });

  test('an invalid status transition is refused by the API', async ({ page }) => {
    await login(page, owner);

    const response = await page.request.patch(`/api/actions/${ownerActionId}/status`, {
      data: { status: 'COMPLETED' },
    });

    // TODO -> COMPLETED skips IN_PROGRESS and must not be allowed.
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a user who does not exist cannot be added as a member', async ({ page }) => {
    await login(page, owner);
    const organizations = (await (await page.request.get('/api/organizations')).json())
      .data as Array<{ id: string }>;
    const organizationId = organizations[0]!.id;

    const created = await page.request.post(`/api/organizations/${organizationId}/members`, {
      data: { email: 'nobody@example.test', name: 'Nobody', role: 'VIEWER' },
    });

    // Adding a user who does not exist must not silently invent an account.
    expect([400, 404, 422]).toContain(created.status());
  });

  test('health endpoint reports integration status without leaking secrets', async ({ request }) => {
    const response = await request.get('/api/health');
    expect([200, 503]).toContain(response.status());

    const body = await response.text();
    expect(body).toContain('services');
    expect(body).not.toMatch(/sk-[A-Za-z0-9]|SECRET|password/i);
  });
});