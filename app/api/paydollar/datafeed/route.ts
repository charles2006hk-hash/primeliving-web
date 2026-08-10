import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

/**
 * PayDollar Secure Hash 驗證邏輯
 */
function verifyDatafeedHash(
  src: string, prc: string, successCode: string, orderRef: string, 
  payRef: string, currCode: string, amount: string, payerAuth: string, 
  secureHashSecret: string, secureHash: string
): boolean {
  const str = [
    src, prc, successCode, orderRef, payRef, currCode, amount, payerAuth, secureHashSecret
  ].join('|');
  const generatedHash = crypto.createHash('sha1').update(str).digest('hex');
  return generatedHash === secureHash;
}

export async function POST(request: Request) {
  try {
    // PayDollar Datafeed 通常是透過 application/x-www-form-urlencoded 傳送
    const textData = await request.text();
    const params = new URLSearchParams(textData);

    const successcode = params.get('successcode') || '';
    const orderRef = params.get('Ref') || '';
    const payRef = params.get('PayRef') || '';
    const amount = params.get('Amt') || '';
    const cur = params.get('Cur') || '';
    const prc = params.get('prc') || '';
    const src = params.get('src') || '';
    const payerAuth = params.get('payerAuth') || '';
    const payMethod = params.get('payMethod') || '未知渠道';
    const secureHash = params.get('secureHash') || '';

    const secureHashSecret = process.env.PAYDOLLAR_SECURE_HASH_SECRET;

    if (!secureHashSecret) {
      console.error('[Datafeed Error]: 遺漏 PAYDOLLAR_SECURE_HASH_SECRET');
      return new Response('Error', { status: 500 });
    }

    // 1. 驗證資料是否真的來自 PayDollar (防偽造)
    const isValid = verifyDatafeedHash(
      src, prc, successcode, orderRef, payRef, cur, amount, payerAuth, secureHashSecret, secureHash
    );

    if (!isValid) {
      console.error(`[Datafeed Error]: Hash 驗證失敗 (Order: ${orderRef})`);
      return new Response('Verify Fail', { status: 400 });
    }

    // 2. 只有 successcode === '0' 才是真正的付款成功
    if (successcode === '0') {
      const batch = adminDb.batch();
      
      const orderDocRef = adminDb.collection('quick_orders').doc(orderRef);
      const transactionDocRef = adminDb.collection('transactions').doc(orderRef);

      const updateData = {
        paymentStatus: 'Paid',
        payRef: payRef,                 // ★ 核心修復：正確存入網關授權碼
        paymentMethodDetail: payMethod, // 紀錄客戶最終是用微信、支付寶還是信用卡
        updatedAt: new Date().toISOString()
      };

      batch.update(orderDocRef, updateData);
      // 同步更新財務中心的紀錄
      batch.update(transactionDocRef, updateData);

      await batch.commit();
      console.log(`[Datafeed Success]: 訂單 ${orderRef} 成功入帳，授權碼 ${payRef}`);
    }

    // ★ 必須回傳純文字 'OK'，否則 PayDollar 會以為發送失敗並持續重試
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('[Datafeed Exception]:', error);
    return new Response('Error', { status: 500 });
  }
}
