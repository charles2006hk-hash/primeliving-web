import React from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  ArrowRight, MapPin, BedDouble, Wind, ShieldCheck, 
  Search, Wifi, Sparkles, Home 
} from 'lucide-react';
import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';

// --- 抓取前 3 名精選房源 ---
async function getFeaturedRooms() {
  try {
    if (!db) return [];
    const q = query(
      collection(db, 'rooms'), 
      where('webStatus', '==', 'published'),
      limit(3)
    );
    const roomSnap = await getDocs(q);
    
    const propSnap = await getDocs(collection(db, 'properties'));
    const propMap: Record<string, string> = {};
    propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => d.data());

    return roomSnap.docs.map(doc => {
      const data = doc.data();
      const primaryImg = mediaDocs.find(m => m.propertyId === data.propertyId && m.isPrimary)?.url 
                       || mediaDocs.find(m => m.propertyId === data.propertyId)?.url;
      return { 
        id: doc.id, 
        ...data, 
        primaryImage: primaryImg,
        propertyName: propMap[data.propertyId] || '精選盤源'
      };
    }).filter((r: any) => r.status !== 'Occupied');
  } catch (e) {
    console.error("Home Fetch Error:", e);
    return [];
  }
}

export default async function HomePage() {
  const featuredRooms = await getFeaturedRooms();

  return (
    <main className="min-h-screen bg-white selection:bg-orange-200">
      
      {/* 1. 極致緊湊版 Hero Section */}
      <section className="pt-20 md:pt-24 pb-10 px-4 bg-slate-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-orange-600 text-[10px] font-black mb-4 border border-slate-100 shadow-sm uppercase tracking-widest">
            <Sparkles size={14} /> 赴港學子 & 高才精英首選
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter leading-tight mb-4">
            您在香港的 <span className="text-orange-500">星級理想家</span>
          </h1>
          <p className="text-sm text-slate-500 mb-8 max-w-lg font-medium leading-relaxed">
            免除繁瑣手續，水電網全包、保潔維修。正規官方直營租約，真正實現拎包入住。
          </p>
          {/* 搜尋列 */}
          <HomeSearch />
        </div>
      </section>

      {/* 2. 熱門區域導航 - 移除暗黑遮罩，壓縮高度 */}
      <section className="py-10 md:py-14 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-6 gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                 <MapPin size={24} className="text-orange-500"/> 探索熱門屋苑
              </h2>
            </div>
            <Link href="/properties" className="text-xs font-black text-slate-500 flex items-center gap-1 hover:text-orange-600 transition-colors">
              查看全部 <ArrowRight size={14}/>
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {[
              { 
                region: "東鐵線沿線", 
                estates: "名城 · 柏傲莊", 
                target: "城大/浸大/中大", 
                img: "https://images.pexels.com/photos/169647/pexels-photo-169647.jpeg?auto=compress&cs=tinysrgb&w=800",
                link: "/properties?uni=cityu",
              },
              { 
                region: "紅磡/何文田", 
                estates: "海濱南岸 · 曦匯", 
                target: "理大 PolyU", 
                img: "https://images.pexels.com/photos/373481/pexels-photo-373481.jpeg?auto=compress&cs=tinysrgb&w=800",
                link: "/properties?uni=polyu",
              },
              { 
                region: "將軍澳/坑口", 
                estates: "日出康城", 
                target: "科大 HKUST", 
                img: "https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=800",
                link: "/properties?uni=hkust",
              },
              { 
                region: "港島核心區", 
                estates: "寶翠園 · 翰林峰", 
                target: "港大 / CBD", 
                img: "https://images.pexels.com/photos/3586966/pexels-photo-3586966.jpeg?auto=compress&cs=tinysrgb&w=800",
                link: "/properties?uni=hku",
              }
            ].map((area, idx) => (
              <Link href={area.link} key={idx} className="group relative h-48 md:h-64 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all block border border-slate-100">
                {/* 原圖展示，不再壓暗 */}
                <img src={area.img} alt={area.region} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                
                {/* 僅在底部加一層黑色漸變，確保文字清晰，不影響上方圖片 */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent top-1/2" />

                <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col justify-end">
                  <div className="bg-white/90 backdrop-blur-sm w-max px-2 py-1 rounded-lg text-[9px] font-black text-orange-600 uppercase tracking-widest mb-2 shadow-sm">
                    {area.target}
                  </div>
                  <h3 className="text-lg md:text-xl font-black text-white mb-1 leading-tight">{area.region}</h3>
                  <p className="text-[11px] font-medium text-slate-200 line-clamp-1">
                    {area.estates}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 精選房源 - 壓縮間距 */}
      <section className="py-10 md:py-14 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-6 gap-4">
            <div>
               <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-orange-500 rounded-full"/> 最新上架房源
              </h2>
            </div>
            <Link href="/properties" className="text-xs font-black text-slate-500 flex items-center gap-1 hover:text-orange-600 transition-colors">
              查看全部 <ArrowRight size={14}/>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuredRooms.map((room: any) => (
              <Link href={`/properties/${room.id}`} key={room.id} className="group bg-white rounded-2xl overflow-hidden border border-slate-100 transition-all hover:shadow-lg flex flex-col">
                <div className="h-48 relative overflow-hidden bg-slate-100 shrink-0">
                  {room.primaryImage ? (
                    <img src={room.primaryImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><Home size={24} className="mb-2 opacity-50"/><span className="font-black uppercase tracking-widest text-[9px] opacity-40">Prime Living</span></div>
                  )}
                  <div className="absolute top-3 left-3 px-2 py-1 bg-white/95 rounded-md text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1">
                    <MapPin size={12} className="text-orange-500"/> {room.propertyName}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-black text-lg text-slate-900 truncate pr-2 flex-1">{room.name}</h3>
                    <p className="text-orange-600 font-black text-xl shrink-0 leading-none">${(room.baseRent || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-3 text-[10px] font-bold text-slate-500 pt-3 mt-auto">
                    <span className="flex items-center gap-1"><BedDouble size={14} className="text-blue-500"/> 正規租約</span>
                    <span className="flex items-center gap-1"><Wind size={14} className="text-cyan-500"/> 分體冷氣</span>
                    <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-500"/> 智能鎖</span>
                  </div>
                </div>
              </Link>
            ))}
            {featuredRooms.length === 0 && (
              <div className="col-span-3 py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                <Search size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500 text-sm font-bold">精選房源籌備中...</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. 核心優勢 - 變成緊湊的一排 */}
      <section className="py-10 md:py-14 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: <ShieldCheck size={20} />, title: '官方直營，拒絕仲介', desc: '正規印花稅合約，絕無隱藏費用。', color: 'blue' },
              { icon: <Wifi size={20} />, title: '拎包入住，水電網全包', desc: '配備品牌傢俬光纖，免除開戶跑局。', color: 'orange' },
              { icon: <Sparkles size={20} />, title: '星級物管與專屬客服', desc: '定期保潔，專屬線上報修極速跟進。', color: 'emerald' }
            ].map(item => (
                <div key={item.title} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-${item.color}-100 text-${item.color}-600`}>
                        {item.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 mb-0.5">{item.title}</h3>
                      <p className="text-slate-500 text-xs font-medium">{item.desc}</p>
                    </div>
                </div>
            ))}
          </div>
        </div>
      </section>
      
    </main>
  );
}