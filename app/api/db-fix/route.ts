import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const toCents = (num: number | string) => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST() {
  try {
    const batch = adminDb.batch();
    const nowIso = new Date().toISOString();

    // 1. 抓取 Tolloy Yu 租客資料
    const tenantsSnap = await adminDb.collection('tenants')
      .where('name', '==', 'Tolloy Yu')
      .get();

    if (tenantsSnap.empty) {
      return NextResponse.json({ success: false, error: '找不到 Tolloy Yu 租客' }, { status: 404, headers: corsHeaders });
    }

    const tenantDoc = tenantsSnap.docs[0];
    const tenantId = tenantDoc.id;

    // 2. 將 $13,600 單據恢復為待繳費 (Unpaid / Pending)
    const docsSnap = await adminDb.collection('documents')
      .where('formData.tenantId', '==', tenantId)
      .get();

    docsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const amt = Number(data.formData?.totalAmount || data.formData?.amount || 0);
      const dueDate = data.formData?.dueDate || data.formData?.docDate || '';

      if (amt === 13600 || dueDate.includes('2026-07-28')) {
        batch.update(doc.ref, {
          paymentStatus: 'Unpaid',
          status: 'Pending',
          updatedAt: nowIso
        });
      }
    });

    // 3. 重新計算所有待繳單據總額 (含 $13,600)
    const unpaidDocs = docsSnap.docs.filter((doc) => {
      const data = doc.data();
      const amt = Number(data.formData?.totalAmount || data.formData?.amount || 0);
      const dueDate = data.formData?.dueDate || data.formData?.docDate || '';
      const isTarget = amt === 13600 || dueDate.includes('2026-07-28');
      const isPaid = data.paymentStatus === 'Paid' || data.status === 'Completed';
      return isTarget || !isPaid;
    });

    const totalUnpaidCents = unpaidDocs.reduce((sum, d) => {
      const data = d.data();
      return sum + toCents(data.formData?.totalAmount || data.formData?.amount || 0);
    }, 0);

    const totalUnpaid = fromCents(totalUnpaidCents);

    batch.update(tenantDoc.ref, {
      amountDue: totalUnpaid,
      hasUnpaidBills: true,
      updatedAt: nowIso
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `重置成功！Tolloy Yu 的 $13,600 單據已恢復為待繳費 (Unpaid)，總欠款重置為 $${totalUnpaid.toLocaleString()}`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
