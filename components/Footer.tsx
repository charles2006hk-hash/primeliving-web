'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation'; // ★ 新增：匯入 usePathname
import { ShieldCheck, MapPin } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname(); // ★ 獲取當前路徑

  // ★ 核心修復：在租客儀表板隱藏 Footer，配合沉浸式 App 佈局
  if (pathname?.startsWith('/tenant-portal/dashboard')) {
    return null;
  }

  return (
    <footer className="bg-slate-900 text-slate-400 py-16 px-4 border-t border-slate-800">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12 border-b border-white/10 pb-12">
        
        {/* 品牌介紹 */}
        <div className="col-span-1 md:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-white p-1.5 rounded-lg inline-flex">
              <img src="/logo.png" alt="Prime Living Logo" className="h-8 object-contain" />
            </div>
            <span className="font-black text-2xl text-white tracking-tight">PrimeLiving</span>
          </div>
          <p className="text-sm leading-relaxed mb-6 font-medium">
            佳寓，專注於提供高品質、直營管理的赴港學生公寓服務。打造溫馨、安全、便捷的海外之家。
          </p>
        </div>

        {/* 快捷連結 */}
        <div className="col-span-1">
          <h4 className="text-white font-bold mb-6">快捷導航</h4>
          <ul className="space-y-4 text-sm font-medium">
            <li><Link href="/properties" className="hover:text-orange-500 transition-colors">精選房源</Link></li>
            <li><Link href="/about" className="hover:text-orange-500 transition-colors">關於我們</Link></li>
            <li><Link href="/tenant-portal" className="hover:text-orange-500 transition-colors">租客入口</Link></li>
          </ul>
        </div>

        {/* 服務區域 */}
        <div className="col-span-1">
          <h4 className="text-white font-bold mb-6">服務區域</h4>
          <ul className="space-y-4 text-sm font-medium">
            <li className="flex items-center gap-2"><MapPin size={14}/> 九龍區域 (理大/城大/浸大)</li>
            <li className="flex items-center gap-2"><MapPin size={14}/> 港島區域 (港大)</li>
            <li className="flex items-center gap-2"><MapPin size={14}/> 新界區域 (中大/教大)</li>
          </ul>
        </div>

        {/* 戰略聯營機構 (Strategic Partner) */}
        <div className="col-span-1">
          <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">戰略聯營機構</h4>
          <Link 
            href="/partner" 
            className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition group"
            title="訪問 HK港灣之家"
          >
            <img src="/115.jpg" alt="HK港灣之家 Logo" className="h-10 w-10 object-contain rounded bg-white p-1 group-hover:scale-105 transition-transform" />
            <div>
              <p className="text-white text-sm font-bold leading-tight group-hover:text-orange-400 transition-colors">HK港灣之家</p>
              <p className="text-[10px] text-slate-500 mt-1 leading-tight">金港灣集團旗下</p>
            </div>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold uppercase tracking-[0.15em]">
        <p>© {new Date().getFullYear()} PRIME LIVING PROPERTY (HK) MANAGEMENT LTD. ALL RIGHTS RESERVED.</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/legal?tab=privacy" className="hover:text-white transition-colors">隱私政策 Privacy Policy</Link>
          <span className="text-slate-700">|</span>
          <Link href="/legal?tab=terms" className="hover:text-white transition-colors">服務條款 Terms & Conditions</Link>
          <span className="text-slate-700">|</span>
          <Link href="/legal?tab=refund" className="hover:text-white transition-colors">取消與退款政策 Refund Policy</Link>
        </div>
      </div>
    </footer>
  );
}
