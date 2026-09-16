import Link from 'next/link';
import { FileStack } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/config/constants';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[oklch(0.24_0.05_264)] p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,oklch(0.55_0.19_264/0.55),transparent),radial-gradient(50%_40%_at_90%_80%,oklch(0.6_0.15_240/0.35),transparent)]"
        />
        <Link href="/" className="relative flex items-center gap-2 text-sm font-semibold">
          <FileStack className="size-5" aria-hidden="true" />
          {APP_NAME}
        </Link>

        <div className="relative max-w-md space-y-6">
          <p className="text-3xl font-semibold leading-tight text-balance">{APP_TAGLINE}</p>
          <p className="text-sm leading-relaxed text-white/70">
            Upload meeting notes, specs and client documents. ActionDoc AI extracts the tasks, owners
            and deadlines inside them - then your team reviews and approves every one before it becomes
            real work.
          </p>

          <ol className="space-y-3 text-sm text-white/80">
            {[
              'Upload a document',
              'AI extracts candidate actions with evidence',
              'Your team reviews and approves',
              'Track the work to completion',
            ].map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/25 text-xs">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <p className="text-xs text-white/50">
            AI suggests. Humans approve. The system executes and tracks.
          </p>
        </div>

        <p className="relative text-xs text-white/40">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}