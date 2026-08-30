'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import { MapPin, BedDouble, Search, Home, Sparkles, Building2, ShieldCheck, AlertCircle, Loader2, Filter, X, ArrowRight, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

// ==========================================
// 1. 預設導出 (移至最上方，避免複製遺漏導致編譯失敗)
// ==========================================
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

// ==========================================
// 2. 隱私遮罩與工具函數 (Privacy Masking Helpers)
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
  if (estateName.includes('柏傲莊') || estateName.includes('柏傲庄')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('海濱南岸') || estateName.includes('海滨南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800';
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

// 將精準價格轉換為 2000-3000 幅度的區間
const getPriceRange = (price: number) => {
  if (!price || price === 0) return '價格待定';
  const base = Math.floor(price / 1000) * 1000;
  const range = price < 8000 ? 1000 : (base % 2 === 0 ? 2000 : 3000);
  let lower = base;
  if (price - base < 500 && range > 1000) { lower -= 1000; }
  const upper = lower + range;
  return `$${lower.toLocaleString()} - $${upper.toLocaleString()}`;
};

const ENCYCLOPEDIA_LIST = [
  { id: 'pavilia-farm', aliases: ['柏傲莊', '柏傲庄'] },
  { id: 'festival-city', aliases: ['名城'] },
  { id: 'the-arles', aliases: ['星凱堤岸', '星凯堤岸'] },
  { id: 'the-palazzo', aliases: ['御龍山', '御龙山'] },
  { id: 'residence-oasis', aliases: ['蔚藍灣畔', '蔚蓝湾畔'] },
  { id: 'nan-fung-plaza', aliases: ['南豐廣場', '南丰广场'] },
  { id: 'baker-circle', aliases: ['曦匯', '曦汇'] },
  { id: 'mei-fung-gardens', aliases: ['美豐花園', '美丰花园'] },
  { id: 'mei-ling-cabin', aliases: ['美菱居'] },
  { id: 'serenity-park', aliases: ['太湖花園', '太湖花园'] },
  { id: 'greenery-plaza', aliases: ['翠怡花園', '翠怡花园'] },
  { id: 'tai-po-centre', aliases: ['大埔中心'] },
  { id: 'uptown-plaza', aliases: ['新達廣場', '新达广场'] }
];

const findEncyclopediaId = (name: string) => {
  if (!name) return null;
  const matched = ENCYCLOPEDIA_LIST.find(record =>
    record.aliases.some(alias => name.includes(alias))
  );
  return matched ? matched.id : null;
};

// ==========================================
// 3. 資料介面定義
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
  displayTitle?: string; 
  displayPrice?: string;
  floorLevel?: string;
  encyclopediaId?: string;
  hasEncyclopedia?: boolean;
}

// ==========================================
// 4. 核心內容元件
// ==========================================
function PropertiesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSearchQuery = searchParams?.get('uni') || searchParams?.get('search') || '';

  const [loading, setLoading] = useState(true);
  const [allRooms, setAllRooms] = useState<PropertyRoom[]>([]);
  
  // 無限滾動分頁狀態
  const [displayCount, setDisplayCount] = useState(30);
  const loaderRef = useRef<HTMLDivElement>(null);
  
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const [bookingRoom, setBookingRoom] = useState<PropertyRoom | null>(null);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadReq, setLeadReq] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);

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
          const isExplicitlySoldOut = data.isSoldOut === true || String(data.status).toLowerCase() === 'occupied';

          return {
            id: doc.id,
            name: data.name || data.title || '優質合作盤源', 
            propertyId: 'competitor_pool', 
            baseRent: data.price || 0, 
            status: isExplicitlySoldOut ? 'Occupied' : 'Available',
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
        .filter(r => r.webStatus === 'published')
        .map(room => {
           const floorLevel = getFloorLevel(room.id);
           let rawEstateName = room.estateName || room.propertyName || '優質屋苑';
           rawEstateName = rawEstateName.replace(/[A-Za-z0-9\-\s]+$/, '').trim();

           const eId = findEncyclopediaId(rawEstateName);

           return {
             ...room,
             floorLevel,
             displayTitle: `${rawEstateName} | ${floorLevel}精選單位`,
             displayPrice: getPriceRange(room.baseRent),
             encyclopediaId: eId || '',
             hasEncyclopedia: !!eId
           };
        });

      setAllRooms(combined);
      setLoading(false);
    }
    fetchData();
  }, []);

  // 無限滾動的 Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setDisplayCount(prev => prev + 30);
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [loading]);

  const handleLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    
    setSubmittingLead(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        tenantId: `visitor_${Date.now()}`,
        name: leadName,
        phone: leadPhone,
        message: `【前台找房-預約看房】\n意向樓盤：${bookingRoom.displayTitle}\n系統房源ID (參考)：${bookingRoom.id}\n預期入住與預算：${leadReq}`,
        type: 'official_notice',
        status: 'New', 
        createdAt: serverTimestamp(),
        isExistingTenant: false 
      });
      alert('✅ 預約已成功發送給管家團隊！我們將在24小時內與您聯絡安排帶看。');
      
      if (bookingRoom.hasEncyclopedia) {
         router.push(`/encyclopedia/${bookingRoom.encyclopediaId}`);
      } else {
         setBookingRoom(null); 
      }
      setLeadName(''); 
      setLeadPhone(''); 
      setLeadReq('');
    } catch (error) {
      console.error("寫入 CRM 失敗:", error);
      alert('發送失敗，請稍後再試。');
    } finally {
      setSubmittingLead(false);
    }
  };

  let decodedSearch = '';
  try { decodedSearch = rawSearchQuery ? decodeURIComponent(rawSearchQuery).toLowerCase().trim() : ''; } 
  catch (e) { decodedSearch = rawSearchQuery?.toLowerCase().trim() || ''; }
  
  const searchKeywords = decodedSearch.split(/[\s+,，()\-]+/).filter(k => k.length > 0); 

  const filteredAndScoredRooms = allRooms.map(room => {
    let score = 0;
    const locationText = [room.propertyName, room.estateName].filter(Boolean).join(' ').toLowerCase();
    const fullText = [locationText, room.name, ...(room.features || [])].filter(Boolean).join(' ').toLowerCase();

    if (!decodedSearch) {
      score = 1; 
    } else {
      if (locationText.includes(decodedSearch)) score += 100;
      searchKeywords.forEach(kw => {
        if (locationText.includes(kw)) score += 30;
        else if (fullText.includes(kw)) score += 10;
      });
    }

    if (activeFilter === 'high') {
      if (room.floorLevel !== '高層') score = -1;
    } else if (activeFilter === 'mid') {
      if (room.floorLevel !== '中層') score = -1;
    } else if (activeFilter === 'budget') {
      if (room.baseRent > 7000) score = -1;
    } else if (activeFilter === 'ensuite') {
      const matchesType = room.features?.includes('套廁') || room.name.toLowerCase().includes('ensuite');
      if (!matchesType) score = -1;
    }

    return { ...room, score };
  }).filter(r => (r.score ?? 0) > 0);

  filteredAndScoredRooms.sort((a, b) => {
    if (b.score !== a.score) return (b.score ?? 0) - (a.score ?? 0); 
    if (a.isCompetitor !== b.isCompetitor) return a.isCompetitor ? 1 : -1; 
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0); 
  });

  const displayRooms = filteredAndScoredRooms.slice(0, displayCount);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      
      <div className="bg-white border-b border-slate-200 pt-28 pb-8 px-4 shadow-sm relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-[10px] font-black mb-4 uppercase tracking-wider border border-orange-100">
             <Sparkles size={14}/> 保護隱私機制啟用
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
            {decodedSearch ? `為您尋找「${decodedSearch.toUpperCase()}」的優質房源` : '探索您在香港的理想家'}
          </h1>
          <p className="text-slate-500 text-sm font-medium mb-8">
            基於隱私保護，我們已將具體房號替換為樓層級別，並顯示預估租金區間。點擊卡片即可聯絡管家了解精確資訊。
          </p>

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
              const isSoldOut = String(room.status).toLowerCase() === 'occupied';

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
                      <h3 className={`text-lg font-black leading-tight line-clamp-2 ${isSoldOut ? 'text-slate-400' : 'text-slate-800'}`}>
                        {room.displayTitle}
                      </h3>
                      <div className="text-right shrink-0">
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
                       <span className={`px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1 ${
                         isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-orange-500'
                       }`}>
                         {isSoldOut ? '已租出' : <>預約看房 <ArrowRight size={14}/></>}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white rounded-[2rem] shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative ${
                room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
              } ${isSoldOut ? 'cursor-not-allowed opacity-90' : 'hover:shadow-2xl hover:-translate-y-2 cursor-pointer'}`;

              return (
                <div 
                  key={room.id} 
                  onClick={() => { if(!isSoldOut) setBookingRoom(room) }} 
                  className={cardClasses}
                >
                  {CardContent}
                </div>
              );
            })}
          </div>
        )}

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

      {/* ★ 預約表單 Modal */}
      {bookingRoom !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            
            <button onClick={() => setBookingRoom(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
              <X size={24}/>
            </button>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-rose-400"></div>
            
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <MessageCircle size={32} className="text-blue-500" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2 text-center">預約看房與了解詳情</h3>
            <p className="text-slate-500 mb-8 font-medium text-center text-sm">
              對 <span className="text-orange-600 font-bold">{bookingRoom.displayTitle}</span> 感興趣嗎？請留下您的聯絡方式，專屬管家會為您提供精確租金與詳細資訊。
            </p>

            <form onSubmit={handleLeadSubmit} className="space-y-4 mb-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">您的稱呼 *</label>
                <input required type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 陳同學"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">聯絡電話 / WeChat *</label>
                <input required type="text" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="輸入電話或微信號"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">預期入住時間</label>
                <input type="text" value={leadReq} onChange={(e) => setLeadReq(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 8月中入住"/>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={submittingLead} className="w-full bg-slate-900 text-white font-black text-lg py-3.5 rounded-xl hover:bg-orange-500 transition-all shadow-md flex justify-center items-center active:scale-[0.98]">
                  {submittingLead ? <Loader2 className="animate-spin" size={24}/> : (bookingRoom.hasEncyclopedia ? '送出並前往查看小區百科' : '送出預約')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
