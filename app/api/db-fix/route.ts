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

/**
 * 系統級時間容錯模組：將 Firestore Timestamp / ISO String / JS Date 統一轉換為標準 ISO 字串
 */
const toSafeIsoString = (val: any): string => {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (val._seconds) return new Date(val._seconds * 1000).toISOString();
  return new Date().toISOString();
};

/**
 * 取得 YYYY-MM-DD 格式，供財務報表按日/月分組使用
 */
const toSafeDateString = (val: any): string => {
  try {
    return toSafeIsoString(val).split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

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

    if (action === 'MIGRATE_60600_TO_FINANCE') {
      const transSnap = await adminDb.collection('transactions').where('amount', '==', 60600).get();

      transSnap.docs.forEach((doc: any) => {
        const data = doc.data();
        const nowIso = new Date().toISOString();
        const createdIso = toSafeIsoString(data.createdAt);
        const docDate = toSafeDateString(data.createdAt);

        // 會計分錄規範化：寫入主財務表
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
          createdAt: createdIso,
          updatedAt: nowIso
        };

        batch.set(adminDb.collection('finances').doc(`FIN-${doc.id}`), standardFinanceData, { merge: true });
        batch.set(adminDb.collection('finance_records').doc(`FIN-${doc.id}`), standardFinanceData, { merge: true });
        batch.update(doc.ref, { type: 'AR', category: '租金收款', updatedAt: nowIso });
        
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
      message: `成功完成會計同步：$60,600 款項已入帳至 finances 與 finance_records 主表 (更新 ${affectedCount} 筆)`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Migration Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
