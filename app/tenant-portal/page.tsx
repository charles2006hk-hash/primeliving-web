'use client';

import React, { useState } from 'react';
import { Home, KeyRound, Loader2, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TenantPortalLogin() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const cleanInput = accessCode.replace(/\s+/g, '');
      if (!cleanInput) throw new Error('請輸入登入碼');

      const response = await fetch('/api/tenant-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: cleanInput })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '登入失敗');
      }

      // ==========================================
      // 🎯 核心修復：廣播式寫入快取 (Multi-Key Broadcast)
      // 清除舊快取，並把所有大系統可能讀取的欄位型態全部填滿
      // ==========================================
      localStorage.clear(); // 先清空所有可能干擾的舊測試資料
      
      localStorage.setItem('pm_tenant_session', JSON.stringify(data));
      localStorage.setItem('tenant', JSON.stringify(data));
      localStorage.setItem('tenantId', data.id || '');
      localStorage.setItem('tenantName', data.name || '');
      localStorage.setItem('tenantPhone', data.phone || '');
      localStorage.setItem('contractId', data.contractId || '');

      // 成功後跳轉
      router.push('/tenant-portal/dashboard');

    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || '系統連線發生錯誤，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-orange-200">
      <div className="bg-white w-full max-w-md rounded-[2rem] shadow-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 blur-[50px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/20 blur-[40px] rounded-full" />
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-orange-500/30 relative z-10">
            <Home size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white relative z-10 tracking-tight">佳寓租客服務入口</h1>
          <p className="text-slate-400 text-sm mt-2 relative z-10 font-medium">Prime Living Tenant Portal</p>
        </div>

        {/* Form */}
        <div className="p-8">
          
          <div className="mb-6 bg-orange-50/50 border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
            <Sparkles className="text-orange-500 shrink-0 mt-0.5" size={18} />
            <div className="text-xs font-bold text-slate-600 leading-relaxed">
              <span className="text-orange-600 font-black">極簡登入：</span><br/>
              請直接輸入您的 <span className="text-slate-800 bg-white px-1.5 py-0.5 rounded shadow-sm border border-slate-200">姓名</span> 加上 <span className="text-slate-800 bg-white px-1.5 py-0.5 rounded shadow-sm border border-slate-200">證件最後4碼</span><br/>
              <span className="text-[10px] text-slate-400 font-medium mt-1 inline-block">例如：陳小明8765 / 張三1234</span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 text-red-600 text-xs font-bold animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">
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
              className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center shadow-lg shadow-slate-900/20"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <><span className="mr-2">進入我的專屬空間</span> <ArrowRight size={16}/></>}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-[10px] text-slate-400 font-medium">遇到登入問題？請聯繫佳寓專屬管家或微信客服為您核對註冊資訊。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
