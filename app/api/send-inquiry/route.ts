import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// ★ 加入這行：強制此 API 為動態路由，防止 Next.js 在 build 階段靜態預先渲染它
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // ★ 修復核心：將實例化移入函式內部，並加入防呆機制
    if (!process.env.RESEND_API_KEY) {
      console.error('Missing RESEND_API_KEY environment variable');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const resend = new Resend(process.env.RESEND_API_KEY);

    const data = await request.json();
    const { school, enrollmentDate, requirements, phone, contactMethod } = data;

    await resend.emails.send({
      from: '系統通知 <onboarding@resend.dev>', // 正式上線請改為已驗證的網域
      to: 'info@primelivinghk.com',
      subject: `🚨 新客戶諮詢：${school}`,
      html: `
        <h2>佳寓官網 - 新租房需求</h2>
        <ul>
          <li><strong>目標地點/學校：</strong> ${school}</li>
          <li><strong>預計入住：</strong> ${enrollmentDate}</li>
          <li><strong>聯絡電話：</strong> ${phone}</li>
          <li><strong>微信/Email：</strong> ${contactMethod}</li>
          <li><strong>特殊要求：</strong> ${requirements || '無'}</li>
        </ul>
        <p>請登入後台系統跟進此客戶。</p>
      `
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
