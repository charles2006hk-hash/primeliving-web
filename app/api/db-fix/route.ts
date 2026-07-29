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

// 1. GET: 直接從 DB 底層撈取最近的 財務紀錄 (finances) 與 曾敏的帳單 (documents)
export async function GET() {
  try {
    // 撈取 finances 集合最新 10 筆
    const financesSnap = await adminDb.collection('finances')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    // 撈取曾敏 (Room A) 名下的租金單據
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

// 2. POST: 執行資料庫直接修復與平帳
export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    const batch = adminDb.batch();
    let affectedCount = 0;

    // 動作 A: 強制平帳曾敏 1, 2, 3 期帳單，歸零欠款、去除逾期紅燈
    if (action === 'FORCE_CLEAR_ZENGMIN') {
      const tenantId = '4Cy3Kn9lw4k64FQRwLZM';
      const nowIso = new Date().toISOString();

      // 1. 更新單據為 Paid
      const billsSnap = await adminDb.collection('documents')
        .where('formData.tenantId', '==', tenantId)
        .get();

      billsSnap.docs.forEach(doc => {
        const desc = doc.data()?.formData?.items?.[0]?.description || '';
        if (desc.includes('第一期') || desc.includes('第二期') || desc.includes('第三期') || desc.includes('押金') || desc.includes('水電')) {
          batch.update(doc.ref, {
            paymentStatus: 'Paid',
            status: 'Completed',
            updatedAt: nowIso
          });
          affectedCount++;
        }
      });

      // 2. 將 tenants 表 amountDue 設為 0
      const tenantRef = adminDb.collection('tenants').doc(tenantId);
      batch.update(tenantRef, {
        amountDue: 0,
        hasUnpaidBills: false,
        updatedAt: nowIso
      });
      affectedCount++;
    }

    // 動作 B: 修正 $60,600 的錯誤「分紅提款」分類為 AR 租金收款
    if (action === 'FIX_60600_CATEGORY') {
      const collections = ['finances', 'finance_records'];
      for (const colName of collections) {
        const snap = await adminDb.collection(colName).where('amount', '==', 60600).get();
        snap.docs.forEach(doc => {
          batch.update(doc.ref, {
            type: 'AR',
            category: '租金收款',
            title: '曾敏 - Room A 租金繳納 ($60,600)',
            updatedAt: new Date().toISOString()
          });
          affectedCount++;
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
