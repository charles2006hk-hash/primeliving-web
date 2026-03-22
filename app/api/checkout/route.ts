import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16', 
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // ★ 接收前端傳來的 returnUrl
    const { amountDue, tenantId, tenantName, roomInfo, returnUrl } = body;

    if (!amountDue || amountDue <= 0) {
      return NextResponse.json({ error: "繳費金額必須大於 0" }, { status: 400 });
    }

    // ★ 直接使用前端給的最準確網址
    const origin = returnUrl || 'http://localhost:3000';

    const fee = Math.round(amountDue * 0.03);
    const totalAmount = amountDue + fee;
    const unitAmount = Math.round(totalAmount * 100); 

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'alipay', 'wechat_pay'], 
      payment_method_options: {
        wechat_pay: {
          client: 'web',
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'hkd',
            product_data: {
              name: '租金繳納 (Rent Payment)',
              description: `${tenantName} - ${roomInfo} (含 3% 系統處理費)`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // ★ 這裡的 origin 已經是 100% 準確的了！
      success_url: `${origin}/tenant-portal/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tenant-portal/dashboard?canceled=true`,
      client_reference_id: tenantId, 
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("🔥 Stripe Checkout Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}