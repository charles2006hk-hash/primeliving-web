import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 強制忽略 TypeScript 型別錯誤，強行發佈
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // ★ 加入反向代理 (穿牆隧道) 設定
  async rewrites() {
    return [
      {
        // 攔截前端發往 /firestore-proxy 的請求，由 Vercel 伺服器代發給 Google
        source: '/firestore-proxy/:path*',
        destination: 'https://firestore.googleapis.com/:path*',
      }
    ];
  },
};

export default nextConfig;
