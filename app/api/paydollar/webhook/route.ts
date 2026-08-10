import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

const PAY_METHOD_MAP: Record<string, string> = {
  'CC': '💳 信用卡 / Visa / Master',
  'VISA': '💳 Visa 信用卡',
  'MASTER': '💳 MasterCard 信用卡',
  'ALIPAY': '📱 支付寶 (Alipay)',
  'ALIPAYONL': '📱 支付寶線上 (Alipay)',
  'ALIPAYHK': '📱 支付寶香港 (AlipayHK)',
  'WECHAT': '💬 微信支付 (WeChat Pay)',
  'WECHATONL': '💬 微信支付 (WeChat Pay)',
  'WECHATHK': '💬 微信支付香港 (WeChat HK)',
  'FPS': '⚡ 轉數快 (FPS)',
  'UNIONPAY': '🏦 銀聯卡 (UnionPay)',
  'PAYPAL': '🅿️ PayPal',
  'APPLEPAY': '🍎 Apple Pay',
  'GOOGLEPAY': '🇬 Google Pay'
};

const fixChineseEncoding = (str: string | undefined): string => {
  if (!str) return '';
  try {
    if (/%[0-9A-F]{2}/i.test(str)) return decodeURIComponent(str);
    return Buffer.from(str, 'binary').toString('utf8');
  } catch {
    return str;
  }
};

function verifyPayDollarHash(data: Record<string, string>, secret: string): boolean {
  const { src = '', prc = '', successcode = '', Ref = '', PayRef = '', Cur = '', Amt = '', payerAuth = '', secureHash = '' } = data;
  if (!secureHash) return false;
  
  // ★ 核心修復 1：PayDollar 官方規定必須使用 '|' 作為連接字元
  const buffer = [src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secret].join('|');
  const generatedHash = crypto.createHash('sha1').update(buffer).digest('hex').toUpperCase();
  
  return generatedHash === secureHash.toUpperCase();
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    // 處理 PayDollar 傳送 Payload 的格式
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    }

    const ref = data.Ref || data.Ord || '';
    const successCode = data.successcode;
    const prc = data.prc;
    const amt = data.Amt || '0';
    const payRef = data.PayRef || '';
    const payMethod = data.payMethod || 'CC';

    // 測試單攔截
    if (ref === 'TestDatafeed' || ref === '12345678' || data.Ref === 'Test') {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const secret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || process.env.PAYDOLLAR_SECURE_SECRET;
    if (!secret || !verifyPayDollarHash(data, secret)) {
      console.error(`[Datafeed Security]: Hash 驗證失敗 (Order: ${ref})`);
      return new NextResponse('Invalid Hash', { status: 400 });
    }

    // 非成功付款，回傳 OK 讓網關停止重試
    if (successCode !== '0' && prc !== '0') {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const totalPaidCents = toCents(amt);
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    const rawPayMethod = payMethod.toUpperCase();
    const humanPayMethod = PAY_METHOD_MAP[rawPayMethod] || `線上支付 (${rawPayMethod || '卡支付'})`;

    const batch = adminDb.batch();

    // ========================================================================
    // 分流 A：現場快速收款 (SQP- / SALES-)
    // ========================================================================
    if (ref.startsWith('SQP-') || ref.startsWith('SALES-')) {
      const quickDocRef = adminDb.collection('quick_orders').doc(ref);
      const transDocRef = adminDb.collection('transactions').doc(ref);
      
      const quickDoc = await quickDocRef.get();
      
      // ★ 核心修復 2：增加冪等性 (Idempotency) 防禦，如果已經付款成功，直接回傳 OK，不浪費 DB 寫入
      if (quickDoc.exists && quickDoc.data()?.paymentStatus === 'Paid') {
        return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }

      let subtotalNum = fromCents(totalPaidCents);
      let surchargeNum = 0;

      if (quickDoc.exists) {
        const qData = quickDoc.data();
        if (qData?.subtotal) {
          subtotalNum = Number(qData.subtotal);
          surchargeNum = Number(qData.surcharge || 0);
        }
      }

      const updatePayload = {
        status: 'Completed',
        paymentStatus: 'Paid',
        paymentMethodDetail: humanPayMethod,
        payRef: payRef || 'N/A',
        paidAt: nowIso,
        updatedAt: nowIso,
      };

      batch.set(quickDocRef, updatePayload, { merge: true });
      batch.set(transDocRef, {
        ...updatePayload,
        subtitle: `【${humanPayMethod}】 | 網關流水號：${payRef || '網關確認'}`,
        description: `應收本金：$${subtotalNum.toLocaleString()} | 3%手續費：$${surchargeNum.toLocaleString()} | 刷卡總額：$${fromCents(totalPaidCents).toLocaleString()}`
      }, { merge: true });

      await batch.commit();
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // ========================================================================
    // 分流 B：租客定期交租 (常規入帳)
    // ========================================================================
    const transDoc = await adminDb.collection('transactions').doc(ref).get();
    let tenantId = '';
    let tenantName = '線上租客';
    let billIds: string[] = [];
    let originalSubtotal = fromCents(totalPaidCents);

    if (transDoc.exists) {
      const transData = transDoc.data();
      // 冪等性防禦
      if (transData?.paymentStatus === 'Paid' || transData?.status === 'completed') {
        return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      tenantId = transData?.tenantId || '';
      tenantName = fixChineseEncoding(transData?.tenantName || '線上租客');
      billIds = transData?.billIds || [];
      if (transData?.subtotal || transData?.originalAmount) {
        originalSubtotal = Number(transData.subtotal || transData.originalAmount);
      }
    }

    const accountingPayload = {
      orderRef: ref,
      tenantId,
      tenantName,
      amount: fromCents(totalPaidCents),
      originalAmount: originalSubtotal, 
      type: 'income',
      category: '租金收款',
      paymentMethod: 'PayDollar',
      paymentMethodDetail: humanPayMethod, 
      payRef: payRef || 'N/A',
      status: 'completed',
      paymentStatus: 'Paid',
      subtitle: `【${humanPayMethod}】 | 網關流水號：${payRef || 'N/A'}`,
      description: `應收本金：$${originalSubtotal.toLocaleString()} | 刷卡總額：$${fromCents(totalPaidCents).toLocaleString()}`,
      dueDate: todayStr,
      completedDate: todayStr,
      updatedAt: nowIso
    };

    batch.set(adminDb.collection('transactions').doc(ref), accountingPayload, { merge: true });
    batch.set(adminDb.collection('finances').doc(`FIN-${ref}`), accountingPayload, { merge: true });

    // 自動執行單據 (documents) 與租客 (tenants) 平帳
    if (tenantId) {
      const docsSnap = await adminDb.collection('documents').where('formData.tenantId', '==', tenantId).get();
      const allTenantDocs = docsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
      const targetDocsToClear: any[] = [];

      if (billIds.length > 0) {
        allTenantDocs.forEach(item => { if (billIds.includes(item.id)) targetDocsToClear.push(item); });
      }

      if (targetDocsToClear.length === 0) {
        const unpaidDocs = allTenantDocs.filter(item => item.data.paymentStatus !== 'Paid' && item.data.status !== 'Completed');
        unpaidDocs.sort((a, b) => String(a.data.formData?.dueDate || '').localeCompare(String(b.data.formData?.dueDate || '')));
        let remainingCents = totalPaidCents;
        for (const item of unpaidDocs) {
          if (remainingCents <= 0) break;
          targetDocsToClear.push(item);
          remainingCents -= toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
        }
      }

      targetDocsToClear.forEach(item => {
        batch.update(item.ref, {
          paymentStatus: 'Paid',
          status: 'Completed',
          paidMethodDetail: humanPayMethod,
          paidAt: nowIso,
          updatedAt: nowIso
        });
      });

      const remainingUnpaidDocs = allTenantDocs.filter(item => !targetDocsToClear.some(tc => tc.id === item.id) && item.data.paymentStatus !== 'Paid');
      const newAmountDueCents = remainingUnpaidDocs.reduce((sum, item) => sum + toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0), 0);
      const newAmountDue = fromCents(newAmountDueCents);
      
      batch.update(adminDb.collection('tenants').doc(tenantId), {
        amountDue: newAmountDue,
        hasUnpaidBills: newAmountDue > 0,
        updatedAt: nowIso
      });
    }

    await batch.commit();
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });

  } catch (error: any) {
    console.error('[PayDollar Webhook Error]:', error);
    return new NextResponse('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
