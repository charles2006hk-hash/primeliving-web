'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, MessageCircle, BookOpen } from 'lucide-react';
import ContactFormModal from './ContactFormModal';

export default function Navbar() {
  const pathname = usePathname(); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const linkStyle = (path: string) => {
    const isActive = pathname === path || (path !== '/' && pathname?.startsWith(path));
    // ★ 修復點：加入 whitespace-nowrap 強制文字不換行
    return `relative group py-2 text-base font-bold transition-colors duration-300 flex items-center gap-1.5 whitespace-nowrap ${
      isActive ? 'text-orange-500' : 'text-slate-600 hover:text-orange-500'
    }`;
  };

  const underlineStyle = (path: string) => {
    const isActive = pathname === path || (path !== '/' && pathname?.startsWith(path));
    return `absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full bg-orange-500 transition-all duration-300 ease-out ${
      isActive ? 'w-full' : 'w-0 group-hover:w-full'
    }`;
  };

  if (pathname?.startsWith('/tenant-portal/dashboard')) {
    return null;
  }

  return (
    <>
      <nav 
        className={`fixed top-0 w-full z-[100] transition-all duration-300 ease-out ${
          scrolled 
            ? 'bg-white/70 backdrop-blur-xl border-b border-white/50 shadow-[0_4px_30px_rgba(0,0,0,0.04)] py-2' 
            : 'bg-white/90 backdrop-blur-md border-b border-transparent shadow-none py-3 md:py-4'
        }`}
      >
        {/* ★ 修復點：稍微縮小兩側 px padding，讓中間選單有更多空間 */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 w-full flex items-center justify-between">
          
          <div className="flex flex-1 justify-start">
            <Link href="/" className="flex items-center gap-2 z-50 transition-transform hover:opacity-90 active:scale-95 shrink-0">
              <img src="/logo.png" alt="Prime Living Logo" className="h-9 sm:h-10 object-contain drop-shadow-sm" />
              <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-slate-800 flex items-baseline gap-1">
                佳寓 <span className="text-orange-500 text-sm sm:text-base font-black hidden sm:inline">PrimeLiving</span>
              </span>
            </Link>
          </div>

          {/* ★ 修復點：將 gap-8 lg:gap-10 縮小為 gap-5 lg:gap-8 防止擠壓 */}
          <div className="hidden lg:flex justify-center items-center gap-5 xl:gap-8">
            <Link href="/" className={linkStyle('/')}>
              首頁
              <span className={underlineStyle('/')}></span>
            </Link>
            <Link href="/properties" className={linkStyle('/properties')}>
              精選房源
              <span className={underlineStyle('/properties')}></span>
            </Link>
            <Link href="/guides" className={linkStyle('/guides')}>
              <BookOpen size={16} className={pathname?.startsWith('/guides') ? "text-orange-500" : "text-slate-400 group-hover:text-orange-500"}/> 
              生活攻略
              <span className={underlineStyle('/guides')}></span>
            </Link>
            <Link href="/about" className={linkStyle('/about')}>
              關於我們
              <span className={underlineStyle('/about')}></span>
            </Link>
            <Link href="/tenant-portal" className={linkStyle('/tenant-portal')}>
              租客入口
              <span className={underlineStyle('/tenant-portal')}></span>
            </Link>
          </div>

          <div className="flex flex-1 justify-end items-center gap-2 sm:gap-4 z-50 shrink-0">
             <button 
               onClick={() => setIsContactModalOpen(true)}
               className="bg-gradient-to-r from-emerald-400 to-emerald-500 text-white px-5 sm:px-6 py-2.5 rounded-full text-sm md:text-base font-black flex items-center gap-2 hover:from-emerald-500 hover:to-emerald-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 active:scale-95"
             >
               <MessageCircle size={20} className="shrink-0" /> 
               <span className="hidden sm:inline tracking-wide">預約諮詢</span>
               <span className="sm:hidden tracking-wide">諮詢</span>
             </button>
             
             {/* ★ 修復點：在螢幕小於 lg (1024px) 時就顯示漢堡選單，避免平板直向時破版 */}
             <button 
               className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             >
               {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />} 
             </button>
          </div>
        </div>

        {/* 📱 手機版 Navbar */}
        {isMobileMenuOpen && (
          <div className="absolute top-[100%] left-0 w-full bg-white/95 backdrop-blur-xl border-b border-slate-200/50 shadow-2xl lg:hidden flex flex-col px-6 py-6 gap-6 animate-in slide-in-from-top-4 duration-300 origin-top">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className={`text-lg flex justify-between items-center ${linkStyle('/')}`}>
              首頁 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/properties" onClick={() => setIsMobileMenuOpen(false)} className={`text-lg flex justify-between items-center ${linkStyle('/properties')}`}>
              精選房源 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/guides" onClick={() => setIsMobileMenuOpen(false)} className={`text-lg flex justify-between items-center ${linkStyle('/guides')}`}>
              <div className="flex items-center gap-2"><BookOpen size={20}/> 生活攻略</div>
              <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className={`text-lg flex justify-between items-center ${linkStyle('/about')}`}>
              關於我們 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/tenant-portal" onClick={() => setIsMobileMenuOpen(false)} className={`text-lg flex justify-between items-center ${linkStyle('/tenant-portal')}`}>
              租客入口 <span className="text-orange-500">&rarr;</span>
            </Link>
          </div>
        )}
      </nav>

      <ContactFormModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </>
  );
}
