import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const targetUrl = new URL(url);
    
    // 🚨 核心安全防護：僅允許代理 Firebase Storage 的圖片，防止 SSRF 攻擊
    if (!targetUrl.hostname.includes('firebasestorage.googleapis.com')) {
      return new NextResponse('Forbidden: Domain not allowed', { status: 403 });
    }

    // 透過 Vercel Server 請求 Google 圖片，完美繞過 GFW
    const response = await fetch(targetUrl.toString(), {
      // 確保不會緩存錯誤的響應
      cache: 'force-cache' 
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        // Vercel Edge CDN 緩存策略：邊緣節點緩存 1 天，背景重新驗證期 12 小時
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
      },
    });
  } catch (error) {
    console.error('Image Proxy Error:', error);
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
