'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArrowLeft, Loader2, Calendar, Eye, Folder, Share2 } from 'lucide-react';

interface GuideArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  imageUrl: string;
  publishDate: string;
  views: number;
}

export default function GuideDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<GuideArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArticle() {
      if (!params.id || typeof params.id !== 'string') return;
      try {
        const docRef = doc(db, 'guides', params.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setArticle({ id: docSnap.id, ...docSnap.data() } as GuideArticle);
          // 用戶進入頁面，非同步將閱讀量 +1
          updateDoc(docRef, { views: increment(1) }).catch(console.error);
        } else {
          router.push('/guides'); // 找不到文章退回列表
        }
      } catch (error) {
        console.error("Error fetching article:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchArticle();
  }, [params.id, router]);

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40}/></div>;
  if (!article) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      
      {/* 頂部導航 */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/guides" className="flex items-center text-sm font-bold text-slate-600 hover:text-orange-600 transition-colors">
            <ArrowLeft size={18} className="mr-1"/> 攻略首頁
          </Link>
          <button onClick={() => navigator.clipboard.writeText(window.location.href).then(() => alert('連結已複製！'))} className="p-2 text-slate-400 hover:text-slate-800 bg-slate-50 rounded-full transition-colors">
            <Share2 size={18}/>
          </button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* 文章標題與 Metadata */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4 text-xs font-bold text-slate-500">
            <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md flex items-center"><Folder size={12} className="mr-1"/> {article.category}</span>
            <span className="flex items-center font-mono"><Calendar size={12} className="mr-1"/> {article.publishDate}</span>
            <span className="flex items-center font-mono"><Eye size={12} className="mr-1"/> {article.views + 1} 閱讀</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 leading-tight mb-6">
            {article.title}
          </h1>
        </div>

        {/* 封面大圖 (已修復：取消強制的 21:9 裁切比例，改為自適應高度並完整顯示) */}
        {article.imageUrl && (
          <div className="w-full rounded-2xl overflow-hidden bg-slate-50 mb-10 shadow-sm border border-slate-200 flex justify-center">
            <img 
              src={article.imageUrl} 
              alt={article.title} 
              className="w-full h-auto max-h-[60vh] object-contain" 
            />
          </div>
        )}

        {/* 文章內容 (支援換行與基本排版) */}
        <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-slate-200 prose prose-slate max-w-none">
          <div 
            className="text-slate-700 leading-loose whitespace-pre-wrap font-medium"
            // 若未來您安裝了 react-markdown，可將此 div 替換為 <ReactMarkdown>{article.content}</ReactMarkdown>
          >
            {article.content}
          </div>
        </div>

        <div className="mt-12 text-center text-slate-400 text-sm font-bold">
          - 到底啦 -
        </div>
      </article>
    </div>
  );
}
