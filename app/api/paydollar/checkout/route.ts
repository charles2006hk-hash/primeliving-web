import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * 財務仙數運算模組：轉為整數 Cents 處理，消除浮點數累加誤差
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * 移除中文與特殊字元，轉為 PayDollar 最安全的純 ASCII 格式
 */
const toSafeAscii = (str: string): string => {
  return (str || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40);
};

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

    // 1. 嚴格檢查環境變數（無 Sandbox 預設值）
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    const endpoint = process.env.PAYDOLLAR_PAYMENT_URL || 'https://www.paydollar.com/b2c2/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      console.error('[PayDollar Checkout Error]: 遺漏 PAYDOLLAR_MERCHANT_ID 或 PAYDOLLAR_SECURE_HASH_SECRET');
      return NextResponse.json(
        { success: false, error: '系統金鑰設定遺漏，請聯絡管理員。' }, 
        { status: 500 }
      );
    }

    // 2. 基礎防呆
    const subtotalCents = toCents(amountDue);
    if (subtotalCents <= 0) {
      return NextResponse.json({ success: false, error: '結帳金額無效' }, { status: 400 });
    }

    // 3. 核心修復：優先取用傳入的 orderRef，若無則自建唯一訂單編號
    const safePrefix = tenantId && typeof tenantId === 'string' 
      ? tenantId.substring(0, 5).toUpperCase() 
      : 'TENAN';
    const orderRef = providedOrderRef || `ORD-${safePrefix}-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    // 4. 財務精確計算 (分/Cents)：加計 3% 手續費
    const surchargeCents = Math.round(subtotalCents * 0.03);
    const totalAmountCents = subtotalCents + surchargeCents;
    const finalAmountStr = fromCents(totalAmountCents).toFixed(2);

    const currCode = '344'; // HKD
    const payType = 'N';    // Normal Sale

    // 5. 生成 SHA-1 安全簽章
    const hashString = `${merchantId}|${orderRef}|${currCode}|${finalAmountStr}|${payType}|${secureHashSecret}`;
    const secureHash = crypto.createHash('sha1').update(hashString).digest('hex');

    // 6. 處理安全的備註字串（防 ASCII 以外字元報錯）
    const safeRemark = `Tenant-${toSafeAscii(roomInfo)}`.trim();

    // 7. 構建前端表單提交的 Payload
    const paymentPayload = {
      endpoint,
      merchantId,
      amount: finalAmountStr,
      orderRef,
      currCode,
      payType,
      lang: 'C',
      payMethod: 'ALL', // 啟用所有線上支付渠道（微信、支付寶、信用卡等）
      remark: safeRemark,
      secureHash,
      successUrl: `${returnUrl}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      failUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&cancel=true`,
    };

    return NextResponse.json({ 
      success: true, 
      paymentPayload,
      summary: {
        subtotal: fromCents(subtotalCents),
        surcharge: fromCents(surchargeCents),
        totalAmount: fromCents(totalAmountCents)
      }
    });

  } catch (error: any) {
    console.error('[PayDollar Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器生成支付請求失敗: ${error.message}` }, 
      { status: 500 }
    );
  }
}
