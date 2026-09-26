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
    <div className="w-full flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-500 z-20">
      <Link 
        href={`/guides/${latestGuide.id}`} 
        className="group flex items-center gap-3 px-4 py-1.5 transition-all duration-300"
      >
        {/* 漸層精緻徽章 */}
        <span className="flex items-center gap-1 text-[11px] font-black text-white bg-gradient-to-r from-orange-500 to-rose-500 px-2 py-0.5 rounded shadow-sm shrink-0 tracking-widest">
          <Flame size={12} className="shrink-0" />
          {latestGuide.category}
        </span>
        
        {/* 無底框文字體 */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          <p className="text-sm sm:text-base font-bold text-slate-800 truncate group-hover:text-orange-600 transition-colors drop-shadow-sm">
            {latestGuide.title}
          </p>
          <ChevronRight size={16} className="text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all shrink-0" />
        </div>
      </Link>
    </div>
  );
}
