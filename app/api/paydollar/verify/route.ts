import { NextResponse } from 'next/server';

// ★ 強制指定你的正式大後台 Firebase 專案 ID，不再被衝突的環境變數干擾
const PROJECT_ID = 'jiayu-pm-system';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 精準 Cents 轉換：杜絕 JS 浮點數誤差
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
    const txSnap = await getDocREST('transactions', orderRef);

    let resolvedTenantId = tenantId || '';
    let resolvedName = tenantName || '曾敏';
    let resolvedRoom = roomInfo || 'Room A';
    let paidCents = toCents(fallbackAmount || 0);
    let targetBillIds: string[] = Array.isArray(billIds) ? billIds.filter(Boolean) : [];

    // 1. 交易已存在則取其金額與設定
    if (txSnap) {
      if (txSnap.fields?.status?.stringValue === 'Success') {
        return NextResponse.json({ success: true, message: '已完成核銷，不重複記帳' }, { status: 200, headers: corsHeaders });
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

    // ★ 2. 無論傳入什麼，沒有 ID 就把該租客名下所有逾期/今日到期的「全部」未繳帳單抓出來
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
          
          return owner === resolvedTenantId && ['Pending', 'Unpaid'].includes(status) && dueDate <= todayStr;
        })
        .map((item: any) => item.name.split('/').pop());
    }

    // 3. 批次核銷每一張單
    for (const billId of targetBillIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    }

    // 4. 精算出剩下的應付餘額，餘額為 0 即滅掉紅燈
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

    // 5. 開立正式電子收款收據 (Receipt)
    const exactAmount = fromCents(paidCents);
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

    // ★ 6. 寫入大後台財務中心 - 「AR 租金收款」 (絕對不寫分紅)
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'AR' },               // ★ 嚴格寫死 AR
          category: { stringValue: '租金收款' },     // ★ 嚴格寫死租金收款
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

    // 7. 寫入 CRM 互動通知
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
