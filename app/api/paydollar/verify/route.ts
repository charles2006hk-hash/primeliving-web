import { NextResponse } from 'next/server';
// ★ 採用系統既有的 firebase-admin 管理員實例，直接穿透 Security Rules
import { adminDb } from '@/lib/firebase-admin'; // 或對應的 adminDb 匯入路徑，若無可直接用 admin.firestore()
import * as admin from 'firebase-admin';

// 嚴格整數運算：把元轉仙 (Cents)，杜絕浮點數運算誤差
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const { orderRef, tenantId, tenantName, roomInfo, fallbackAmount, billIds } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少 orderRef' }, { status: 400, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const paidCents = toCents(fallbackAmount || 0);
    const exactAmount = fromCents(paidCents);

    let resolvedTenantId = tenantId || '';
    let resolvedName = tenantName || '曾敏';
    let resolvedRoom = roomInfo || 'Room A';
    let targetBillIds: string[] = Array.isArray(billIds) ? billIds.filter(Boolean) : [];

    // ★ 使用 Firestore Batch 批次處理，保證財務單據與應收欠款「原子性 (Atomic) 寫入」
    const batch = adminDb.batch();

    // 1. 若前端無帶入 ID，使用 Admin 權限查詢租客所有到期 / 逾期的待繳帳單
    if (targetBillIds.length === 0 && resolvedTenantId) {
      const unpaidQuery = await adminDb.collection('documents')
        .where('formData.tenantId', '==', resolvedTenantId)
        .where('paymentStatus', 'in', ['Unpaid', 'Pending'])
        .get();

      targetBillIds = unpaidQuery.docs
        .filter(doc => {
          const dueDate = doc.data()?.formData?.dueDate || doc.data()?.createdAt || '';
          return dueDate <= todayStr;
        })
        .map(doc => doc.id);
    }

    // 2. 批次把單據改為已付 (Paid)
    targetBillIds.forEach(billId => {
      const billRef = adminDb.collection('documents').doc(billId);
      batch.update(billRef, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    });

    // 3. 扣減租客帳務 balance 並消除紅燈
    if (resolvedTenantId) {
      const tenantRef = adminDb.collection('tenants').doc(resolvedTenantId);
      const tenantSnap = await tenantRef.get();
      const currentDueCents = toCents(tenantSnap.data()?.amountDue || 0);
      const remainsDue = fromCents(Math.max(0, currentDueCents - paidCents));

      batch.update(tenantRef, {
        amountDue: remainsDue,
        hasUnpaidBills: remainsDue > 0,
        updatedAt: nowIso
      });
    }

    // 4. 開立線上付款電子收據 (Receipt)
    const receiptRef = adminDb.collection('documents').doc(`REC-${Date.now()}`);
    batch.set(receiptRef, {
      type: 'Statement',
      paymentStatus: 'Paid',
      status: 'Completed',
      summary: `${resolvedName} - 租金繳納收據 (${orderRef})`,
      isCompanyChopApplied: true,
      createdAt: nowIso,
      formData: {
        tenantId: resolvedTenantId,
        tenantName: resolvedName,
        roomName: resolvedRoom,
        docDate: todayStr,
        paymentMethod: 'PayDollar',
        totalReceived: exactAmount,
        remarks: `線上支付授權成功\n交易流水號: ${orderRef}\n已完成核銷 ${targetBillIds.length} 張單據`
      }
    });

    // ★ 5. 雙管道會計入帳：使用 Admin 權限同步寫入 `finances` 與 `finance_records`
    const financeId = `FIN-${Date.now()}`;
    const financeData = {
      type: 'AR',                           // ★ 會計資產類別：應收帳款 (AR)
      category: '租金收款',                 // ★ 精確分類：租金收款 (非分紅)
      title: `${resolvedName} - ${resolvedRoom} 租金繳納`,
      amount: exactAmount,
      date: todayStr,
      paymentMethod: 'PayDollar',
      tenantId: resolvedTenantId,
      orderRef: orderRef,
      status: 'Paid',
      createdAt: nowIso
    };

    batch.set(adminDb.collection('finances').doc(financeId), financeData);
    batch.set(adminDb.collection('finance_records').doc(financeId), financeData);

    // 6. CRM 通知日誌
    if (resolvedTenantId) {
      const crmRef = adminDb.collection('inquiries').doc(`CRM-${Date.now()}`);
      batch.set(crmRef, {
        tenantId: resolvedTenantId,
        name: resolvedName,
        roomInfo: resolvedRoom,
        message: `【系統通知：繳費確認】\n已成功通過 PayDollar 繳清租金 HK$${exactAmount.toLocaleString()}。單據與欠款已自動核銷。`,
        author: '系統自動化',
        type: 'official_notice',
        status: 'Resolved',
        createdAt: nowIso,
        isExistingTenant: true
      });
    }

    // ★ 一起提交 Firestore 所有修改
    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      api_version: "2026-v5-admin",
      amount: exactAmount, 
      clearedBills: targetBillIds.length,
      debugWriteTargets: {
        "jiayu-pm-system_finances": true,
        "jiayu-pm-system_finance_records": true
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Verify API V5 Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
