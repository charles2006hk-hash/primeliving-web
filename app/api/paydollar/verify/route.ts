import { NextResponse } from 'next/server';

// 取得 Firebase 專案設定
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'primeliving-portal';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 輔助函數：透過 Firestore REST API 安全寫入與讀取 (解決 Client SDK Server-side 權限不足問題)
async function getDocREST(collectionName: string, docId: string) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionName}/${docId}`, { method: 'GET' });
  if (!res.ok) return null;
  return await res.json();
}

async function patchDocREST(collectionName: string, docId: string, fields: any) {
  // 將 JSON 轉為 Firestore REST 格式
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

    // 1. 查詢本次交易
    const txSnap = await getDocREST('transactions', orderRef);
    if (!txSnap) {
      return NextResponse.json({ success: false, error: '找不到對應交易記錄' }, { status: 404 });
    }

    // 解析 REST 回傳格式
    const txData = {
      status: txSnap.fields?.status?.stringValue,
      tenantId: txSnap.fields?.tenantId?.stringValue,
      tenantName: txSnap.fields?.tenantName?.stringValue,
      roomInfo: txSnap.fields?.roomInfo?.stringValue,
      amount: txSnap.fields?.amount?.stringValue || txSnap.fields?.amount?.doubleValue,
      billIds: txSnap.fields?.billIds?.arrayValue?.values?.map((v: any) => v.stringValue) || []
    };

    // 防重入：如已核銷則返回
    if (txData.status === 'Success') {
      return NextResponse.json({ success: true, message: '已完成核銷' });
    }

    // A. 批次將帳單狀態改為已繳 (Paid / Completed)
    for (const billId of txData.billIds) {
      await patchDocREST('documents', billId, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: new Date().toISOString()
      });
    }

    // B. 自動開立正式收據
    const receiptId = `REC-${Date.now()}`;
    await fetch(`${FIRESTORE_URL}/documents?documentId=${receiptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          type: { stringValue: 'Receipt' },
          paymentStatus: { stringValue: 'Paid' },
          status: { stringValue: 'Completed' },
          summary: { stringValue: `${txData.tenantName || 'Tenant'} - 線上付款正式收據 (${orderRef})` },
          isCompanyChopApplied: { booleanValue: true },
          createdAt: { stringValue: new Date().toISOString() },
          formData: {
            mapValue: {
              fields: {
                tenantId: { stringValue: txData.tenantId || '' },
                tenantName: { stringValue: txData.tenantName || '' },
                roomName: { stringValue: txData.roomInfo || '' },
                docDate: { stringValue: new Date().toISOString().split('T')[0] },
                paymentMethod: { stringValue: 'PayDollar' },
                totalReceived: { doubleValue: Number(txData.amount) || 0 },
                remarks: { stringValue: `由 PayDollar 線上安全支付自動結算。\n訂單編號: ${orderRef}` }
              }
            }
          }
        }
      })
    });

    // C. 將租客的欠款狀態除旗 (消除首頁紅燈)
    if (txData.tenantId) {
      await patchDocREST('tenants', txData.tenantId, {
        hasUnpaidBills: false,
        updatedAt: new Date().toISOString()
      });
    }

    // D. 標記交易記錄為 Success
    await patchDocREST('transactions', orderRef, {
      status: 'Success',
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Verify API Exception]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器核銷異常: ${error.message}` },
      { status: 500 }
    );
  }
}
