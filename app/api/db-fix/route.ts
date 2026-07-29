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
    const todayStr = new Date().toISOString().split('T')[0];
    let affectedCount = 0;

    const collections = ['transactions', 'finances', 'finance_records'];
    for (const colName of collections) {
      const snap = await adminDb.collection(colName).where('amount', '==', 60600).get();
      snap.docs.forEach((doc) => {
        batch.set(doc.ref, {
          type: 'income',
          category: '租金收款',
          title: '曾敏 - Room A 租金繳納 ($60,600)',
          status: 'completed',
          dueDate: todayStr,        // ✦ 補齊期限日期
          completedDate: todayStr,  // ✦ 補齊完成日期 (讓總覽軌跡抓到 2026-07-30)
          updatedAt: new Date().toISOString()
        }, { merge: true });
        affectedCount++;
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      affectedCount,
      message: `成功將 $60,600 補齊交易日期 (${todayStr}) 與正式標記「租金收款」！`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
