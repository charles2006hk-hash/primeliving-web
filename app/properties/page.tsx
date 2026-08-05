import React from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase'; 
import { 
  MapPin, BedDouble, Search, Home, Sparkles, Building2
} from 'lucide-react';
import Link from 'next/link';

const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
};

// ★ 新增：依照屋苑名稱自動匹配預設封面圖 (避免行家盤無圖時的白板現象)
const getEstateCover = (estateName?: string) => {
  if (!estateName) return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800'; // 預設圖
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('柏傲莊')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('海濱南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('康城')) return 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&q=80&w=800';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800';
};

// ★ 新增 isCompetitor 屬性以區分盤源來源
interface PropertyRoom {
  id: string;
  name: string;
  propertyId: string;
  baseRent: number;
  status: string;
  webStatus?: 'published' | 'draft';
  equipment?: string[];
  features?: string[];
  propertyName?: string;
  primaryImage?: string;
  images?: string[]; 
  isCompetitor?: boolean; 
}

async function getPublishedRooms(): Promise<PropertyRoom[]> {
  let internalRooms: PropertyRoom[] = [];
  let competitorRooms: PropertyRoom[] = [];

  // ==========================================
  // 1. 獲取內部盤源 (獨立 try-catch)
  // ==========================================
  try {
    if (!db) return [];
    
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
        primaryImage: primaryImage,
        isCompetitor: false
      } as PropertyRoom;
    });
  } catch (error) {
    console.error("Fetch internal rooms error:", error);
  }

  // ==========================================
  // 2. 獲取行家盤源 (獨立 try-catch，防止阻斷)
  // ==========================================
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
        primaryImage: data.imageUrl || null,
        features: data.features || [],
        isCompetitor: true 
      } as PropertyRoom;
    });
  } catch (error) {
    // 預期內錯誤：若 Collection 不存在或權限未開，只會印出警告，不會影響內部盤源
    console.warn("Fetch competitor rooms bypassed (likely missing Security Rules or empty collection).", error);
  }

  // ==========================================
  // 3. 合併並過濾
  // ==========================================
  const allRooms = [...internalRooms, ...competitorRooms];
  
  return allRooms.filter(r => r.webStatus === 'published' || r.status === 'Occupied'); 
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ uni?: string; type?: string }> }) {
  const { uni, type } = await searchParams;
  const allRooms = await getPublishedRooms();

  const filteredRooms = allRooms.filter(room => {
    let matchesUni = true;
    let matchesType = true;

    if (uni) {
      const searchTarget = (room.name + room.propertyName).toLowerCase();
      matchesUni = searchTarget.includes(uni.toLowerCase());
    }
    if (type) {
      if (type === 'ensuite') matchesType = room.features?.includes('套廁') || room.name.toLowerCase().includes('ensuite');
      else if (type === 'single') matchesType = !room.features?.includes('套廁');
    }
    return matchesUni && matchesType;
  });

  // 排序：內部盤源優先，然後才顯示行家盤
  filteredRooms.sort((a, b) => (a.isCompetitor === b.isCompetitor ? 0 : a.isCompetitor ? 1 : -1));

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold mb-3 uppercase tracking-wider border border-orange-200 shadow-sm">
               <Sparkles size={12}/> 官方直營 & 精選合作
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              {uni ? `搜尋結果: ${uni.toUpperCase()}` : '尋找您在香港的理想家'}
            </h1>
            <p className="text-slate-500 text-sm mt-2 font-medium">
               找到 <span className="text-orange-600 font-bold">{filteredRooms.length}</span> 個符合條件的優質房間
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-4">
        {filteredRooms.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
             <Search size={48} className="mx-auto text-slate-200 mb-4"/>
             <p className="text-slate-500 font-bold text-lg">找不到符合條件的房源</p>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isSoldOut = room.webStatus === 'draft' || room.status === 'Occupied';
            // ★ 行家盤 (isCompetitor) 會被導向 /competitor/[id]，官方盤導向 /properties/[id]
            const hrefUrl = isSoldOut ? '#' : (room.isCompetitor ? `/competitor/${room.id}` : `/properties/${room.id}`);

            // ★ 圖片回退邏輯：自定義圖片 > 屋苑公版封面圖 > 預設圖標
            const finalImage = room.primaryImage 
              ? getProxiedUrl(room.primaryImage) 
              : (room.isCompetitor ? getEstateCover(room.propertyName) : null);

            return (
              <Link 
                href={hrefUrl} 
                key={room.id} 
                className={`group bg-white rounded-3xl shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative ${
                  room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
                } ${isSoldOut ? 'cursor-default' : 'hover:shadow-xl hover:-translate-y-1'}`}
              >
                {isSoldOut && (
                  <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                    <div className="bg-slate-800/90 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700 backdrop-blur-md scale-110">
                      SOLD OUT
                    </div>
                  </div>
                )}

                <div className="relative h-56 md:h-64 bg-slate-100 overflow-hidden shrink-0">
                  {finalImage ? (
                    <img src={finalImage} alt={room.name} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                      <Home size={32} className="mb-2 opacity-50"/>
                    </div>
                  )}
                  
                  {/* 左上角：地區標籤 */}
                  <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 border border-white/20 z-10">
                     <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {room.propertyName}
                  </div>

                  {/* ★ 右上角：HK港灣之家標籤 */}
                  {room.isCompetitor && (
                    <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10">
                       <Building2 size={12}/> HK港灣之家
                    </div>
                  )}
                </div>
                
                <div className="p-6 flex flex-col flex-1 relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className={`text-xl font-black truncate pr-2 mb-1 ${isSoldOut ? 'text-slate-400' : 'text-slate-800'}`}>
                      {room.name}
                    </h3>
                    <div className="text-right shrink-0">
                      <span className={`font-black text-2xl ${isSoldOut ? 'text-slate-400' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
                        ${(room.baseRent || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-500">
                     <div className="flex gap-3">
                       <span className={`flex items-center gap-1 ${isSoldOut ? 'text-slate-400' : ''}`}>
                         <BedDouble size={14}/> 拎包入住
                       </span>
                     </div>
                     <span className={`px-4 py-2 rounded-lg transition-colors ${
                       isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-opacity-90'
                     }`}>
                       {isSoldOut ? '已租出' : '立即查看'}
                     </span>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  );
}
