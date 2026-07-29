import { NextResponse } from 'next/server';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jiayu-pm-system';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 財務精度轉換：一律轉為分 (Cents) 運算，杜絕 JS 浮點數誤差
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

// REST API 輔助工具
async function getDocREST(collection: string, docId: string) {
  const res = await fetch(`${FIRESTORE_URL}/${collection}/${docId}`, { method: 'GET' });
  return res.ok ? await res.json() : null;
}

async function patchDocREST(collection: string, docId: string, fields: Record<string, any>) {
  const firestoreFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
  }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  await fetch(`${FIRESTORE_URL}/${collection}/${docId}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields })
  });
}

export async function POST(request: Request) {
  try {
    const { orderRef, tenantId, tenantName, roomInfo, fallbackAmount, billIds } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號 orderRef' }, { status: 400, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const txSnap = await getDocREST('transactions', orderRef);

    let resolvedTenantId = tenantId || '';
    let resolvedName = tenantName || '租客';
    let resolvedRoom = roomInfo || '';
    let paidCents = toCents(fallbackAmount || 0);
    let targetBillIds: string[] = Array.isArray(billIds) ? billIds.filter(Boolean) : [];

    // 1. 如果 Firestore 中已有 transactions 紀錄，以交易紀錄之上下文為準
    if (txSnap) {
      if (txSnap.fields?.status?.stringValue === 'Success') {
        return NextResponse.json({ success: true, message: '交易已完成核銷，不重複記帳' }, { status: 200, headers: corsHeaders });
      }
      resolvedTenantId = txSnap.fields?.tenantId?.stringValue || resolvedTenantId;
      resolvedName = txSnap.fields?.tenantName?.stringValue || resolvedName;
      resolvedRoom = txSnap.fields?.roomInfo?.stringValue || resolvedRoom;
      if (txSnap.fields?.amount) {
        paidCents = toCents(txSnap.fields.amount.stringValue || txSnap.fields.amount.doubleValue || 0);
      }
      const txBills = txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue);
      if (txBills?.length) targetBillIds = txBills;
    }

    // 2. 如果沒有指定單據 ID，安全掃描：只核銷「該租客名下、已到期或逾期」的單據，保留未來期數
    if (targetBillIds.length === 0 && resolvedTenantId) {
      const allDocsRes = await fetch(`${FIRESTORE_URL}/documents`);
      const allDocsData = await allDocsRes.json();
      targetBillIds = (allDocsData.documents || [])
        .filter((item: any) => {
          const f = item.fields || {};
          const fd = f.formData?.mapValue?.fields || {};
          const owner = fd.tenantId?.stringValue || f.tenantId?.stringValue;
          const status = f.status?.stringValue || f.paymentStatus?.stringValue;
          const dueDate = fd.dueDate?.stringValue || f.createdAt?.timestampValue || '';
          
          // ★ 安全核銷防線：僅核銷 Unpaid/Pending 且 日期 <= 今天的單據
          return owner === resolvedTenantId && ['Pending', 'Unpaid'].includes(status) && dueDate <= todayStr;
        })
        .map((item: any) => item.name.split('/').pop());
    }

    // 3. 執行單據核銷 (轉 Paid / Completed)
    for (const billId of targetBillIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    }

    // 4. 扣減租客應付總額 amountDue，並消掉大系統與前台的逾期紅燈
    if (resolvedTenantId) {
      const tenantSnap = await getDocREST('tenants', resolvedTenantId);
      const currentDueCents = toCents(
        tenantSnap?.fields?.amountDue?.doubleValue || 
        tenantSnap?.fields?.amountDue?.integerValue || 0
      );
      const remainsDue = fromCents(Math.max(0, currentDueCents - paidCents));

      await patchDocREST('tenants', resolvedTenantId, {
        amountDue: remainsDue,
        hasUnpaidBills: remainsDue > 0, // ★ 只要餘額歸零，立刻消燈
        updatedAt: nowIso
      });
    }

    // 5. 開立正式電子收款收據 (Receipt)
    const receiptId = `REC-${Date.now()}`;
    const exactAmount = fromCents(paidCents);
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${resolvedName} - 租金繳交收據 (${orderRef})` },
          isCompanyChopApplied: { booleanValue: true },
          createdAt: { stringValue: nowIso },
          formData: {
            mapValue: {
              fields: {
                tenantId: { stringValue: resolvedTenantId },
                tenantName: { stringValue: resolvedName },
                roomName: { stringValue: resolvedRoom },
                docDate: { stringValue: todayStr },
                paymentMethod: { stringValue: 'PayDollar' },
                totalReceived: { doubleValue: exactAmount },
                remarks: { stringValue: `線上支付授權成功\n交易單號: ${orderRef}\n已核銷 ${targetBillIds.length} 筆帳單` }
              }
            }
          }
        }
      })
    });

    // 6. 寫入財務會計系統 - 本月收租 (AR)
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'AR' },               // ★ 確保進入本月收租報表
          category: { stringValue: '租金收款' },
          title: { stringValue: `${resolvedName} - ${resolvedRoom} 租金繳納` },
          amount: { doubleValue: exactAmount },
          date: { stringValue: todayStr },
          paymentMethod: { stringValue: 'PayDollar' },
          tenantId: { stringValue: resolvedTenantId },
          orderRef: { stringValue: orderRef },
          status: { stringValue: 'Paid' },
          createdAt: { stringValue: nowIso }
        }
      })
    });

    // 7. 同步 CRM 互動軌跡
    if (resolvedTenantId) {
      const crmLogId = `CRM-${Date.now()}`;
      await fetch(`${FIRESTORE_URL}/inquiries?documentId=${crmLogId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            tenantId: { stringValue: resolvedTenantId },
            name: { stringValue: resolvedName },
            roomInfo: { stringValue: resolvedRoom },
            message: `【系統通知：繳費確認】\n已成功通過 PayDollar 繳清租金 HK$${exactAmount.toLocaleString()}。單據與應付金額已更新。`,
            author: { stringValue: '系統自動化' },
            type: { stringValue: 'official_notice' },
            status: { stringValue: 'Resolved' },
            createdAt: { stringValue: nowIso },
            isExistingTenant: { booleanValue: true }
          }
        })
      });
    }

    if (txSnap) {
      await patchDocREST('transactions', orderRef, {
        status: 'Success',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({ success: true, amount: exactAmount, clearedBills: targetBillIds.length }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
