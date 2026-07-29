import { NextResponse } from 'next/server';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'primeliving-portal';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 嚴格整數(Cents)運算，避免 JavaScript 浮點數誤差
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

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

async function queryREST(collectionName: string, fieldName: string, value: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath: fieldName },
            op: 'EQUAL',
            value: { stringValue: value }
          }
        }
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .filter((item: any) => item.document)
    .map((item: any) => ({
      id: item.document.name.split('/').pop(),
      ...item.document
    }));
}

export async function POST(request: Request) {
  try {
    const { orderRef, tenantId: reqTenantId, tenantName: reqTenantName, roomInfo: reqRoomInfo, fallbackAmount } = await request.json();
    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號 orderRef' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const txSnap = await getDocREST('transactions', orderRef);

    let tenantId = reqTenantId || '';
    let tenantName = reqTenantName || '租客';
    let roomInfo = reqRoomInfo || '';
    let exactAmount = fromCents(toCents(fallbackAmount || 20400));
    let billIds: string[] = [];

    if (txSnap) {
      if (txSnap.fields?.status?.stringValue === 'Success') {
        return NextResponse.json({ success: true, message: '此款項已完成核銷' });
      }
      tenantId = txSnap.fields?.tenantId?.stringValue || tenantId;
      tenantName = txSnap.fields?.tenantName?.stringValue || tenantName;
      roomInfo = txSnap.fields?.roomInfo?.stringValue || roomInfo;
      const rawAmount = txSnap.fields?.amount?.stringValue || txSnap.fields?.amount?.doubleValue;
      if (rawAmount) exactAmount = fromCents(toCents(rawAmount));
      billIds = txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue) || [];
    }

    // ==========================================
    // 1. 強制將單據改為 Paid / Completed
    // ==========================================
    if (billIds.length > 0) {
      for (const billId of billIds) {
        await patchDocREST('documents', billId, {
          paymentStatus: 'Paid',
          status: 'Completed',
          updatedAt: nowIso
        });
      }
    } else if (tenantId) {
      // 容錯：若無指定 ID，自動掃描該租客名下所有的 Unpaid / Pending 帳單強制修改
      const userDocs = await queryREST('documents', 'formData.tenantId', tenantId);
      for (const doc of userDocs) {
        const pStatus = doc.fields?.paymentStatus?.stringValue;
        if (pStatus === 'Unpaid' || pStatus === 'Pending') {
          await patchDocREST('documents', doc.id, {
            paymentStatus: 'Paid',
            status: 'Completed',
            updatedAt: nowIso
          });
        }
      }
    }

    // ==========================================
    // 2. 開立租客收據
    // ==========================================
    const receiptId = `REC-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${tenantName} - 線上繳款收據 (${orderRef})` },
          isCompanyChopApplied: { booleanValue: true },
          createdAt: { stringValue: nowIso },
          formData: {
            mapValue: {
              fields: {
                tenantId: { stringValue: tenantId },
                tenantName: { stringValue: tenantName },
                roomName: { stringValue: roomInfo },
                docDate: { stringValue: todayStr },
                paymentMethod: { stringValue: 'PayDollar' },
                totalReceived: { doubleValue: exactAmount },
                remarks: { stringValue: `PayDollar 線上授權成功\n單號: ${orderRef}` }
              }
            }
          }
        }
      })
    });

    // ==========================================
    // 3. 注入大系統「資產財務結算中心 - 本月收租 (AR)」
    // ==========================================
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'AR' },
          category: { stringValue: '租金收入' },
          title: { stringValue: `${tenantName} - ${roomInfo} 租金繳交` },
          amount: { doubleValue: exactAmount },
          date: { stringValue: todayStr },
          paymentMethod: { stringValue: 'PayDollar' },
          tenantId: { stringValue: tenantId },
          orderRef: { stringValue: orderRef },
          status: { stringValue: 'Paid' },
          createdAt: { stringValue: nowIso }
        }
      })
    });

    // ==========================================
    // 4. 清除租客欠款警示旗標
    // ==========================================
    if (tenantId) {
      await patchDocREST('tenants', tenantId, {
        hasUnpaidBills: false,
        updatedAt: nowIso
      });
    }

    if (txSnap) {
      await patchDocREST('transactions', orderRef, {
        status: 'Success',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({ success: true, amount: exactAmount });
  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
