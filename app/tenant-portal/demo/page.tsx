'use client';

import React from 'react';
import { Home, FileText, Wrench, DollarSign, Bell, Info } from 'lucide-react';
import Link from 'next/link';

export default function TenantDemoDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-10 px-4">
      <div className="max-w-4xl mx-auto md:p-6">
        {/* Demo 提示橫幅 */}
        <div className="bg-amber-100 border border-amber-300 text-amber-800 p-3 rounded-xl mb-6 flex items-center gap-2 text-sm font-bold shadow-sm">
          <Info size={18} className="shrink-0" /> 此為訪客 Demo 體驗模式，數據為虛擬展示。
          <Link href="/tenant-portal" className="ml-auto underline shrink-0">返回登入</Link>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-2xl shadow-lg">張</div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">張同學，歡迎回家</h1>
            <p className="text-sm text-slate-500 flex items-center mt-1"><Home size={14} className="mr-1"/> 沙田第一城 4座 22A - 尊享套房</p>
          </div>
        </div>

        {/* 狀態卡片區 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
            <DollarSign size={28} className="mx-auto text-red-500 mb-2" />
            <p className="text-xs font-bold text-slate-500">本月待繳</p>
            <p className="text-xl font-black text-slate-800 mt-1">$7,500</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
            <FileText size={28} className="mx-auto text-blue-500 mb-2" />
            <p className="text-xs font-bold text-slate-500">我的合約</p>
            <p className="text-xl font-black text-slate-800 mt-1">生效中</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
            <Wrench size={28} className="mx-auto text-amber-500 mb-2" />
            <p className="text-xs font-bold text-slate-500">報修進度</p>
            <p className="text-xl font-black text-slate-800 mt-1">無待辦</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
            <Bell size={28} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-xs font-bold text-slate-500">社區公告</p>
            <p className="text-xl font-black text-slate-800 mt-1">2 則</p>
          </div>
        </div>

        {/* 動態展示區 (Mock Data) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-black text-slate-800 mb-4 border-b pb-3">近期帳單</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="font-bold text-sm text-slate-800">2026年 8月份 租金</p>
                <p className="text-xs text-slate-500 mt-1">到期日: 2026-08-01</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-black text-red-500 text-lg">$7,500</p>
                <button className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg mt-1 font-bold hover:bg-red-200">立即繳款</button>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 opacity-70">
              <div>
                <p className="font-bold text-sm text-slate-800">2026年 7月份 水電均攤</p>
                <p className="text-xs text-slate-500 mt-1">繳款日: 2026-07-05</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-black text-slate-600 text-lg">$320</p>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg mt-1 font-bold inline-block">已付清</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
