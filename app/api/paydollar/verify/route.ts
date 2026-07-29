import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { orderRef } = await request.json();

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少交易單號' }, { status: 400 });
    }

    // 1. 查詢本次交易
    const txRef = doc(db, 'transactions', orderRef);
    const txSnap = await getDoc(txRef);

    if (!txSnap.exists()) {
      return NextResponse.json({ success: false, error: '找不到對應交易記錄' }, { status: 404 });
    }

    const txData = txSnap.data();

    // 防重入：已核銷就放行
    if (txData.status === 'Success') {
      return NextResponse.json({ success: true, message: '已完成核銷' });
    }

    // 2. 將所有相關聯的帳單狀態改為「已繳」
    const billIds: string[] = txData.billIds || [];
    for (const billId of billIds) {
      await updateDoc(doc(db, 'documents', billId), {
        paymentStatus: 'Paid',
        status: 'Completed',
        updatedAt: serverTimestamp(),
      });
    }

    // 3. 自動開立正式收據
    await addDoc(collection(db, 'documents'), {
      type: 'Receipt',
      paymentStatus: 'Paid',
      status: 'Completed',
      summary: `${txData.tenantName} - 線上付款正式收據 (${orderRef})`,
      isCompanyChopApplied: true,
      formData: {
        tenantId: txData.tenantId,
        tenantName: txData.tenantName,
        roomName: txData.roomInfo,
        docDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'PayDollar',
        totalReceived: Number(txData.amount) || 0,
        remarks: `由 PayDollar 線上安全支付自動結算。\n訂單編號: ${orderRef}`,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 4. 動態同步大系統的「紅燈/欠款」狀態
    const qUnpaid = query(
      collection(db, 'documents'),
      where('formData.tenantId', '==', txData.tenantId),
      where('paymentStatus', '==', 'Unpaid')
    );
    const snapUnpaid = await getDocs(qUnpaid);

    await updateDoc(doc(db, 'tenants', txData.tenantId), {
      hasUnpaidBills: !snapUnpaid.empty,
      updatedAt: serverTimestamp(),
    });

    // 5. 標記交易為完成
    await updateDoc(txRef, {
      status: 'Success',
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Verify API Exception]:', error);
    return NextResponse.json(
      { success: false, error: `伺服器核銷異常: ${error.message}` },
      { status: 500 }
    );
  }
}
