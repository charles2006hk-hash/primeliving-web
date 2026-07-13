'use client';

import React from 'react';
import Link from 'next/link';
import { Search, MapPin, Home as HomeIcon, ChevronDown, Sparkles } from 'lucide-react';

// ★ 引入原本的動態天氣背景與首頁搜尋組件
import WeatherAmbientBackground from '@/components/WeatherAmbientBackground';
import HomeSearch from '@/components/HomeSearch';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { ShieldCheck, Wind, Quote, CheckCircle, Home, Train, Building2, ArrowRight } from 'lucide-react';

const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// --- 抓取資料函數 (為了搭配 use client，我們將其移入 useEffect，或者改為 Server Component 架構，但這裡我們用最單純的 Fetch) ---
// 注意：因為您要求這頁變成 Client Component (`'use client'`) 來呈現動畫，
// 所以原本的 Server Side Fetching (async 函數 + Server Component) 必須改寫為 Client Side 抓取。
export default function HomePage() {
  const [areaGuides, setAreaGuides] = React.useState<any[]>([]);
  const [testimonials, setTestimonials] = React.useState<any[]>([]);
  const [featuredProps, setFeaturedProps] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAllData() {
      try {
        if (!db) return;

        // 1. 抓取區域
        const qArea = query(collection(db, 'area_guides'), orderBy('sortOrder', 'asc'));
        const snapArea = await getDocs(qArea);
        setAreaGuides(snapArea.docs.map(d => ({ id: d.id, ...d.data(), imageUrl: d.data().imageUrl || d.data().img || ''})));

        // 2. 抓取好評
        const qTest = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
        const snapTest = await getDocs(qTest);
        setTestimonials(snapTest.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. 抓取最新盤源
        const qProp = query(collection(db, 'properties'), orderBy('createdAt', 'desc'), limit(3));
        const propSnap = await getDocs(qProp);
        const roomsSnap = await getDocs(collection(db, 'rooms'));
        const allRooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const mediaSnap = await getDocs(collection(db, 'media_library'));
        const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

        const propsData = propSnap.docs.map(doc => {
          const data = doc.data();
          const propImages = mediaDocs.filter(m => m.propertyId === doc.id);
          const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
          const hasPublishedRooms = allRooms.some(r => r.propertyId === doc.id && r.webStatus === 'published');
          return { id: doc.id, ...data, primaryImage: primaryImg, hasPublishedRooms };
        });
        setFeaturedProps(propsData);

      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchAllData();
  }, []);

  return (
    // ★ 核心：全螢幕流動光影背景 (Mesh Gradient)
    <main className="relative min-h-screen bg-[#fafbfc] overflow-hidden selection:bg-orange-200">
      
      {/* --- 天氣環境光渲染層 --- */}
      <div className="absolute inset-0 z-0">
        <WeatherAmbientBackground />
      </div>

      {/* --- 內容層 (將原本的 section 背景色拔除，統一透明) --- */}
      <div className="relative z-10 pt-24 md:pt-32 pb-24 space-y-32">
        
        {/* ==================== Hero Section ==================== */}
        <section className="max-w-7xl mx-auto px-4 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/60 backdrop-blur-sm border border-orange-200/50 text-orange-600 text-xs font-black tracking-widest mb-6 shadow-sm">
            <Sparkles size={14} /> 2026 赴港精英租房首選平台
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight mb-12">
            您在香港的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">星級理想家</span>
          </h1>

          <div className="w-full max-w-4xl">
            <HomeSearch />
          </div>
        </section>

        {/* ==================== 生活圈百科 ==================== */}
        <section className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-900 mb-3">精選生活圈百科</h2>
            <p className="text-sm text-slate-500 font-bold">深入調研區域優勢，為您匹配最適合的大學/通勤圈</p>
          </div>

          {loading ? (
             <div className="py-20 text-center bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white/60">
               <p className="text-slate-400 font-bold">載入中...</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {areaGuides.map((area: any) => (
                <div key={area.id} className="group bg-white/60 backdrop-blur-lg border border-white/60 rounded-[2.5rem] overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-2">
                  <div className="h-64 relative overflow-hidden bg-slate-200">
                    {area.imageUrl ? (
                      <img src={getProxiedUrl(area.imageUrl)} alt={area.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 font-bold">尚無圖片</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent flex items-end p-6">
                      <h3 className="text-xl font-black text-white">{area.name}</h3>
                    </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <p className="text-sm text-slate-600 leading-relaxed mb-6 font-medium line-clamp-3">{area.desc}</p>
                    <div className="space-y-4 mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100/50 p-2 rounded-lg text-blue-600"><Train size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.transport}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100/50 p-2 rounded-lg text-emerald-600"><Building2 size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.estates}</p>
                      </div>
                    </div>
                    <Link href={`/properties?search=${area.name.split(' ')[0]}`} className="w-full mt-auto py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                      探索此區房源 <ArrowRight size={18} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ==================== 最新盤源 ==================== */}
        <section className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-12 border-b border-slate-200/50 pb-4">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 最新上架盤源
            </h2>
            <Link href="/properties" className="text-sm font-black text-orange-600 hover:underline">查看全部</Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredProps.map((prop: any) => {
              const smartDestinationUrl = prop.hasPublishedRooms ? `/properties?search=${prop.name}` : `/properties`;
              return (
                <Link href={smartDestinationUrl} key={prop.id} className="group bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-white/60 flex flex-col">
                  <div className="h-52 relative overflow-hidden bg-slate-100 shrink-0">
                    {prop.primaryImage ? (
                      <img src={getProxiedUrl(prop.primaryImage)} alt={prop.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black italic"><Home size={32} className="mb-2 opacity-20" />Prime Living</div>
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-black text-slate-800 shadow-sm">
                      <MapPin size={12} className="inline mr-1 text-orange-500"/> {prop.region} {prop.district}
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="font-black text-lg text-slate-900 mb-4 truncate">{prop.name}</h3>
                    <div className="flex gap-4 border-t border-slate-200/50 pt-4 text-[10px] font-black text-slate-500">
                      <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-blue-500"/> 官方直營</span>
                      <span className="flex items-center gap-1"><Wind size={14} className="text-cyan-500"/> 拎包入住</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ==================== 租客好評 ==================== */}
        <section className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-16 tracking-tight">聽聽租客怎麼說</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.length === 0 && !loading ? (
               <div className="col-span-2 py-10 text-center text-slate-400 font-bold bg-white/40 backdrop-blur-md rounded-3xl border border-dashed border-slate-300">
                 目前尚未有租客評價
               </div>
            ) : (
              testimonials.map((t: any) => (
                <div key={t.id} className="bg-white/60 backdrop-blur-lg p-10 rounded-[2.5rem] relative border border-white/80 shadow-lg shadow-slate-200/20">
                  <Quote className="absolute top-8 right-8 text-orange-200 opacity-40" size={48} />
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-white font-black text-xl italic shadow-inner">{t.name?.[0]}</div>
                    <div>
                      <h4 className="font-black text-slate-900">{t.name}</h4>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">{t.identity}</p>
                    </div>
                  </div>
                  <p className="text-slate-700 text-lg font-medium leading-relaxed">「{t.text}」</p>
                  <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    <CheckCircle size={14}/> 身份已認證租客
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
