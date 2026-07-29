import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amountDue, tenantId, tenantName, roomInfo, email, returnUrl, payingBillIds } = body;

    if (!amountDue || Number(amountDue) <= 0) {
      return NextResponse.json({ success: false, error: '結帳金額無效' }, { status: 400 });
    }

    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;
    const endpoint = process.env.PAYDOLLAR_ENDPOINT || 'https://test.paydollar.com/b2cDemo/eng/payment/payForm.jsp';

    if (!merchantId || !secureHashSecret) {
      return NextResponse.json({ success: false, error: '系統金鑰設定遺漏' }, { status: 500 });
    }

    const amountInCents = Math.round(Number(amountDue) * 100);
    const surchargeCents = Math.round(amountInCents * 0.03);
    const finalAmount = ((amountInCents + surchargeCents) / 100).toFixed(2);

    const orderRef = `ORD-${tenantId.substring(0, 5).toUpperCase()}-${Date.now()}`;
    const currCode = '344';
    const payType = 'N';

    const hashString = `${merchantId}|${orderRef}|${currCode}|${finalAmount}|${payType}|${secureHashSecret}`;
    const secureHash = crypto.createHash('sha1').update(hashString).digest('hex');

    // ★ 新增：在資料庫先建立一筆 Pending 交易紀錄，記錄哪些帳單正在被繳納
    await setDoc(doc(db, 'transactions', orderRef), {
      orderRef,
      tenantId,
      tenantName,
      roomInfo,
      amount: finalAmount,
      billIds: payingBillIds || [],
      status: 'Pending',
      gateway: 'PayDollar',
      createdAt: serverTimestamp()
    });

    const paymentPayload = {
      endpoint, merchantId, amount: finalAmount, orderRef, currCode, payType,
      lang: 'C', remark: `${tenantName} - ${roomInfo}`, secureHash,
      successUrl: `${returnUrl}/tenant-portal/dashboard?success=true&orderRef=${orderRef}`,
      failUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&orderRef=${orderRef}`,
      cancelUrl: `${returnUrl}/tenant-portal/dashboard?failed=true&cancel=true`,
    };

    return NextResponse.json({ success: true, paymentPayload });

  } catch (error: any) {
    console.error('[PayDollar Checkout Error]:', error);
    return NextResponse.json({ success: false, error: '伺服器錯誤' }, { status: 500 });
  }
}
