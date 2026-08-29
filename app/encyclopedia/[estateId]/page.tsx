import React from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, BedDouble, Search, Home, Sparkles, Building2, Share2, CheckCircle2, Navigation, MessageCircle, Maximize } from 'lucide-react';
import Link from 'next/link';
import ChinaImage from '@/components/ChinaImage';

export const dynamic = 'force-dynamic'; 

const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
};

const getEstateCover = (estateName?: string) => {
  if (!estateName) return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800'; 
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('柏傲莊')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800';
};

// 1. 定義百科靜態資料 (可替換為 DB 讀取)
const getEncyclopediaData = (id: string) => {
  return {
    id,
    title: '大圍 柏傲莊 (The Pavilia Farm)',
    searchKeyword: '柏傲莊', // 用這個字串去 DB 撈這棟樓的真實盤源
    tags: ['香港中文大學', '香港城市大學', '香港浸會大學', '東鐵線/屯馬線'],
    trafficMapUrl: 'https://images.unsplash.com/photo-1555931202-b8830f80bb1a?auto=format&fit=crop&q=80&w=1200', 
    estateIntro: '柏傲莊位於大圍站上蓋，為全新大型高級私人屋苑。基座為大型商場「圍方 (The Wai)」，生活配套一應俱全。交通極度便利，東鐵線及屯馬線雙鐵路交匯，前往中大、城大、浸大及理大均極為方便，是留學生與來港專才的頂級居住首選。',
    estateImages: ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=800'],
    facilities: ['五星級豪華會所', '室內外雙泳池', '24小時無間斷健身房', '階梯式閱讀室與共享工作空間', '嚴密智能安保系統'],
    highlights: '佳寓 PrimeLiving 專注於提供高品質、直營管理的赴港學生公寓服務。我們承諾：\n✅ 嚴選優質屋苑\n✅ 全新高品質傢俬家電\n✅ 包 WiFi 及清潔\n✅ 專屬管家與極速維修'
  };
};

// 2. 複用大系統的拉取邏輯，找出屬於這個百科的房源
async function getEstateRooms(searchKeyword: string) {
  let internalRooms: any[] = [];
  let competitorRooms: any[] = [];

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
         primaryImage = mediaDocs.find(m => m.id === data.images[0])?.url;
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
        primaryImage,
        isCompetitor: false,
        createdAt: data.createdAt || { seconds: Date.now() / 1000 }
      };
    });
  } catch (error) { console.error(error); }

  try {
    const compSnap = await getDocs(collection(db, 'competitor_listings'));
    competitorRooms = compSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.title || '優質合作盤源', 
        baseRent: data.price || 0, 
        status: data.status || 'Available',
        webStatus: data.webStatus || 'published',
        propertyName: data.district || data.estateName || '合作屋苑',
        estateName: data.estateName || '',
        primaryImage: data.imageUrl || null,
        isCompetitor: true,
        createdAt: data.createdAt || data.updatedAt || { seconds: Date.now() / 1000 }
      };
    });
  } catch (error) {}

  // 合併並只保留有這個「關鍵字」的房源
  const filteredRooms = [...internalRooms, ...competitorRooms]
    .filter(r => r.webStatus === 'published' || String(r.status).toLowerCase() === 'occupied')
    .filter(r => {
      const fullName = (r.propertyName + ' ' + r.estateName + ' ' + r.name).toLowerCase();
      return fullName.includes(searchKeyword.toLowerCase());
    });

  // 排序：未售出優先 -> 佳寓直營優先 -> 最新建立優先
  filteredRooms.sort((a, b) => {
    const aSold = a.webStatus === 'draft' || String(a.status).toLowerCase() === 'occupied';
    const bSold = b.webStatus === 'draft' || String(b.status).toLowerCase() === 'occupied';
    if (aSold !== bSold) return aSold ? 1 : -1;
    if (a.isCompetitor !== b.isCompetitor) return a.isCompetitor ? 1 : -1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  return filteredRooms;
}

export default async function EstateEncyclopediaPage({ params }: { params: Promise<{ estateId: string }> }) {
  const resolvedParams = await params;
  const estate = getEncyclopediaData(resolvedParams.estateId);
  const relatedRooms = await getEstateRooms(estate.searchKeyword);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-24 font-sans">
      
      {/* 麵包屑 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6 flex items-center text-sm text-slate-500">
        <Link href="/" className="hover:text-emerald-600 transition-colors">首頁</Link> 
        <span className="mx-2 opacity-50">/</span>
        <span className="text-slate-800 font-bold">{estate.title}</span>
      </div>

      {/* 頂部形象圖 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-8">
        <div className="relative h-[300px] md:h-[450px] rounded-[2rem] overflow-hidden shadow-sm group">
          <ChinaImage src={estate.estateImages[0]} alt="主圖" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-8 left-8 right-8">
             <h1 className="text-3xl md:text-5xl font-black text-white mb-3 tracking-tight drop-shadow-md">{estate.title}</h1>
             <div className="flex flex-wrap gap-2">
               {estate.tags.map(tag => (
                 <span key={tag} className="px-3 py-1 bg-white/20 backdrop-blur-md text-white border border-white/30 text-xs font-bold rounded-lg shadow-sm">
                   {tag}
                 </span>
               ))}
             </div>
          </div>
        </div>
      </div>

      {/* 左右雙欄排版 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左側：百科詳情 */}
        <div className="lg:col-span-8 space-y-8">
          
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> 關於本小區
            </h2>
            <p className="text-slate-600 leading-relaxed text-sm md:text-base">{estate.estateIntro}</p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> 星級會所與配套
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {estate.facilities.map((fac, i) => (
                <div key={i} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0"/>
                  <span className="text-sm font-bold text-slate-700">{fac}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] shadow-lg text-white">
            <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-400 rounded-full"></span> 佳寓 PrimeLiving 承諾
            </h2>
            <p className="text-slate-300 leading-relaxed text-sm md:text-base whitespace-pre-wrap">{estate.highlights}</p>
          </div>
        </div>

        {/* 右側：導航懸浮卡片 */}
        <div className="lg:col-span-4 hidden lg:block">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 sticky top-28">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 border border-blue-100">
              <Navigation size={32} className="text-blue-500"/>
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-4">地理優勢</h3>
            <div className="rounded-xl overflow-hidden border border-slate-200 mb-6 h-48">
              <ChinaImage src={estate.trafficMapUrl} className="w-full h-full object-cover" />
            </div>
            <a href="#available-rooms" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 active:scale-95">
              立即查看本區房源
            </a>
          </div>
        </div>

      </div>

      {/* 底部：該百科下的真實盤源列表 (取代舊版的 Accrodion) */}
      <div id="available-rooms" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 pt-8 border-t border-slate-200 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-8">
           <h2 className="text-2xl md:text-3xl font-black text-slate-900">本區精選盤源</h2>
           <span className="bg-orange-100 text-orange-600 text-sm px-3 py-1 rounded-full font-bold border border-orange-200 w-max">共 {relatedRooms.length} 套</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {relatedRooms.length === 0 ? (
             <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300">
               <Search size={48} className="mx-auto text-slate-300 mb-4"/>
               <p className="text-slate-500 font-bold text-lg">目前該區暫無空置房源</p>
             </div>
          ) : (
            relatedRooms.map((room) => {
              const isSoldOut = room.webStatus === 'draft' || String(room.status).toLowerCase() === 'occupied';
              // 點擊後跳轉到你提供的單一房源詳情頁
              const hrefUrl = isSoldOut ? '' : (room.isCompetitor ? `/competitor/${room.id}` : `/properties/${room.id}`);
              const finalImage = room.primaryImage ? getProxiedUrl(room.primaryImage) : getEstateCover(room.propertyName || room.estateName);

              const CardContent = (
                <>
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-slate-800/90 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700 backdrop-blur-md scale-110">
                        SOLD OUT
                      </div>
                    </div>
                  )}

                  <div className="relative h-56 bg-slate-100 overflow-hidden shrink-0">
                    {finalImage ? (
                      <ChinaImage src={finalImage} alt={room.name} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><Home size={32} className="mb-2 opacity-50"/></div>
                    )}
                    
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 z-10">
                       <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {room.estateName || room.propertyName}
                    </div>

                    {/* ★ 將港灣之家的字眼，統一改為 PrimeLiving 合作盤源 */}
                    {room.isCompetitor && (
                      <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10">
                         <Building2 size={12}/> 精選合作盤源
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
                       <span className={`flex items-center gap-1 ${isSoldOut ? 'text-slate-400' : ''}`}><BedDouble size={14}/> 拎包入住</span>
                       <span className={`px-4 py-2 rounded-lg transition-colors ${isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-opacity-90'}`}>
                         {isSoldOut ? '已租出' : '點擊查看詳情'}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white rounded-3xl shadow-sm border overflow-hidden transition-all duration-300 flex flex-col relative ${
                room.isCompetitor ? 'border-purple-100 hover:border-purple-300' : 'border-slate-100 hover:border-orange-200'
              } ${isSoldOut ? 'cursor-not-allowed opacity-90' : 'hover:shadow-xl hover:-translate-y-1 cursor-pointer'}`;

              return isSoldOut ? <div key={room.id} className={cardClasses}>{CardContent}</div> : <Link href={hrefUrl} key={room.id} className={cardClasses}>{CardContent}</Link>;
            })
          )}
        </div>
      </div>
    </div>
  );
}
