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

export async function GET() {
  try {
    const targetCollections = ['finances', 'finance_records', 'transactions'];
    const foundRecords: any[] = [];

    for (const colName of targetCollections) {
      const snap = await adminDb.collection(colName).limit(30).get();
      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        const amount = Number(data.amount || data.totalAmount || data.value || 0);
        const text = JSON.stringify(data);

        // 鎖定金額為 $60,600 的紀錄
        if (amount === 60600 || text.includes('曾敏') || text.includes('60600')) {
          foundRecords.push({
            id: doc.id,
            _collection: colName,
            title: data.title || data.description || '曾敏 - Room A 租金繳納',
            category: data.category || '租金收款',
            type: data.type || 'AR',
            amount: amount,
            raw: data
          });
        }
      });
    }

    return NextResponse.json({ success: true, data: { finances: foundRecords } }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    const batch = adminDb.batch();
    let affectedCount = 0;

    // 將 transactions 中的 $60,600 正規化並同步寫入 finances & finance_records
    if (action === 'MIGRATE_60600_TO_FINANCE') {
      const transSnap = await adminDb.collection('transactions').where('amount', '==', 60600).get();
      
      transSnap.docs.forEach((doc: any) => {
        const data = doc.data();
        const nowIso = new Date().toISOString();
        const docDate = data.createdAt?.split('T')[0] || nowIso.split('T')[0];
        
        // 標準會計分錄結構
        const standardFinanceData = {
          type: 'AR',
          category: '租金收款',
          title: '曾敏 - Room A 租金繳納 ($60,600)',
          amount: 60600,
          date: docDate,
          paymentMethod: 'PayDollar',
          tenantId: '4Cy3Kn9lw4k64FQRwLZM',
          orderRef: doc.id,
          status: 'Paid',
          createdAt: data.createdAt || nowIso,
          updatedAt: nowIso
        };

        // 使用相同的 ID 寫入至兩個主表，避免重複建立
        batch.set(adminDb.collection('finances').doc(`FIN-${doc.id}`), standardFinanceData, { merge: true });
        batch.set(adminDb.collection('finance_records').doc(`FIN-${doc.id}`), standardFinanceData, { merge: true });
        
        // 確保原始紀錄分類正確
        batch.update(doc.ref, { type: 'AR', category: '租金收款' });
        affectedCount += 2;
      });
    }

    if (affectedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      action,
      affectedCount,
      message: `成功將 $60,600 租金款項遷移並補齊至主財務報表 (共更新 ${affectedCount} 筆資料)！`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
