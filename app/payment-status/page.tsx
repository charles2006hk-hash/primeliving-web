'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { CheckCircle2, AlertCircle, Home, XCircle, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function PaymentStatusContent() {
  const searchParams = useSearchParams();
  const success = searchParams?.get('success');
  const failed = searchParams?.get('failed');
  const orderRef = searchParams?.get('orderRef');

  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    // 30 秒倒數計時器
    if (countdown <= 0) {
      handleCloseOrRedirect();
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleCloseOrRedirect = () => {
    // 嘗試關閉視窗 (部分手機瀏覽器如 Safari, WeChat 內建瀏覽器基於安全機制可能會阻擋 window.close)
    try {
      window.close();
    } catch (e) {
      console.log('Close blocked by browser');
    }
    // 如果關閉失敗（視窗還在），則強制導向官方首頁，徹底離開系統層
    setTimeout(() => {
      window.location.href = 'https://www.primelivinghk.com';
    }, 300);
  };

  const isSuccess = success === 'true';
  const isFailed = failed === 'true';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white max-w-md w-full rounded-[2rem] p-8 text-center shadow-xl border border-slate-100 relative overflow-hidden">
        
        {isSuccess ? (
          <>
            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
            <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">付款已成功提交</h1>
            <p className="text-sm text-slate-500 font-medium mb-6">
              感謝您的付款！系統已成功接收授權。<br />
              現場管家已同步收到通知，您可以關閉此畫面了。
            </p>
          </>
        ) : isFailed ? (
          <>
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500" />
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={48} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">付款失敗或取消</h1>
            <p className="text-sm text-slate-500 font-medium mb-6">
              您的交易未能完成。<br />請重新掃描管家提供的 QR Code 再次嘗試。
            </p>
          </>
        ) : (
          <>
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-500" />
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 size={48} className="text-blue-500 animate-spin" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">處理中...</h1>
          </>
        )}

        {orderRef && (
          <div className="bg-slate-50 rounded-xl p-3 mb-8 border border-slate-100">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">訂單編號</p>
            <p className="text-xs font-mono font-bold text-slate-700">{orderRef}</p>
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={handleCloseOrRedirect}
            className={`w-full py-4 rounded-2xl font-black text-white flex justify-center items-center gap-2 transition active:scale-95 shadow-lg ${
              isSuccess ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 
              isFailed ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-900/20' : 
              'bg-blue-600'
            }`}
          >
            <XCircle size={18} />
            關閉安全視窗 ({countdown}s)
          </button>

          <button 
            onClick={() => window.location.href = 'https://www.primelivinghk.com'}
            className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-slate-50 transition"
          >
            <Home size={18} />
            返回佳寓首頁
          </button>
        </div>
        
      </div>
    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
      <PaymentStatusContent />
    </Suspense>
  );
}
