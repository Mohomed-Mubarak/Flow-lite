import './globals.css';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';

export const metadata = { title: 'Flowlite', description: 'Light workflow automation' };

const themeScript = `try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
