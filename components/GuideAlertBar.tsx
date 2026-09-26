'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Sparkles, ChevronRight, Flame } from 'lucide-react';

interface GuideArticle { id: string; title: string; publishDate: string; category: string; }

export default function GuideAlertBar() {
  const [latestGuide, setLatestGuide] = useState<GuideArticle | null>(null);

  useEffect(() => {
    // 唯讀查詢：抓取最新一篇發布且標記為熱門的文章
    const q = query(collection(db, 'guides'), where('isPublished', '==', true), where('isHot', '==', true), orderBy('publishDate', 'desc'), limit(1));
    return onSnapshot(q, (snap) => {
      if (!snap.empty) setLatestGuide({ id: snap.docs[0].id, ...snap.docs[0].data() } as GuideArticle);
    });
  }, []);

  if (!latestGuide) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mb-4 animate-in fade-in slide-in-from-top-4">
      <Link href={`/guides/${latestGuide.id}`} className="group flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-3 rounded-2xl shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* 跳動的主題 Icon */}
          <div className="bg-white p-2 rounded-xl shadow-sm animate-bounce text-orange-500 shrink-0">
            <Flame size={18} />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-widest">{latestGuide.category}</span>
              <span className="text-[10px] text-slate-500 font-mono">{latestGuide.publishDate}</span>
            </div>
            <p className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
              {latestGuide.title}
            </p>
          </div>
        </div>
        <div className="shrink-0 bg-white p-1.5 rounded-full text-blue-600 shadow-sm group-hover:translate-x-1 transition-transform">
          <ChevronRight size={16} />
        </div>
      </Link>
    </div>
  );
}
