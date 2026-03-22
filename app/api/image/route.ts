import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    // 讓 Vercel 伺服器 (海外) 去向 Google 拿圖片，完美繞過 GFW 與解碼問題
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    
    const buffer = await response.arrayBuffer();
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        // 加上 Vercel CDN 快取機制，讓租客第二次看圖瞬間秒開！
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
      },
    });
  } catch (error) {
    console.error('Image Proxy Error:', error);
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
