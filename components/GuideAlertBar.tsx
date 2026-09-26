'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ChevronRight, Flame } from 'lucide-react';

interface GuideArticle { id: string; title: string; publishDate: string; category: string; }

export default function GuideAlertBar() {
  const [latestGuide, setLatestGuide] = useState<GuideArticle | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'guides'), where('isPublished', '==', true), where('isHot', '==', true), orderBy('publishDate', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) setLatestGuide({ id: snap.docs[0].id, ...snap.docs[0].data() } as GuideArticle);
    });
    return () => unsubscribe();
  }, []);

  if (!latestGuide) return null;

  return (
    <div className="w-full mx-auto animate-in fade-in slide-in-from-top-4 z-20">
      <Link href={`/guides/${latestGuide.id}`} className="group relative flex items-center justify-between bg-white/70 backdrop-blur-xl border border-white/80 p-2 sm:p-2.5 rounded-full shadow-lg shadow-orange-500/10 hover:shadow-xl hover:bg-white/90 transition-all duration-300">
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden pl-2">
          {/* 橘色火焰 Icon */}
          <div className="bg-gradient-to-r from-orange-400 to-rose-400 p-1.5 rounded-full shadow-sm text-white shrink-0">
            <Flame size={16} />
          </div>
          <div className="flex items-center gap-2 truncate">
            {/* 分類標籤 */}
            <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full tracking-widest shrink-0">
              {latestGuide.category}
            </span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">{latestGuide.publishDate}</span>
            {/* 標題文字 */}
            <p className="text-sm font-bold text-slate-700 truncate group-hover:text-orange-600 transition-colors">
              {latestGuide.title}
            </p>
          </div>
        </div>
        {/* 箭頭按鈕 */}
        <div className="shrink-0 bg-slate-50 p-1.5 rounded-full text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:translate-x-1 transition-all mr-1">
          <ChevronRight size={16} />
        </div>
      </Link>
    </div>
  );
}
