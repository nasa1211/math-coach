// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthGuard from '@/components/AuthGuard'; // 추가

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
    <html lang="ko">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}