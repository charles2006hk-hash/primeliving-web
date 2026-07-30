import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ★ PayDollar 官方支付渠道代號翻譯字典
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
    const { orderRef, payRef, payMethod } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少單據參考號' }, { status: 400, headers: corsHeaders });
    }

    // 翻譯成清晰的中文財務支付標記
    const cleanMethod = (payMethod || '').toUpperCase();
    const humanPayMethod = PAY_METHOD_MAP[cleanMethod] || `外部渠道 (${cleanMethod || '卡支付'})`;
    const nowIso = new Date().toISOString();

    const updatePayload = {
      status: 'Completed',               // ★ 正式完成入帳
      paymentStatus: 'Paid',             // ★ 轉為已收款 (Paid)
      payRef: payRef || 'N/A',           // PayDollar 收據號
      paymentMethodDetail: humanPayMethod, // ★ 記下 WeChat Pay / 支付寶 / 信用卡
      paidAt: nowIso,
      updatedAt: nowIso
    };

    const batch = adminDb.batch();
    batch.update(adminDb.collection('quick_orders').doc(orderRef), updatePayload);
    
    // ★ 同步更新大財務中心的應收單據，把狀態改為「已收 (Paid)」並加註支付細節
    batch.update(adminDb.collection('transactions').doc(orderRef), {
      ...updatePayload,
      description: adminDb.FieldValue.delete(), // 移除舊的描述，替換為完整的財務細節
      subtitle: `付款渠道：${humanPayMethod} | 收據號：${payRef || '網關確認'}`
    });

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
