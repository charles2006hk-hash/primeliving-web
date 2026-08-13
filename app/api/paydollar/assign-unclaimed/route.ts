import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// 金額精確度轉換 (防浮點數誤差)
const toCents = (num: number): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

export async function POST(request: Request) {
  try {
    const { unclaimedId, tenantId, tenantName } = await request.json();

    if (!unclaimedId || !tenantId) {
      return NextResponse.json({ success: false, error: '缺少必要參數' }, { status: 400 });
    }

    const unclaimedRef = adminDb.collection('unclaimed_payments').doc(unclaimedId);
    const unclaimedDoc = await unclaimedRef.get();

    if (!unclaimedDoc.exists || unclaimedDoc.data()?.status === 'Assigned') {
      return NextResponse.json({ success: false, error: '此款項不存在或已被認領' }, { status: 400 });
    }

    const uData = unclaimedDoc.data()!;
    const amountCents = toCents(uData.amount);
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    const batch = adminDb.batch();

    // 1. 生成正式的財務紀錄 (寫入 transactions 與 finances)
    const newTransRef = adminDb.collection('transactions').doc(); // 生成新的正式單號
    const accountingPayload = {
      orderRef: newTransRef.id,
      originalUnclaimedRef: unclaimedId, // 記錄來源
      tenantId,
      tenantName,
      amount: uData.amount,
      originalAmount: uData.amount,
      type: 'income',
      category: '租金收款',
      paymentMethod: uData.paymentMethod,
      paymentMethodDetail: uData.paymentMethodDetail,
      payRef: uData.payRef,
      status: 'completed',
      paymentStatus: 'Paid',
      subtitle: `${uData.subtitle} (手動配單)`,
      description: `固定碼收款人工配對。刷卡總額：$${uData.amount.toLocaleString()}`,
      dueDate: todayStr,
      completedDate: todayStr,
      updatedAt: nowIso
    };

    batch.set(newTransRef, accountingPayload);
    batch.set(adminDb.collection('finances').doc(`FIN-${newTransRef.id}`), accountingPayload);

    // 2. 將未認領款項標記為「已認領」
    batch.update(unclaimedRef, {
      status: 'Assigned',
      assignedTo: tenantId,
      assignedTenantName: tenantName,
      assignedAt: nowIso,
      assignedTransId: newTransRef.id
    });

    // 3. 執行租客平帳邏輯 (自動尋找未付款單據扣抵)
    const docsSnap = await adminDb.collection('documents')
      .where('formData.tenantId', '==', tenantId)
      .where('paymentStatus', '!=', 'Paid')
      .get();
      
    const unpaidDocs = docsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
    // 依到期日排序 (舊帳先清)
    unpaidDocs.sort((a, b) => String(a.data.formData?.dueDate || '').localeCompare(String(b.data.formData?.dueDate || '')));

    let remainingCents = amountCents;
    for (const item of unpaidDocs) {
      if (remainingCents <= 0) break;
      const docAmountCents = toCents(item.data.formData?.totalAmount || item.data.formData?.amount || 0);
      
      batch.update(item.ref, {
        paymentStatus: 'Paid',
        status: 'Completed',
        paidMethodDetail: uData.paymentMethodDetail,
        paidAt: nowIso,
        updatedAt: nowIso
      });
      remainingCents -= docAmountCents;
    }

    // 4. 更新租客的欠款總額 (AmountDue)
    // 這裡為了簡化，直接將現有 amountDue 減去本次配單金額 (注意：若有溢繳，amountDue 會變負數，可作為預繳款)
    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();
    if (tenantDoc.exists) {
      const currentDueCents = toCents(tenantDoc.data()?.amountDue || 0);
      const newDueCents = currentDueCents - amountCents;
      batch.update(tenantRef, {
        amountDue: fromCents(newDueCents),
        hasUnpaidBills: newDueCents > 0,
        updatedAt: nowIso
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true, message: '配單與平帳完成' }, { status: 200 });

  } catch (error: any) {
    console.error('[Assign Unclaimed Error]:', error);
    return NextResponse.json({ success: false, error: '伺服器內部錯誤' }, { status: 500 });
  }
}
