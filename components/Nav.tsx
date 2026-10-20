'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { setTheme, useTheme } from '@/lib/theme';

const links = [
  { href: '/', label: 'Workflows' },
  { href: '/credentials', label: 'Credentials' },
  { href: '/executions', label: 'Executions' },
  { href: '/api-access', label: 'API & MCP' },
];

export default function Nav() {
  const path = usePathname();
  const theme = useTheme();
  if (path.startsWith('/form') || path.startsWith('/chat') || path === '/login') return null;
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <nav className="top">
      <span className="brand"><i /> Flowlite</span>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={(l.href === '/' ? path === '/' || path.startsWith('/workflows') : path.startsWith(l.href)) ? 'on' : ''}>
          {l.label}
        </Link>
      ))}
      <span style={{ flex: 1 }} />
      <button className="tbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
      <button className="tbtn" onClick={logout} style={{ marginLeft: 8 }}>Log out</button>
    </nav>
  );
}
