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

    // 1. 同時更新 transactions、finances、finance_records 三個集合，將 $60,600 正式設為 income / AR
    const collections = ['transactions', 'finances', 'finance_records'];
    for (const colName of collections) {
      const snap = await adminDb.collection(colName).where('amount', '==', 60600).get();
      snap.docs.forEach((doc) => {
        batch.set(doc.ref, {
          type: 'income',            // ★ 設為 income 讓大後台直接匹配藍色「應收」
          category: '租金收款',
          title: '曾敏 - Room A 租金繳納 ($60,600)',
          status: 'completed',
          updatedAt: nowIso
        }, { merge: true });
        affectedCount++;
      });
    }

    // 2. 將曾敏在 tenants 集合中的欠款歸零，讓「本月收租 (AR)」轉為綠色已繳費
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
      message: `全系統修復成功！已將 transactions 與 finances 同步更新為 income (應收)。`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
