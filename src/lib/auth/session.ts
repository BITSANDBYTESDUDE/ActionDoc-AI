import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { UnauthorizedError } from '@/lib/errors';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/constants';
import type { SessionUser } from '@/types';

export { ACTIVE_ORG_COOKIE };

/**
 * Returns the authenticated session user or null. Never trusts client-supplied
 * user ids - the id always comes from the signed session token.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    image: user.image ?? null,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * The active organization is chosen by the user but always re-validated against
 * the membership collection before it is trusted.
 */
export async function readActiveOrganizationId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_ORG_COOKIE)?.value;
  return value && /^[a-f\d]{24}$/i.test(value) ? value : null;
}