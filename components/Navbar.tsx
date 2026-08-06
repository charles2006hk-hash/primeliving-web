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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ★ 升級字體大小至 text-[15px]，提供最佳 B2C 閱讀體驗
  const linkStyle = (path: string) => {
    const isActive = pathname === path;
    return `relative group py-2 text-[15px] font-bold transition-colors duration-300 ${
      isActive ? 'text-orange-500' : 'text-slate-600 hover:text-orange-500'
    }`;
  };

  const underlineStyle = (path: string) => {
    const isActive = pathname === path;
    return `absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] rounded-full bg-orange-500 transition-all duration-300 ease-out ${
      isActive ? 'w-full' : 'w-0 group-hover:w-full'
    }`;
  };

  return (
    <>
      <nav 
        className={`fixed top-0 w-full z-[100] transition-all duration-300 ease-out ${
          scrolled 
            ? 'bg-white/70 backdrop-blur-xl border-b border-white/50 shadow-[0_4px_30px_rgba(0,0,0,0.04)] py-2' 
            : 'bg-white/90 backdrop-blur-md border-b border-transparent shadow-none py-3 md:py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full flex items-center justify-between">
          
          <div className="flex-1 flex justify-start">
            <Link href="/" className="flex items-center gap-2 z-50 transition-transform hover:opacity-90 active:scale-95 shrink-0">
              {/* ★ 稍微放大 Logo 圖片與文字 */}
              <img src="/logo.png" alt="Prime Living Logo" className="h-8 sm:h-9 object-contain drop-shadow-sm" />
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-800 flex items-baseline gap-1">
                佳寓 <span className="text-orange-500 text-xs sm:text-sm font-black">PrimeLiving</span>
              </span>
            </Link>
          </div>

          <div className="hidden md:flex flex-1 justify-center items-center gap-10">
            <Link href="/" className={linkStyle('/')}>
              首頁
              <span className={underlineStyle('/')}></span>
            </Link>
            <Link href="/properties" className={linkStyle('/properties')}>
              精選房源
              <span className={underlineStyle('/properties')}></span>
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

          <div className="flex-1 flex justify-end items-center gap-2 sm:gap-4 z-50 shrink-0">
             {/* ★ 同步放大按鈕文字至 text-[15px] */}
             <button 
               onClick={() => setIsContactModalOpen(true)}
               className="bg-gradient-to-r from-emerald-400 to-emerald-500 text-white px-5 py-2 md:px-6 md:py-2.5 rounded-full text-xs md:text-[15px] font-black flex items-center gap-2 hover:from-emerald-500 hover:to-emerald-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 active:scale-95"
             >
               <MessageCircle size={18} className="shrink-0" /> 
               <span className="hidden sm:inline tracking-wide">預約諮詢</span>
               <span className="sm:hidden tracking-wide">諮詢</span>
             </button>
             
             <button 
               className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             >
               {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />} 
             </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="absolute top-[100%] left-0 w-full bg-white/90 backdrop-blur-xl border-b border-slate-200/50 shadow-2xl md:hidden flex flex-col px-6 py-6 gap-6 animate-in slide-in-from-top-4 duration-300 origin-top">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className={`text-base flex justify-between items-center ${linkStyle('/')}`}>
              首頁 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/properties" onClick={() => setIsMobileMenuOpen(false)} className={`text-base flex justify-between items-center ${linkStyle('/properties')}`}>
              精選房源 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className={`text-base flex justify-between items-center ${linkStyle('/about')}`}>
              關於我們 <span className="text-orange-500">&rarr;</span>
            </Link>
            <Link href="/tenant-portal" onClick={() => setIsMobileMenuOpen(false)} className={`text-base flex justify-between items-center ${linkStyle('/tenant-portal')}`}>
              租客入口 <span className="text-orange-500">&rarr;</span>
            </Link>
          </div>
        )}
      </nav>

      <ContactFormModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </>
  );
}
