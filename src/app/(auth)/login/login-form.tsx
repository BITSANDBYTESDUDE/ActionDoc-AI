'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, type AuthActionState } from '@/app/(auth)/actions';

const initialState: AuthActionState = {};

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  // `useActionState` gives no built-in redirect for programmatic sign-in, so
  // navigate once the action reports success.
  useEffect(() => {
    if (!state.redirectTo) return;
    router.replace(state.redirectTo);
    router.refresh();
  }, [state.redirectTo, router]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {state.fieldErrors?.email ? (
          <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        New to ActionDoc AI?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}