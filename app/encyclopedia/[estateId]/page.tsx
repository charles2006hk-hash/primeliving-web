import React from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, Search, Home, Building2, BedDouble, ChevronRight, Users, Navigation, LayoutList, Building } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// ==========================================
// 1. 圖片安全處理元件 (解決 500 錯誤)
// ==========================================
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  // 只有 Firebase 圖片需要經過 Vercel 代理繞過 GFW
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url; // 其他圖片 (如 Unsplash) 直接直連
};

const SafeImage = ({ src, alt, className }: { src: string, alt?: string, className?: string }) => {
  const safeSrc = getProxiedUrl(src);
  return (
    <img 
      src={safeSrc} 
      alt={alt || '圖片'} 
      className={`object-cover ${className || ''}`} 
      loading="lazy"
      onError={(e) => { 
        // 圖片代理失敗時，自動降級使用原始網址
        if (e.currentTarget.src !== src) e.currentTarget.src = src; 
      }} 
    />
  );
};

// ==========================================
// 2. CMS 資料結構定義 (未來供大後台維護使用)
// ==========================================
interface EncyclopediaData {
  id: string;
  title: string;
  searchKeyword: string; // 用於匹配大系統的盤源
  targetAudience: string; // 適合人群
  trafficDesc: string; // 交通攻略
  trafficMapUrl: string; // 交通地圖
  estateIntro: string; // 小區介紹
  estateImages: string[]; // 小區圖片
  facilitiesText: string; // 設施介紹文字
  roomAmenitiesUrl: string; // 房間設施清單 (圖)
  highlightsUrl: string; // 公寓亮點 (圖)
  publicAreaImages: string[]; // 公共區域展示
  roomTypes: {
    name: string; // 戶型名稱 (例：三房一廁 陽台大單間)
    floorPlanUrl: string; // 戶型圖則
    roomImages: string[]; // 房間實景
  }[];
}

// Mock 資料：完全對齊港灣之家 PDF 的內容架構
const getEncyclopediaData = (id: string): EncyclopediaData => ({
  id,
  title: '大圍 柏傲莊',
  searchKeyword: '柏傲莊',
  targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學\n【適合人群】學生、上班族。交通便利，新界、九龍、港島主要辦公區都適合。',
  trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站，只需乘港鐵一個站6分鐘便可到達九龍塘站，到紅磡站、大學站亦只需15分鐘。位於東鐵線，只需半個小時到口岸。小區樓下便是地鐵站和公交站。',
  trafficMapUrl: 'https://images.unsplash.com/photo-1555931202-b8830f80bb1a?auto=format&fit=crop&q=80&w=800', 
  estateIntro: '位於香港新界沙田區車公廟路18號，於2022年下半年開始開放入住。小區內部直通大圍地鐵站和大型商場圍方（下雨可不用打傘），坐落於獅子山腳，依傍護城河，山水相依，屋苑園林景觀優美別緻，周邊生活配套齊全。',
  estateImages: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=600'
  ],
  facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
  roomAmenitiesUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&q=80&w=800', // 替換為設施表截圖
  highlightsUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=800', // 替換為亮點宣傳圖
  publicAreaImages: [
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&q=80&w=400'
  ],
  roomTypes: [
    {
      name: '三房一廁 陽台大單間A-D',
      floorPlanUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600',
      roomImages: ['https://images.unsplash.com/photo-1522771731470-ea457f920257?auto=format&fit=crop&q=80&w=600']
    },
    {
      name: '四房二廁 獨衛陽台大單間A',
      floorPlanUrl: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=600',
      roomImages: ['https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&q=80&w=600']
    }
  ]
});

// ==========================================
// 3. 拉取大系統房源 (限制 8 個)
// ==========================================
async function getRelatedRooms(searchKeyword: string) {
  let rooms: any[] = [];
  try {
    if (!db) return [];
    const propSnap = await getDocs(collection(db, 'properties'));
    const propMap: Record<string, string> = {};
    propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

    const roomSnap = await getDocs(collection(db, 'rooms'));
    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    const internalRooms = roomSnap.docs.map(doc => {
      const data = doc.data();
      let primaryImage = mediaDocs.find(m => m.id === data.images?.[0])?.url;
      if (!primaryImage) {
         const roomImages = mediaDocs.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
         primaryImage = roomImages.find(m => m.isPrimary)?.url || roomImages[0]?.url || null;
      }
      return {
        id: doc.id, ...data, propertyName: propMap[data.propertyId] || '', estateName: propMap[data.propertyId] || '',
        primaryImage, isCompetitor: false, createdAt: data.createdAt?.seconds || Date.now() / 1000
      };
    });

    let competitorRooms: any[] = [];
    try {
      const compSnap = await getDocs(collection(db, 'competitor_listings'));
      competitorRooms = compSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, name: data.name || data.title, baseRent: data.price || 0, status: data.status || 'Available', webStatus: data.webStatus || 'published',
          propertyName: data.district || data.estateName, estateName: data.estateName || '', primaryImage: data.imageUrl || null,
          isCompetitor: true, createdAt: data.createdAt?.seconds || Date.now() / 1000
        };
      });
    } catch(e) {}

    rooms = [...internalRooms, ...competitorRooms]
      .filter(r => r.webStatus === 'published' || String(r.status).toLowerCase() === 'occupied')
      .filter(r => (r.propertyName + ' ' + r.estateName + ' ' + r.name).includes(searchKeyword));

    rooms.sort((a, b) => {
      const aSold = a.webStatus === 'draft' || String(a.status).toLowerCase() === 'occupied';
      const bSold = b.webStatus === 'draft' || String(b.status).toLowerCase() === 'occupied';
      if (aSold !== bSold) return aSold ? 1 : -1;
      if (a.isCompetitor !== b.isCompetitor) return a.isCompetitor ? 1 : -1;
      return b.createdAt - a.createdAt;
    });

  } catch (error) {}
  
  return rooms.slice(0, 8); // ★ 限制只出 8 個關聯盤源
}

// ==========================================
// 4. 頁面渲染
// ==========================================
export default async function EstateEncyclopediaPage({ params }: { params: Promise<{ estateId: string }> }) {
  const resolvedParams = await params;
  const estate = getEncyclopediaData(resolvedParams.estateId);
  const relatedRooms = await getRelatedRooms(estate.searchKeyword);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-20 sm:pt-24 font-sans">
      
      {/* 頂部標題 */}
      <div className="bg-white py-6 mb-4 text-center border-b border-slate-200 shadow-sm relative z-50">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">{estate.title}</h1>
        <div className="flex items-center justify-center text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-600">首頁</Link> <ChevronRight size={14} className="mx-1 opacity-50" />
          <span className="text-slate-800 font-bold">小區百科</span>
        </div>
      </div>

      {/* 懸浮導航列 (對齊港灣之家) */}
      <div className="sticky top-[64px] md:top-[76px] z-40 bg-white border-b border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto flex items-center gap-6 px-4 py-3 min-w-max">
          <span className="font-black text-blue-600 text-lg mr-2 sm:mr-4">佳寓 PrimeLiving</span>
          <a href="#traffic" className="text-slate-600 hover:text-blue-600 font-bold text-sm transition-colors">交通攻略</a>
          <a href="#intro" className="text-slate-600 hover:text-blue-600 font-bold text-sm transition-colors">小區介紹</a>
          <a href="#facilities" className="text-slate-600 hover:text-blue-600 font-bold text-sm transition-colors">設施介紹</a>
          <a href="#rooms" className="text-slate-600 hover:text-blue-600 font-bold text-sm transition-colors">戶型介紹</a>
        </div>
      </div>

      {/* 單欄沉浸式內容區 (Max-W-3XL 對齊手機/平板閱讀體驗) */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-8 space-y-8">
        
        {/* 1. 適合人群 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
            <Users className="text-blue-600" size={20}/> 適合人群
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{estate.targetAudience}</p>
        </section>

        {/* 2. 交通攻略 */}
        <section id="traffic" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 scroll-mt-32">
          <h2 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
            <Navigation className="text-blue-600" size={20}/> ◎ 交通攻略
          </h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">{estate.trafficDesc}</p>
          <SafeImage src={estate.trafficMapUrl} className="w-full rounded-xl border border-slate-200" />
        </section>

        {/* 3. 小區介紹 */}
        <section id="intro" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 scroll-mt-32">
          <h2 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
            <Building className="text-blue-600" size={20}/> ◎ 小區介紹
          </h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">{estate.estateIntro}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {estate.estateImages.map((img, i) => (
              <SafeImage key={i} src={img} className="w-full h-48 rounded-xl border border-slate-100" />
            ))}
          </div>
        </section>

        {/* 4. 設施介紹 */}
        <section id="facilities" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 scroll-mt-32">
          <h2 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={20}/> ◎ 設施介紹
          </h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">{estate.facilitiesText}</p>
          
          <h3 className="font-bold text-slate-800 mt-6 mb-3 text-sm">◎ 房間設施</h3>
          <SafeImage src={estate.roomAmenitiesUrl} className="w-full rounded-xl border border-slate-200 mb-6" />

          <h3 className="font-bold text-slate-800 mt-6 mb-3 text-sm">◎ 公寓亮點</h3>
          <SafeImage src={estate.highlightsUrl} className="w-full rounded-xl border border-slate-200 mb-6" />

          <h3 className="font-bold text-slate-800 mt-6 mb-3 text-sm">◎ 公共區域展示</h3>
          <div className="grid grid-cols-2 gap-2">
            {estate.publicAreaImages.map((img, i) => (
              <SafeImage key={i} src={img} className="w-full h-32 rounded-xl border border-slate-100" />
            ))}
          </div>
        </section>

        {/* 5. 戶型介紹 (包含圖則與房間圖) */}
        <section id="floorplans" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 scroll-mt-32">
          <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <LayoutList className="text-blue-600" size={20}/> ◎ 戶型介紹
          </h2>
          <div className="space-y-8">
            {estate.roomTypes.map((rt, idx) => (
              <div key={idx} className="border-b border-slate-100 pb-8 last:border-0 last:pb-0">
                <h3 className="text-md font-bold text-slate-800 mb-3 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 text-blue-800 w-max">
                  {rt.name}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2">戶型圖則</p>
                    <SafeImage src={rt.floorPlanUrl} className="w-full rounded-xl border border-slate-200" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2">房間實景</p>
                    <div className="space-y-2">
                      {rt.roomImages.map((img, i) => (
                        <SafeImage key={i} src={img} className="w-full rounded-xl border border-slate-200" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ========================================== */}
      {/* 底部：本區可租盤源列表 (大系統關聯數據) */}
      {/* ========================================== */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-16 pt-10 border-t border-slate-200">
        <div className="text-center mb-10">
           <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">本區可租盤源</h2>
           <p className="text-sm text-slate-500 font-bold">為您精選 {relatedRooms.length} 套優質房源</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {relatedRooms.length === 0 ? (
             <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300">
               <Search size={40} className="mx-auto text-slate-300 mb-4"/>
               <p className="text-slate-500 font-bold text-lg">目前該區暫無空置房源</p>
             </div>
          ) : (
            relatedRooms.map((room) => {
              const isSoldOut = room.webStatus === 'draft' || String(room.status).toLowerCase() === 'occupied';
              const hrefUrl = isSoldOut ? '' : (room.isCompetitor ? `/competitor/${room.id}` : `/properties/${room.id}`);

              const CardContent = (
                <>
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-slate-800 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700">SOLD OUT</div>
                    </div>
                  )}

                  <div className="relative h-48 bg-slate-100 overflow-hidden shrink-0">
                    {room.primaryImage ? (
                      <SafeImage src={room.primaryImage} alt={room.name} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><Home size={32} className="mb-2 opacity-50"/></div>
                    )}
                    
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 z-10">
                       <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-blue-500'}/> {room.estateName || room.propertyName}
                    </div>

                    {room.isCompetitor && (
                      <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10">
                         <Building2 size={12}/> 合作盤源
                      </div>
                    )}
                  </div>
                  
                  <div className="p-5 flex flex-col flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-lg font-black truncate pr-2 ${isSoldOut ? 'text-slate-400' : 'text-slate-800'}`}>{room.name}</h3>
                      <span className={`font-black text-xl shrink-0 ${isSoldOut ? 'text-slate-400' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
                        ${(room.baseRent || 0).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-500">
                       <span className={`flex items-center gap-1 ${isSoldOut ? 'text-slate-400' : ''}`}><BedDouble size={14}/> 拎包入住</span>
                       <span className={`px-3 py-1.5 rounded-lg transition-colors ${isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-opacity-90'}`}>
                         {isSoldOut ? '已租出' : '查看詳情'}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative ${
                room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
              } ${isSoldOut ? 'cursor-not-allowed opacity-90' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'}`;

              return isSoldOut ? <div key={room.id} className={cardClasses}>{CardContent}</div> : <Link href={hrefUrl} key={room.id} className={cardClasses}>{CardContent}</Link>;
            })
          )}
        </div>
      </div>
    </div>
  );
}
