import * as React from 'react';
import { cn } from '@/lib/utils';

const baseFieldClasses =
  'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        baseFieldClasses,
        'file:mr-3 file:border-0 file:bg-transparent file:text-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(baseFieldClasses, 'h-auto min-h-20 py-2 leading-relaxed', className)}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

/**
 * Native select styled to match the rest of the form controls. The caret is
 * drawn by the `.select-caret` utility in globals.css so no image request is
 * needed and it inherits the current theme colours.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(baseFieldClasses, 'select-caret cursor-pointer pr-8', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export { Input, Textarea, Select, baseFieldClasses };