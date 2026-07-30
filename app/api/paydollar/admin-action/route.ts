import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const toCents = (num: number | string): number => Math.round((Number(num) || 0) * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, orderRef, payRef, refundAmount } = body;

    // 1. 讀取 API 操作金鑰
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '88700051';
    const loginId = process.env.PAYDOLLAR_API_LOGIN_ID || '';
    const password = process.env.PAYDOLLAR_API_PASSWORD || '';
    const apiUrl = 'https://www.paydollar.com/b2c2/eng/merchant/api/orderApi.jsp';

    if (!loginId || !password) {
      return NextResponse.json({ success: false, error: '未配置 PAYDOLLAR_API_LOGIN_ID 或密碼' }, { status: 500, headers: corsHeaders });
    }

    if (!orderRef) {
      return NextResponse.json({ success: false, error: '缺少必填參數 OrderRef' }, { status: 400, headers: corsHeaders });
    }

    // ========================================================================
    // 動作 A：查詢 PayDollar 官方網關的實際訂單狀態 (Query Order)
    // ========================================================================
    if (action === 'query') {
      const queryParams = new URLSearchParams({
        merchantId,
        loginId,
        password,
        actionType: 'Query',
        orderRef: String(orderRef).trim()
      });

      const res = await fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'POST' });
      const textResult = await res.text();
      const resultParams = new URLSearchParams(textResult);

      const prc = resultParams.get('prc');
      const src = resultParams.get('src');
      const ord = resultParams.get('Ord') || orderRef;
      const gatewayPayRef = resultParams.get('PayRef') || '';
      const amt = resultParams.get('Amt') || '0';
      const cur = resultParams.get('Cur') || 'HKD';
      const orderStatus = resultParams.get('orderStatus') || 'Unknown';

      return NextResponse.json({
        success: prc === '0',
        orderRef: ord,
        payRef: gatewayPayRef,
        amount: Number(amt),
        currency: cur,
        status: orderStatus,
        rawResponse: Object.fromEntries(resultParams.entries())
      }, { status: 200, headers: corsHeaders });
    }

    // ========================================================================
    // 動作 B：一鍵全額 / 部分退款 (Refund Order)
    // ========================================================================
    if (action === 'refund') {
      if (!payRef) {
        return NextResponse.json({ success: false, error: '退款作業必須提供 PayDollar 官方交易號 (PayRef)' }, { status: 400, headers: corsHeaders });
      }

      const refundCents = toCents(refundAmount);
      if (refundCents <= 0) {
        return NextResponse.json({ success: false, error: '有效的退款金額必須大於 0' }, { status: 400, headers: corsHeaders });
      }

      const cleanRefundStr = fromCents(refundCents).toFixed(2);
      const refundParams = new URLSearchParams({
        merchantId,
        loginId,
        password,
        actionType: 'Refund',
        orderRef: String(orderRef).trim(),
        payRef: String(payRef).trim(),
        amount: cleanRefundStr
      });

      const res = await fetch(`${apiUrl}?${refundParams.toString()}`, { method: 'POST' });
      const textResult = await res.text();
      const resultParams = new URLSearchParams(textResult);

      const prc = resultParams.get('prc');
      const resultCode = resultParams.get('resultCode');

      if (prc === '0' && resultCode === '0') {
        const nowIso = new Date().toISOString();
        const batch = adminDb.batch();

        // 將總帳中的紀錄更新為已退款 (Refunded)
        const transRef = adminDb.collection('transactions').doc(orderRef);
        batch.set(transRef, {
          status: 'Refunded',
          paymentStatus: 'Refunded',
          refundedAmount: fromCents(refundCents),
          refundedAt: nowIso,
          subtitle: `【已退款 $${cleanRefundStr}】 | 原 PayRef: ${payRef}`
        }, { merge: true });

        if (orderRef.startsWith('SQP-') || orderRef.startsWith('SALES-')) {
          batch.set(adminDb.collection('quick_orders').doc(orderRef), {
            status: 'Refunded',
            paymentStatus: 'Refunded',
            updatedAt: nowIso
          }, { merge: true });
        }

        await batch.commit();

        return NextResponse.json({
          success: true,
          message: `成功向網關發起退款 HKD $${cleanRefundStr}`,
          orderRef,
          payRef
        }, { status: 200, headers: corsHeaders });
      } else {
        const errMessage = resultParams.get('errorMessage') || '網關拒絕退款請求';
        return NextResponse.json({
          success: false,
          error: `PayDollar 退款失敗: ${errMessage} (PRC: ${prc})`
        }, { status: 400, headers: corsHeaders });
      }
    }

    return NextResponse.json({ success: false, error: '不支援的 Action 指令' }, { status: 400, headers: corsHeaders });

  } catch (error: any) {
    console.error('[PayDollar Admin Action Error]:', error);
    return NextResponse.json({ success: false, error: error.message || 'API 請求失敗' }, { status: 500, headers: corsHeaders });
  }
}
