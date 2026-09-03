import type { Metadata } from 'next';
import { IBM_Plex_Mono, Unbounded } from 'next/font/google';
import './globals.css';

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
});

const unbounded = Unbounded({
  weight: ['500', '700', '900'],
  subsets: ['latin'],
  variable: '--font-unbounded',
});

export const metadata: Metadata = {
  title: 'PLAYER — strudel song builder',
  description: 'Build songs with Strudel code and visual editors',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${unbounded.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
