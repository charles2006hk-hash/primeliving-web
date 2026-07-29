import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 財務會計精確運算輔助模組
 * 一律轉成仙 (Cents) 整數計算，杜絕 JS 浮點數精度誤差 (Floating Point Error)
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
      passcode,        // 內部授權解鎖密碼
      region,          // 屋苑 / 盤源物業
      roomName,        // 單位編號
      tenantName,      // 租客姓名
      idNumber,        // 證件號碼 (用於 CRM 大系統事後自動配對)
      phone,           // 聯絡電話
      amount,          // 收款金額 (HKD)
      remarks,         // 用途說明
      salesPerson      // 收款經辦人
    } = body;

    // 1. 安全校驗：核對通行金鑰是否與 Vercel 環境變數匹配
    const validPin = process.env.SALES_QUICK_PAY_PIN || 'PL202688';
    if (!passcode || passcode !== validPin) {
      return NextResponse.json(
        { success: false, error: '⛔ 授權無效：現場收款通行密碼錯誤或已過期' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. 財務精度與必要欄位驗證
    const paidAmountCents = toCents(amount);
    if (paidAmountCents <= 0 || !tenantName || !phone) {
      return NextResponse.json(
        { success: false, error: '請完整填寫客戶姓名、聯絡電話及有效金額' },
        { status: 400, headers: corsHeaders }
      );
    }

    const orderRef = `SALES-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    // 3. 建立現場收款單據隊列 (嚴格設定為處理中 Pending / 未歸戶 Unassigned)
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
      status: 'Pending',             // 只有金流 Webhook/Verify 成功確認後才允許更改為 Completed
      paymentStatus: 'Unpaid',
      pairingStatus: 'Unassigned',   // 大系統 CRM 現場認領標記
      gateway: 'PayDollar',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 4. 原子化寫入隊列：進入 quick_orders (現場待認領隊列) 與 transactions (財務網關表)
    const batch = adminDb.batch();
    batch.set(adminDb.collection('quick_orders').doc(orderRef), quickOrderData);
    batch.set(adminDb.collection('transactions').doc(orderRef), {
      ...quickOrderData,
      type: 'income',
      category: '現場預收款',
      title: `[現場收款] ${quickOrderData.tenantName} - ${quickOrderData.roomInfo} ($${quickOrderData.amount.toLocaleString()})`
    });
    await batch.commit();

    // 5. 呼叫後端簽章 API 生成 PayDollar 安全表單參數
    const origin = new URL(request.url).origin;
    const response = await fetch(`${origin}/api/paydollar/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountDue: fromCents(paidAmountCents),
        tenantId: `QUICK-${(idNumber || phone).trim()}`,
        tenantName: quickOrderData.tenantName,
        roomInfo: quickOrderData.roomInfo,
        // ★ 核心修復：把 returnUrl 精確指向 /sales-pay，防禦路徑錯亂拼接
        returnUrl: `${origin}/sales-pay`,
        orderRef: orderRef
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
    console.error('[Sales Quick-Checkout API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '無法建立現場收款單' },
      { status: 500, headers: corsHeaders }
    );
  }
}
