import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const { orderRef, payRef, actionType = 'Query' } = await request.json();

    // 1. 取得環境變數 (請確保 Vercel 已經設定這些值)
    const merchantId = process.env.PAYDOLLAR_MERCHANT_ID;
    // ★ 注意：這是開通信中的 "API Login"，通常與登入後台的 admin 帳號不同
    const apiLoginId = process.env.PAYDOLLAR_API_LOGIN_ID; 
    const apiPassword = process.env.PAYDOLLAR_API_PASSWORD;

    if (!merchantId || !apiLoginId || !apiPassword) {
      console.error('[PayDollar Admin API] 遺漏 API 憑證');
      return NextResponse.json(
        { success: false, error: '系統未設定 PayDollar API 查詢憑證' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!orderRef && !payRef) {
      return NextResponse.json(
        { success: false, error: '必須提供 orderRef 或 payRef 才能查詢' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. PayDollar 訂單操作與查詢 API 端點
    const endpoint = 'https://www.paydollar.com/b2c2/eng/merchant/api/orderApi.jsp';

    // 3. ★ 核心修復：嚴格規定使用 x-www-form-urlencoded 格式組合參數
    const params = new URLSearchParams();
    params.append('merchantId', merchantId);
    params.append('loginId', apiLoginId);
    params.append('password', apiPassword);
    params.append('actionType', actionType); // 'Query', 'Void', 'Capture', 'Refund'
    
    // 優先使用網關收據號查詢，若無則使用系統單號
    if (payRef && payRef !== 'N/A') {
      params.append('payRef', payRef);
    } else {
      params.append('orderRef', orderRef);
    }

    // 4. 發送請求至 PayDollar
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`PayDollar Server Responded with Status: ${response.status}`);
    }

    // 5. 解析 PayDollar 的純文字 URL 編碼回傳值 (例: resultCode=0&prc=0&src=0...)
    const responseText = await response.text();
    const responseParams = new URLSearchParams(responseText);
    const data = Object.fromEntries(responseParams.entries());

    // 6. 處理結果回傳
    if (data.resultCode === '0') {
      return NextResponse.json({
        success: true,
        data: data
      }, { status: 200, headers: corsHeaders });
    } else {
      // 若查詢失敗，精確回傳 PRC 與 SRC 錯誤碼給前端顯示
      return NextResponse.json({
        success: false,
        error: `PayDollar 網關拒絕操作 (代碼 PRC: ${data.prc || 'null'}, SRC: ${data.src || 'null'})`,
        data: data
      }, { status: 400, headers: corsHeaders });
    }

  } catch (error: any) {
    console.error('[PayDollar Admin API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '查詢網關狀態失敗' },
      { status: 500, headers: corsHeaders }
    );
  }
}
