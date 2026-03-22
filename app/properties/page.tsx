import React from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase'; 
import { 
  MapPin, BedDouble, Wind, ShieldCheck, 
  ChevronRight, Search, Filter, Home, Heart, Sparkles 
} from 'lucide-react';
import Link from 'next/link';

// ★ 反向代理 URL 轉換器
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  // 避免重複包裝
  if (url.startsWith('/api/image')) return url;
  // 將原汁原味的 Firebase 網址，打包交給我們的 API
  return `/api/image?url=${encodeURIComponent(url)}`;
};

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
  images?: string[]; // 支援專屬圖片
}

async function getPublishedRooms() {
  try {
    if (!db) return [];
    const propSnap = await getDocs(collection(db, 'properties'));
    const propMap: Record<string, string> = {};
    propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

    const q = query(collection(db, 'rooms'), where('webStatus', '==', 'published'));
    const roomSnap = await getDocs(q);

    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    return roomSnap.docs.map(doc => {
      const data = doc.data();
      let primaryImage = null;

      // ★ 優先找此房間的專屬圖片
      if (data.images && data.images.length > 0) {
         const firstAssigned = mediaDocs.find(m => m.id === data.images[0]);
         if (firstAssigned) primaryImage = firstAssigned.url;
      }

      // 如果沒專屬圖片，用盤源的主圖墊底
      if (!primaryImage) {
         const roomImages = mediaDocs.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
         primaryImage = roomImages.find(m => m.isPrimary)?.url || roomImages[0]?.url || null;
      }

      return {
        id: doc.id,
        ...data,
        propertyName: propMap[data.propertyId] || '精選盤源',
        primaryImage: primaryImage
      } as PropertyRoom;
    }).filter(r => r.status !== 'Occupied');
  } catch (error) {
    return [];
  }
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ uni?: string; type?: string }>;
}) {
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
      if (type === 'ensuite') {
        matchesType = room.features?.includes('套廁') || room.name.toLowerCase().includes('ensuite');
      } else if (type === 'single') {
        matchesType = !room.features?.includes('套廁');
      }
    }

    return matchesUni && matchesType;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold mb-3 uppercase tracking-wider border border-orange-200 shadow-sm">
               <Sparkles size={12}/> 官方直營 · 精選房源
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
             <Link href="/properties" className="text-orange-600 text-sm mt-2 block hover:underline">查看全部房源</Link>
          </div>
        ) : (
          filteredRooms.map((room) => (
            <Link href={`/properties/${room.id}`} key={room.id} className="group bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:border-orange-200 hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="relative h-56 md:h-64 bg-slate-100 overflow-hidden shrink-0">
                {room.primaryImage ? (
                  // ★ 套用過牆代理
                  <img src={getProxiedUrl(room.primaryImage)} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><Home size={32} className="mb-2 opacity-50"/><span className="uppercase tracking-widest text-[10px] font-bold opacity-50">Prime Living</span></div>
                )}
                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 border border-white/20">
                   <MapPin size={12} className="text-orange-500"/> {room.propertyName}
                </div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-black text-slate-800 truncate pr-2 mb-1">{room.name}</h3>
                  <div className="text-right shrink-0">
                    <span className="text-orange-600 font-black text-2xl">${(room.baseRent || 0).toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-500">
                   <div className="flex gap-3">
                     <span className="flex items-center gap-1"><BedDouble size={14}/> 拎包入住</span>
                   </div>
                   <span className="bg-slate-900 text-white px-4 py-2 rounded-lg group-hover:bg-orange-600 transition-colors">立即查看</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
