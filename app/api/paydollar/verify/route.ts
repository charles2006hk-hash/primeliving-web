import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 財務精確計算 (仙 Cents) 防範浮點數誤差
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

const toSafeDateStr = (val: any): string => {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  if (typeof val.toDate === 'function') return val.toDate().toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { 
      orderRef, 
      tenantId, 
      tenantName, 
      fallbackAmount, 
      amount, 
      billIds 
    } = body;

    let finalTenantId = tenantId;
    let finalTenantName = tenantName;
    let finalAmount = fallbackAmount || amount || 0;
    let finalBillIds = Array.isArray(billIds) ? billIds : [];

    // ★ 核心修復：若前端頁面尚未載入完畢（導致金額為 0），自動回查 Firestore transactions 預存文件
    if (orderRef && (!finalAmount || finalBillIds.length === 0)) {
      const savedTransDoc = await adminDb.collection('transactions').doc(orderRef).get();
      if (savedTransDoc.exists) {
        const transData = savedTransDoc.data();
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
    const safeTenantName = finalTenantName || '租客';

    // 1. 同步更新 [transactions] 與 [finances] 會計報表
    const transactionData = {
      orderRef: safeOrderRef,
      tenantId: finalTenantId || '',
      tenantName: safeTenantName,
      title: `租金繳納 - ${safeTenantName} ($${fromCents(paidAmountCents).toLocaleString()})`,
      amount: fromCents(paidAmountCents),
      type: 'income',             // 標記為 income
      category: '租金收款',
      paymentMethod: 'PayDollar',
      status: 'completed',
      dueDate: todayStr,
      completedDate: todayStr,
      updatedAt: nowIso
    };

    const transRef = adminDb.collection('transactions').doc(safeOrderRef);
    const financeRef = adminDb.collection('finances').doc(`FIN-${safeOrderRef}`);

    batch.set(transRef, transactionData, { merge: true });
    batch.set(financeRef, transactionData, { merge: true });

    let clearedDocIds: string[] = [];

    // 2. 自動執行單據與欠款核銷引擎
    if (finalTenantId || finalBillIds.length > 0) {
      
      // 若無 tenantId，從第一個單據反查
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

        // 【策略 A】：依據指定 billIds 進行核銷
        if (finalBillIds.length > 0) {
          allTenantDocs.forEach(item => {
            if (finalBillIds.includes(item.id)) {
              targetDocsToClear.push(item);
            }
          });
        }

        // 【策略 B】：FIFO 到期日舊至新自動抵扣
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

        // 3. 更新目標單據為 Paid / Completed
        targetDocsToClear.forEach(item => {
          batch.update(item.ref, {
            paymentStatus: 'Paid',
            status: 'Completed',
            paidAt: nowIso,
            updatedAt: nowIso
          });
          clearedDocIds.push(item.id);
        });

        // 4. 重新結算租客 [tenants] 剩餘 amountDue
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
      clearedBillCount: clearedDocIds.length,
      clearedDocIds,
      message: `自動核銷成功！已完成 ${clearedDocIds.length} 張單據平帳並更新租客欠款。`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[PayDollar Auto-Verify Engine Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '核銷流程發生異常' },
      { status: 500, headers: corsHeaders }
    );
  }
}
