'use client';

import React, { useState, useEffect } from 'react';
import { 
  Home, KeyRound, Loader2, ArrowRight, AlertCircle, Sparkles, 
  ShieldCheck, Wrench, Receipt, ArrowLeft, Building2 
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TenantPortalLogin() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 檢查是否已經登入過
  useEffect(() => {
    const cachedTenant = localStorage.getItem('pm_tenant_session');
    if (cachedTenant) {
      router.push('/tenant-portal/dashboard'); 
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const cleanInput = accessCode.replace(/\s+/g, '');
      if (!cleanInput) throw new Error('請輸入登入碼');

      // 呼叫後端 API，保護資料不外洩
      const response = await fetch('/api/tenant-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: cleanInput })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '登入失敗');
      }

      // 廣播式寫入快取，防禦死循環
      localStorage.clear(); 
      localStorage.setItem('pm_tenant_session', JSON.stringify(data));
      localStorage.setItem('tenant', JSON.stringify(data));
      localStorage.setItem('tenantId', data.id || '');
      localStorage.setItem('tenantName', data.name || '');
      localStorage.setItem('tenantPhone', data.phone || '');
      localStorage.setItem('contractId', data.contractId || '');

      router.push('/tenant-portal/dashboard');

    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || '系統連線發生錯誤，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white selection:bg-orange-200 font-sans">
      
      {/* ==========================================
          左側：品牌形象與價值宣導區 (Brand Panel)
          ========================================== */}
      <div className="md:w-1/2 lg:w-[55%] relative bg-slate-900 text-white flex flex-col justify-between overflow-hidden">
        {/* 背景光效與紋理 */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-orange-500/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none" />

        {/* 頂部導覽 */}
        <div className="p-8 relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Home size={20} className="text-white" />
            </div>
            <span className="text-xl font-black tracking-tight">佳寓 <span className="text-orange-400">PrimeLiving</span></span>
          </div>
          <Link href="/" className="text-sm font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors">
            <ArrowLeft size={16} /> 回官網首頁
          </Link>
        </div>

        {/* 核心文案區 */}
        <div className="p-8 md:p-16 lg:p-24 relative z-10 flex-1 flex flex-col justify-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight mb-6">
            歡迎回來，<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
              您的專屬居住管家
            </span>
          </h1>
          <p className="text-lg text-slate-400 font-medium mb-12 max-w-lg leading-relaxed">
            透過佳寓智能物業系統，輕鬆管理您的租賃生活。我們致力於為您提供最透明、便捷的居住體驗。
          </p>

          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/5 backdrop-blur-sm shrink-0">
                <Receipt size={24} className="text-orange-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">電子合約與線上對帳</h3>
                <p className="text-sm text-slate-400 mt-1">隨時查閱合約條款，支援多種線上支付與水電帳單明細。</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/5 backdrop-blur-sm shrink-0">
                <Wrench size={24} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">一鍵報修與進度追蹤</h3>
                <p className="text-sm text-slate-400 mt-1">設備損壞線上拍照上傳，專人火速安排維修並追蹤進度。</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/5 backdrop-blur-sm shrink-0">
                <ShieldCheck size={24} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">最高規格隱私安全</h3>
                <p className="text-sm text-slate-400 mt-1">您的個人資料與合約文件均經過企業級加密，安全無虞。</p>
              </div>
            </div>
          </div>
        </div>

        {/* 底部版權 */}
        <div className="p-8 relative z-10 text-xs font-bold text-slate-500">
          &copy; {new Date().getFullYear()} PrimeLiving Property (HK) Management. All rights reserved.
        </div>
      </div>

      {/* ==========================================
          右側：登入表單區 (Login Panel)
          ========================================== */}
      <div className="md:w-1/2 lg:w-[45%] bg-slate-50 flex items-center justify-center p-6 md:p-12 relative">
        <div className="absolute inset-0 bg-white md:bg-transparent pointer-events-none" /> {/* 手機版底色 */}
        
        <div className="w-full max-w-md relative z-10">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-slate-200/50 border border-slate-100">
            
            <div className="mb-8 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 size={32} className="text-slate-800" />
              </div>
              <h2 className="text-2xl font-black text-slate-800">租客服務入口</h2>
              <p className="text-sm text-slate-500 font-medium mt-2">請輸入您的專屬登入碼進入系統</p>
            </div>

            {/* 智能提示區塊 */}
            <div className="mb-8 bg-orange-50/50 border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
              <Sparkles className="text-orange-500 shrink-0 mt-0.5" size={18} />
              <div className="text-xs font-bold text-slate-600 leading-relaxed">
                <span className="text-orange-600 font-black">極簡登入免記密碼：</span><br/>
                請直接輸入您的 <span className="text-slate-800 bg-white px-1.5 py-0.5 rounded shadow-sm border border-slate-200">姓名</span> 加上 <span className="text-slate-800 bg-white px-1.5 py-0.5 rounded shadow-sm border border-slate-200">證件最後4碼</span><br/>
                <span className="text-[10px] text-slate-400 font-medium mt-1.5 inline-block">例如：陳小明8765 / 張三1234</span>
              </div>
            </div>

            {/* 錯誤訊息 */}
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 text-red-600 text-xs font-bold animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="leading-relaxed">{errorMsg}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-500 mb-2 ml-1">
                  專屬登入碼 (Access Code)
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors">
                    <KeyRound size={20} />
                  </div>
                  <input 
                    type="text"
                    required
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="姓名 + 證件後4碼"
                    className="w-full bg-slate-50 border border-slate-200 pl-12 pr-4 py-4 rounded-2xl text-base font-black text-slate-800 outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:font-medium placeholder:text-slate-400"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading || !accessCode}
                className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center shadow-lg shadow-slate-900/20 group"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <span className="mr-2">進入我的專屬空間</span> 
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
            
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                遇到登入問題？請聯繫佳寓專屬管家<br/>或微信客服為您核對註冊資訊。
              </p>
            </div>

          </div>
        </div>
      </div>
      
    </div>
  );
}
