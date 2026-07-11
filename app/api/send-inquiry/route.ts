import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    const data = await request.json();
    
    // 展開新欄位
    const { name, gender, school, degree, duration, roomType, budget, phone, contactMethod, requirements } = data;

    await resend.emails.send({
      from: '系統通知 <onboarding@resend.dev>', // 正式上線記得改為您的網域
      to: 'info@primelivinghk.com',
      subject: `🚨 新客戶諮詢：${name || '未知客戶'} - ${school}`,
      html: `
        <h2>佳寓官網 - 新租房需求</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-w: 600px;">
          <tr><td width="30%"><strong>稱呼/性別</strong></td><td>${name} (${gender})</td></tr>
          <tr><td><strong>學校/地點</strong></td><td>${school}</td></tr>
          <tr><td><strong>身份</strong></td><td>${degree}</td></tr>
          <tr><td><strong>期望房型</strong></td><td>${roomType}</td></tr>
          <tr><td><strong>租期</strong></td><td>${duration}</td></tr>
          <tr><td><strong>預算 (HKD)</strong></td><td>${budget}</td></tr>
          <tr><td><strong>聯絡電話</strong></td><td>${phone}</td></tr>
          <tr><td><strong>微信 / Email</strong></td><td>${contactMethod}</td></tr>
          <tr><td><strong>備註</strong></td><td>${requirements || '無'}</td></tr>
        </table>
        <p style="margin-top:20px;">請登入大系統後台「客戶需求 CRM」進行跟進。</p>
      `
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
