// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { ThemeProvider } from '@/components/ThemeProvider';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#090d16' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5.0,
  userScalable: true,
  viewportFit: 'cover', // 필수 통합 선언
};

export const metadata: Metadata = {
  title: '초·중등 수학 홈코치 AI',
  description: '초·중등 전 학년 수학 채점 및 학부모 지도 코칭 리포트',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '수학홈코치',
  },
  icons: {
    icon: [
      { url: '/icon-192.png?v=1', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png?v=1', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png?v=1', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthGuard>{children}</AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}