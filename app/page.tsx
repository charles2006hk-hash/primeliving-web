// ★ 強制 Next.js 每次重新整理都去資料庫抓最新資料
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import React from 'react';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { 
  ArrowRight, MapPin, ShieldCheck, 
  Sparkles, Home, CheckCircle,
  Train, Building2, Quote, Wind, Sun, AlertTriangle // ★ 引入天氣需要的 icon
} from 'lucide-react';
import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';
// 移除笨重的天氣橫幅組件
// import WeatherBanner from '@/components/WeatherBanner'; 

// --- 核心工具：圖片過牆代購 API ---
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// --- 1. 抓取 CMS 區域百科 ---
async function getAreaGuides() {
  try {
    if (!db) return [];
    const q = query(collection(db, 'area_guides'), orderBy('sortOrder', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      imageUrl: d.data().imageUrl || d.data().img || '',
    }));
  } catch (e) {
    console.error("CMS Areas Fetch Error:", e);
    return [];
  }
}

// --- 2. 抓取 CMS 租客好評 ---
async function getTestimonials() {
  try {
    if (!db) return [];
    const q = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

// --- 3. 抓取最新盤源 (★ 包含空殼檢查邏輯) ---
async function getLatestProperties() {
  try {
    if (!db) return [];
    
    // 抓取最新建立的 3 個盤源大殼
    const q = query(collection(db, 'properties'), orderBy('createdAt', 'desc'), limit(3));
    const propSnap = await getDocs(q);
    
    // 抓取所有房間，用來比對這 3 個大殼內部有沒有發佈的分間
    const roomsSnap = await getDocs(collection(db, 'rooms'));
    const allRooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

    return propSnap.docs.map(doc => {
      const data = doc.data();
      const propImages = mediaDocs.filter(m => m.propertyId === doc.id);
      const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
      
      // ★ 核心檢查：看看這個物業內部，有沒有任何一間房的 webStatus 是 'published'
      const hasPublishedRooms = allRooms.some(r => r.propertyId === doc.id && r.webStatus === 'published');
      
      return { 
        id: doc.id, 
        ...data, 
        primaryImage: primaryImg,
        hasPublishedRooms // 將標記傳給前端
      };
    });
  } catch (e) {
    console.error("Latest Properties Fetch Error:", e);
    return [];
  }
}

export default async function HomePage() {
  // 併發抓取數據提升速度
  const [areaGuides, testimonials, featuredProps] = await Promise.all([
    getAreaGuides(),
    getTestimonials(),
    getLatestProperties()
  ]);

  return (
    <main className="min-h-screen bg-white selection:bg-orange-200">
      
      {/* 1. Hero Section (★ 升級毛玻璃懸浮組件) */}
      <section className="pt-20 md:pt-32 pb-16 px-4 bg-slate-50 relative overflow-hidden min-h-[60vh] flex items-center justify-center">
        {/* 背景裝飾光暈 */}
        <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[20rem] h-[20rem] bg-blue-500/5 blur-[80px] rounded-full pointer-events-none" />
        
        {/* ★ 優化版：懸浮毛玻璃天氣小組件 (放置於畫面右上角) */}
        <div className="hidden lg:flex absolute top-28 right-12 z-20 flex-col items-end animate-in fade-in slide-in-from-right-8 duration-700">
          <div className="bg-white/60 backdrop-blur-md border border-white shadow-xl rounded-2xl p-4 flex flex-col gap-2 transition-transform hover:scale-105">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-500">
                <Sun size={20} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-800 tracking-tighter">31°C</span>
                  <span className="text-xs font-bold text-slate-500">濕度 72%</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400">香港 • 下午好，佳寓夥伴！</p>
              </div>
            </div>
            {/* 動態警告區塊 */}
            <div className="w-full bg-red-50 border border-red-100 text-red-600 text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5">
               <AlertTriangle size={12} /> 雷暴警告現正生效
            </div>
          </div>
        </div>

        {/* 核心搜尋區塊 (視覺焦點) */}
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10 w-full">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-orange-600 text-[11px] font-black mb-6 border border-slate-100 shadow-sm uppercase tracking-widest animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Sparkles size={16} /> 2026 赴港精英租務首選平台
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            您在香港的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">星級理想家</span>
          </h1>
          
          <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <HomeSearch />
          </div>
        </div>
      </section>

      {/* 2. 生活圈百科 */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">精選生活圈百科</h2>
            <p className="text-slate-500 font-medium">深入調研區域優勢，為您匹配最適合的大學/通勤圈</p>
          </div>

          {areaGuides.length === 0 ? (
            <div className="py-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold">正在從 CMS 載入百科資料...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {areaGuides.map((area: any) => (
                <div key={area.id} className="group bg-slate-50 rounded-[2.5rem] overflow-hidden border border-slate-100 flex flex-col transition-all hover:shadow-2xl hover:border-orange-200">
                  <div className="h-56 relative overflow-hidden bg-slate-200">
                    {area.imageUrl ? (
                      <img 
                        src={getProxiedUrl(area.imageUrl)} 
                        alt={area.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 font-bold">
                        尚無圖片
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                    <div className="absolute bottom-6 left-6">
                      <h3 className="text-xl font-black text-white">{area.name}</h3>
                    </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <p className="text-sm text-slate-600 leading-relaxed mb-6 font-medium line-clamp-3">{area.desc}</p>
                    <div className="space-y-4 mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Train size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.transport}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Building2 size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.estates}</p>
                      </div>
                    </div>
                    <Link href={`/properties?search=${area.name.split(' ')[0]}`} className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all">
                      探索此區房源 <ArrowRight size={18} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. 最新盤源 (★ 包含智能跳轉路由) */}
      <section className="py-20 px-4 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 最新上架盤源
            </h2>
            <Link href="/properties" className="text-sm font-black text-orange-600 hover:underline">查看全部</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredProps.map((prop: any) => {
              
              // ★ 智能路由：有房間就搜自己，空殼就導向總列表
              const smartDestinationUrl = prop.hasPublishedRooms 
                ? `/properties?search=${prop.name}` 
                : `/properties`;

              return (
                <Link href={smartDestinationUrl} key={prop.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col">
                  <div className="h-52 relative overflow-hidden bg-slate-100 shrink-0">
                    {prop.primaryImage ? (
                      <img 
                        src={getProxiedUrl(prop.primaryImage)} 
                        alt={prop.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black italic">
                        <Home size={32} className="mb-2 opacity-20" />
                        Prime Living
                      </div>
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-black text-slate-800">
                      <MapPin size={12} className="inline mr-1 text-orange-500"/> {prop.region} {prop.district}
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="font-black text-lg text-slate-900 mb-4 truncate">{prop.name}</h3>
                    <div className="flex gap-4 border-t border-slate-50 pt-4 text-[10px] font-black text-slate-400">
                      <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-blue-500"/> 官方直營</span>
                      <span className="flex items-center gap-1"><Wind size={14} className="text-cyan-500"/> 拎包入住</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. 租客好評 */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-16 tracking-tight">聽聽租客怎麼說</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.length === 0 ? (
               <div className="col-span-2 py-10 text-center text-slate-400 font-bold bg-slate-50 rounded-3xl border border-dashed">
                 目前尚未有租客評價
               </div>
            ) : (
              testimonials.map((t: any) => (
                <div key={t.id} className="bg-slate-50 p-10 rounded-[2.5rem] relative border border-slate-100">
                  <Quote className="absolute top-8 right-8 text-orange-200 opacity-30" size={48} />
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-xl italic">{t.name?.[0]}</div>
                    <div>
                      <h4 className="font-black text-slate-900">{t.name}</h4>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">{t.identity}</p>
                    </div>
                  </div>
                  <p className="text-slate-600 text-lg font-medium leading-relaxed">「{t.text}」</p>
                  <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    <CheckCircle size={14}/> 身份已認證租客
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      
    </main>
  );
}
