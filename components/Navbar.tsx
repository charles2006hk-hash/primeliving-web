'use client'; // 讓它在瀏覽器運行，處理滾動效果

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Phone } from 'lucide-react';
import WechatModal from './WechatModal';

export default function Navbar() {
  const pathname = usePathname(); // 獲取當前在哪個頁面

  // 判斷是否為當前頁面的樣式
  const linkStyle = (path: string) => 
    `transition-colors ${pathname === path ? 'text-orange-500 font-black' : 'hover:text-orange-500 text-slate-600 font-bold'}`;

  return (
    <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm z-[100] border-b border-slate-100 shadow-sm h-14 md:h-16 flex items-center">
      <div className="max-w-7xl mx-auto px-4 w-full flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shadow">
            <Home size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            佳寓 <span className="text-orange-500 text-sm font-bold">PrimeLiving</span>
          </span>
        </Link>

        {/* 電腦版選單 */}
        <div className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/" className={linkStyle('/')}>首頁</Link>
          <Link href="/properties" className={linkStyle('/properties')}>精選房源</Link>
          <Link href="/about" className={linkStyle('/about')}>關於我們</Link>
          <Link href="/tenant-portal" className={linkStyle('/tenant-portal')}>租客入口</Link>
        </div>

        {/* 右側按鈕 */}
        <div className="flex items-center gap-2">
           <div className="scale-90 md:scale-100 origin-right">
              <WechatModal />
           </div>
        </div>
      </div>
    </nav>
  );
}