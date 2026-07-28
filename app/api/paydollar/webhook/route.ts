// app/api/paydollar/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * 驗證 PayDollar Secure Hash (指定使用 SHA-1)
 */
function verifyPayDollarHash(data: Record<string, string>, secret: string): boolean {
  const { src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secureHash } = data;
  
  if (!secureHash) return false;

  // 嚴格依照 PayDollar 官方順序拼接字串
  const buffer = [src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secret].join('-');
  
  // 使用 SHA-1 進行加密 (根據 PayDollar 後台設定)
  const generatedHash = crypto.createHash('sha1').update(buffer).digest('hex').toUpperCase(); 
  
  return generatedHash === secureHash.toUpperCase();
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    // 1. 處理 PayDollar 表單資料 (解決先前的 400 錯誤)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    }

    const ref = data.Ref;
    const successCode = data.successcode;
    const amt = data.Amt;
    const payRef = data.PayRef;

    // 2. 處理 PayDollar 後台的 Test 按鈕
    if (ref === 'TestDatafeed') {
      console.log('[PayDollar Webhook] Test connection successful.');
      return new NextResponse('OK', { status: 200 });
    }

    // 3. 驗證 Secure Hash 防偽造
    const secret = process.env.PAYDOLLAR_SECURE_SECRET;
    if (!secret) {
      console.error('[Webhook] Missing PAYDOLLAR_SECURE_SECRET in environment variables.');
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    if (!verifyPayDollarHash(data, secret)) {
      console.error(`[Webhook] Invalid Secure Hash for Order: ${ref}`);
      return new NextResponse('Invalid Hash', { status: 400 });
    }

    // 4. 財務數據處理與資料庫更新
    if (successCode === '0') {
      // 處理財務數據時，轉換為最小單位 (Cents) 儲存，徹底避免 JS 浮點數運算誤差
      const amountInCents = Math.round(parseFloat(amt) * 100); 

      console.log(`[Webhook] Verification Passed! Order ${ref} paid. Amount: ${amountInCents} cents.`);

      // TODO: 整合 Firebase Admin SDK 寫入 Firestore
      // 範例:
      // await adminDb.collection('orders').doc(ref).update({
      //   status: 'PAID',
      //   payRef: payRef,
      //   paidAmount: amountInCents,
      //   updatedAt: new Date().toISOString()
      // });
    } else {
      console.log(`[Webhook] Payment Failed or Cancelled for Order ${ref}`);
    }

    // 5. PayDollar 官方要求：成功接收後必須回傳純文字 'OK'
    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error('[PayDollar Webhook] Internal Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
