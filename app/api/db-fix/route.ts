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

export async function POST(request: Request) {
  try {
    const batch = adminDb.batch();
    const nowIso = new Date().toISOString();
    const tenantId = '4Cy3Kn9lw4k64FQRwLZM';
    let affectedCount = 0;

    // 1. 強制修正 finances / finance_records 集合中的 $60,600 標籤，徹底去除「分紅提款」
    const collections = ['finances', 'finance_records', 'transactions'];
    for (const colName of collections) {
      const snap = await adminDb.collection(colName).where('amount', '==', 60600).get();
      snap.docs.forEach((doc) => {
        batch.set(doc.ref, {
          type: 'AR',
          category: '租金收款',
          title: '曾敏 - Room A 租金繳納 ($60,600)',
          updatedAt: nowIso
        }, { merge: true });
        affectedCount++;
      });
    }

    // 2. 修復大後台【本月收租 (AR)】視圖所讀取的單據 (documents)，將曾敏相關單據全數轉為 Paid
    const billsSnap = await adminDb.collection('documents')
      .where('formData.tenantId', '==', tenantId)
      .get();

    billsSnap.docs.forEach((doc) => {
      batch.set(doc.ref, {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: nowIso
      }, { merge: true });
      affectedCount++;
    });

    // 3. 同步歸零 tenants 主表應繳金額，消滅待繳標籤
    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    batch.set(tenantRef, {
      amountDue: 0,
      hasUnpaidBills: false,
      updatedAt: nowIso
    }, { merge: true });
    affectedCount++;

    await batch.commit();

    return NextResponse.json({
      success: true,
      affectedCount,
      message: `成功完成全系統雙向會計對帳修正！共更新 ${affectedCount} 筆底層資料。`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[DB Repair Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
