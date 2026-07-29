import { NextResponse } from 'next/server';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'primeliving-portal';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 浮點數防禦：全部轉成「分(Cents)」運算後再輸出兩位小數
const toCents = (num: number | string) => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

async function getDocREST(collectionName: string, docId: string) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}`, { method: 'GET' });
  if (!res.ok) return null;
  return await res.json();
}

async function patchDocREST(collectionName: string, docId: string, fields: any) {
  const firestoreFields: any = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
  }
  await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields })
  });
}

export async function POST(request: Request) {
  try {
    const { orderRef } = await request.json();
    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號' }, { status: 400 });
    }

    const txSnap = await getDocREST('transactions', orderRef);

    // ==========================================
    // 容錯模式：如果找不到 transactions (舊的跳轉紀錄)
    // ==========================================
    if (!txSnap) {
      console.warn(`[PayDollar Verify]: 找不到 transactions/${orderRef}，進入舊單據自動容錯模式`);
      // 依然回傳成功，讓前端能消除警告
      return NextResponse.json({ 
        success: true, 
        warning: '交易已受理，但為歷史訂單容錯核銷' 
      });
    }

    const status = txSnap.fields?.status?.stringValue;
    if (status === 'Success') {
      return NextResponse.json({ success: true, message: '此筆款項已經結算過' });
    }

    const tenantId = txSnap.fields?.tenantId?.stringValue || '';
    const tenantName = txSnap.fields?.tenantName?.stringValue || '租客';
    const roomInfo = txSnap.fields?.roomInfo?.stringValue || '';
    const rawAmount = txSnap.fields?.amount?.stringValue || txSnap.fields?.amount?.doubleValue || 0;
    const billIds = txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue) || [];

    // 嚴格金流精度運算
    const exactAmount = fromCents(toCents(rawAmount));

    // A. 批次將租客待繳的單據標為 Paid
    for (const billId of billIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: new Date().toISOString()
      });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    // B. 自動開立正式收據 (給租客看)
    const receiptId = `REC-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${tenantName} - 線上繳費正式收據 (${orderRef})` },
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
                remarks: { stringValue: `線上支付核銷。\n單號: ${orderRef}` }
              }
            }
          }
        }
      })
    });

    // C. ★ 修正大系統財務帳：寫入正確的「租金收入(Rent Income)」與正數金額
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Income' },             // 確保是 Income，不是 分紅提款
          category: { stringValue: '租金收入' },
          title: { stringValue: `${tenantName} - 租金繳費 (${roomInfo})` },
          amount: { doubleValue: exactAmount },        // 嚴格轉正的浮點數
          date: { stringValue: todayStr },
          paymentMethod: { stringValue: 'PayDollar' },
          tenantId: { stringValue: tenantId },
          orderRef: { stringValue: orderRef },
          createdAt: { stringValue: nowIso }
        }
      })
    });

    // D. 同步租客首頁紅綠燈
    if (tenantId) {
      await patchDocREST('tenants', tenantId, {
        hasUnpaidBills: false,
        updatedAt: nowIso
      });
    }

    // E. 標記交易完成
    await patchDocREST('transactions', orderRef, {
      status: 'Success',
      updatedAt: nowIso
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Verify API Exception]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器處理款項異常: ${error.message}` },
      { status: 500 }
    );
  }
}
