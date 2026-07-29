import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// 1. GET: 全方位掃描所有可能記錄了「$60,600」或「分紅」的帳戶集合
export async function GET() {
  try {
    const targetCollections = ['finances', 'finance_records', 'transactions', 'shareholder_draws', 'incomes', 'audit_logs'];
    const foundRecords: any[] = [];

    for (const colName of targetCollections) {
      const snap = await adminDb.collection(colName).limit(30).get();
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        const amount = Number(data.amount || data.totalAmount || data.value || 0);
        const text = JSON.stringify(data);

        // ★ 核心捕捉機制：金額落在 60,000 上下、或文字帶有「曾敏」、「分紅」、「60600」皆捕捉
        if ((amount >= 50000 && amount <= 70000) || text.includes('曾敏') || text.includes('分紅') || text.includes('60600')) {
          foundRecords.push({
            id: doc.id,
            _collection: colName,
            title: data.title || data.description || data.summary || '未知標題',
            category: data.category || data.type || '未分類',
            type: data.type || 'N/A',
            amount: amount,
            raw: data
          });
        }
      });
    }

    // 讀取曾敏名下的帳單
    const billsSnap = await adminDb.collection('documents')
      .where('formData.tenantId', '==', '4Cy3Kn9lw4k64FQRwLZM')
      .get();

    const parseDocs = (snap: any) => snap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({
      success: true,
      data: {
        finances: foundRecords, // 這裡回傳的全是精準捕獲的可疑紀錄
        tenantBills: parseDocs(billsSnap)
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[DB-Fix GET Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 2. POST: 執行徹底的會計分類歸正
export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    const batch = adminDb.batch();
    let affectedCount = 0;

    // 動作 B: 將所有帶有「分紅」或金額大約等於 60600 的可疑紀錄，全部修正為 AR - 租金收款
    if (action === 'FIX_60600_CATEGORY') {
      const targetCollections = ['finances', 'finance_records', 'transactions', 'shareholder_draws', 'incomes'];
      
      for (const colName of targetCollections) {
        const snap = await adminDb.collection(colName).get();
        snap.docs.forEach((doc: any) => {
          const data = doc.data();
          const amount = Number(data.amount || data.totalAmount || 0);
          const text = JSON.stringify(data);

          if ((amount >= 60000 && amount <= 61000) || text.includes('分紅') && text.includes('曾敏')) {
            batch.update(doc.ref, {
              type: 'AR',
              category: '租金收款',
              title: '曾敏 - Room A 租金繳納 ($60,600)',
              updatedAt: new Date().toISOString()
            });
            affectedCount++;
          }
        });
      }
    }

    if (affectedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      action,
      affectedCount,
      message: `操作 [${action}] 執行成功，在底層找出了並異動了 ${affectedCount} 筆相關會計資料！`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[DB-Fix POST Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
