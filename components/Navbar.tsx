'use client'; // 讓它在瀏覽器運行，處理滾動效果

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Menu, X } from 'lucide-react'; // ★ 新增 Menu 和 X 圖標
import WechatModal from './WechatModal';

export default function Navbar() {
  const pathname = usePathname(); // 獲取當前在哪個頁面
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // ★ 新增手機選單開關狀態

  // 判斷是否為當前頁面的樣式
  const linkStyle = (path: string) => 
    `transition-colors ${pathname === path ? 'text-orange-500 font-black' : 'hover:text-orange-500 text-slate-600 font-bold'}`;

  return (
    <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm z-[100] border-b border-slate-100 shadow-sm h-14 md:h-16 flex items-center">
      <div className="max-w-7xl mx-auto px-4 w-full flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 z-50">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shadow">
            <Home size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            佳寓 <span className="text-orange-500 text-sm font-bold">PrimeLiving</span>
          </span>
        </Link>

        {/* 電腦版選單 (手機時隱藏) */}
        <div className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/" className={linkStyle('/')}>首頁</Link>
          <Link href="/properties" className={linkStyle('/properties')}>精選房源</Link>
          <Link href="/about" className={linkStyle('/about')}>關於我們</Link>
          <Link href="/tenant-portal" className={linkStyle('/tenant-portal')}>租客入口</Link>
        </div>

        {/* 右側按鈕區 (微信按鈕 + 手機漢堡選單) */}
        <div className="flex items-center gap-2 md:gap-4 z-50">
           <div className="scale-90 md:scale-100 origin-right">
              <WechatModal />
           </div>
           
           {/* ★ 手機版專屬漢堡按鈕 (電腦時隱藏) */}
           <button 
             className="md:hidden p-1 text-slate-600 hover:text-orange-500 transition-colors"
             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
           >
             {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
           </button>
        </div>
      </div>

      {/* ★ 手機版下拉選單 */}
      {isMobileMenuOpen && (
        <div className="absolute top-14 left-0 w-full bg-white border-b border-slate-100 shadow-lg md:hidden flex flex-col px-6 py-6 gap-6 animate-in slide-in-from-top-2 duration-200">
          <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/')}`}>首頁</Link>
          <Link href="/properties" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/properties')}`}>精選房源</Link>
          <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/about')}`}>關於我們</Link>
          <Link href="/tenant-portal" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/tenant-portal')}`}>租客入口</Link>
        </div>
      )}
    </nav>
  );
}
