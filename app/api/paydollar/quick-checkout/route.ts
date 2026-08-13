// app/api/paydollar/quick-checkout/route.ts
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
      passcode,
      region,
      roomName,
      tenantName,
      idNumber, // 接收前端傳來的 idNumber
      amount,
      remarks,
      salesPerson,
      payMethod, 
      orderRef: clientOrderRef 
    } = body;

    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // ★ 表單驗證：移除對 phone 的驗證
    const subtotalCents = toCents(amount);
    if (subtotalCents <= 0 || !tenantName) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    const surchargeCents = Math.round(subtotalCents * 0.03);
    const totalAmountCents = subtotalCents + surchargeCents;

    const subtotalNum = fromCents(subtotalCents);
    const surchargeNum = fromCents(surchargeCents);
    const totalAmountNum = fromCents(totalAmountCents);
    const cleanAmountStr = totalAmountNum.toFixed(2);

    const finalOrderRef = clientOrderRef || `SQP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);

    const quickOrderData = {
      orderRef: finalOrderRef,
      region: region || '香港',
      roomName: roomName || '未指定單位',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(), // 確保寫入 Firebase
      subtotal: subtotalNum,
      surcharge: surchargeNum,
      amount: totalAmountNum,
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '內部專員',
      status: 'Pending',
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned',
      gateway: 'PayDollar',
      paymentMethodDetail: '等待網關授權...',
      date: dateStr,
      dueDate: dateStr,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(finalOrderRef), quickOrderData);
    
    batch.set(adminDb.collection('transactions').doc(finalOrderRef), {
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

    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    const endpoint = process.env.PAYDOLLAR_PAYMENT_URL || 'https://www.paydollar.com/b2c2/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      console.error('[Sales Quick-Checkout Error]: 遺漏 PAYDOLLAR_MERCHANT_ID 或 PAYDOLLAR_SECURE_HASH_SECRET');
      return NextResponse.json(
        { success: false, error: '系統正式環境金鑰未正確設定' },
        { status: 500, headers: corsHeaders }
      );
    }

    const currCode = '344'; 
    const payType = 'N';    

    const secureHash = generatePayDollarSecureHash(
      merchantId,
      finalOrderRef,
      currCode,
      cleanAmountStr,
      payType,
      secureHashSecret
    );

    const origin = new URL(request.url).origin;
    const cleanReturnUrl = `${origin}/payment-status`;
    const safeRemark = `SALES ${toSafeAscii(quickOrderData.roomName)}`.trim();

    let targetPayMethod = 'ALL';
    if (payMethod === 'WECHAT') targetPayMethod = 'WECHATONL';
    else if (payMethod === 'ALIPAY') targetPayMethod = 'ALIPAY';
    else if (payMethod === 'CC') targetPayMethod = 'CC';

    const paymentPayload: Record<string, string> = {
      endpoint,
      merchantId,
      amount: cleanAmountStr,
      orderRef: finalOrderRef,
      currCode,
      mpsMode: 'N',
      successUrl: `${cleanReturnUrl}?success=true&orderRef=${finalOrderRef}`,
      failUrl: `${cleanReturnUrl}?failed=true&orderRef=${finalOrderRef}`,
      cancelUrl: `${cleanReturnUrl}?failed=true&orderRef=${finalOrderRef}`,
      payType,
      lang: 'C',
      secureHash,
      remark: safeRemark || 'QUICK-PAY',
      payMethod: targetPayMethod 
    };

    return NextResponse.json({
      success: true,
      orderRef: finalOrderRef,
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
