import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務精確計算輔助模組 (單位：分 Cents)
 * 徹底防範 JavaScript 浮點數運算誤差
 */
const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      passcode,        // 現場銷售內部通行密碼
      region,          // 物業/屋苑名稱
      roomName,        // 單位編號
      tenantName,      // 租客姓名
      idNumber,        // 證件號碼 (用於 CRM 事後自動配對認領)
      phone,           // 聯絡電話
      amount,          // 收款金額
      remarks,         // 款項備註
      salesPerson      // 收款銷售員
    } = body;

    // 1. 安全權限核驗：驗證傳入密碼是否與 Vercel 環境變數吻合
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. 財務精度與必要欄位校驗
    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、電話及有效收款金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    const orderRef = `SALES-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    // 3. 建立現場預收款訂單 (未歸戶狀態：pairingStatus = 'Unassigned')
    const quickOrderData = {
      orderRef,
      region: region || '香港',
      roomName: roomName || '未指定單位',
      roomInfo: `${region || ''} - ${roomName || ''}`.trim(),
      tenantName: tenantName.trim(),
      idNumber: (idNumber || '').trim().toUpperCase(),
      phone: phone.trim(),
      amount: fromCents(paidAmountCents),
      remarks: remarks || '現場收款',
      salesPerson: salesPerson || '內部專員',
      status: 'Pending',
      pairingStatus: 'Unassigned',
      gateway: 'PayDollar',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 原子化寫入 quick_orders 專用隊列與 transactions 網關表
    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(orderRef), quickOrderData);
    batch.set(adminDb.collection('transactions').doc(orderRef), {
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo} ($${quickOrderData.amount.toLocaleString()})`
    });
    await batch.commit();

    // 4. 呼叫官方 PayDollar 簽章 API 生成支付參數
    const response = await fetch(`${new URL(request.url).origin}/api/paydollar/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountDue: fromCents(paidAmountCents),
        tenantId: `QUICK-${idNumber || phone}`,
        tenantName: quickOrderData.tenantName,
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
