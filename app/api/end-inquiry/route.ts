import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// 請在 Vercel 環境變數中設定 RESEND_API_KEY
const resend = new Resend(process.env.RESEND_API_KEY); 

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { school, enrollmentDate, requirements, phone, contactMethod } = data;

    await resend.emails.send({
      from: '系統通知 <noreply@primelivinghk.com>', // 需在 Resend 驗證您的網域
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
        <p>請盡快登入後台 CRM 系統跟進此客戶。</p>
      `
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
  }
}
