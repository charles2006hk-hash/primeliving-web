// app/api/paydollar/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
// 假設您已經在 lib/firebase-admin 初始化了 admin SDK
// import { customInitApp } from '@/lib/firebase-admin';
// import { getFirestore } from 'firebase-admin/firestore';

// PayDollar Hash 生成函數 (請根據 PayDollar 官方技術文件的欄位順序調整)
function verifySecureHash(data: Record<string, string>, secret: string): boolean {
  // PayDollar 通常的串接順序 (請務必核對您的 PayDollar 商家技術文件)
  // 常用順序: src-prc-successcode-Ref-PayRef-Cur-Amt-payerAuth-Secret
  const { src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secureHash } = data;
  
  if (!secureHash) return false;

  const buffer = [src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secret].join('-');
  // PayDollar 舊版為 sha1，新版建議 sha256
  const generatedHash = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase(); 
  
  return generatedHash === secureHash.toUpperCase();
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    }

    const { Ref: ref, successcode, PayRef: payRef, Amt: amt } = data;

    // 1. 測試按鈕放行
    if (ref === 'TestDatafeed') {
      return new NextResponse('OK', { status: 200 });
    }

    // 2. 驗證 Secure Hash (安全防護：防止偽造付款成功通知)
    const secret = process.env.PAYDOLLAR_SECURE_SECRET;
    if (!secret) {
      console.error('[Webhook] Missing PAYDOLLAR_SECURE_SECRET env variable');
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    if (!verifySecureHash(data, secret)) {
      console.error(`[Webhook] Invalid Secure Hash for Order: ${ref}`);
      return new NextResponse('Invalid Hash', { status: 400 });
    }

    // 3. 處理財務邏輯與資料庫更新
    if (successcode === '0') {
      // customInitApp();
      // const db = getFirestore();
      
      // 【財務數據處理原則】：避免 JS 浮點數誤差，建議轉為最小單位 (如 Cents) 儲存或整數運算
      const amountInCents = Math.round(parseFloat(amt) * 100); 

      // 範例：更新 Firestore 中的訂單狀態
      // await db.collection('orders').doc(ref).update({
      //   status: 'PAID',
      //   payRef: payRef,
      //   paidAmount: amountInCents,
      //   paidAt: new Date().toISOString()
      // });
      
      console.log(`[Webhook] Order ${ref} paid successfully. PayRef: ${payRef}`);
    }

    // 4. PayDollar 要求的成功回傳值
    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error('[PayDollar Webhook Error]:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
