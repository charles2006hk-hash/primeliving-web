import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amountDue, tenantId, tenantName, roomInfo, email, returnUrl } = body;

    // 1. 基礎防呆：確保金額有效
    if (!amountDue || Number(amountDue) <= 0) {
      return NextResponse.json({ success: false, error: '結帳金額無效' }, { status: 400 });
    }

    // 2. 嚴格檢查環境變數 (Fail-Fast 原則)
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    
    // 預設走測試機，若設定了正式機環境變數則自動切換
    const endpoint = process.env.PAYDOLLAR_ENDPOINT || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      console.error('[PayDollar Error]: 遺漏環境變數 PAYDOLLAR_MERCHANT_ID 或 PAYDOLLAR_SECURE_HASH_SECRET');
      return NextResponse.json(
        { success: false, error: '系統金鑰設定遺漏，無法發起交易，請聯絡管理員。' }, 
        { status: 500 }
      );
    }

    // 3. 處理浮點數誤差：使用 Cents (分) 精確計算包含 3% 手續費的總額
    const amountInCents = Math.round(Number(amountDue) * 100);
    const surchargeCents = Math.round(amountInCents * 0.03);
    const finalAmount = ((amountInCents + surchargeCents) / 100).toFixed(2); // 確保格式為 0.00

    // 4. 生成訂單編號
    const orderRef = `ORD-${tenantId.substring(0, 5).toUpperCase()}-${Date.now()}`;
    const currCode = '344'; // HKD
    const payType = 'N';    // Normal Sale

    // 5. 計算 Secure Hash (SHA-1)
    const hashString = `${merchantId}|${orderRef}|${currCode}|${finalAmount}|${payType}|${secureHashSecret}`;
    const secureHash = crypto.createHash('sha1').update(hashString).digest('hex');

    // 6. 組合最終 Payload
    const paymentPayload = {
      endpoint,
      merchantId,
      amount: finalAmount,
      orderRef,
      currCode,
      payType,
      lang: 'C', // 預設繁體中文
      remark: `${tenantName} - ${roomInfo}`,
      secureHash,
      successUrl: `${returnUrl}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      failUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&cancel=true`,
    };

    return NextResponse.json({ success: true, paymentPayload });

  } catch (error: any) {
    console.error('[PayDollar Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: '伺服器產生結帳請求時發生錯誤，請稍後再試。' }, 
      { status: 500 }
    );
  }
}
