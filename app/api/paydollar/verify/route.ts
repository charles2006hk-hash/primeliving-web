import { NextResponse } from 'next/server';

// ★ 強制鎖定大後台統一專案 ID
const TARGET_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jiayu-pm-system';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT_ID}/databases/(default)/documents`;

// 嚴格整數運算：將金額轉仙 (Cents)
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

    // 1. 若無傳遞單據 ID，自動找出該租客名下到期/逾期的所有未繳帳單
    if (targetBillIds.length === 0 && resolvedTenantId) {
      const allDocsRes = await fetch(`${FIRESTORE_URL}/documents`);
      if (allDocsRes.ok) {
        const allDocsData = await allDocsRes.json();
        targetBillIds = (allDocsData.documents || [])
          .filter((item: any) => {
            const f = item.fields || {};
            const fd = f.formData?.mapValue?.fields || {};
            const owner = fd.tenantId?.stringValue || f.tenantId?.stringValue;
            const status = f.status?.stringValue || f.paymentStatus?.stringValue;
            const dueDate = fd.dueDate?.stringValue || f.createdAt?.timestampValue || '';
            return owner === resolvedTenantId && ['Pending', 'Unpaid'].includes(status) && dueDate <= todayStr;
          })
          .map((item: any) => item.name.split('/').pop());
      }
    }

    // 2. 批次核銷單據狀態為 Paid
    for (const billId of targetBillIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    }

    // 3. 扣減 tenants 應付餘額，餘額為 0 即滅掉逾期紅燈
    if (resolvedTenantId) {
      const tenantSnap = await getDocREST('tenants', resolvedTenantId);
      const currentDueCents = toCents(
        tenantSnap?.fields?.amountDue?.doubleValue || 
        tenantSnap?.fields?.amountDue?.integerValue || 0
      );
      const remainsDue = fromCents(Math.max(0, currentDueCents - paidCents));

      await patchDocREST('tenants', resolvedTenantId, {
        amountDue: remainsDue,
        hasUnpaidBills: remainsDue > 0,
        updatedAt: nowIso
      });
    }

    // 4. 開立正式電子收款收據 (Receipt)
    const receiptId = `REC-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${resolvedName} - 租金繳納收據 (${orderRef})` },
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
                remarks: { stringValue: `線上支付授權成功\n交易流水號: ${orderRef}\n已完成核銷 ${targetBillIds.length} 張單據` }
              }
            }
          }
        }
      })
    });

    // ★ 5. 雙向同步寫入 AR 財務帳 (同時寫入 finances 與 finance_records 兩個集合！)
    const financeId = `FIN-${Date.now()}`;
    const financePayload = {
      fields: {
        type: { stringValue: 'AR' },               // ★ 會計分類：租金應收 (AR)
        category: { stringValue: '租金收款' },     // ★ 絕不是分紅提款
        title: { stringValue: `${resolvedName} - ${resolvedRoom} 租金繳納` },
        amount: { doubleValue: exactAmount },
        date: { stringValue: todayStr },
        paymentMethod: { stringValue: 'PayDollar' },
        tenantId: { stringValue: resolvedTenantId },
        orderRef: { stringValue: orderRef },
        status: { stringValue: 'Paid' },
        createdAt: { stringValue: nowIso }
      }
    };

    const [finRes1, finRes2] = await Promise.all([
      fetch(`${FIRESTORE_URL}/finances?documentId=${financeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(financePayload)
      }),
      fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(financePayload)
      })
    ]);

    // 6. CRM 通知日誌
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
            message: `【系統通知：繳費確認】\n已成功通過 PayDollar 繳清租金 HK$${exactAmount.toLocaleString()}。單據與欠款已自動核銷。`,
            author: { stringValue: '系統自動化' },
            type: { stringValue: 'official_notice' },
            status: { stringValue: 'Resolved' },
            createdAt: { stringValue: nowIso },
            isExistingTenant: { booleanValue: true }
          }
        })
      });
    }

    // ★ 關鍵：回傳明確的版本標記與寫入狀態，便於客戶端調試
    return NextResponse.json({ 
      success: true, 
      api_version: "2026-v4",
      amount: exactAmount, 
      clearedBills: targetBillIds.length,
      debugWriteTargets: {
        "jiayu-pm-system_finances": finRes1.ok,
        "jiayu-pm-system_finance_records": finRes2.ok
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
