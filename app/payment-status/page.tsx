'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Home, ArrowLeft, Loader2, Receipt } from 'lucide-react';
import Link from 'next/link';

function PaymentStatusContent() {
  const searchParams = useSearchParams();
  
  // 1. 取得 URL 參數 (支援我們自己的 API 參數，也相容 PayDollar 原生回傳參數)
  const isSuccessParam = searchParams?.get('success');
  const isFailedParam = searchParams?.get('failed');
  const payDollarSuccessCode = searchParams?.get('successcode'); // PayDollar 原生成功碼是 '0'
  
  const orderRef = searchParams?.get('orderRef') || searchParams?.get('Ref') || 'N/A';
  
  // 判斷最終狀態
  const isSuccess = isSuccessParam === 'true' || payDollarSuccessCode === '0';
  const isFailed = isFailedParam === 'true' || payDollarSuccessCode !== '0' && payDollarSuccessCode !== null;

  // 如果沒有帶任何參數，預設顯示錯誤或載入中
  if (!isSuccess && !isFailed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-500 font-medium flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-blue-500" size={32} />
          <p>正在確認付款狀態...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans selection:bg-blue-100">
      
      {/* 品牌 Logo (可選，如果你有 public/logo.png 可以保留) */}
      <div className="mb-8">
         <img src="/logo.png" alt="Prime Living" className="h-10 sm:h-12 object-contain opacity-90" />
      </div>

      <div className="bg-white border border-slate-100 max-w-md w-full rounded-[2rem] p-8 sm:p-10 shadow-xl shadow-slate-200/50 text-center relative overflow-hidden">
        
        {/* 頂部裝飾光暈 */}
        <div className={`absolute top-0 left-0 w-full h-2 ${isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`} />

        {isSuccess ? (
          // ==========================================
          // 成功畫面 (Success State)
          // ==========================================
          <div className="animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-emerald-100">
              <CheckCircle2 size={48} strokeWidth={2.5} />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-3">付款成功！</h1>
            <p className="text-slate-500 text-sm sm:text-base mb-8 leading-relaxed">
              我們已經收到您的款項。<br/>
              感謝您選擇佳寓 Prime Living，您的帳單狀態將會自動更新。
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-8 space-y-2">
              <div className="flex items-center text-xs text-slate-400 font-bold mb-1 uppercase tracking-wider">
                <Receipt size={14} className="mr-1.5" /> 交易明細
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">訂單編號</span>
                <span className="font-mono font-bold text-slate-800">{orderRef}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">處理狀態</span>
                <span className="font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-md text-xs">已授權 (Authorized)</span>
              </div>
            </div>

            <Link href="/" className="flex items-center justify-center gap-2 w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95">
              <Home size={18} /> 返回官方首頁
            </Link>
          </div>

        ) : (
          // ==========================================
          // 失敗畫面 (Failed State)
          // ==========================================
          <div className="animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-red-100">
              <XCircle size={48} strokeWidth={2.5} />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-3">付款未完成</h1>
            <p className="text-slate-500 text-sm sm:text-base mb-8 leading-relaxed">
              您的交易已被取消或遭到銀行拒絕。<br/>
              請確認您的帳戶餘額、信用卡額度，或嘗試使用其他支付方式。
            </p>

            {orderRef !== 'N/A' && (
              <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-8">
                 <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">訂單編號</span>
                  <span className="font-mono font-bold text-slate-800">{orderRef}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.history.back()} 
                className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-95"
              >
                <ArrowLeft size={18} /> 返回重新付款
              </button>
              
              <Link href="/" className="flex items-center justify-center gap-2 w-full py-4 bg-white hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-all border border-slate-200 active:scale-95">
                返回官方首頁
              </Link>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mt-8 font-medium">
        &copy; {new Date().getFullYear()} Prime Living. All rights reserved.
      </p>
    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    // 使用 Suspense 包裹以支援 Next.js App Router 中的 useSearchParams
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    }>
      <PaymentStatusContent />
    </Suspense>
  );
}
