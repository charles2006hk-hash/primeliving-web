import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PAY_METHOD_MAP: Record<string, string> = {
  'CC': '💳 信用卡 / Visa / Master',
  'VISA': '💳 Visa 信用卡',
  'MASTER': '💳 MasterCard 信用卡',
  'ALIPAY': '📱 支付寶 (Alipay)',
  'ALIPAYHK': '📱 支付寶香港 (AlipayHK)',
  'WECHAT': '💬 微信支付 (WeChat Pay)',
  'WECHATHK': '💬 微信支付香港 (WeChat HK)',
  'FPS': '⚡ 轉數快 (FPS)',
  'UNIONPAY': '🏦 銀聯卡 (UnionPay)',
  'PAYPAL': '🅿️ PayPal',
  'APPLEPAY': '🍎 Apple Pay',
  'GOOGLEPAY': '🇬 Google Pay'
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const { orderRef, payRef, payMethod, passcode } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少單據參考號' }, { status: 400, headers: corsHeaders });
    }

    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (passcode && passcode !== validPin) {
      return NextResponse.json({ success: false, error: '⛔ 授權無效：無核銷權限' }, { status: 401, headers: corsHeaders });
    }

    const cleanMethod = (payMethod || '').toUpperCase();
    const humanPayMethod = PAY_METHOD_MAP[cleanMethod] || `外部渠道 (${cleanMethod || '卡支付'})`;
    const nowIso = new Date().toISOString();

    // ★ 核心修復：動態建立 Payload，如果前端沒拿到 payRef，絕對不要設為 'N/A' 去覆寫 Webhook 的數據！
    const updatePayload: any = {
      status: 'Completed',
      paymentStatus: 'Paid',
      paidAt: nowIso,
      updatedAt: nowIso
    };

    // 只有在前端明確有拿到值時，才寫入 (保留 Webhook 寫的真實紀錄)
    if (payRef && payRef !== 'N/A') {
      updatePayload.payRef = payRef;
    }
    if (payMethod) {
      updatePayload.paymentMethodDetail = humanPayMethod;
    }

    const batch = adminDb.batch();
    
    batch.set(adminDb.collection('quick_orders').doc(orderRef), updatePayload, { merge: true });
    
    // 財務總帳也套用相同邏輯
    const txPayload = { ...updatePayload };
    if (payRef && payRef !== 'N/A') {
      txPayload.subtitle = `付款渠道：${humanPayMethod} | 收據號：${payRef}`;
    }
    
    batch.set(adminDb.collection('transactions').doc(orderRef), txPayload, { merge: true });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `已入帳：${humanPayMethod}`,
      detail: humanPayMethod
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Sales Quick-Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message || '入帳核銷失敗' }, { status: 500, headers: corsHeaders });
  }
}
