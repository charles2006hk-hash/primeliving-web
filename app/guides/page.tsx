'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Flame, Loader2, ChevronRight, Search, Eye, ArrowLeft } from 'lucide-react';

interface GuideArticle { 
  id: string; 
  title: string; 
  publishDate: string; 
  category: string; 
  imageUrl: string; 
  views: number; 
  isHot: boolean; 
}

export default function GuidePublicPage() {
  const [articles, setArticles] = useState<GuideArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!db) return;
    // 前台只抓取已發布的文章，並依照日期排序
    const q = query(collection(db, 'guides'), where('isPublished', '==', true), orderBy('publishDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setArticles(snap.docs.map(d => ({ id: d.id, ...d.data() } as GuideArticle)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 本地端關鍵字搜尋過濾
  const filteredArticles = articles.filter(art => 
    art.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    art.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 animate-in fade-in duration-500">
      {/* 頂部 Banner 區塊 */}
      <div className="bg-slate-900 text-white pt-16 pb-12 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Link href="/" className="inline-flex items-center text-sm font-bold text-slate-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={16} className="mr-1"/> 返回首頁
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">香港留學攻略・HK港灣之家</h1>
          <p className="text-slate-400 text-sm mb-6 max-w-xl leading-relaxed">
            為來港新生與優才量身打造。涵蓋簽證辦理、住址證明、銀行開戶、交通出行與防坑指南，讓您的香港生活有備無患。
          </p>
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-3 text-slate-400" size={18}/>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋攻略 (例如: 住址證明, 銀行卡)" 
              className="w-full pl-12 pr-4 py-3 rounded-full bg-slate-800/80 border border-slate-700 text-white outline-none focus:border-orange-500 focus:bg-slate-800 text-sm transition-all placeholder:text-slate-500 shadow-inner"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-6 relative z-20">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <span className="text-slate-500 text-sm font-bold">共 {filteredArticles.length} 篇精選內容</span>
            <span className="flex items-center gap-1 text-slate-400 text-xs font-bold cursor-default">
              最新發布排序 <ChevronRight size={14} className="rotate-90"/>
            </span>
          </div>
          
          {filteredArticles.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-bold">
              找不到相關文章，請嘗試其他關鍵字。
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredArticles.map((article) => (
                <Link href={`/guides/${article.id}`} key={article.id} className="flex items-stretch justify-between p-4 sm:p-6 hover:bg-slate-50/80 transition-colors group">
                  {/* 左側：標題與資訊 */}
                  <div className="flex-1 pr-4 sm:pr-6 flex flex-col justify-between py-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-800 leading-snug group-hover:text-orange-600 transition-colors line-clamp-2 mb-3">
                      {article.title}
                    </h3>
                    <div className="flex flex-wrap items-center text-xs text-slate-400 font-medium gap-y-2 mt-auto">
                      <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{article.category}</span>
                      <span className="mx-2 hidden sm:inline">•</span>
                      <span className="font-mono">{article.publishDate}</span>
                      <span className="mx-2">•</span>
                      <span className="flex items-center"><Eye size={14} className="mr-1 opacity-70"/> {article.views.toLocaleString()}</span>
                      
                      {article.isHot && (
                        <span className="ml-3 flex items-center text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-bold text-[10px]">
                          <Flame size={12} className="mr-0.5"/> 必讀
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* 右側：正方形封面小圖 */}
                  {article.imageUrl && (
                    <div className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-slate-100 bg-slate-100 relative shadow-sm">
                      <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
