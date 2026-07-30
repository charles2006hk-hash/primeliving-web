import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

function generatePayDollarSecureHash(
  merchantId: string,
  orderRef: string,
  currCode: string,
  amount: string,
  payType: string,
  secureHashSecret: string
): string {
  const str = `${merchantId.trim()}|${orderRef.trim()}|${currCode.trim()}|${amount.trim()}|${payType.trim()}|${secureHashSecret.trim()}`;
  return crypto.createHash('sha1').update(str).digest('hex');
}

const toSafeAscii = (str: string): string => {
  return (str || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40);
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { passcode, region, roomName, tenantName, idNumber, phone, amount, remarks, salesPerson } = body;

    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json({ success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' }, { status: 401, headers: corsHeaders });
    }

    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json({ success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' }, { status: 400, headers: corsHeaders });
    }

    const orderRef = `SQP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    
    // ★ 時間結構補強：為財務報表準備 Date String (YYYY-MM-DD) 與 ISO 時間
    const nowObj = new Date();
    const nowIso = nowObj.toISOString();
    const dateStr = nowIso.slice(0, 10); // 例如 2026-07-30

    const cleanAmountNum = fromCents(paidAmountCents);
    const cleanAmountStr = cleanAmountNum.toFixed(2);

    // ★ 隊列寫入：此時屬於「待支付 / 網關發起中」，狀態先標註為待確定
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
      status: 'Pending',             // 尚未完成刷卡
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned',   // CRM 待配對標記
      gateway: 'PayDollar',
      paymentMethodDetail: '等待網關授權...', // ★ 預設提示
      date: dateStr,                 // ★ 核心修復：相容財務中心日曆
      dueDate: dateStr,              // ★ 核心修復：應收到期日為今日
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(orderRef), quickOrderData);
    
    // ★ 寫入財務大表 transactions，提供齊全的顯示屬性
    batch.set(adminDb.collection('transactions').doc(orderRef), {
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo}`,
      description: `經手人：${quickOrderData.salesPerson} | 備註：${quickOrderData.remarks}`,
      date: dateStr,
      dueDate: dateStr,
      timestamp: Date.now()
    });
    await batch.commit();

    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88888888';
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || 'YOUR_SECRET_KEY';
    const currCode = '344'; 
    const payType = 'N';    

    const secureHash = generatePayDollarSecureHash(
      merchantId, orderRef, currCode, cleanAmountStr, payType, secureHashSecret
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
      payMethod: 'ALL', // 允許客戶在 PayDollar 挑選支付寶、WeChat Pay 或信用卡
      secureHash,
      remark: safeRemark || 'QUICK-PAY'
    };

    return NextResponse.json({ success: true, orderRef, paymentPayload }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error('[Sales Quick-Checkout API Error]:', error);
    return NextResponse.json({ success: false, error: error.message || '無法建立現場收款單' }, { status: 500, headers: corsHeaders });
  }
}
