'use client';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const read = (): Theme => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch {}
  window.dispatchEvent(new Event('themechange'));
}

export function useTheme(): Theme {
  const [t, setT] = useState<Theme>('light');
  useEffect(() => {
    const f = () => setT(read());
    f();
    window.addEventListener('themechange', f);
    return () => window.removeEventListener('themechange', f);
  }, []);
  return t;
}
