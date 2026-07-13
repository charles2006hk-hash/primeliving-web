'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, MessageCircle } from 'lucide-react';
import ContactFormModal from './ContactFormModal';

export default function Navbar() {
  const pathname = usePathname(); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  const linkStyle = (path: string) => 
    `transition-colors ${pathname === path ? 'text-orange-500 font-black' : 'hover:text-orange-500 text-slate-600 font-bold'}`;

  return (
    <>
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm z-[100] border-b border-slate-100 shadow-sm h-14 md:h-16 flex items-center">
        <div className="max-w-7xl mx-auto px-4 w-full flex items-center justify-between">
          
          {/* ★ 修復：移除 hidden，並動態調整手機版與電腦版的字體大小 */}
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 z-50 transition-transform active:scale-95 shrink-0">
            <img src="/logo.png" alt="Prime Living Logo" className="h-6 sm:h-8 object-contain" />
            <span className="font-extrabold text-[15px] sm:text-lg tracking-tight text-slate-900 flex items-baseline gap-1">
              佳寓 <span className="text-orange-500 text-[10px] sm:text-sm font-bold">PrimeLiving</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/" className={linkStyle('/')}>首頁</Link>
            <Link href="/properties" className={linkStyle('/properties')}>精選房源</Link>
            <Link href="/about" className={linkStyle('/about')}>關於我們</Link>
            <Link href="/tenant-portal" className={linkStyle('/tenant-portal')}>租客入口</Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-4 z-50 shrink-0">
             {/* ★ 微調手機版按鈕縮放，騰出更多空間給 Logo 文字 */}
             <div className="scale-[0.85] sm:scale-100 origin-right">
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
               className="md:hidden p-1.5 text-slate-600 hover:text-orange-500 transition-colors"
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             >
               {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />} 
             </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="absolute top-14 left-0 w-full bg-white border-b border-slate-100 shadow-lg md:hidden flex flex-col px-6 py-6 gap-6 animate-in slide-in-from-top-2 duration-200">
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
