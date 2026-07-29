import { NextResponse } from 'next/server';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'primeliving-portal';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 嚴格 Cent (分) 轉換，杜絕 JS 浮點數誤差
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
    const { 
      orderRef, 
      tenantId: reqTenantId, 
      tenantName: reqTenantName, 
      roomInfo: reqRoomInfo, 
      fallbackAmount,
      billIds: reqBillIds
    } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const txSnap = await getDocREST('transactions', orderRef);

    let tenantId = reqTenantId || '';
    let tenantName = reqTenantName || '曾敏';
    let roomInfo = reqRoomInfo || 'Room A';
    let paidCents = toCents(fallbackAmount || 60600);
    let billIds: string[] = reqBillIds || [];

    if (txSnap) {
      if (txSnap.fields?.status?.stringValue === 'Success') {
        return NextResponse.json({ success: true, message: '此訂單已完成核銷，不重複記帳' });
      }
      tenantId = txSnap.fields?.tenantId?.stringValue || tenantId;
      tenantName = txSnap.fields?.tenantName?.stringValue || tenantName;
      roomInfo = txSnap.fields?.roomInfo?.stringValue || roomInfo;
      const rawAmount = txSnap.fields?.amount?.stringValue || txSnap.fields?.amount?.doubleValue;
      if (rawAmount) paidCents = toCents(rawAmount);
      const txBills = txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue);
      if (txBills && txBills.length > 0) billIds = txBills;
    }

    // 1. 強制將指定單據或名下未繳費帳單全部轉為 Paid
    if (billIds.length > 0) {
      for (const billId of billIds) {
        await patchDocREST('documents', billId, {
          paymentStatus: 'Paid',
          status: 'Completed',
          updatedAt: nowIso
        });
      }
    } else if (tenantId) {
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

    // 2. 扣減應付額 amountDue 並一鍵消除紅燈 hasUnpaidBills
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
        hasUnpaidBills: remainsDue > 0, // ★ 精確判斷：只要付清，必定轉 false
        updatedAt: nowIso
      });
    }

    // 3. 自動開立已繳租金電子收據 (給租客備查)
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
          summary: { stringValue: `${tenantName} - 線上租金繳納收據 (${orderRef})` },
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
                remarks: { stringValue: `線上支付授權成功\n交易流水號: ${orderRef}` }
              }
            }
          }
        }
      })
    });

    // 4. 寫入大後台資產財務結算中心 -「本月收租 (AR)」(不再是分紅提款！)
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'AR' },               // ★ 會計分類：本月收租
          category: { stringValue: '租金收款' },
          title: { stringValue: `${tenantName} - ${roomInfo} 租金繳納` },
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

    // 5. 推送 CRM 官方繳費成功通告
    if (tenantId) {
      const crmLogId = `CRM-${Date.now()}`;
      await fetch(`${FIRESTORE_URL}/inquiries?documentId=${crmLogId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            tenantId: { stringValue: tenantId },
            name: { stringValue: tenantName },
            roomInfo: { stringValue: roomInfo },
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

    return NextResponse.json({ success: true, amount: exactAmount });
  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
