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

// 1. GET: 全盤掃描所有租客與單據，檢查金額不吻合或欄位缺失
export async function GET() {
  try {
    const tenantsSnap = await adminDb.collection('tenants').get();
    const docsSnap = await adminDb.collection('documents').get();

    const allDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const auditResults: any[] = [];

    tenantsSnap.docs.forEach(tenantDoc => {
      const t = tenantDoc.data();
      const tenantId = tenantDoc.id;

      // 撈出該租客名下的所有待繳單據
      const tenantUnpaidBills = allDocs.filter((d: any) => {
        const isBelong = d.formData?.tenantId === tenantId;
        const isPaid = d.paymentStatus === 'Paid' || d.status === 'Completed';
        return isBelong && !isPaid;
      });

      // 精確計算未繳總額 (Cents)
      const calculatedUnpaidCents = tenantUnpaidBills.reduce((sum, b: any) => {
        const amt = Number(b.formData?.totalAmount || b.formData?.amount || 0);
        return sum + toCents(amt);
      }, 0);

      const calculatedUnpaid = fromCents(calculatedUnpaidCents);
      const dbAmountDue = Number(t.amountDue || 0);

      // 檢查欄位異常或金額不對齊
      const hasMissingField = tenantUnpaidBills.some((b: any) => !b.paymentStatus);
      const isDiscrepancy = Math.abs(calculatedUnpaid - dbAmountDue) > 0.01;

      auditResults.push({
        tenantId,
        name: t.name || '未命名',
        roomName: t.roomName || t.roomId || '未知房間',
        dbAmountDue,
        calculatedUnpaid,
        unpaidBillCount: tenantUnpaidBills.length,
        hasMissingField,
        isDiscrepancy,
        status: (isDiscrepancy || hasMissingField) ? 'NEED_FIX' : 'HEALTHY'
      });
    });

    return NextResponse.json({
      success: true,
      totalTenants: auditResults.length,
      needFixCount: auditResults.filter(r => r.status === 'NEED_FIX').length,
      auditResults
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 2. POST: 一鍵校準全資料庫：將 tenant.amountDue 強制校對為單據實算金額，並補齊缺失欄位
export async function POST() {
  try {
    const tenantsSnap = await adminDb.collection('tenants').get();
    const docsSnap = await adminDb.collection('documents').get();
    const batch = adminDb.batch();
    const nowIso = new Date().toISOString();
    let fixedTenants = 0;
    let fixedDocs = 0;

    const allDocs = docsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));

    tenantsSnap.docs.forEach(tenantDoc => {
      const tenantId = tenantDoc.id;
      
      // 1. 修復單據缺失欄位
      const tenantBills = allDocs.filter((d: any) => d.formData?.tenantId === tenantId);
      tenantBills.forEach((b: any) => {
        if (!b.paymentStatus) {
          const isCompleted = b.status === 'Completed';
          batch.update(b.ref, {
            paymentStatus: isCompleted ? 'Paid' : 'Unpaid',
            updatedAt: nowIso
          });
          fixedDocs++;
        }
      });

      // 2. 校準欠款金額 (amountDue)
      const unpaidBills = tenantBills.filter((b: any) => {
        const isPaid = b.paymentStatus === 'Paid' || b.status === 'Completed';
        return !isPaid;
      });

      const exactUnpaidCents = unpaidBills.reduce((sum, b: any) => {
        return sum + toCents(b.formData?.totalAmount || b.formData?.amount || 0);
      }, 0);

      const exactUnpaid = fromCents(exactUnpaidCents);

      batch.update(tenantDoc.ref, {
        amountDue: exactUnpaid,
        hasUnpaidBills: exactUnpaid > 0,
        updatedAt: nowIso
      });
      fixedTenants++;
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `校準完成！共更正了 ${fixedTenants} 位租客的主表欠款，並補齊了 ${fixedDocs} 張單據的歷史欄位。`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
