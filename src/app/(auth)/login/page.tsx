import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // An authenticated visitor has no reason to see the sign-in form.
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to review AI suggestions and track your team&apos;s work.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}