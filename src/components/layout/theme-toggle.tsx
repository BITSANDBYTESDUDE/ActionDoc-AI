'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    if (root.classList.contains('dark')) {
      setTheme('dark');
    } else if (root.classList.contains('light')) {
      setTheme('light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {
      // ignore storage errors
    }
  };

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" className="size-9">
        <Sun className="size-4 opacity-0" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
      title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
      className="size-9 transition-colors"
    >
      {theme === 'dark' ? (
        <Sun className="size-4 text-amber-400 hover:text-amber-300 transition-transform duration-200" />
      ) : (
        <Moon className="size-4 text-slate-700 hover:text-slate-900 transition-transform duration-200" />
      )}
    </Button>
  );
}
