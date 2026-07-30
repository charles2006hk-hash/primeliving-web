import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務會計精確運算：轉 Cents (仙) 整數運算，杜絕 JS 浮點數精度誤差
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * PayDollar 官方 SHA-1 簽章演算法
 * 格式：merchantId|orderRef|currCode|amount|payType|secureHashSecret
 */
function generatePayDollarSecureHash(
  merchantId: string,
  orderRef: string,
  currCode: string,
  amount: string, // 強制字串傳入 (例如 "13600.00")
  payType: string,
  secureHashSecret: string
): string {
  const str = [
    String(merchantId).trim(),
    String(orderRef).trim(),
    String(currCode).trim(),
    amount,
    String(payType).trim(),
    String(secureHashSecret).trim()
  ].join('|');

  return crypto.createHash('sha1').update(str).digest('hex');
}

/**
 * 移除特殊符號與中文，轉為 PayDollar 最安全的純英文數字格式
 * 防範 Sandbox JSP 頁面因 ISO-8859-1 編碼崩潰
 */
const toSafeAscii = (str: string): string => {
  return (str || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40);
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      passcode,        // 現場解鎖通行金鑰
      region,          // 物業屋苑
      roomName,        // 單位編號
      tenantName,      // 租客全名
      idNumber,        // 證件號碼 (CRM 事後認領配對)
      phone,           // 聯絡電話
      amount,          // 收款金額
      remarks,         // 備註
      salesPerson      // 經辦銷售員
    } = body;

    // 1. PIN 密碼授權校驗
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. 財務欄位嚴格校驗
    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    // ★ 關鍵對齊 1：使用跟租客端完全對齊的短訂單編號格式 (長度控制在 20 字元內)
    const orderRef = `SQP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    
    const nowIso = new Date().toISOString();
    const cleanAmountNum = fromCents(paidAmountCents);
    const cleanAmountStr = cleanAmountNum.toFixed(2); // 固定兩位小數 (例如 "3000.00")

    // 3. 寫入大系統 CRM 現場收款預收對帳隊列
    const quickOrderData = {
      orderRef,
      region: region || '香港',
      roomName: roomName || '未指定單位',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(),
      phone: phone.trim(),
      amount: cleanAmountNum,
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '內部專員',
      status: 'Pending',
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned', // CRM 待認領標記
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
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo} ($${cleanAmountNum.toLocaleString()})`
    });
    await batch.commit();

    // 4. PayDollar 參數嚴格鏡像對齊租客端
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88888888';
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || 'YOUR_SECRET_KEY';
    const currCode = '344'; // 344 = 香港元 HKD
    const payType = 'N';    // N = Normal Sale
    const lang = 'C';       // C = 繁體中文

    const secureHash = generatePayDollarSecureHash(
      merchantId,
      orderRef,
      currCode,
      cleanAmountStr,
      payType,
      secureHashSecret
    );

    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/sales-pay`;

    // ★ 關鍵對齊 2：備註絕對不送中文和特殊符號，改為標準 ASCII，防範 Sandbox JSP 解碼異常
    const safeRemark = `SALES ${toSafeAscii(quickOrderData.roomName)} ${toSafeAscii(quickOrderData.tenantName)}`.trim();

    const paymentPayload = {
      endpoint: process.env.PAYDOLLAR_PAYMENT_URL || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp',
      merchantId,
      amount: cleanAmountStr,
      orderRef,
      currCode,
      mpsMode: 'N',
      successUrl: `${cleanReturnUrl}?success=true&orderRef=${orderRef}`,
      failUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${cleanReturnUrl}?failed=true&orderRef=${orderRef}`,
      payType,
      lang,
      payMethod: 'ALL',
      secureHash,
      remark: safeRemark || 'QUICK-PAY'
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
