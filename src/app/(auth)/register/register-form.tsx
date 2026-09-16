'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerAction, type AuthActionState } from '@/app/(auth)/actions';

const initialState: AuthActionState = {};

export function RegisterForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(registerAction, initialState);

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
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" required placeholder="Alex Morgan" />
        {state.fieldErrors?.name ? (
          <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="organizationName">Organization</Label>
        <Input
          id="organizationName"
          name="organizationName"
          required
          placeholder="Northwind Delivery"
          aria-describedby="organizationName-hint"
        />
        <p id="organizationName-hint" className="text-xs text-muted-foreground">
          You will be the owner of this workspace.
        </p>
        {state.fieldErrors?.organizationName ? (
          <p className="text-xs text-destructive">{state.fieldErrors.organizationName}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
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
          autoComplete="new-password"
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters, including a letter and a number.
        </p>
        {state.fieldErrors?.password ? (
          <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Creating your workspace…' : 'Create account'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}