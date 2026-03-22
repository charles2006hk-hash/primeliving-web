import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16', 
});

export async function GET(req: Request) {
  // 從網址中抓取 session_id
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    // 向 Stripe 查詢這筆交易的真實狀態
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    return NextResponse.json({
      payment_status: session.payment_status, // 'paid', 'unpaid', etc.
      amount_total: session.amount_total,     // 總金額 (包含 3% 手續費)
      tenantId: session.client_reference_id   // 我們剛剛綁定的租客 ID
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}