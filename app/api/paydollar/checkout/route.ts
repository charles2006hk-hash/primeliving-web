import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      amountDue, 
      tenantId, 
      tenantName, 
      roomInfo, 
      returnUrl, 
      orderRef: providedOrderRef 
    } = body;

    // 1. 金鑰與環境變數嚴格檢查
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    const endpoint = process.env.PAYDOLLAR_ENDPOINT || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      console.error('[PayDollar Checkout Error]: 遺漏環境變數 PAYDOLLAR_MERCHANT_ID 或 PAYDOLLAR_SECURE_HASH_SECRET');
      return NextResponse.json(
        { success: false, error: '系統金鑰設定遺漏，請聯絡管理員。' }, 
        { status: 500 }
      );
    }

    // 2. 基礎防呆：金額不能小於等於 0
    if (!amountDue || Number(amountDue) <= 0) {
      return NextResponse.json({ success: false, error: '結帳金額無效' }, { status: 400 });
    }

    // 3. ★ 核心修復：優先取用前端傳的 orderRef，若無則自建，並對 tenantId 使用安全的可選串接
    const safePrefix = tenantId && typeof tenantId === 'string' 
      ? tenantId.substring(0, 5).toUpperCase() 
      : 'TENAN';
    
    const orderRef = providedOrderRef || `ORD-${safePrefix}-${Date.now()}`;

    // 4. 財務精確計算 (分/Cents)：包含 3% 金流處理費
    const amountInCents = Math.round(Number(amountDue) * 100);
    const surchargeCents = Math.round(amountInCents * 0.03);
    const finalAmount = ((amountInCents + surchargeCents) / 100).toFixed(2); // 保持 PayDollar 要求的 0.00 格式

    const currCode = '344'; // HKD
    const payType = 'N';    // Normal Sale

    // 5. 生成 SHA-1 安全雜湊簽章 (MerchantId|OrderRef|CurrCode|Amount|PayType|SecureHashSecret)
    const hashString = `${merchantId}|${orderRef}|${currCode}|${finalAmount}|${payType}|${secureHashSecret}`;
    const secureHash = crypto.createHash('sha1').update(hashString).digest('hex');

    // 6. 回傳 Payload 供前端自動 POST 表單跳轉
    const paymentPayload = {
      endpoint,
      merchantId,
      amount: finalAmount,
      orderRef,
      currCode,
      payType,
      lang: 'C', // 繁體中文
      remark: `${tenantName || 'Tenant'} - ${roomInfo || ''}`,
      secureHash,
      successUrl: `${returnUrl}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      failUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&cancel=true`,
    };

    return NextResponse.json({ success: true, paymentPayload });

  } catch (error: any) {
    console.error('[PayDollar Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器生成支付請求失敗: ${error.message}` }, 
      { status: 500 }
    );
  }
}
