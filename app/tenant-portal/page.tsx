'use client';

import React, { useState } from 'react';
import { Smartphone, Hash, ArrowRight, ShieldCheck, Lock, Eye } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // ★ 新增 Link

export default function TenantLoginPage() {
  const [phone, setPhone] = useState('');
  const [contractId, setContractId] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const q = query(
        collection(db, 'tenants'),
        where('phone', '==', phone), 
        where('name', '==', contractId) 
      );
      
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const tenantDoc = querySnapshot.docs[0];
        const tenantData = tenantDoc.data();
        
        localStorage.setItem('tenantId', tenantDoc.id);
        localStorage.setItem('tenantName', tenantData.name);
        
        router.push('/tenant-portal/dashboard');
      } else {
        alert("❌ 驗證失敗：找不到對應的租客資料，請確認手機與姓名是否正確。");
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("系統連線錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 pt-20 pb-12 bg-slate-50">
      <div className="max-w-md w-full">
        {/* 頂部引導 */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-orange-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-200">
            <Lock size={30} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">租客專屬入口</h1>
          <p className="text-slate-500 font-medium">輸入您的資訊以管理租約與帳單</p>
        </div>

        {/* 登入表單 */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="bg-white p-2 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center px-4 py-4 border-b border-slate-50">
              <Smartphone size={20} className="text-slate-400 mr-4" />
              <input 
                type="tel" 
                placeholder="手機號碼 (需與租約一致)" 
                className="flex-1 outline-none text-slate-800 font-bold placeholder:text-slate-300"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center px-4 py-4">
              <Hash size={20} className="text-slate-400 mr-4" />
              <input 
                type="text" 
                placeholder="姓名 (與合約一致)" 
                className="flex-1 outline-none text-slate-800 font-bold placeholder:text-slate-300"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition-all active:scale-95 shadow-xl disabled:opacity-50"
          >
            {loading ? '驗證中...' : '確認登入'} <ArrowRight size={20}/>
          </button>
        </form>

        {/* ★ 新增：Demo 體驗模式入口 */}
        <Link 
          href="/tenant-portal/demo" 
          className="mt-4 w-full py-4 bg-white text-slate-600 rounded-3xl font-bold text-md flex items-center justify-center gap-2 hover:bg-slate-100 transition-all border border-slate-200 shadow-sm"
        >
          <Eye size={18}/> 訪客體驗 Demo 帳戶
        </Link>

        {/* 底部保障提示 */}
        <div className="mt-12 grid grid-cols-2 gap-4">
           <div className="flex flex-col items-center text-center p-4">
              <ShieldCheck size={20} className="text-emerald-500 mb-2"/>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">數據加密傳輸</p>
           </div>
           <div className="flex flex-col items-center text-center p-4">
              <Smartphone size={20} className="text-blue-500 mb-2"/>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">適配手機操作</p>
           </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-8 font-medium">
          若忘記租約資訊，請聯絡您的專屬管家或點擊下方客服諮詢。
        </p>
      </div>
    </div>
  );
}
