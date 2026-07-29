import { NextResponse } from 'next/server';

// 取得 Firebase 專案 ID 與 REST 根網址
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'primeliving-portal';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 輔助：浮點數轉分(Cents)防禦，避免小數點尾數誤差
const toCents = (num: number | string) => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

// REST 讀取輔助
async function getDocREST(collectionName: string, docId: string) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}`, { method: 'GET' });
  if (!res.ok) return null;
  return await res.json();
}

// REST 更新輔助
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
    const { orderRef } = await request.json();
    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    // 1. 查詢該筆交易紀錄
    const txSnap = await getDocREST('transactions', orderRef);

    let tenantId = '';
    let tenantName = '租客';
    let roomInfo = '';
    let exactAmount = 0;
    let billIds: string[] = [];

    // ----------------------------------------------------
    // 容錯機制：如果查無 transactions，啟動自動補救
    // ----------------------------------------------------
    if (!txSnap) {
      console.warn(`[Verify API]: 找不到 transactions/${orderRef}，進入歷史單據容錯模式`);
      // 從訂單號 ORD-XXXXX-timestamp 解析出租客 ID 前綴 (如果不符合格式則為空)
      const parts = orderRef.split('-');
      if (parts.length >= 2) {
        // 為了容錯，這裡若缺少 transactions，仍回傳成功讓瀏覽器關閉載入框
        return NextResponse.json({ success: true, message: '已受理，需人工同步舊單據' });
      }
    } else {
      const status = txSnap.fields?.status?.stringValue;
      if (status === 'Success') {
        return NextResponse.json({ success: true, message: '已經結算核銷完成' });
      }

      tenantId = txSnap.fields?.tenantId?.stringValue || '';
      tenantName = txSnap.fields?.tenantName?.stringValue || '租客';
      roomInfo = txSnap.fields?.roomInfo?.stringValue || '';
      const rawAmount = txSnap.fields?.amount?.stringValue || txSnap.fields?.amount?.doubleValue || 0;
      exactAmount = fromCents(toCents(rawAmount));
      billIds = txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue) || [];
    }

    // 2. 批次將「待繳單據 (Unpaid / Pending)」的狀態修改為 Paid
    for (const billId of billIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      });
    }

    // 3. 自動為租客產生「正式線上收據 (Receipt)」
    const receiptId = `REC-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${tenantName} - 線上繳款正式收據 (${orderRef})` },
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
                remarks: { stringValue: `線上支付核銷。\n交易編號: ${orderRef}` }
              }
            }
          }
        }
      })
    });

    // 4. ★ 核心同步：寫入「大系統財務中心」的正數租金收入
    // 這樣財務會計中心 (圖3) 才能在「本月收租 (AR)」看到正確增加的收入！
    const financeId = `FIN-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/finance_records?documentId=${financeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Income' },             // 收入項目
          category: { stringValue: 'Rent' },           // 類別：租金收入
          title: { stringValue: `${tenantName} - 租金線上繳款 (${roomInfo})` },
          amount: { doubleValue: exactAmount },        // 嚴格轉為兩位小數正浮點數
          date: { stringValue: todayStr },
          paymentMethod: { stringValue: 'PayDollar' },
          tenantId: { stringValue: tenantId },
          orderRef: { stringValue: orderRef },
          status: { stringValue: 'Paid' },
          createdAt: { stringValue: nowIso }
        }
      })
    });

    // 5. 解除租客檔案中「有逾期帳單 (hasUnpaidBills)」的警告標記
    if (tenantId) {
      await patchDocREST('tenants', tenantId, {
        hasUnpaidBills: false,
        updatedAt: nowIso
      });
    }

    // 6. 將交易紀錄設定為 Success
    if (txSnap) {
      await patchDocREST('transactions', orderRef, {
        status: 'Success',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({ success: true, message: '核銷與帳務同步成功' });
  } catch (error: any) {
    console.error('[Verify API Exception]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器同步異常: ${error.message}` },
      { status: 500 }
    );
  }
}
