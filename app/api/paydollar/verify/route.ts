import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================================
// 1. 財務會計工具與字符修復模組
// ============================================================================
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

const toSafeDateStr = (val: any): string => {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  if (typeof val.toDate === 'function') return val.toDate().toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
};

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

const fixChineseEncoding = (str: string | undefined): string => {
  if (!str) return '';
  try {
    if (/%[0-9A-F]{2}/i.test(str)) return decodeURIComponent(str);
    return Buffer.from(str, 'binary').toString('utf8');
  } catch {
    return str;
  }
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// ============================================================================
// 2. POST 主處理核心：統一核銷入帳引擎
// ============================================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { 
      orderRef, 
      tenantId, 
      tenantName, 
      fallbackAmount, 
      amount, 
      billIds,
      payRef,
      payMethod,
      paymentMethodDetail
    } = body;

    let finalTenantId = tenantId;
    let finalTenantName = fixChineseEncoding(tenantName);
    let finalAmount = fallbackAmount || amount || 0;
    let finalBillIds = Array.isArray(billIds) ? billIds : [];

    // 1. 自動反查 Firestore `transactions` 補齊缺失的訂單數據
    if (orderRef && (!finalAmount || finalBillIds.length === 0 || !finalTenantName)) {
      const savedTransDoc = await adminDb.collection('transactions').doc(orderRef).get();
      if (savedTransDoc.exists) {
        const transData = savedTransDoc.data();
        // ★ 重複入帳防呆：若此筆交易早已經是 Completed / Paid 狀態，直接返回成功，避免重新扣減應收款導致負數
        if (transData?.paymentStatus === 'Paid' || transData?.status === 'Completed') {
          return NextResponse.json({
            success: true,
            orderRef,
            message: '單據此前已成功平帳，忽略重複扣減。'
          }, { status: 200, headers: corsHeaders });
        }
        if (!finalAmount) finalAmount = transData?.amount || 0;
        if (finalBillIds.length === 0) finalBillIds = transData?.billIds || [];
        if (!finalTenantId) finalTenantId = transData?.tenantId || '';
        if (!finalTenantName) finalTenantName = transData?.tenantName || '';
      }
    }

    const paidAmountCents = toCents(finalAmount);
    if (paidAmountCents <= 0 && finalBillIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少有效的交易金額或帳單 ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const batch = adminDb.batch();

    const safeOrderRef = orderRef || `ORD-${Date.now()}`;
    const safeTenantName = finalTenantName || '租客 / 現場客戶';

    const rawPayMethod = (payMethod || '').toUpperCase();
    const humanPayMethod = paymentMethodDetail || PAY_METHOD_MAP[rawPayMethod] || `線上支付 (${rawPayMethod || 'PayDollar'})`;
    const safePayRef = payRef || '網關確認';

    // A. 寫入總會計報表與應收表單 [transactions] & [finances]
    const transactionData: Record<string, any> = {
      orderRef: safeOrderRef,
      tenantId: finalTenantId || '',
      tenantName: safeTenantName,
      title: `租金收款 - ${safeTenantName} ($${fromCents(paidAmountCents).toLocaleString()})`,
      amount: fromCents(paidAmountCents),
      type: 'income',
      category: '租金收款',
      paymentMethod: 'PayDollar',
      paymentMethodDetail: humanPayMethod,
      payRef: safePayRef,
      status: 'Completed',
      paymentStatus: 'Paid',
      dueDate: todayStr,
      completedDate: todayStr,
      updatedAt: nowIso
    };

    const transRef = adminDb.collection('transactions').doc(safeOrderRef);
    const financeRef = adminDb.collection('finances').doc(`FIN-${safeOrderRef}`);

    batch.set(transRef, transactionData, { merge: true });
    batch.set(financeRef, transactionData, { merge: true });

    // B. 現場快速收款 [quick_orders] 對齊
    if (safeOrderRef.startsWith('SQP-') || safeOrderRef.startsWith('SALES-')) {
      const quickOrderRef = adminDb.collection('quick_orders').doc(safeOrderRef);
      batch.set(quickOrderRef, {
        status: 'Completed',
        paymentStatus: 'Paid',
        paymentMethodDetail: humanPayMethod,
        payRef: safePayRef,
        paidAt: nowIso,
        updatedAt: nowIso
      }, { merge: true });
    }

    // C. 租客單據自動核銷與欠款抵扣引擎 (對帳平帳)
    let clearedDocIds: string[] = [];

    if (finalTenantId || finalBillIds.length > 0) {
      if (!finalTenantId && finalBillIds.length > 0) {
        const sampleDoc = await adminDb.collection('documents').doc(finalBillIds[0]).get();
        if (sampleDoc.exists) {
          finalTenantId = sampleDoc.data()?.formData?.tenantId || '';
        }
      }

      if (finalTenantId) {
        const docsSnap = await adminDb.collection('documents')
          .where('formData.tenantId', '==', finalTenantId)
          .get();

        const allTenantDocs = docsSnap.docs.map(doc => ({
          id: doc.id,
          ref: doc.ref,
          data: doc.data()
        }));

        const targetDocsToClear: any[] = [];

        // 策略 1：指定帳單直接核銷
        if (finalBillIds.length > 0) {
          allTenantDocs.forEach(item => {
            if (finalBillIds.includes(item.id)) {
              targetDocsToClear.push(item);
            }
          });
        }

        // 策略 2：FIFO (最久未付帳單優先抵扣)
        if (targetDocsToClear.length === 0) {
          const unpaidDocs = allTenantDocs.filter(item => {
            const pStatus = item.data.paymentStatus;
            const status = item.data.status;
            return pStatus !== 'Paid' && status !== 'Completed';
          });

          unpaidDocs.sort((a, b) => {
            const dateA = toSafeDateStr(a.data.formData?.dueDate || a.data.formData?.docDate);
            const dateB = toSafeDateStr(b.data.formData?.dueDate || b.data.formData?.docDate);
            return dateA.localeCompare(dateB);
          });

          let remainingPaidCents = paidAmountCents;
          for (const item of unpaidDocs) {
            if (remainingPaidCents <= 0) break;
            const billAmtCents = toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
            targetDocsToClear.push(item);
            remainingPaidCents -= billAmtCents;
          }
        }

        // 更新帳單為 Paid
        targetDocsToClear.forEach(item => {
          batch.update(item.ref, {
            paymentStatus: 'Paid',
            status: 'Completed',
            paidMethodDetail: humanPayMethod,
            paidAt: nowIso,
            updatedAt: nowIso
          });
          clearedDocIds.push(item.id);
        });

        // 結算該名租客剩餘金額 amountDue
        const remainingUnpaidDocs = allTenantDocs.filter(item => {
          const isTargetCleared = targetDocsToClear.some(tc => tc.id === item.id);
          const isAlreadyPaid = item.data.paymentStatus === 'Paid' || item.data.status === 'Completed';
          return !isTargetCleared && !isAlreadyPaid;
        });

        const newAmountDueCents = remainingUnpaidDocs.reduce((sum, item) => {
          return sum + toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
        }, 0);

        const newAmountDue = fromCents(newAmountDueCents);

        const tenantRef = adminDb.collection('tenants').doc(finalTenantId);
        batch.update(tenantRef, {
          amountDue: newAmountDue,
          hasUnpaidBills: newAmountDue > 0,
          updatedAt: nowIso
        });
      }
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      orderRef: safeOrderRef,
      tenantId: finalTenantId,
      payMethod: humanPayMethod,
      clearedBillCount: clearedDocIds.length,
      clearedDocIds,
      message: `自動核銷成功！(${humanPayMethod}) 已完成 ${clearedDocIds.length} 張單據平帳。`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[PayDollar Auto-Verify Engine Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '核銷流程發生異常' },
      { status: 500, headers: corsHeaders }
    );
  }
}
