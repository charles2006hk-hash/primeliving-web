import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務會計精確運算：轉仙 (Cents) 整數運算，杜絕 JS 浮點數精度誤差
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
  amount: string, // 強制固定兩位小數字串傳入 (例如 "1030.00")
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
 * 移除中文與特殊字元，轉為 PayDollar 最安全的純 ASCII 格式
 * 避免舊版 Sandbox JSP 頁面因 ISO-8859-1 解碼異常
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
      passcode,        // 內部通行密碼
      region,          // 物業大廈
      roomName,        // 房間單位
      tenantName,      // 租客全名
      idNumber,        // 證件號碼 (CRM 對帳)
      phone,           // 聯絡電話
      amount,          // ★ 客戶輸入之本金金額 (Subtotal)
      remarks,         // 備註用途
      salesPerson      // 經辦人
    } = body;

    // 1. PIN 密碼授權校驗
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. ★ 財務仙數運算：計算本金、3% 手續費與刷卡總金額
    const subtotalCents = toCents(amount);
    if (subtotalCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 手續費率 = 3%
    const surchargeCents = Math.round(subtotalCents * 0.03);
    const totalAmountCents = subtotalCents + surchargeCents;

    const subtotalNum = fromCents(subtotalCents);
    const surchargeNum = fromCents(surchargeCents);
    const totalAmountNum = fromCents(totalAmountCents);
    const cleanAmountStr = totalAmountNum.toFixed(2); // 傳給 PayDollar 須為固定兩位小數字串

    // 3. 產生與租客端對齊的短單號結構
    const orderRef = `SQP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10); // YYYY-MM-DD

    // 4. 建立現場收帳單據隊列 (記錄完整的本金與手續費明細)
    const quickOrderData = {
      orderRef,
      region: region || '香港',
      roomName: roomName || '未指定單位',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(),
      phone: phone.trim(),
      subtotal: subtotalNum,            // ★ 本金
      surcharge: surchargeNum,          // ★ 3% 手續費
      amount: totalAmountNum,           // ★ 總收款額 (包含手續費)
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '內部專員',
      status: 'Pending',
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned',      // CRM 未認領標識
      gateway: 'PayDollar',
      paymentMethodDetail: '等待網關授權...',
      date: dateStr,
      dueDate: dateStr,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(orderRef), quickOrderData);
    
    // 寫入財務中心主表，副標題加上手續費備註
    batch.set(adminDb.collection('transactions').doc(orderRef), {
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo}`,
      description: `經手人：${quickOrderData.salesPerson} | 本金 $${subtotalNum.toLocaleString()} + 3%手續費 $${surchargeNum.toLocaleString()} | 備註：${quickOrderData.remarks}`,
      date: dateStr,
      dueDate: dateStr,
      timestamp: Date.now()
    });
    await batch.commit();

    // 5.PayDollar 參數配置與安全 SHA-1 加密
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88888888';
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || 'YOUR_SECRET_KEY';
    const currCode = '344'; // 344 = 香港元 HKD
    const payType = 'N';    // N = Normal Sale

    const secureHash = generatePayDollarSecureHash(
      merchantId,
      orderRef,
      currCode,
      cleanAmountStr, // ★ 傳入加計 3% 後的總金額
      payType,
      secureHashSecret
    );

    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/sales-pay`;
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
      lang: 'C',
      payMethod: 'ALL',
      secureHash,
      remark: safeRemark || 'QUICK-PAY'
    };

    return NextResponse.json({
      success: true,
      orderRef,
      paymentPayload,
      summary: {
        subtotal: subtotalNum,
        surcharge: surchargeNum,
        totalAmount: totalAmountNum
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Sales Quick-Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '無法建立現場收款單' },
      { status: 500, headers: corsHeaders }
    );
  }
}
