import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">
          Start turning documents into actionable work in under a minute.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}