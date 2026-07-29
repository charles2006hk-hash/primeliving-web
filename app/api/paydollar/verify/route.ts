import { NextResponse } from 'next/server';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jiayu-pm-system';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 嚴格整數運算：把元轉成分 (Cents)，杜絕浮點數誤差
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

async function getDocREST(collectionName: string, docId: string) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}`, { method: 'GET' });
  if (!res.ok) return null;
  return await res.json();
}

async function patchDocREST(collectionName: string, docId: string, fields: Record<string, any>) {
  const firestoreFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
  }
  const maskParams = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}?${maskParams}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields })
  });
}

export async function POST(request: Request) {
  try {
    const { orderRef, tenantId, tenantName, roomInfo, fallbackAmount, billIds } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號' }, { status: 400, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const paidCents = toCents(fallbackAmount || 0);

    // 1. 精準讀取要核銷的單據清單
    let targetBillIds: string[] = Array.isArray(billIds) ? billIds.filter(Boolean) : [];

    // 若前端沒有傳入 billIds，自動掃描該租客已到期或逾期(含今日)的全部單據
    if (targetBillIds.length === 0 && tenantId) {
      const allDocsRes = await fetch(`${FIRESTORE_URL}/documents`);
      const allDocsData = await allDocsRes.json();
      const allDocs = allDocsData.documents || [];

      targetBillIds = allDocs
        .filter((item: any) => {
          const f = item.fields || {};
          const fd = f.formData?.mapValue?.fields || {};
          const owner = fd.tenantId?.stringValue || f.tenantId?.stringValue;
          const status = f.status?.stringValue || f.paymentStatus?.stringValue;
          const dueDate = fd.dueDate?.stringValue || f.createdAt?.timestampValue || '';
          return owner === tenantId && ['Pending', 'Unpaid'].includes(status) && dueDate <= todayStr;
        })
        .map((item: any) => item.name.split('/').pop());
    }

    // ★ 批次核銷：不管 1 筆還是 10 筆，全部轉為 Paid
    for (const billId of targetBillIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    }

    // 2. 扣減 tenants 應付餘額，餘額歸零即滅紅燈
    if (tenantId) {
      const tenantSnap = await getDocREST('tenants', tenantId);
      const currentDueCents = toCents(
        tenantSnap?.fields?.amountDue?.doubleValue || 
        tenantSnap?.fields?.amountDue?.integerValue || 
        0
      );
      const remainsDue = fromCents(Math.max(0, currentDueCents - paidCents));

      await patchDocREST('tenants', tenantId, {
        amountDue: remainsDue,
        hasUnpaidBills: remainsDue > 0,
        updatedAt: nowIso
      });
    }

    // 3. 自動開立電子收據 (Receipt)
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
          summary: { stringValue: `${tenantName || '租客'} - 租金繳交收據 (${orderRef})` },
          isCompanyChopApplied: { booleanValue: true },
          createdAt: { stringValue: nowIso },
          formData: {
            mapValue: {
              fields: {
                tenantId: { stringValue: tenantId || '' },
                tenantName: { stringValue: tenantName || '' },
                roomName: { stringValue: roomInfo || '' },
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

    // 4. 寫入財務中心 - 本月收租 (AR) ★ 修正舊版「分紅提款」的錯誤
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'AR' },               // ★ 會計分類：租金應收 (AR)
          category: { stringValue: '租金收款' },     // ★ 不再是分紅提款！
          title: { stringValue: `${tenantName || '租客'} - ${roomInfo || ''} 租金繳納` },
          amount: { doubleValue: exactAmount },
          date: { stringValue: todayStr },
          paymentMethod: { stringValue: 'PayDollar' },
          tenantId: { stringValue: tenantId || '' },
          orderRef: { stringValue: orderRef },
          status: { stringValue: 'Paid' },
          createdAt: { stringValue: nowIso }
        }
      })
    });

    return NextResponse.json({ success: true, amount: exactAmount, clearedBills: targetBillIds.length }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
