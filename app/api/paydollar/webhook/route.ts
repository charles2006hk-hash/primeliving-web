import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

// ============================================================================
// 1. 財務會計與字元處理模組
// ============================================================================
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

// PayDollar 官方支付渠道代號翻譯字典
const PAY_METHOD_MAP: Record<string, string> = {
  'CC': '💳 信用卡 / Visa / Master',
  'VISA': '💳 Visa 信用卡',
  'MASTER': '💳 MasterCard 信用卡',
  'ALIPAY': '📱 支付寶 (Alipay)',
  'ALIPAYHK': '📱 支付寶香港 (AlipayHK)',
  'WECHAT': '💬 微信支付 (WeChat Pay)',
  'WECHATHK': '💬 微信支付香港 (WeChat HK)',
  'FPS': '⚡ 轉數快 (FPS)',
  'UNIONPAY': '🏦 銀聯卡 (UnionPay)',
  'PAYPAL': '🅿️ PayPal',
  'APPLEPAY': '🍎 Apple Pay',
  'GOOGLEPAY': '🇬 Google Pay'
};

// 修復 PayDollar DataFeed ISO-8859-1 / Hex 傳遞時的中文亂碼
const fixChineseEncoding = (str: string | undefined): string => {
  if (!str) return '';
  try {
    if (/%[0-9A-F]{2}/i.test(str)) return decodeURIComponent(str);
    return Buffer.from(str, 'binary').toString('utf8');
  } catch {
    return str;
  }
};

/**
 * 嚴格驗證 PayDollar Secure Hash (指定使用 SHA-1)
 * 官方順序: src-prc-successcode-Ref-PayRef-Cur-Amt-payerAuth-secret
 */
function verifyPayDollarHash(data: Record<string, string>, secret: string): boolean {
  const { src = '', prc = '', successcode = '', Ref = '', PayRef = '', Cur = '', Amt = '', payerAuth = '', secureHash = '' } = data;
  if (!secureHash) return false;

  const buffer = [src, prc, successcode, Ref, PayRef, Cur, Amt, payerAuth, secret].join('-');
  const generatedHash = crypto.createHash('sha1').update(buffer).digest('hex').toUpperCase(); 
  
  return generatedHash === secureHash.toUpperCase();
}

// ============================================================================
// 2. POST 核心：處理 Webhook (DataFeed) 與會計核銷
// ============================================================================
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    // 1. 處理 PayDollar 表單資料 (相容 application/x-www-form-urlencoded 與 text)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    }

    // 取得基本參數 (相容 Ref 或 Ord 命名)
    const ref = data.Ref || data.Ord || '';
    const successCode = data.successcode;
    const prc = data.prc;
    const amt = data.Amt || '0';
    const payRef = data.PayRef || '';
    const payMethod = data.payMethod || 'CC';

    // 2. ★ 處理 PayDollar 後台的 Test 按鈕 (測試 Datafeed 專用)
    if (ref === 'TestDatafeed' || ref === '12345678' || data.Ref === 'Test') {
      console.log('[PayDollar Webhook] 收到官方 DataFeed 測試連接，回傳 200 OK。');
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 3. 驗證 Secure Hash 防假冒偽造
    // 優先讀取正式配置，如無則 fallback 讀取 PAYDOLLAR_SECURE_SECRET
    const secret = process.env.PAYDOLLAR_SECURE_HASH_SECRET || process.env.PAYDOLLAR_SECURE_SECRET;
    if (!secret) {
      console.error('[Webhook Error] Vercel 缺少 PAYDOLLAR_SECURE_HASH_SECRET 環境變數。');
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    if (!verifyPayDollarHash(data, secret)) {
      console.error(`[Webhook Security Alert] Secure Hash 驗證不通過！可能為偽造請求。Order: ${ref}`);
      return new NextResponse('Invalid Hash', { status: 400 });
    }

    // 4. 嚴格驗證付款狀態是否成功 (0 表示成功)
    if (successCode !== '0' && prc !== '0') {
      console.log(`[Webhook] 交易未完成或已被取消。Order: ${ref}, PRC: ${prc}`);
      // 依照網關標準，即使是交易取消通知，只要伺服器順利接收，也必須回傳 'OK' 以停止 Gateway 重送
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 5. 轉換為最小單位 (Cents) 處理，徹底避免 JS 浮點數誤差
    const amountInCents = toCents(amt);
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    const rawPayMethod = payMethod.toUpperCase();
    const humanPayMethod = PAY_METHOD_MAP[rawPayMethod] || `線上支付 (${rawPayMethod || 'PayDollar'})`;

    const batch = adminDb.batch();

    // ========================================================================
    // 分流 A：如果是現場快速收款 (SQP- 或 SALES- 前綴)，直接標記核銷，不動租客合約帳款
    // ========================================================================
    if (ref.startsWith('SQP-') || ref.startsWith('SALES-')) {
      const quickOrderRef = adminDb.collection('quick_orders').doc(ref);
      const transRef = adminDb.collection('transactions').doc(ref);

      const updatePayload = {
        status: 'Completed',
        paymentStatus: 'Paid',
        paymentMethodDetail: humanPayMethod,
        payRef: payRef || 'N/A',
        paidAt: nowIso,
        updatedAt: nowIso,
      };

      batch.set(quickOrderRef, updatePayload, { merge: true });
      batch.set(transRef, {
        ...updatePayload,
        subtitle: `付款渠道：${humanPayMethod} | 收據號：${payRef || '網關確認'}`
      }, { merge: true });

      await batch.commit();
      console.log(`[PayDollar Webhook] 現場收款單據 ${ref} 已成功入帳！金額: $${fromCents(amountInCents)}`);
      
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // ========================================================================
    // 分流 B：一般租客交租繳費 (自動平帳單據 documents 並減去租客總欠款 amountDue)
    // ========================================================================
    const transDoc = await adminDb.collection('transactions').doc(ref).get();
    let tenantId = '';
    let tenantName = '線上租客';
    let billIds: string[] = [];

    if (transDoc.exists) {
      const transData = transDoc.data();
      tenantId = transData?.tenantId || '';
      tenantName = fixChineseEncoding(transData?.tenantName || '線上租客');
      billIds = transData?.billIds || [];
    }

    const accountingPayload = {
      orderRef: ref,
      tenantId,
      tenantName,
      amount: fromCents(amountInCents),
      type: 'income',
      category: '租金收款',
      paymentMethod: 'PayDollar',
      paymentMethodDetail: humanPayMethod,
      payRef: payRef || 'N/A',
      status: 'completed',
      paymentStatus: 'Paid',
      dueDate: todayStr,
      completedDate: todayStr,
      updatedAt: nowIso
    };

    batch.set(adminDb.collection('transactions').doc(ref), accountingPayload, { merge: true });
    batch.set(adminDb.collection('finances').doc(`FIN-${ref}`), accountingPayload, { merge: true });

    // 自動執行單據 (documents) 抵扣與租客 (tenants) 欠款重算
    if (tenantId) {
      const docsSnap = await adminDb.collection('documents')
        .where('formData.tenantId', '==', tenantId)
        .get();

      const allTenantDocs = docsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
      const targetDocsToClear: any[] = [];

      // 優先抵扣指定帳單
      if (billIds.length > 0) {
        allTenantDocs.forEach(item => {
          if (billIds.includes(item.id)) targetDocsToClear.push(item);
        });
      }

      // 若無指定，依 FIFO 最久遠到期單據優先抵扣
      if (targetDocsToClear.length === 0) {
        const unpaidDocs = allTenantDocs.filter(item => item.data.paymentStatus !== 'Paid' && item.data.status !== 'Completed');
        unpaidDocs.sort((a, b) => {
          const dateA = a.data.formData?.dueDate || a.data.formData?.docDate || '';
          const dateB = b.data.formData?.dueDate || b.data.formData?.docDate || '';
          return String(dateA).localeCompare(String(dateB));
        });

        let remainingCents = amountInCents;
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

      // 重新計算租客帳號中剩餘 amountDue
      const remainingUnpaidDocs = allTenantDocs.filter(item => {
        const isCleared = targetDocsToClear.some(tc => tc.id === item.id);
        const isPaid = item.data.paymentStatus === 'Paid' || item.data.status === 'Completed';
        return !isCleared && !isPaid;
      });

      const newAmountDueCents = remainingUnpaidDocs.reduce((sum, item) => {
        return sum + toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
      }, 0);

      const newAmountDue = fromCents(newAmountDueCents);
      batch.update(adminDb.collection('tenants').doc(tenantId), {
        amountDue: newAmountDue,
        hasUnpaidBills: newAmountDue > 0,
        updatedAt: nowIso
      });
    }

    await batch.commit();
    console.log(`[PayDollar Webhook] 合約交租 ${ref} 已完成核銷！`);

    // 6. PayDollar 官方要求：成功接收及處理後必須回傳純文字 'OK'
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });

  } catch (error: any) {
    console.error('[PayDollar Webhook] 系統內部處理異常:', error);
    return new NextResponse('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
