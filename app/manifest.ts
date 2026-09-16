// app/manifest.ts
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '초·중등 수학 홈코치 AI',
    short_name: '수학홈코치',
    description: '초·중등 전 학년 수학 채점 및 학부모 지도 코칭 리포트',
    start_url: '/',
    display: 'standalone', // 브라우저 상·하단 UI(주소창 등)를 숨겨 진짜 앱처럼 표시
    background_color: '#f8fafc',
    theme_color: '#4f46e5',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}