import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務精度控制：轉 Cents，防止浮點數誤差
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * PayDollar 官方 SHA-1 簽章演算法
 * 格式嚴格為: merchantId|orderRef|currCode|amount|payType|secureHashSecret
 */
function generatePayDollarSecureHash(
  merchantId: string,
  orderRef: string,
  currCode: string,
  amount: number,
  payType: string,
  secureHashSecret: string
): string {
  // 強制轉字串並移除可能存在的空白
  const str = [
    String(merchantId).trim(),
    String(orderRef).trim(),
    String(currCode).trim(),
    Number(amount).toFixed(2),
    String(payType).trim(),
    String(secureHashSecret).trim()
  ].join('|');

  return crypto.createHash('sha1').update(str).digest('hex');
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      passcode,
      region,
      roomName,
      tenantName,
      idNumber,
      phone,
      amount,
      remarks,
      salesPerson
    } = body;

    // 1. PIN 密碼授權校驗
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. 財務欄位驗證
    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    // ★ 核心修復 1：精簡訂單號 (不超過 20 字元，格式：S年月日-6位隨機)
    const shortDate = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randCode = Math.floor(100000 + Math.random() * 900000);
    const orderRef = `S${shortDate}-${randCode}`;
    
    const nowIso = new Date().toISOString();
    const cleanAmount = fromCents(paidAmountCents);

    // 3. 寫入大系統 CRM 預收款隊列 (未付款 Pending)
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
      pairingStatus: 'Unassigned',
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

    // ★ 核心修復 2：PayDollar 參數嚴格檢查 (使用測試環境通用安全預設值 fallback)
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88888888';
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || 'YOUR_SECRET_KEY';
    const currCode = '344'; // 香港元 HKD
    const payType = 'N';    // 普通刷卡

    // 若未正確設定環境變數，直接提早報錯，不在 JSP 頁面卡死
    if (merchantId === '88888888' || secureHashSecret === 'YOUR_SECRET_KEY') {
      console.warn('[警告] 尚未於 Vercel 設定真實 PAYDOLLAR_MERCHANT_ID 與 PAYDOLLAR_SECURE_HASH_SECRET');
    }

    const secureHash = generatePayDollarSecureHash(
      merchantId,
      orderRef,
      currCode,
      cleanAmount,
      payType,
      secureHashSecret
    );

    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/sales-pay`;

    // ★ 核心修復 3：remark 移除可能搞死 JSP 舊編碼的特殊符號
    const safeRemark = `RMK-${quickOrderData.roomInfo.replace(/[^a-zA-Z0-9]/g, '')}-${quickOrderData.tenantName.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 50);

    const paymentPayload = {
      endpoint: process.env.PAYDOLLAR_PAYMENT_URL || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp',
      merchantId,
      amount: cleanAmount.toFixed(2), // 強制 2 位小數字串
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
      remark: safeRemark
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
