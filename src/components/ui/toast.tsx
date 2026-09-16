'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}

const TONE_ICON: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-[color-mix(in_oklch,var(--color-success)_80%,black)]',
  error: 'text-destructive',
  info: 'text-[color-mix(in_oklch,var(--color-info)_85%,black)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const toast = React.useCallback(
    ({ title, description, tone = 'info' }: { title: string; description?: string; tone?: ToastTone }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, title, description, tone }]);
    },
    [],
  );

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={6000}>
        {children}
        {toasts.map((item) => {
          const Icon = TONE_ICON[item.tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
              className={cn(
                'group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg',
                'data-[state=open]:animate-in-up',
              )}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[item.tone])} aria-hidden="true" />
              <div className="flex-1 space-y-1">
                <ToastPrimitive.Title className="text-sm font-medium">{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-xs text-muted-foreground">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export { ToastPrimitive };