// app/api/paydollar/webhook/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // ⚠️ 關鍵點 1：PayDollar 發送的是 application/x-www-form-urlencoded，絕對不能用 request.json()
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      // 處理意外的格式
      const text = await request.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries(params.entries());
    }

    // 取得 PayDollar 回傳的關鍵欄位
    const ref = data.Ref;           // 商家訂單號
    const successCode = data.successcode; // 0 代表成功
    const payRef = data.PayRef;     // PayDollar 的交易序號
    const prc = data.prc;           // 主要回傳碼
    const src = data.src;           // 次要回傳碼

    console.log('[PayDollar Webhook] Received:', data);

    // ⚠️ 關鍵點 2：針對 PayDollar 後台的 "Test" 按鈕做例外放行
    // 當你在後台按 Test 時，Ref 會固定是 'TestDatafeed'
    if (ref === 'TestDatafeed') {
      console.log('[PayDollar Webhook] Test connection successful.');
      return new NextResponse('OK', { status: 200 }); // 必須回傳純文字 'OK'
    }

    // --- 以下為真實交易的處理邏輯 ---

    // ⚠️ 安全提醒：這裡必須實作 Secure Hash 驗證，否則任何人都可以偽造成功付款的 POST 請求！
    // const secureHash = data.secureHash;
    // const isValid = verifyPaydollarHash(data, process.env.PAYDOLLAR_SECURE_SECRET);
    // if (!isValid) {
    //   console.error('[PayDollar Webhook] Invalid Secure Hash for Ref:', ref);
    //   return new NextResponse('Invalid Hash', { status: 400 });
    // }

    // 處理訂單狀態更新
    if (successCode === '0' && prc === '0' && src === '0') {
      // TODO: 更新資料庫 (Firestore) 訂單狀態為已付款
      // 例如：await updateOrderInFirestore(ref, { status: 'PAID', payRef });
    } else {
      // TODO: 處理付款失敗/取消的邏輯
    }

    // ⚠️ 關鍵點 3：PayDollar 要求成功接收 Datafeed 後，必須回傳純文字 "OK" (不要回傳 JSON)
    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error('[PayDollar Webhook] Internal Error:', error);
    // 即使內部錯誤，也可以考慮回傳 200 OK 避免 PayDollar 持續重試，但這裡先以標準 500 處理
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// 防禦性設計：如果 PayDollar 系統錯誤發送了 GET 請求
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
