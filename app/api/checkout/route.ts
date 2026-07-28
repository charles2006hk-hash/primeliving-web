import { NextResponse } from 'next/server';
import crypto from 'crypto';

// ============================================================================
// ⚙️ 環境變數設定 (請確保這些變數已在 Vercel 中設定，絕對不可加上 NEXT_PUBLIC_)
// ============================================================================
const MERCHANT_ID = process.env.PAYDOLLAR_MERCHANT_ID || '';
const SHA_SECRET = process.env.PAYDOLLAR_SHA_SECRET || '';
const PAYDOLLAR_ENV = process.env.PAYDOLLAR_ENV || 'test';

const PAYDOLLAR_ENDPOINT = PAYDOLLAR_ENV === 'production' 
  ? 'https://www.paydollar.com/b2c2/eng/payment/payForm.jsp' 
  : 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp';

export async function POST(req: Request) {
  try {
    // 🛡️ 資安防禦：確保環境變數已正確掛載
    if (!MERCHANT_ID || !SHA_SECRET) {
      console.error('Missing PayDollar Credentials in Server Environment.');
      return NextResponse.json({ success: false, error: '系統支付網關配置錯誤，請聯絡管理員' }, { status: 500 });
    }

    const body = await req.json();
    // ★ 完整保留您的參數：接收 amountDue, tenantId, tenantName, roomInfo, returnUrl
    const { amountDue, tenantId, tenantName, roomInfo, returnUrl, email = '' } = body;

    if (!amountDue || amountDue <= 0) {
      return NextResponse.json({ success: false, error: '繳費金額必須大於 0' }, { status: 400 });
    }

    // ★ 保留業務邏輯：計算 3% 系統處理費
    const fee = Math.round(amountDue * 0.03);
    const totalAmount = amountDue + fee;
    
    // 🧮 財務數據精確性：PayDollar 需要精確至小數點後兩位的字串
    const formattedAmount = Number(totalAmount).toFixed(2);

    // ★ 保留業務邏輯：動態重定向網址
    const origin = returnUrl || 'http://localhost:3000';
    // 建立 PayDollar 專用的訂單編號
    const orderRef = `R-${tenantId}-${Date.now()}`;

    // 💳 PayDollar 固定參數定義
    const currCode = '344'; // 344 為 HKD
    const payType = 'N';    // N = Normal Sale
    const payMethod = 'ALL';// 開放所有可用的支付方式
    const lang = 'C';       // 預設為繁體中文

    // ============================================================================
    // 🔐 Secure Hash 加密簽名生成 (PayDollar Client Post 標準算法)
    // ============================================================================
    const rawString = `${MERCHANT_ID}${orderRef}${currCode}${formattedAmount}${payType}${SHA_SECRET}`;
    const secureHash = crypto.createHash('sha1').update(rawString).digest('hex');

    // 📦 封裝拋送給前端的參數
    const paymentPayload: Record<string, string> = {
      endpoint: PAYDOLLAR_ENDPOINT,
      merchantId: MERCHANT_ID,
      amount: formattedAmount,
      orderRef: orderRef,
      currCode: currCode,
      payType: payType,
      payMethod: payMethod,
      lang: lang,
      secureHash: secureHash,
      // 租客資訊 (PayDollar 會顯示在付款頁面，並可用作對帳)
      payerName: tenantName || '',
      payerEmail: email,
      remark: roomInfo || '', // 帶入房間資訊
      // 將您原本的 success_url 與 cancel_url 對接到 PayDollar 的參數
      successUrl: `${origin}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      cancelUrl: `${origin}/tenant-portal/dashboard?canceled=true`,
      failUrl: `${origin}/tenant-portal/dashboard?failed=true`
    };

    return NextResponse.json({ success: true, paymentPayload });

  } catch (error: any) {
    console.error('PayDollar Checkout API Error:', error);
    return NextResponse.json({ success: false, error: error.message || '內部伺服器錯誤' }, { status: 500 });
  }
}
