import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務會計精確運算：轉仙 (Cents) 處理，防止 IEEE 754 浮點數運算誤差
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * PayDollar 官方 SHA-1 安全加密簽章演算法
 */
function generatePayDollarSecureHash(
  merchantId: string,
  orderRef: string,
  currCode: string,
  amount: number,
  payType: string,
  secureHashSecret: string
): string {
  const str = `${merchantId}|${orderRef}|${currCode}|${amount}|${payType}|${secureHashSecret}`;
  return crypto.createHash('sha1').update(str).digest('hex');
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      passcode,        // 內部現場解鎖金鑰
      region,          // 屋苑/大廈
      roomName,        // 單位編號
      tenantName,      // 租客姓名
      idNumber,        // 證件編號
      phone,           // 聯絡電話
      amount,          // 收款金額
      remarks,         // 備註用途
      salesPerson      // 經辦人
    } = body;

    // 1. 權限防禦：檢查通行金鑰 (對比 Vercel Environment Variables)
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. 財務精度與必要欄位驗證
    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    const orderRef = `SALES-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();
    const cleanAmount = fromCents(paidAmountCents);

    // 3. 建立現場未歸戶預收款隊列 (純守 Pending 狀態，等待金流 Webhook 觸發付訖)
    const quickOrderData = {
      orderRef,
      region: region || '香港',
      roomName: roomName || '未指定單位',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(),
      phone: phone.trim(),
      amount: cleanAmount,
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '內部專員',
      status: 'Pending',
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned',  // CRM 待配對標記
      gateway: 'PayDollar',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(orderRef), quickOrderData);
    batch.set(adminDb.collection('transactions').doc(orderRef), {
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo} ($${cleanAmount.toLocaleString()})`
    });
    await batch.commit();

    // 4. PayDollar 參數配置與 SHA-1 簽章 (直接使用環境變數或專案商戶設定)
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88888888'; // 請確保 Vercel 已設 PAYDOLLAR_MERCHANT_ID
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || 'YOUR_SECRET_KEY';
    const currCode = '344'; // 344 = HKD
    const payType = 'N';    // N = Normal Sale

    const secureHash = generatePayDollarSecureHash(
      merchantId,
      orderRef,
      currCode,
      cleanAmount,
      payType,
      secureHashSecret
    );

    // ★ 核心修復：嚴格定義絕對回傳 URL，絕不二次拼接，導回 /sales-pay
    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/sales-pay`;

    const paymentPayload = {
      endpoint: process.env.PAYDOLLAR_PAYMENT_URL || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp',
      merchantId,
      amount: cleanAmount,
      orderRef,
      currCode,
      mpsMode: 'N',
      successUrl: `${cleanReturnUrl}?success=true&orderRef=${orderRef}`,
      failUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      payType,
      lang: 'C',        // 繁體中文
      payMethod: 'ALL', // 支援信用卡、FPS 等全部付款方式
      secureHash,
      remark: `${quickOrderData.roomInfo} - ${quickOrderData.tenantName}`
    };

    return NextResponse.json({
      success: true,
      orderRef,
      paymentPayload
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Sales Quick-Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '無法建立現場收款單' },
      { status: 500, headers: corsHeaders }
    );
  }
}
