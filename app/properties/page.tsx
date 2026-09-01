'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import { MapPin, BedDouble, Search, Home, Sparkles, Building2, ShieldCheck, Loader2, Filter, X, ArrowRight, MessageCircle, Images } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

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

// 提取純淨屋苑名稱 (剔除尾部房號英文數字，確保隱私)
const getCleanEstateName = (name?: string) => {
  if (!name) return '精選屋苑';
  return name.replace(/[A-Za-z0-9\-\s]+$/, '').trim() || name;
};

const getFloorLevel = (id: string) => {
  if (!id) return '中層';
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rem = sum % 3;
  return rem === 0 ? '高層' : rem === 1 ? '中層' : '低層';
};

const COMMON_SURNAMES = ['陳', '李', '張', '王', '何', '林', '黃', '劉', '吳', '蔡', '楊', '鄭', '郭', '黎', '周'];

const getSurnameForProperty = (propId: string) => {
  if (!propId) return '陳';
  let hash = 0;
  for (let i = 0; i < propId.length; i++) {
    hash = propId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COMMON_SURNAMES.length;
  return COMMON_SURNAMES[index];
};

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
  images?: string[]; 
  isCompetitor?: boolean; 
  createdAt?: any; 
  score?: number;
  isSoldOutProperty?: boolean;
  displayTitle?: string; 
  displayPrice?: string;
  floorLevel?: string;
  encyclopediaId?: string;
  hasEncyclopedia?: boolean;
}

function PropertiesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSearchQuery = searchParams?.get('uni') || searchParams?.get('search') || '';

  const [loading, setLoading] = useState(true);
  const [allRooms, setAllRooms] = useState<PropertyRoom[]>([]);
  const [displayCount, setDisplayCount] = useState(30);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');

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
          let roomImages: string[] = []; 

          if (data.images && data.images.length > 0) {
             const assigned = mediaDocs.filter(m => data.images.includes(m.id));
             roomImages = assigned.map(m => m.url);
             primaryImage = roomImages[0] || null;
          }
          if (!primaryImage) {
             const fallback = mediaDocs.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
             roomImages = fallback.map(m => m.url);
             primaryImage = fallback.find(m => m.isPrimary)?.url || roomImages[0] || null;
          }
          
          const isSoldOut = String(data.status).toLowerCase() === 'occupied' || data.webStatus === 'draft';

          return {
            id: doc.id,
            ...data,
            propertyName: propMap[data.propertyId] || '精選盤源',
            estateName: propMap[data.propertyId] || '',
            primaryImage: primaryImage,
            images: roomImages, 
            isCompetitor: false,
            isSoldOutProperty: isSoldOut,
            createdAt: data.createdAt || { seconds: Date.now() / 1000 }
          } as PropertyRoom;
        });
      } catch (error) { console.error("Fetch internal error:", error); }

      try {
        const competitorSnap = await getDocs(collection(db, 'competitor_listings'));
        competitorRooms = competitorSnap.docs.map(doc => {
          const data = doc.data();
          const isSoldOut = data.isSoldOut === true || String(data.status).toLowerCase() === 'occupied' || data.webStatus === 'draft';
          const compImages = data.images && data.images.length > 0 ? data.images : (data.imageUrl ? [data.imageUrl] : []);

          return {
            id: doc.id,
            name: data.name || data.title || '優質合作盤源', 
            propertyId: 'competitor_pool', 
            baseRent: data.price || 0, 
            status: isSoldOut ? 'Occupied' : 'Available',
            webStatus: data.webStatus || 'published',
            propertyName: data.district || data.estateName || '合作屋苑',
            estateName: data.estateName || '',
            primaryImage: compImages[0] || null,
            images: compImages, 
            features: data.features || [],
            isCompetitor: true,
            isSoldOutProperty: isSoldOut,
            createdAt: data.createdAt || data.updatedAt || { seconds: Date.now() / 1000 }
          } as PropertyRoom;
        });
      } catch (error) {}

      const combined = [...internalRooms, ...competitorRooms]
        .filter(r => r.webStatus === 'published' || r.isSoldOutProperty === true)
        .map(room => {
           const floorLevel = getFloorLevel(room.id);
           const cleanEstateName = getCleanEstateName(room.estateName || room.propertyName);
           const eId = findEncyclopediaId(cleanEstateName);

           return {
             ...room,
             floorLevel,
             displayTitle: `${cleanEstateName} | ${floorLevel}精選單位`,
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

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(prev => prev + 30);
      setIsLoadingMore(false);
    }, 1000);
  };

  const handleLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    
    setSubmittingLead(true);
    try {
      const isSoldOut = bookingRoom.isSoldOutProperty === true;
      await addDoc(collection(db, 'inquiries'), {
        tenantId: `visitor_${Date.now()}`,
        name: leadName,
        phone: leadPhone,
        message: `【前台找房-${isSoldOut ? '滿租候補登記' : '預約看房'}】\n意向樓盤：${bookingRoom.displayTitle}\n系統房源ID (參考)：${bookingRoom.id}\n預期入住與預算：${leadReq}`,
        type: 'official_notice',
        status: 'New', 
        createdAt: serverTimestamp(),
        isExistingTenant: false 
      });

      alert(isSoldOut 
        ? '✅ 候補登記已成功發送給管家團隊！一旦有房源釋出或類似優質單位，我們將第一時間聯絡您。' 
        : '✅ 預約已成功發送給管家團隊！我們將在24小時內與您聯絡安排帶看。'
      );
      
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
    
    const fullSearchText = [
      room.propertyName,
      room.estateName,
      (room as any).district,
      (room as any).region,
      (room as any).address,
      room.displayTitle,
      room.name,
      ...(room.features || [])
    ].filter(Boolean).join(' ').toLowerCase();

    if (!decodedSearch) {
      score = 1; 
    } else {
      if (fullSearchText.includes(decodedSearch)) score += 100;
      searchKeywords.forEach(kw => {
        if (fullSearchText.includes(kw)) score += 30;
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

    if (regionFilter !== 'all') {
      if (regionFilter === 'nte') {
        const nteKeywords = [
          '沙田', '大埔', '火炭', '大圍', '大围', '太和', '粉嶺', '粉岭', '上水', '馬鞍山', '马鞍山', '烏溪沙', '新界',
          '柏傲莊', '柏傲庄', '名城', '星凱', '星凯', '御龍山', '御龙山', '美豐', '美丰', '美菱居', '太湖', '翠怡', '大埔中心', '新達', '新达', '第一城', '河畔', '金獅', '雲疊', '銀禧'
        ];
        const isNTE = nteKeywords.some(kw => fullSearchText.includes(kw.toLowerCase()));
        if (!isNTE) score = -1;
      } else if (regionFilter === 'kowloon') {
        const kowloonKeywords = [
          '紅磡', '红磡', '旺角', '九龍', '九龙', '土瓜灣', '土瓜湾', '黃埔', '黄埔', '尖沙咀', '深水埗', '長沙灣', '长沙湾', '佐敦', '油麻地', '大角咀',
          '海濱南岸', '海滨南岸', '曦匯', '曦汇', '必嘉坊', '利港', '城南', '港灣豪庭', '港湾豪庭', '維港'
        ];
        const isKowloon = kowloonKeywords.some(kw => fullSearchText.includes(kw.toLowerCase()));
        if (!isKowloon) score = -1;
      } else if (regionFilter === 'tko') {
        const tkoKeywords = [
          '將軍澳', '将军澳', '坑口', '寶琳', '宝琳', '康城', '調景嶺', '调景岭',
          '蔚藍灣畔', '蔚蓝湾畔', '南豐廣場', '南丰广场', '新都城', '東港城', '都會駅', '領都'
        ];
        const isTKO = tkoKeywords.some(kw => fullSearchText.includes(kw.toLowerCase()));
        if (!isTKO) score = -1;
      }
    }

    return { ...room, score };
  }).filter(r => (r.score ?? 0) > 0);

  filteredAndScoredRooms.sort((a, b) => {
    if (b.score !== a.score) return (b.score ?? 0) - (a.score ?? 0); 
    const hashA = a.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
    const hashB = b.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
    if (hashA !== hashB) return hashB - hashA;
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

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-slate-400 mr-1">地區區域:</span>
              <button onClick={() => setRegionFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${regionFilter === 'all' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全部地區</button>
              <button onClick={() => setRegionFilter('nte')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${regionFilter === 'nte' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>新界東 (沙田/大埔/大圍)</button>
              <button onClick={() => setRegionFilter('kowloon')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${regionFilter === 'kowloon' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>九龍區 (紅磡/旺角)</button>
              <button onClick={() => setRegionFilter('tko')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${regionFilter === 'tko' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>將軍澳 / 坑口</button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Filter size={16} className="text-slate-400 mr-1"/>
              <button onClick={() => setActiveFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全部特色</button>
              <button onClick={() => setActiveFilter('high')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'high' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>高層優選</button>
              <button onClick={() => setActiveFilter('mid')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'mid' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>中層舒適</button>
              <button onClick={() => setActiveFilter('ensuite')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'ensuite' ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>獨立套廁</button>
              <button onClick={() => setActiveFilter('budget')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeFilter === 'budget' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>高性價比 (&lt;$7K)</button>
            </div>
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
              const isSoldOut = room.isSoldOutProperty === true;

              const finalImage = room.primaryImage 
                ? getProxiedUrl(room.primaryImage) 
                : (room.isCompetitor ? getEstateCover(room.propertyName || room.estateName) : null);

              const CardContent = (
                <>
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white px-5 py-2.5 rounded-full font-black tracking-widest shadow-xl shadow-orange-500/30 border-2 border-white/20 flex items-center gap-2 transform transition-transform scale-105">
                        <Sparkles size={16} className="text-yellow-200" />
                        感謝 {getSurnameForProperty(room.id)}同學 預訂
                      </div>
                    </div>
                  )}

                  <div className="relative h-56 md:h-64 bg-slate-100 overflow-hidden shrink-0">
                    {finalImage ? (
                      <img src={finalImage} alt={room.displayTitle} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'opacity-90' : 'group-hover:scale-105'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <Home size={32} className="mb-2 opacity-50"/>
                      </div>
                    )}
                    
                    {/* ★ 修正點 1：地圖圖釘標籤隱藏真實房號 */}
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 border border-white/20 z-10">
                       <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {getCleanEstateName(room.estateName || room.propertyName)}
                    </div>

                    {room.isCompetitor && (
                      <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10 border border-white/20">
                         <Building2 size={12}/> HK港灣之家
                      </div>
                    )}

                    {!isSoldOut && room.images && room.images.length > 1 && (
                      <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-black text-white flex items-center gap-1 z-10">
                        <Images size={12}/> {room.images.length}
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 flex flex-col flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <h3 className={`text-lg font-black leading-tight line-clamp-2 ${isSoldOut ? 'text-slate-500' : 'text-slate-800'}`}>
                        {room.displayTitle}
                      </h3>
                      <div className="text-right shrink-0">
                        <span className={`font-black text-xl tracking-tight ${isSoldOut ? 'text-slate-500' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
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
                         isSoldOut ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-slate-900 text-white hover:bg-orange-500'
                       }`}>
                         {isSoldOut ? <>候補登記 <ArrowRight size={14}/></> : <>預約看房 <ArrowRight size={14}/></>}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white rounded-[2rem] shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative hover:shadow-2xl hover:-translate-y-2 cursor-pointer ${
                room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
              } ${isSoldOut ? 'opacity-95' : ''}`;

              return (
                <div 
                  key={room.id} 
                  onClick={() => setBookingRoom(room)} 
                  className={cardClasses}
                >
                  {CardContent}
                </div>
              );
            })}
          </div>
        )}

        {!loading && displayCount < filteredAndScoredRooms.length && (
          <div className="py-12 flex justify-center items-center">
            <button 
              onClick={handleLoadMore} 
              disabled={isLoadingMore}
              className="bg-white px-8 py-3.5 rounded-full border border-slate-200 shadow-sm font-black text-slate-600 hover:text-orange-600 hover:border-orange-200 hover:shadow-md transition-all flex items-center gap-2 active:scale-95"
            >
              {isLoadingMore ? (
                <><Loader2 size={18} className="animate-spin text-orange-500"/> 正在獲取更多盤源...</>
              ) : (
                '載入更多精選盤源'
              )}
            </button>
          </div>
        )}
        
        {!loading && displayCount >= filteredAndScoredRooms.length && filteredAndScoredRooms.length > 0 && (
          <div className="py-12 flex justify-center items-center text-slate-400">
            <span className="text-xs font-bold tracking-widest bg-slate-200 px-4 py-2 rounded-full">已到底部，無更多盤源</span>
          </div>
        )}
      </div>

      {bookingRoom !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            
            <button onClick={() => setBookingRoom(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
              <X size={24}/>
            </button>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-rose-400"></div>
            
            <h3 className="text-2xl font-black text-slate-900 mb-2 mt-4 text-center">
              {bookingRoom.isSoldOutProperty ? '該單位熱銷已滿租 (候補登記)' : '預約看房與了解詳情'}
            </h3>
            <p className="text-slate-600 mb-6 font-medium text-center text-sm">
              {bookingRoom.isSoldOutProperty ? (
                <>對 <span className="text-orange-600 font-bold">{bookingRoom.displayTitle}</span> 感興趣嗎？目前該單位已預訂，留下聯絡方式即可優先登記候補或由管家推薦同款熱門房源。</>
              ) : (
                <>對 <span className="text-orange-600 font-bold">{bookingRoom.displayTitle}</span> 感興趣嗎？請留下您的聯絡方式，專屬管家會提供精確租金與詳細資訊。</>
              )}
            </p>

            {bookingRoom.images && bookingRoom.images.length > 0 && (
              <div className="flex overflow-x-auto gap-2 mb-6 custom-scrollbar pb-2">
                {bookingRoom.images.map((img: string, idx: number) => (
                  <img key={idx} src={getProxiedUrl(img)} className="w-24 h-24 object-cover rounded-2xl shrink-0 shadow-sm border border-slate-200" alt="房間實景" />
                ))}
              </div>
            )}

            <form onSubmit={handleLeadSubmit} className="space-y-4 mb-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">您的稱呼 *</label>
                <input 
                  required 
                  type="text" 
                  value={leadName} 
                  onChange={(e) => setLeadName(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="例如: 陳同學"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">聯絡電話 / WeChat *</label>
                <input 
                  required 
                  type="text" 
                  value={leadPhone} 
                  onChange={(e) => setLeadPhone(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="輸入電話或微信號"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">預期入住時間與預算</label>
                <input 
                  type="text" 
                  value={leadReq} 
                  onChange={(e) => setLeadReq(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="例如: 8月中入住，預算 $6000 左右"
                />
              </div>
              <div className="pt-2">
                <button type="submit" disabled={submittingLead} className="w-full bg-slate-900 text-white font-black text-lg py-3.5 rounded-xl hover:bg-orange-500 transition-all shadow-md flex justify-center items-center active:scale-[0.98]">
                  {submittingLead ? (
                    <Loader2 className="animate-spin" size={24}/>
                  ) : bookingRoom.isSoldOutProperty ? (
                    '送出候補優先登記'
                  ) : bookingRoom.hasEncyclopedia ? (
                    '送出並前往查看小區百科'
                  ) : (
                    '送出預約'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
