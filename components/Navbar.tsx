'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, MessageCircle } from 'lucide-react';
import ContactFormModal from './ContactFormModal';

export default function Navbar() {
  const pathname = usePathname(); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  
  // ★ 新增：滾動狀態監聽
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const linkStyle = (path: string) => 
    `transition-colors ${pathname === path ? 'text-orange-600 font-black' : 'hover:text-orange-500 text-slate-700 font-bold'}`;

  return (
    <>
      {/* ★ 核心修改：動態切換透明與毛玻璃樣式 */}
      <nav className={`fixed top-0 w-full z-[100] h-14 md:h-16 flex items-center transition-all duration-300 ${
        scrolled 
          ? 'bg-white/40 backdrop-blur-lg border-b border-white/30 shadow-sm' // 滾動時：毛玻璃
          : 'bg-transparent border-b border-transparent' // 置頂時：完全透明一體化
      }`}>
        <div className="max-w-7xl mx-auto px-4 w-full flex items-center justify-between">
          
          <Link href="/" className="flex items-center gap-2 z-50 transition-transform active:scale-95">
            <img src="/logo.png" alt="Prime Living Logo" className="h-8 object-contain drop-shadow-sm" />
            <span className="font-extrabold text-lg tracking-tight text-slate-900 hidden sm:block drop-shadow-sm">
              佳寓 <span className="text-orange-600 text-sm font-bold">PrimeLiving</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/" className={linkStyle('/')}>首頁</Link>
            <Link href="/properties" className={linkStyle('/properties')}>精選房源</Link>
            <Link href="/about" className={linkStyle('/about')}>關於我們</Link>
            <Link href="/tenant-portal" className={linkStyle('/tenant-portal')}>租客入口</Link>
          </div>

          <div className="flex items-center gap-2 md:gap-4 z-50">
             <div className="scale-90 md:scale-100 origin-right">
                <button 
                  onClick={() => setIsContactModalOpen(true)}
                  className="bg-emerald-500 text-white px-4 py-1.5 md:px-5 md:py-2 rounded-full text-xs md:text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-600 shadow-sm transition-all active:scale-95"
                >
                  <MessageCircle size={16} /> 
                  <span className="hidden sm:inline">預約諮詢</span>
                  <span className="sm:hidden">諮詢</span>
                </button>
             </div>
             
             <button 
               className="md:hidden p-1 text-slate-700 hover:text-orange-600 transition-colors"
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             >
               {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />} 
             </button>
          </div>
        </div>

        {/* 手機版下拉選單 (保持毛玻璃以防遮擋背景) */}
        {isMobileMenuOpen && (
          <div className="absolute top-14 left-0 w-full bg-white/90 backdrop-blur-xl border-b border-white/50 shadow-lg md:hidden flex flex-col px-6 py-6 gap-6 animate-in slide-in-from-top-2 duration-200">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/')}`}>首頁</Link>
            <Link href="/properties" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/properties')}`}>精選房源</Link>
            <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/about')}`}>關於我們</Link>
            <Link href="/tenant-portal" onClick={() => setIsMobileMenuOpen(false)} className={`text-base ${linkStyle('/tenant-portal')}`}>租客入口</Link>
          </div>
        )}
      </nav>

      <ContactFormModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </>
  );
}
