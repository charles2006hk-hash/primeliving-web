import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amountDue, tenantId, tenantName, roomInfo, email, returnUrl } = body;

    // 1. 基礎防呆：確保金額有效
    if (!amountDue || amountDue <= 0) {
      return NextResponse.json({ success: false, error: '結帳金額無效' }, { status: 400 });
    }

    // 2. 計算包含 3% 手續費的總結帳金額 (精確計算)
    const amountInCents = Math.round(amountDue * 100);
    const surchargeCents = Math.round(amountInCents * 0.03);
    const finalAmount = ((amountInCents + surchargeCents) / 100).toFixed(2);

    // 3. 生成本次交易專屬的訂單編號 (Order Reference)
    const orderRef = `ORD-${tenantId.substring(0, 5)}-${Date.now()}`;

    // 4. PayDollar 結帳參數設定
    // ⚠️ 注意：這裡使用的是測試環境 URL，上線後需更改為正式環境 URL
    const endpoint = 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp';
    
    // 這是你開戶信件中的 Merchant ID (測試帳號)
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88168859'; 

    const paymentPayload = {
      endpoint,
      merchantId: merchantId,
      amount: finalAmount,
      orderRef: orderRef,
      currCode: '344', // 344 = HKD (港幣)
      payType: 'N',    // N = Normal Sale
      lang: 'C',       // C = 繁體中文 (可改為 E 英文)
      remark: `${tenantName} - ${roomInfo}`,
      
      // 設定付款完成、失敗、取消後的返回網址 (帶回 orderRef 供前端查驗)
      successUrl: `${returnUrl}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      failUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&cancel=true`,
    };

    // 如果你在 PayDollar 後台有開啟 "Payment Request" 的 Secure Hash，這裡還需要加上 secureHash 計算邏輯。
    // 一般 B2C Client Post 預設不需要，除非你嚴格啟用了雙向 Hash。

    // 回傳參數給前端，讓前端執行 Form POST 跳轉
    return NextResponse.json({ 
      success: true, 
      paymentPayload 
    });

  } catch (error: any) {
    console.error('[PayDollar Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: '伺服器產生結帳請求時發生錯誤，請稍後再試。' }, 
      { status: 500 }
    );
  }
}
