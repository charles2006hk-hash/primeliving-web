import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 財務精確計算 (仙 Cents)
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      region,          // 選擇地區 (e.g., 太湖花園, 碧濤花園)
      roomName,        // 房間編號 (e.g., Room A, Room B)
      tenantName,      // 租客姓名
      idNumber,        // 證件號碼 (後4碼或全碼，用作日後自動配對索引)
      phone,           // 聯絡電話
      amount,          // 收款金額
      remarks,         // 備註 (e.g., 兩個月押金+首月租金)
      salesPerson      // 收款經辦人 (銷售人員姓名)
    } = body;

    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫租客姓名、電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    const orderRef = `SALES-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    // 1. 建立現場預收款訂單 (狀態設為待支付 Pending，配對狀態為未分配 Unassigned)
    const quickOrderData = {
      orderRef,
      region: region || '香港',
      roomName: roomName || '未指定房間',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(),
      phone: phone.trim(),
      amount: fromCents(paidAmountCents),
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '一般員工',
      status: 'Pending',
      pairingStatus: 'Unassigned',  // ★ 關鍵：標記為未配對，日後可在大系統自動/手動認領
      gateway: 'PayDollar',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 同時寫入 quick_orders 與 transactions 主表
    await adminDb.collection('quick_orders').doc(orderRef).set(quickOrderData);
    await adminDb.collection('transactions').doc(orderRef).set({
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${tenantName} - ${quickOrderData.roomInfo} ($${fromCents(paidAmountCents).toLocaleString()})`
    });

    // 2. 呼叫官方安全支付簽章 API (直接共用原先的支付生成邏輯)
    const response = await fetch(`${new URL(request.url).origin}/api/paydollar/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountDue: fromCents(paidAmountCents),
        tenantId: `QUICK-${idNumber || phone}`,  // 暫存 ID
        tenantName: tenantName,
        roomInfo: quickOrderData.roomInfo,
        returnUrl: `${new URL(request.url).origin}/sales-pay?success=true&orderRef=${orderRef}`,
        orderRef
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || '金流授權請求生成失敗');
    }

    return NextResponse.json({
      success: true,
      orderRef,
      paymentPayload: data.paymentPayload
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Sales Pay API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '無法建立現場收款單' },
      { status: 500, headers: corsHeaders }
    );
  }
}
