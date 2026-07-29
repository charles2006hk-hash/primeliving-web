import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { orderRef } = await request.json();
    if (!orderRef) return NextResponse.json({ success: false, error: '缺少訂單編號' }, { status: 400 });

    const txRef = doc(db, 'transactions', orderRef);
    const txSnap = await getDoc(txRef);

    if (!txSnap.exists()) return NextResponse.json({ success: false, error: '找不到交易紀錄' });
    const txData = txSnap.data();

    // 防重複執行
    if (txData.status === 'Success') return NextResponse.json({ success: true });

    // 1. 將本次繳納的原始帳單 (Statement) 全部標記為「已繳清」
    const billIds = txData.billIds || [];
    for (const billId of billIds) {
       await updateDoc(doc(db, 'documents', billId), {
         paymentStatus: 'Paid',
         status: 'Completed',
         updatedAt: serverTimestamp()
       });
    }

    // 2. 自動在系統開立一張「總額收據 (Receipt)」，讓財務與大系統可以看見
    await addDoc(collection(db, 'documents'), {
       type: 'Receipt',
       paymentStatus: 'Paid',
       status: 'Completed',
       summary: `${txData.tenantName} - 線上付款正式收據 (${orderRef})`,
       isCompanyChopApplied: true, // 自動蓋章
       formData: {
         tenantId: txData.tenantId,
         tenantName: txData.tenantName,
         roomName: txData.roomInfo,
         docDate: new Date().toISOString().split('T')[0], // 今天的日期
         paymentMethod: 'PayDollar',
         totalReceived: Number(txData.amount) || 0,
         remarks: `由 PayDollar 線上安全支付自動結算。\n訂單編號: ${orderRef}`,
       },
       createdAt: serverTimestamp(),
       updatedAt: serverTimestamp()
    });

    // 3. 自我修復：檢查該租客是否還有剩餘未繳帳單，更新紅點狀態
    const qUnpaid = query(
      collection(db, 'documents'), 
      where('formData.tenantId', '==', txData.tenantId), 
      where('paymentStatus', '==', 'Unpaid')
    );
    const snapUnpaid = await getDocs(qUnpaid);
    await updateDoc(doc(db, 'tenants', txData.tenantId), {
       hasUnpaidBills: !snapUnpaid.empty,
       updatedAt: serverTimestamp()
    });

    // 4. 將交易紀錄標記為成功
    await updateDoc(txRef, { status: 'Success', updatedAt: serverTimestamp() });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Verify API Error]:', error);
    return NextResponse.json({ success: false, error: '核銷過程發生錯誤' }, { status: 500 });
  }
}
