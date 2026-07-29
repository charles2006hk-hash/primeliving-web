import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務精確計算輔助模組 (單位：分 Cents)
 * 徹底防範 JavaScript 浮點數累加誤差 (Floating Point Error)
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * 安全日期字串轉換器 (相容 ISO String, Date 物件與 Firestore Timestamp)
 */
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
    const { 
      orderRef, 
      tenantId, 
      tenantName, 
      fallbackAmount, 
      amount, 
      billIds 
    } = body;

    // 1. 以「分 (Cents)」為單位精確計算本次實付總額
    const rawPaidAmount = fallbackAmount || amount || 0;
    const paidAmountCents = toCents(rawPaidAmount);
    
    if (paidAmountCents <= 0 && (!billIds || billIds.length === 0)) {
      return NextResponse.json(
        { success: false, error: '缺少有效的交易金額或帳單 ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const batch = adminDb.batch();

    const safeOrderRef = orderRef || `ORD-${Date.now()}`;
    const safeTenantId = tenantId || '';
    const safeTenantName = tenantName || '租客';

    // 2. 雙向同步寫入 [transactions] 與 [finances] 主會計報表
    const transactionData = {
      orderRef: safeOrderRef,
      tenantId: safeTenantId,
      tenantName: safeTenantName,
      title: `曾敏 - Room A 租金繳納 ($${fromCents(paidAmountCents).toLocaleString()})`,
      amount: fromCents(paidAmountCents),
      type: 'income',             // 強制標註為 income (大後台自動渲染藍/綠色「租金收款」)
      category: '租金收款',
      paymentMethod: 'PayDollar',
      status: 'completed',
      dueDate: todayStr,          // 補齊到期日供總報表日誌抓取
      completedDate: todayStr,    // 補齊完成日
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const transRef = adminDb.collection('transactions').doc(safeOrderRef);
    const financeRef = adminDb.collection('finances').doc(`FIN-${safeOrderRef}`);

    batch.set(transRef, transactionData, { merge: true });
    batch.set(financeRef, transactionData, { merge: true });

    let resolvedTenantId = safeTenantId;
    let clearedDocIds: string[] = [];

    // 3. 自動進入單據 (documents) 與租客主表 (tenants) 核銷引擎
    if (resolvedTenantId || (billIds && billIds.length > 0)) {
      
      // 若未帶 tenantId 但有 billIds，自動從第一個單據反查租客 ID
      if (!resolvedTenantId && billIds && billIds.length > 0) {
        const sampleDoc = await adminDb.collection('documents').doc(billIds[0]).get();
        if (sampleDoc.exists) {
          resolvedTenantId = sampleDoc.data()?.formData?.tenantId || '';
        }
      }

      if (resolvedTenantId) {
        // 撈出該租客名下的所有單據
        const docsSnap = await adminDb.collection('documents')
          .where('formData.tenantId', '==', resolvedTenantId)
          .get();

        const allTenantDocs = docsSnap.docs.map(doc => ({
          id: doc.id,
          ref: doc.ref,
          data: doc.data()
        }));

        const targetDocsToClear: any[] = [];

        // 【策略 A】：前端傳入明確的 billIds -> 優先依據指定 ID 進行核銷
        if (Array.isArray(billIds) && billIds.length > 0) {
          allTenantDocs.forEach(item => {
            if (billIds.includes(item.id)) {
              targetDocsToClear.push(item);
            }
          });
        }

        // 【策略 B (FIFO 智能防呆)】：若無指定 ID，按到期日舊至新自動抵扣
        if (targetDocsToClear.length === 0) {
          // 篩選出未繳單據 (同時容錯 undefined, Unpaid, Pending)
          const unpaidDocs = allTenantDocs.filter(item => {
            const pStatus = item.data.paymentStatus;
            const status = item.data.status;
            const isPaid = pStatus === 'Paid' || status === 'Completed';
            return !isPaid;
          });

          // 按到期日由舊到新排序 (最早到期的先平帳)
          unpaidDocs.sort((a, b) => {
            const dateA = toSafeDateStr(a.data.formData?.dueDate || a.data.formData?.docDate);
            const dateB = toSafeDateStr(b.data.formData?.dueDate || b.data.formData?.docDate);
            return dateA.localeCompare(dateB);
          });

          let remainingPaidCents = paidAmountCents;

          for (const item of unpaidDocs) {
            if (remainingPaidCents <= 0) break;
            const billAmtCents = toCents(
              item.data.formData?.totalAmount || item.data.formData?.amount || 0
            );
            targetDocsToClear.push(item);
            remainingPaidCents -= billAmtCents;
          }
        }

        // 4. 將目標單據狀態同步改寫為 Paid / Completed
        targetDocsToClear.forEach(item => {
          batch.update(item.ref, {
            paymentStatus: 'Paid',
            status: 'Completed',
            paidAt: nowIso,
            updatedAt: nowIso
          });
          clearedDocIds.push(item.id);
        });

        // 5. 實算租客主表 [tenants] 的真實殘餘欠款 (amountDue)
        const remainingUnpaidDocs = allTenantDocs.filter(item => {
          const isTargetCleared = targetDocsToClear.some(tc => tc.id === item.id);
          const isAlreadyPaid = item.data.paymentStatus === 'Paid' || item.data.status === 'Completed';
          return !isTargetCleared && !isAlreadyPaid;
        });

        const newAmountDueCents = remainingUnpaidDocs.reduce((sum, item) => {
          return sum + toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
        }, 0);

        const newAmountDue = fromCents(newAmountDueCents);

        // 即時扣減或歸零 tenants 主表
        const tenantRef = adminDb.collection('tenants').doc(resolvedTenantId);
        batch.update(tenantRef, {
          amountDue: newAmountDue,
          hasUnpaidBills: newAmountDue > 0,
          updatedAt: nowIso
        });
      }
    }

    // 6. 原子批次一次性提交所有變更
    await batch.commit();

    return NextResponse.json({
      success: true,
      orderRef: safeOrderRef,
      tenantId: resolvedTenantId,
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
