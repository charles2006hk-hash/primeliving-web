'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import { MapPin, BedDouble, Search, Home, Sparkles, Building2, ShieldCheck, Wind, AlertCircle, Loader2, Filter } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// ==========================================
// 1. 隱私遮罩與工具函數 (Privacy Masking Helpers)
// ==========================================
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const getEstateCover = (estateName?: string) => {
  if (!estateName) return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800'; 
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('柏傲莊')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('海濱南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('康城')) return 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&q=80&w=800';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800';
};

// 根據 ID 計算穩定的樓層描述 (低/中/高層)
const getFloorLevel = (id: string) => {
  if (!id) return '中層';
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rem = sum % 3;
  return rem === 0 ? '高層' : rem === 1 ? '中層' : '低層';
};

// 將精準價格轉換為千元區間 (如 6500 -> 6000-7000)
const getPriceRange = (price: number) => {
  if (!price || price === 0) return '價格待定';
  const lower = Math.floor(price / 1000) * 1000;
  const upper = lower + 1000;
  return `$${lower.toLocaleString()} - $${upper.toLocaleString()}`;
};

// ==========================================
// 2. 資料介面定義
// ==========================================
interface PropertyRoom {
  id: string;
  name: string;
  propertyId: string;
  baseRent: number;
  status: string;
  webStatus?: 'published' | 'draft';
  features?: string[];
  propertyName?: string;
  estateName?: string; 
  primaryImage?: string;
  isCompetitor?: boolean; 
  createdAt?: any; 
  score?: number;
  // 生成的遮罩資料
  displayTitle?: string; 
  displayPrice?: string;
  floorLevel?: string;
}

// ==========================================
// 3. 核心內容元件 (包裹在 Suspense 內)
// ==========================================
function PropertiesContent() {
  const searchParams = useSearchParams();
  const rawSearchQuery = searchParams?.get('uni') || searchParams?.get('search') || '';
  const typeParam = searchParams?.get('type') || '';

  const [loading, setLoading] = useState(true);
  const [allRooms, setAllRooms] = useState<PropertyRoom[]>([]);
  
  // 無限滾動分頁狀態
  const [displayCount, setDisplayCount] = useState(30);
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // 介紹過濾器狀態
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // 初始化拉取所有資料
  useEffect(() => {
    async function fetchData() {
      let internalRooms: PropertyRoom[] = [];
      let competitorRooms: PropertyRoom[] = [];

      try {
        if (!db) return;
        const propSnap = await getDocs(collection(db, 'properties'));
        const propMap: Record<string, string> = {};
        propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

        const roomSnap = await getDocs(collection(db, 'rooms'));
        const mediaSnap = await getDocs(collection(db, 'media_library'));
        const mediaDocs = mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        internalRooms = roomSnap.docs.map(doc => {
          const data = doc.data();
          let primaryImage = null;
          if (data.images && data.images.length > 0) {
             const firstAssigned = mediaDocs.find(m => m.id === data.images[0]);
             if (firstAssigned) primaryImage = firstAssigned.url;
          }
          if (!primaryImage) {
             const roomImages = mediaDocs.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
             primaryImage = roomImages.find(m => m.isPrimary)?.url || roomImages[0]?.url || null;
          }
          return {
            id: doc.id,
            ...data,
            propertyName: propMap[data.propertyId] || '精選盤源',
            estateName: propMap[data.propertyId] || '',
            primaryImage: primaryImage,
            isCompetitor: false,
            createdAt: data.createdAt || { seconds: Date.now() / 1000 }
          } as PropertyRoom;
        });
      } catch (error) { console.error("Fetch internal error:", error); }

      try {
        const competitorSnap = await getDocs(collection(db, 'competitor_listings'));
        competitorRooms = competitorSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || data.title || '優質合作盤源', 
            propertyId: 'competitor_pool', 
            baseRent: data.price || 0, 
            status: data.status || 'Available',
            webStatus: data.webStatus || 'published',
            propertyName: data.district || data.estateName || '合作屋苑',
            estateName: data.estateName || '',
            primaryImage: data.imageUrl || null,
            features: data.features || [],
            isCompetitor: true,
            createdAt: data.createdAt || data.updatedAt || { seconds: Date.now() / 1000 }
          } as PropertyRoom;
        });
      } catch (error) {}

      const combined = [...internalRooms, ...competitorRooms]
        .filter(r => r.webStatus === 'published' || String(r.status).toLowerCase() === 'occupied')
        .map(room => {
           const floorLevel = getFloorLevel(room.id);
           const locationStr = room.estateName || room.propertyName || '優質屋苑';
           // ★ 隱私處理：覆蓋原始名稱與價格
           return {
             ...room,
             floorLevel,
             displayTitle: `${locationStr} | ${floorLevel}精選單位`,
             displayPrice: getPriceRange(room.baseRent)
           };
        });

      setAllRooms(combined);
      setLoading(false);
    }
    fetchData();
  }, []);

  // 設置 Intersection Observer 監聽滾動載入更多 (30筆 -> 60筆 -> 90筆)
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setDisplayCount(prev => prev + 30);
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [loading]);

  // ★ 處理搜尋與過濾邏輯
  let decodedSearch = '';
  try { decodedSearch = rawSearchQuery ? decodeURIComponent(rawSearchQuery).toLowerCase().trim() : ''; } 
  catch (e) { decodedSearch = rawSearchQuery?.toLowerCase().trim() || ''; }
  
  const searchKeywords = decodedSearch.split(/[\s+,，()\-]+/).filter(k => k.length > 0); 

  const filteredAndScoredRooms = allRooms.map(room => {
    let score = 0;
    const locationText = [room.propertyName, room.estateName].filter(Boolean).join(' ').toLowerCase();
    const fullText = [locationText, room.name, ...(room.features || [])].filter(Boolean).join(' ').toLowerCase();

    // 1. 搜尋字串配對
    if (!decodedSearch) {
      score = 1; 
    } else {
      if (locationText.includes(decodedSearch)) score += 100;
      searchKeywords.forEach(kw => {
        if (locationText.includes(kw)) score += 30;
        else if (fullText.includes(kw)) score += 10;
      });
    }

    // 2. 標籤過濾器 (Filter Bar)
    if (activeFilter === 'high') {
      if (room.floorLevel !== '高層') score = -1;
    } else if (activeFilter === 'mid') {
      if (room.floorLevel !== '中層') score = -1;
    } else if (activeFilter === 'budget') {
      if (room.baseRent > 7000) score = -1; // 預算盤 < 7000
    } else if (activeFilter === 'ensuite') {
      const matchesType = room.features?.includes('套廁') || room.name.toLowerCase().includes('ensuite');
      if (!matchesType) score = -1;
    }

    return { ...room, score };
  }).filter(r => (r.score ?? 0) > 0);

  // 商業邏輯排序
  filteredAndScoredRooms.sort((a, b) => {
    if (b.score !== a.score) return (b.score ?? 0) - (a.score ?? 0); 
    
    const aIsSoldOut = a.webStatus === 'draft' || String(a.status).toLowerCase() === 'occupied';
    const bIsSoldOut = b.webStatus === 'draft' || String(b.status).toLowerCase() === 'occupied';
    if (aIsSoldOut !== bIsSoldOut) return aIsSoldOut ? 1 : -1; 
    
    if (a.isCompetitor !== b.isCompetitor) return a.isCompetitor ? 1 : -1; 
    
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0); 
  });

  const displayRooms = filteredAndScoredRooms.slice(0, displayCount);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      
      {/* 頂部 Header */}
      <div className="bg-white border-b border-slate-200 pt-28 pb-8 px-4 shadow-sm relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-[10px] font-black mb-4 uppercase tracking-wider border border-orange-100">
             <Sparkles size={14}/> 官方直營 & 精選合作
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
            {decodedSearch ? `為您尋找「${decodedSearch.toUpperCase()}」的優質房源` : '探索您在香港的理想家'}
          </h1>
          <p className="text-slate-500 text-sm font-medium mb-8">
            基於隱私保護，我們已將具體房號替換為樓層級別，並顯示預估租金區間。所有直營盤源均可預約現場或視訊看房。
          </p>

          {/* ★ 過濾標籤列 */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter size={16} className="text-slate-400 mr-2"/>
            <button onClick={() => setActiveFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全部盤源</button>
            <button onClick={() => setActiveFilter('high')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'high' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>高層優選</button>
            <button onClick={() => setActiveFilter('mid')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'mid' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>中層舒適</button>
            <button onClick={() => setActiveFilter('ensuite')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'ensuite' ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>獨立套廁</button>
            <button onClick={() => setActiveFilter('budget')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'budget' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>高性價比 (&lt;$7K)</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        <p className="text-slate-400 text-xs font-bold mb-6">
           共找到 <span className="text-orange-600 text-sm">{filteredAndScoredRooms.length}</span> 個符合條件的結果
        </p>

        {loading ? (
          <div className="py-32 flex flex-col justify-center items-center text-slate-400">
             <Loader2 size={40} className="animate-spin text-orange-500 mb-4"/>
             <p className="font-bold tracking-widest">正在為您匹配最佳房源...</p>
          </div>
        ) : filteredAndScoredRooms.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-300 shadow-sm">
             <Search size={48} className="mx-auto text-slate-200 mb-4"/>
             <h3 className="text-slate-700 font-black text-xl mb-2">找不到符合條件的房源</h3>
             <p className="text-slate-400 text-sm font-medium">請嘗試更改過濾條件，或搜尋其他熱門區域</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {displayRooms.map((room) => {
              const isSoldOut = room.webStatus === 'draft' || String(room.status).toLowerCase() === 'occupied';
              const hrefUrl = isSoldOut ? '' : (room.isCompetitor ? `/competitor/${room.id}` : `/properties/${room.id}`);

              const finalImage = room.primaryImage 
                ? getProxiedUrl(room.primaryImage) 
                : (room.isCompetitor ? getEstateCover(room.propertyName || room.estateName) : null);

              const CardContent = (
                <>
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-slate-800/90 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700 backdrop-blur-md scale-110">
                        SOLD OUT
                      </div>
                    </div>
                  )}

                  <div className="relative h-56 md:h-64 bg-slate-100 overflow-hidden shrink-0">
                    {finalImage ? (
                      <img src={finalImage} alt={room.displayTitle} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <Home size={32} className="mb-2 opacity-50"/>
                      </div>
                    )}
                    
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 border border-white/20 z-10">
                       <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {room.estateName || room.propertyName}
                    </div>

                    {room.isCompetitor && (
                      <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10">
                         <Building2 size={12}/> HK港灣之家
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 flex flex-col flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      {/* ★ 應用隱私遮罩的 Title */}
                      <h3 className={`text-lg font-black leading-tight line-clamp-2 ${isSoldOut ? 'text-slate-400' : 'text-slate-800'}`}>
                        {room.displayTitle}
                      </h3>
                      <div className="text-right shrink-0">
                        {/* ★ 應用隱私遮罩的區間價格 */}
                        <span className={`font-black text-xl tracking-tight ${isSoldOut ? 'text-slate-400' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
                          {room.displayPrice}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500">
                       <div className="flex gap-2">
                         <span className={`flex items-center gap-1 ${isSoldOut ? 'text-slate-400' : 'text-slate-600'}`}>
                           <BedDouble size={14}/> 拎包入住
                         </span>
                         {!room.isCompetitor && !isSoldOut && (
                           <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                             <ShieldCheck size={12}/> 官方直營
                           </span>
                         )}
                       </div>
                       <span className={`px-4 py-2 rounded-lg transition-colors shadow-sm ${
                         isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-orange-500'
                       }`}>
                         {isSoldOut ? '已租出' : '查看詳情'}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white rounded-[2rem] shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative ${
                room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
              } ${isSoldOut ? 'cursor-not-allowed opacity-90' : 'hover:shadow-2xl hover:-translate-y-2 cursor-pointer'}`;

              if (isSoldOut) {
                return <div key={room.id} className={cardClasses}>{CardContent}</div>;
              }

              return <Link href={hrefUrl} key={room.id} className={cardClasses}>{CardContent}</Link>;
            })}
          </div>
        )}

        {/* 無限滾動的觸發器 (Loader) */}
        {!loading && displayCount < filteredAndScoredRooms.length && (
          <div ref={loaderRef} className="py-12 flex justify-center items-center text-slate-400">
            <Loader2 size={24} className="animate-spin text-orange-500 mr-2"/>
            <span className="text-sm font-bold tracking-widest">正在載入更多盤源...</span>
          </div>
        )}
        
        {!loading && displayCount >= filteredAndScoredRooms.length && filteredAndScoredRooms.length > 0 && (
          <div className="py-12 flex justify-center items-center text-slate-400">
            <span className="text-xs font-bold tracking-widest bg-slate-200 px-4 py-2 rounded-full">已到底部，無更多盤源</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 導出主頁面
export default function PropertiesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex justify-center items-center bg-slate-50">
        <Loader2 className="animate-spin text-orange-500" size={40}/>
      </div>
    }>
      <PropertiesContent />
    </Suspense>
  );
}
