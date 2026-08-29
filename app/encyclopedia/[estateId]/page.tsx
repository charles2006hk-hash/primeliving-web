import React from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// ★ 修復核心：補上漏掉的 CheckCircle2
import { MapPin, Search, Home, Building2, BedDouble, ChevronRight, Users, Navigation, LayoutList, Building, Sparkles, Map, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// ==========================================
// 1. 圖片安全處理元件
// ==========================================
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url; 
};

const SafeImage = ({ src, alt, className }: { src: string, alt?: string, className?: string }) => {
  const safeSrc = getProxiedUrl(src);
  return (
    <img 
      src={safeSrc} 
      alt={alt || '圖片'} 
      className={`object-cover ${className || ''}`} 
      loading="lazy"
    />
  );
};

// ==========================================
// 2. CMS 資料結構定義
// ==========================================
interface EncyclopediaData {
  id: string;
  title: string;
  searchKeyword: string; 
  targetAudience: string; 
  trafficDesc: string; 
  trafficMapUrl: string; 
  estateIntro: string; 
  estateImages: string[]; 
  facilitiesText: string; 
  roomAmenitiesUrl: string; 
  highlightsUrl: string; 
  publicAreaImages: string[]; 
  roomTypes: {
    name: string; 
    floorPlanUrl: string; 
    roomImages: string[]; 
  }[];
}

const getEncyclopediaData = (id: string): EncyclopediaData => ({
  id,
  title: '大圍 柏傲莊',
  searchKeyword: '柏傲莊',
  targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學\n【適合人群】學生、上班族。交通便利，新界、九龍、港島主要辦公區都適合。',
  trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站，只需乘港鐵一個站6分鐘便可到達九龍塘站，到紅磡站、大學站亦只需15分鐘。位於東鐵線，只需半個小時到口岸。小區樓下便是地鐵站和公交站。',
  trafficMapUrl: 'https://images.unsplash.com/photo-1555931202-b8830f80bb1a?auto=format&fit=crop&q=80&w=1200', 
  estateIntro: '位於香港新界沙田區車公廟路18號，於2022年下半年開始開放入住。小區內部直通大圍地鐵站和大型商場圍方（下雨可不用打傘），坐落於獅子山腳，依傍護城河，山水相依，屋苑園林景觀優美別緻，周邊生活配套齊全。',
  estateImages: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1200'
  ],
  facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
  roomAmenitiesUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&q=80&w=1200', 
  highlightsUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200', 
  publicAreaImages: [
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&q=80&w=800',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&q=80&w=800'
  ],
  roomTypes: [
    {
      name: '三房一廁 陽台大單間A-D',
      floorPlanUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800',
      roomImages: ['https://images.unsplash.com/photo-1522771731470-ea457f920257?auto=format&fit=crop&q=80&w=800']
    },
    {
      name: '四房二廁 獨衛陽台大單間A',
      floorPlanUrl: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=800',
      roomImages: ['https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&q=80&w=800']
    }
  ]
});

// ==========================================
// 3. 拉取大系統房源 (限制 6 個以維持版面平衡)
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
  
  return rooms.slice(0, 6); 
}

// ==========================================
// 4. 頁面渲染 
// ==========================================
export default async function EstateEncyclopediaPage({ params }: { params: Promise<{ estateId: string }> }) {
  const resolvedParams = await params;
  const estate = getEncyclopediaData(resolvedParams.estateId);
  const relatedRooms = await getRelatedRooms(estate.searchKeyword);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 selection:bg-orange-200 pb-24 font-sans">
      
      {/* 沉浸式背景層 */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 blur-[120px] mix-blend-multiply" />
        <div className="absolute top-[20%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-rose-400/20 blur-[130px] mix-blend-multiply" />
      </div>

      {/* 頂部形象圖與標題 */}
      <div className="relative pt-24 md:pt-32 pb-12 z-10 max-w-7xl mx-auto px-4">
         <div className="text-center mb-10">
           <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/50 text-orange-600 text-xs font-black tracking-widest mb-4 shadow-sm">
             <MapPin size={14} /> 小區生活圈百科
           </div>
           <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight drop-shadow-sm mb-4">
             {estate.title}
           </h1>
           <p className="text-slate-600 font-bold max-w-2xl mx-auto leading-relaxed whitespace-pre-wrap">
             {estate.targetAudience}
           </p>
         </div>

         {/* 懸浮導航 (Pill Design) */}
         <div className="sticky top-[80px] z-50 flex justify-center mb-12">
            <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg shadow-slate-200/50 rounded-full px-2 py-2 flex gap-1 overflow-x-auto custom-scrollbar max-w-full">
               {[
                 { id: '#intro', icon: Building, label: '小區介紹' },
                 { id: '#traffic', icon: Navigation, label: '交通攻略' },
                 { id: '#facilities', icon: Sparkles, label: '設施與亮點' },
                 { id: '#floorplans', icon: LayoutList, label: '戶型圖則' },
                 { id: '#available-rooms', icon: Home, label: '可租盤源' }
               ].map(nav => (
                 <a key={nav.id} href={nav.id} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black text-slate-600 hover:bg-orange-500 hover:text-white transition-all whitespace-nowrap">
                   <nav.icon size={16}/> {nav.label}
                 </a>
               ))}
            </div>
         </div>

         {/* 主視覺大圖 */}
         <div id="intro" className="h-[400px] md:h-[500px] rounded-[3rem] overflow-hidden shadow-2xl shadow-slate-200/50 relative group scroll-mt-32">
            <SafeImage src={estate.estateImages[0]} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
         </div>
      </div>

      {/* 內容區塊 (雙欄網格) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左側：詳細資訊 */}
        <div className="lg:col-span-8 space-y-8">
          
          <section className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80">
            <h2 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 關於本小區
            </h2>
            <p className="text-slate-700 leading-relaxed font-medium text-lg">{estate.estateIntro}</p>
          </section>

          <section id="traffic" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
            <h2 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 交通與通勤
            </h2>
            <p className="text-slate-700 leading-relaxed font-medium text-base mb-6">{estate.trafficDesc}</p>
            <div className="rounded-2xl overflow-hidden border border-slate-200/50 shadow-sm h-[300px]">
              <SafeImage src={estate.trafficMapUrl} className="w-full h-full object-cover" />
            </div>
          </section>

          <section id="facilities" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 屋苑設施與亮點
            </h2>
            <p className="text-slate-700 leading-relaxed font-medium text-base mb-8">{estate.facilitiesText}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="text-orange-500" size={18}/> 房間標準配置</h3>
                <div className="rounded-2xl overflow-hidden shadow-sm h-64 border border-slate-200/50"><SafeImage src={estate.roomAmenitiesUrl} className="w-full h-full object-cover" /></div>
              </div>
              <div>
                <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="text-orange-500" size={18}/> 佳寓服務亮點</h3>
                <div className="rounded-2xl overflow-hidden shadow-sm h-64 border border-slate-200/50"><SafeImage src={estate.highlightsUrl} className="w-full h-full object-cover" /></div>
              </div>
            </div>
          </section>

          {/* 戶型圖則 */}
          <section id="floorplans" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
            <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 戶型介紹與圖則
            </h2>
            
            <div className="space-y-12">
              {estate.roomTypes.map((rt, idx) => (
                <div key={idx} className="border-b border-slate-200/60 pb-10 last:border-0 last:pb-0">
                  <h3 className="text-lg font-black text-white bg-slate-900 px-5 py-2.5 rounded-2xl w-max mb-6 shadow-md shadow-slate-900/20">
                    {rt.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/60">
                      <p className="text-sm font-black text-slate-500 mb-3 flex items-center gap-2"><Map size={16}/> 戶型圖則</p>
                      <div className="h-64 rounded-2xl overflow-hidden bg-white"><SafeImage src={rt.floorPlanUrl} className="w-full h-full object-contain" /></div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/60">
                      <p className="text-sm font-black text-slate-500 mb-3 flex items-center gap-2"><BedDouble size={16}/> 房間實景</p>
                      <div className="h-64 rounded-2xl overflow-hidden bg-white"><SafeImage src={rt.roomImages[0]} className="w-full h-full object-cover" /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* 右側：浮動摘要卡片 */}
        <div className="lg:col-span-4 hidden lg:block">
           <div className="sticky top-[160px] bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl shadow-slate-900/20 text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 blur-[40px] -translate-y-10 translate-x-10 pointer-events-none" />
              <Building className="text-orange-400 mb-6" size={40}/>
              <h3 className="text-2xl font-black mb-4">對 {estate.title} 感興趣？</h3>
              <p className="text-slate-400 font-medium leading-relaxed mb-8">
                佳寓團隊隨時為您提供本屋苑的最新租盤資訊。所有房源均配備全套高品質傢俬，並享受專屬管家服務。
              </p>
              <a href="#available-rooms" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl shadow-lg shadow-orange-500/30 transition-all flex justify-center items-center gap-2 active:scale-95 mb-4">
                立即查看本區房源
              </a>
              <div className="pt-6 border-t border-slate-800">
                <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">為什麼選擇佳寓</p>
                <ul className="space-y-3 text-sm font-bold text-slate-300">
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 100% 真實房源</li>
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 免收中介費</li>
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 星級直營管理</li>
                </ul>
              </div>
           </div>
        </div>

      </div>

      {/* ========================================== */}
      {/* 底部：關聯房源 (復刻官網精美卡片) */}
      {/* ========================================== */}
      <div id="available-rooms" className="relative z-10 max-w-7xl mx-auto px-4 mt-24 scroll-mt-32">
        <div className="flex justify-between items-end mb-10 border-b border-slate-300/50 pb-4">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 drop-shadow-sm">
             <div className="w-2 h-8 bg-orange-500 rounded-full shadow-md shadow-orange-500/50"/> 本區可租盤源
          </h2>
          <span className="text-sm font-black text-orange-600 bg-orange-100 px-3 py-1 rounded-lg">共 {relatedRooms.length} 套</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {relatedRooms.length === 0 ? (
             <div className="col-span-full py-24 text-center bg-white/50 backdrop-blur-xl rounded-[2.5rem] border border-dashed border-slate-300 shadow-sm">
               <Search size={48} className="mx-auto text-slate-300 mb-4"/>
               <p className="text-slate-600 font-black text-lg">目前該區暫無空置房源</p>
             </div>
          ) : (
            relatedRooms.map((room) => {
              const isSoldOut = room.webStatus === 'draft' || String(room.status).toLowerCase() === 'occupied';
              const hrefUrl = isSoldOut ? '' : (room.isCompetitor ? `/competitor/${room.id}` : `/properties/${room.id}`);

              const CardContent = (
                <>
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-100/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-slate-800 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700">SOLD OUT</div>
                    </div>
                  )}

                  <div className="relative h-56 bg-slate-100 overflow-hidden shrink-0">
                    {room.primaryImage ? (
                      <SafeImage src={room.primaryImage} alt={room.name} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black italic"><Home size={32} className="mb-2 opacity-20"/>Prime Living</div>
                    )}
                    
                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 z-10 border border-white/50">
                       <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {room.estateName || room.propertyName}
                    </div>

                    {room.isCompetitor && (
                      <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10 border border-white/50">
                         <Building2 size={12}/> 精選合作盤源
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 flex flex-col flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className={`text-xl font-black truncate pr-2 mb-1 ${isSoldOut ? 'text-slate-400' : 'text-slate-900'}`}>{room.name}</h3>
                      <span className={`font-black text-2xl shrink-0 ${isSoldOut ? 'text-slate-400' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
                        ${(room.baseRent || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-black text-slate-500">
                       <span className={`flex items-center gap-1 px-2 py-1 rounded-md ${isSoldOut ? 'bg-slate-100 text-slate-400' : 'bg-cyan-50 text-cyan-700'}`}>
                         <BedDouble size={14}/> 拎包入住
                       </span>
                       <span className={`px-4 py-2 rounded-lg transition-colors text-xs ${isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                         {isSoldOut ? '已租出' : '立即查看'}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white/70 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border border-white/80 transition-all duration-300 flex flex-col relative cursor-pointer ${isSoldOut ? 'opacity-90' : 'hover:shadow-2xl hover:-translate-y-1'}`;

              return isSoldOut ? <div key={room.id} className={cardClasses}>{CardContent}</div> : <Link href={hrefUrl} key={room.id} className={cardClasses}>{CardContent}</Link>;
            })
          )}
        </div>
      </div>
    </div>
  );
}
