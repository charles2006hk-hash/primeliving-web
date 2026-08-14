import { NextResponse } from 'next/server';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 安全處理特殊字元 (避免 PayDollar 網關因奇怪符號報錯)
const toSafeAscii = (str: string): string => {
  return (str || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40);
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderRef, amount, roomName, payMethod } = body;

    // 基本防呆驗證
    if (!orderRef || !amount) {
      return NextResponse.json(
        { success: false, error: '缺少單號或金額參數' },
        { status: 400, headers: corsHeaders }
      );
    }

// ★ 同步加入後端 API 72小時超時阻擋防護
    if (orderRef) {
      const orderDoc = await adminDb.collection('quick_orders').doc(orderRef).get();
      if (orderDoc.exists) {
        const createdAt = orderDoc.data()?.createdAt;
        if (createdAt) {
          const createdAtTime = new Date(createdAt).getTime();
          const EXPIRY_HOURS = 72;
          if (Date.now() > createdAtTime + EXPIRY_HOURS * 60 * 60 * 1000) {
            return NextResponse.json(
              { success: false, error: '此繳費單已超過 72 小時有效期，請聯繫業務重新開單。' },
              { status: 403, headers: corsHeaders }
            );
          }
        }
      }
    }
    
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    const endpoint = process.env.PAYDOLLAR_PAYMENT_URL || 'https://www.paydollar.com/b2c2/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      console.error('[Generate-Link Error]: 遺漏 PAYDOLLAR_MERCHANT_ID 或 PAYDOLLAR_SECURE_HASH_SECRET');
      return NextResponse.json(
        { success: false, error: '系統正式環境金鑰未正確設定' },
        { status: 500, headers: corsHeaders }
      );
    }

    // 格式化金額，確保為 2 位小數字串 (防浮點數跳錯)
    const cleanAmountStr = Number(amount).toFixed(2);
    const currCode = '344'; // HKD
    const payType = 'N';    // Normal Sale

    // 產生 PayDollar 專屬安全簽章 (Secure Hash)
    const hashStr = [
      merchantId.trim(),
      String(orderRef).trim(),
      currCode,
      cleanAmountStr,
      payType,
      secureHashSecret.trim()
    ].join('|');

    const secureHash = crypto.createHash('sha1').update(hashStr).digest('hex');

    // 處理返回網址 (指向我們剛做好的 payment-status 統一狀態頁面)
    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/payment-status`;
    const safeRemark = `SALES ${toSafeAscii(roomName || '')}`.trim();

    // 映射對應的支付渠道代碼
    let targetPayMethod = 'ALL';
    if (payMethod === 'WECHAT') targetPayMethod = 'WECHATONL';
    else if (payMethod === 'ALIPAY') targetPayMethod = 'ALIPAY';
    else if (payMethod === 'CC') targetPayMethod = 'CC';

    // 組合最終 Payload 返回給前端渲染
    const paymentPayload: Record<string, string> = {
      endpoint,
      merchantId,
      amount: cleanAmountStr,
      orderRef: String(orderRef).trim(),
      currCode,
      mpsMode: 'N',
      successUrl: `${cleanReturnUrl}?success=true&orderRef=${orderRef}`,
      failUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      payType,
      lang: 'C',
      secureHash,
      remark: safeRemark || 'QUICK-PAY',
      payMethod: targetPayMethod 
    };

    return NextResponse.json({
      success: true,
      paymentPayload
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Generate-Link API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '無法產生付款連結' },
      { status: 500, headers: corsHeaders }
    );
  }
}
