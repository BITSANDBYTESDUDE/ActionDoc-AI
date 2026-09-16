'use server';

import { cookies } from 'next/headers';
import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db/connect';
import { User } from '@/models/User';
import { hashPassword, checkPasswordStrength } from '@/lib/auth/password';
import { registerSchema, loginSchema } from '@/lib/validation/organization';
import { createOrganization } from '@/services/organization.service';
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_MAX_AGE } from '@/lib/auth/constants';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ConflictError, ValidationError } from '@/lib/errors';

export interface AuthActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set on success so the client can navigate to the dashboard. */
  redirectTo?: string;
}

/**
 * Register a new account and its first organization.
 *
 * The user is created first, then the organization (which makes them OWNER).
 * If organization creation fails the user is removed again so a half-created
 * account cannot block the email address with no way to sign in usefully.
 */
export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    organizationName: formData.get('organizationName'),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
      ),
    };
  }

  const { name, email, password, organizationName } = parsed.data;

  const strength = checkPasswordStrength(password);
  if (!strength.valid) {
    return { fieldErrors: { password: strength.message ?? 'Choose a stronger password.' } };
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Throttle account creation per email/IP-ish key to slow enumeration.
    await enforceRateLimit({ key: `register:${normalizedEmail}`, limit: 5, windowSeconds: 3600 });

    await connectToDatabase();

    const existing = await User.exists({ email: normalizedEmail });
    if (existing) {
      throw new ConflictError('An account with that email address already exists.');
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });

    let organization;
    try {
      organization = await createOrganization({
        userId: String(user._id),
        userName: user.name,
        name: organizationName,
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id }).catch(() => undefined);
      throw error;
    }

    // Sign the new user in and pin the new organization as active.
    try {
      await signIn('credentials', {
        email: normalizedEmail,
        password,
        redirect: false,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return { error: 'Your account was created. Please sign in to continue.' };
      }
      throw error;
    }

    await setActiveOrganizationCookie(organization.id);

    return { redirectTo: '/dashboard' };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ConflictError) {
      return { error: error.message };
    }
    console.error('[auth] registration failed', error);
    return { error: 'We could not create your account. Please try again.' };
  }
}

/** Sign in with email and password. */
export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
      ),
    };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      redirect: false,
    });
    return { redirectTo: '/dashboard' };
  } catch (error) {
    if (error instanceof AuthError) {
      // Intentionally generic: never reveal whether the email exists.
      return { error: 'Invalid email or password.' };
    }
    console.error('[auth] sign-in failed', error);
    return { error: 'We could not sign you in. Please try again.' };
  }
}

/** Persist the active organization in an http-only cookie. */
export async function setActiveOrganizationCookie(organizationId: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: ACTIVE_ORG_COOKIE,
    value: organizationId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });
}