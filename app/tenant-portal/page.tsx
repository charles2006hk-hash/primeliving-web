'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Home, KeyRound, Loader2, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TenantPortalLogin() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 檢查是否已經登入過 (LocalStorage Cache)
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
      // 1. 清洗使用者輸入：移除所有空格、轉小寫
      const cleanInput = accessCode.replace(/\s+/g, '').toLowerCase();
      if (!cleanInput) throw new Error('請輸入登入碼');

      // 2. 抓取所有履約中與即將入駐的租客
      const activeQuery = query(collection(db, 'tenants'), where('status', 'in', ['Active', 'Pending']));
      const snap = await getDocs(activeQuery);
      
      // 3. 智能多重匹配邏輯 (Smart Match)
      const matchedTenant = snap.docs.find(doc => {
        const data = doc.data();
        
        // 提取並清洗資料庫中的各項欄位
        const name = (data.name || '').replace(/\s+/g, '').toLowerCase();
        const nameLast4 = name.slice(-4); // 英文名字的最後4個字母
        const idLast4 = (data.identityNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-4);
        const phone = (data.phone || '').replace(/\D/g, '');
        const phone8 = phone.slice(-8); // 取最後8碼電話
        const phone4 = phone.slice(-4); // 取最後4碼電話
        const contractId = (data.contractId || '').replace(/\s+/g, '').toLowerCase();

        // 建立該租客所有允許的魔法登入碼組合
        const validCodes = [];
        if (name && idLast4) validCodes.push(name + idLast4);             // 姓名 + 證件後4碼
        if (nameLast4 && idLast4) validCodes.push(nameLast4 + idLast4);   // 姓名後4字母 + 證件後4碼
        if (phone8 && idLast4) validCodes.push(phone8 + idLast4);         // 手機8碼 + 證件後4碼
        if (name && phone4) validCodes.push(name + phone4);               // 姓名 + 手機後4碼 (備用)
        if (contractId) validCodes.push(contractId);                      // 系統合約編號

        // 檢查使用者輸入是否命中其中任何一種
        return validCodes.includes(cleanInput);
      });

      // 4. 登入結果處理
      if (matchedTenant) {
        const tenantData = { id: matchedTenant.id, ...matchedTenant.data() };
        localStorage.setItem('pm_tenant_session', JSON.stringify(tenantData));
        router.push('/tenant-portal/dashboard');
      } else {
        setErrorMsg('登入碼無效。請確認您的姓名與證件後4碼是否正確。');
      }

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
              <span className="text-[10px] text-slate-400 font-medium mt-1 inline-block">例如：陳大文123A / 呂嫣然5678</span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 text-red-600 text-xs font-bold animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* 唯一帳號欄位 */}
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
