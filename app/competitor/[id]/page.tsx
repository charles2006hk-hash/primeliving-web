import React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import { MapPin, BedDouble, Building2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

const getEstateCover = (estateName?: string) => {
  if (!estateName) return null;
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=1200';
  if (estateName.includes('柏傲莊')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=1200';
  if (estateName.includes('海濱南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=1200';
  if (estateName.includes('康城')) return 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&q=80&w=1200';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=1200'; 
};

export default async function CompetitorPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params; 
  
  // ★ 核心修復：將 URL 中的亂碼解碼回中文，確保能正確匹配 Firestore Document ID
  const decodedId = decodeURIComponent(resolvedParams.id);
  const docRef = doc(db, 'competitor_listings', decodedId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h1 className="text-2xl font-black text-slate-800 mb-2">找不到該盤源</h1>
        <p className="text-slate-500 mb-6">您尋找的房源可能已下架或網址錯誤 ({decodedId})</p>
        <Link href="/properties" className="px-6 py-2 bg-orange-600 text-white rounded-full font-bold hover:bg-orange-700 transition">返回列表</Link>
      </div>
    );
  }

  const room = docSnap.data();
  const coverImage = room.imageUrl || getEstateCover(room.estateName);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* 頂部導航 */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <Link href="/properties" className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
          <ChevronLeft size={16} className="mr-1"/> 返回房源列表
        </Link>
      </div>

      {/* 封面圖 */}
      <div className="max-w-5xl mx-auto px-4 mb-8">
        <div className="w-full h-[40vh] md:h-[60vh] rounded-3xl overflow-hidden relative shadow-lg">
          <img src={coverImage} alt={room.name} className="w-full h-full object-cover" />
          <div className="absolute top-6 left-6 bg-purple-600/95 backdrop-blur px-4 py-2 rounded-full text-xs font-black text-white flex items-center gap-2 shadow-lg">
             <Building2 size={16}/> HK港灣之家 (合作盤源)
          </div>
        </div>
      </div>

      {/* 內容區塊 */}
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">{room.name}</h1>
            <p className="text-slate-500 font-bold flex items-center gap-1 mb-6">
               <MapPin size={18} className="text-purple-500"/> {room.estateName || '未知區域'}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-6">
              {room.features?.map((feature: string, idx: number) => (
                <span key={idx} className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-sm font-bold">
                  {feature}
                </span>
              ))}
            </div>

            <div className="prose prose-slate max-w-none">
              <p className="font-medium leading-relaxed whitespace-pre-wrap">
                {room.description || '這是一個優質的合作盤源，提供舒適的居住環境。點擊右側聯絡我們了解更多詳情。'}
              </p>
            </div>
          </div>
        </div>

        {/* 右側資訊卡 */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100 sticky top-24">
            <p className="text-sm font-bold text-slate-500 mb-1">每月租金</p>
            <div className="text-4xl font-black text-purple-600 mb-6">
              ${(room.price || 0).toLocaleString()} <span className="text-sm text-slate-400">/月</span>
            </div>
            
            <a 
              href={`https://wa.me/85212345678?text=你好，我想了解 ${room.name} (HK港灣之家)`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-purple-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
            >
              立即預約看房
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
