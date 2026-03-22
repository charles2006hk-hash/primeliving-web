import React from 'react';
import Link from 'next/link';
import { Home, Mail, ShieldCheck, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-16 px-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        
        {/* 品牌介紹 */}
        <div className="col-span-1 md:col-span-1">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
              <Home size={18} />
            </div>
            <span className="font-black text-xl text-white tracking-tight">PrimeLiving</span>
          </div>
          <p className="text-sm leading-relaxed mb-6 font-medium">
            佳寓，專注於提供高品質、直營管理的赴港學生公寓服務。打造溫馨、安全、便捷的海外之家。
          </p>
        </div>

        {/* 快捷連結 */}
        <div>
          <h4 className="text-white font-bold mb-6">快捷導航</h4>
          <ul className="space-y-4 text-sm font-medium">
            <li><Link href="/properties" className="hover:text-orange-500 transition-colors">精選房源</Link></li>
            <li><Link href="/about" className="hover:text-orange-500 transition-colors">關於我們</Link></li>
            <li><Link href="/tenant-portal" className="hover:text-orange-500 transition-colors">租客入口</Link></li>
          </ul>
        </div>

        {/* 服務區域 */}
        <div>
          <h4 className="text-white font-bold mb-6">服務區域</h4>
          <ul className="space-y-4 text-sm font-medium">
            <li className="flex items-center gap-2"><MapPin size={14}/> 九龍區域 (理大/城大/浸大)</li>
            <li className="flex items-center gap-2"><MapPin size={14}/> 港島區域 (港大)</li>
            <li className="flex items-center gap-2"><MapPin size={14}/> 新界區域 (中大/教大)</li>
          </ul>
        </div>

        {/* 官方認證 */}
        <div>
          <h4 className="text-white font-bold mb-6">品牌保障</h4>
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3 text-emerald-400 mb-3">
              <ShieldCheck size={20} />
              <span className="text-xs font-black uppercase tracking-widest">Official Direct</span>
            </div>
            <p className="text-[10px] leading-relaxed">
              所有房源均為佳寓官方直營，提供具備法律效力的印花租約，保障學子租房安全。
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em]">
        <p>© 2026 PRIMELIVING HONG KONG. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-white">隱私政策</Link>
          <Link href="/terms" className="hover:text-white">服務條款</Link>
        </div>
      </div>
    </footer>
  );
}