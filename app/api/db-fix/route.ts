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

// 1. GET: 撈取最新的 20 筆 財務紀錄 (finances) 與 曾敏的帳單 (documents)
export async function GET() {
  try {
    const financesSnap = await adminDb.collection('finances')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

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
        finances: parseDocs(financesSnap),
        tenantBills: parseDocs(billsSnap)
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[DB-Fix GET Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 2. POST: 執行資料庫直接修復與平帳 (相容 paymentStatus = undefined 的遺留異常)
export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    const batch = adminDb.batch();
    let affectedCount = 0;

    // 動作 A: 強制平帳曾敏 1, 2, 3 期帳單 (相容 undefined / Pending)，歸零欠款並熄滅紅燈
    if (action === 'FORCE_CLEAR_ZENGMIN') {
      const tenantId = '4Cy3Kn9lw4k64FQRwLZM';
      const nowIso = new Date().toISOString();

      const billsSnap = await adminDb.collection('documents')
        .where('formData.tenantId', '==', tenantId)
        .get();

      billsSnap.docs.forEach(doc => {
        const data = doc.data();
        const desc = data?.formData?.items?.[0]?.description || '';
        
        // ★ 精確比對首3期、押金與水電，無視原有 paymentStatus 是否為 undefined
        const isTargetBill = desc.includes('第一期') || 
                             desc.includes('第二期') || 
                             desc.includes('第三期') || 
                             desc.includes('押金') || 
                             desc.includes('水電');

        if (isTargetBill && data.paymentStatus !== 'Paid') {
          batch.update(doc.ref, {
            paymentStatus: 'Paid',
            status: 'Completed',
            updatedAt: nowIso
          });
          affectedCount++;
        }
      });

      // 歸零 tenants 主表欠款額
      const tenantRef = adminDb.collection('tenants').doc(tenantId);
      batch.update(tenantRef, {
        amountDue: 0,
        hasUnpaidBills: false,
        updatedAt: nowIso
      });
      affectedCount++;
    }

    // 動作 B: 跨兩個表同時搜尋並修正 $60,600 的錯誤「分紅提款」為 AR
    if (action === 'FIX_60600_CATEGORY') {
      const collections = ['finances', 'finance_records'];
      for (const colName of collections) {
        const snap = await adminDb.collection(colName).where('amount', '==', 60600).get();
        snap.docs.forEach(doc => {
          const data = doc.data();
          if (String(data.category || '').includes('分紅') || data.type !== 'AR') {
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

    // 動作 C: 一鍵清理 $1 / $10 的測試垃圾數據
    if (action === 'CLEAN_TEST_RECORDS') {
      const collections = ['finances', 'finance_records'];
      for (const colName of collections) {
        const snap1 = await adminDb.collection(colName).where('amount', '==', 1).get();
        const snap10 = await adminDb.collection(colName).where('amount', '==', 10).get();
        [...snap1.docs, ...snap10.docs].forEach(doc => {
          batch.delete(doc.ref);
          affectedCount++;
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
      message: `操作 [${action}] 執行成功，異動了 ${affectedCount} 筆資料庫文件！`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[DB-Fix POST Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
