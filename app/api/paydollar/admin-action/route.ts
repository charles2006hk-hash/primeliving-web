import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// ============================================================================
// CORS 設置與會計仙數運算 (杜絕 IEEE 754 浮點數誤差)
// ============================================================================
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

    // 1. 讀取 Vercel 正式線 API 配置金鑰
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID || '';
    const loginId = process.env.PAYDOLLAR_API_LOGIN_ID || '';
    const password = process.env.PAYDOLLAR_API_PASSWORD || '';
    const apiUrl = 'https://www.paydollar.com/b2c2/eng/merchant/api/orderApi.jsp';

    if (!merchantId || !loginId || !password) {
      return NextResponse.json(
        { success: false, error: '伺服器未設定 PAYDOLLAR_API_LOGIN_ID 或密碼憑證' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!orderRef) {
      return NextResponse.json(
        { success: false, error: '缺少必填查詢單號 OrderRef' },
        { status: 400, headers: corsHeaders }
      );
    }

    // ========================================================================
    // Action A: 查詢網關實時扣款狀態 (Query Order Status)
    // ========================================================================
    if (action === 'query') {
      const queryParams = new URLSearchParams({
        merchantId,
        loginId,
        password,
        actionType: 'Query',
        orderRef: String(orderRef).trim(),
      });

      const res = await fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'POST' });
      const textResult = await res.text();
      const resultParams = new URLSearchParams(textResult);

      const prc = resultParams.get('prc');
      const gatewayPayRef = resultParams.get('PayRef') || '';
      const amt = resultParams.get('Amt') || '0';
      const cur = resultParams.get('Cur') || 'HKD';
      const orderStatus = resultParams.get('orderStatus') || '未授權 / 待處理';

      return NextResponse.json({
        success: prc === '0',
        orderRef,
        payRef: gatewayPayRef,
        amount: Number(amt),
        currency: cur,
        status: orderStatus,
      }, { status: 200, headers: corsHeaders });
    }

    // ========================================================================
    // Action B: 執行線上沖銷退款 (Refund Order)
    // ========================================================================
    if (action === 'refund') {
      if (!payRef || payRef === 'N/A') {
        return NextResponse.json(
          { success: false, error: '退款失敗：缺少 PayDollar 官方交易流水號 (PayRef)' },
          { status: 400, headers: corsHeaders }
        );
      }

      const refundCents = toCents(refundAmount);
      if (refundCents <= 0) {
        return NextResponse.json(
          { success: false, error: '退款金額必須大於 $0.00' },
          { status: 400, headers: corsHeaders }
        );
      }

      const cleanRefundStr = fromCents(refundCents).toFixed(2);
      const refundParams = new URLSearchParams({
        merchantId,
        loginId,
        password,
        actionType: 'Refund',
        orderRef: String(orderRef).trim(),
        payRef: String(payRef).trim(),
        amount: cleanRefundStr,
      });

      const res = await fetch(`${apiUrl}?${refundParams.toString()}`, { method: 'POST' });
      const textResult = await res.text();
      const resultParams = new URLSearchParams(textResult);

      const prc = resultParams.get('prc');
      const resultCode = resultParams.get('resultCode');

      // 退款成功 (prc=0 & resultCode=0)
      if (prc === '0' && resultCode === '0') {
        const nowIso = new Date().toISOString();
        const batch = adminDb.batch();

        // 同步修改 transactions 為已退款，在財務上杜絕虛增收入
        const transRef = adminDb.collection('transactions').doc(orderRef);
        batch.set(transRef, {
          status: 'Refunded',
          paymentStatus: 'Refunded',
          refundedAmount: fromCents(refundCents),
          refundedAt: nowIso,
          subtitle: `【已退款 $${cleanRefundStr}】 | 原 PayRef: ${payRef}`,
        }, { merge: true });

        // 現場快收單同時更新狀態
        if (orderRef.startsWith('SQP-') || orderRef.startsWith('SALES-')) {
          batch.set(adminDb.collection('quick_orders').doc(orderRef), {
            status: 'Refunded',
            paymentStatus: 'Refunded',
            updatedAt: nowIso,
          }, { merge: true });
        }

        await batch.commit();

        return NextResponse.json({
          success: true,
          message: `已成功向網關申請退款 HKD $${cleanRefundStr}`,
          orderRef,
          payRef,
        }, { status: 200, headers: corsHeaders });
      } else {
        const errMessage = resultParams.get('errorMessage') || '網關拒絕該筆退款操作';
        return NextResponse.json(
          { success: false, error: `退款不通過: ${errMessage} (PRC: ${prc})` },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: '未知的 Action 操作指令' },
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[PayDollar Admin API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'API 通訊發生內部錯誤' },
      { status: 500, headers: corsHeaders }
    );
  }
}
