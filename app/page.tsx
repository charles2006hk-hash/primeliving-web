import React from 'react';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore'; // ★ 引入 orderBy
import { db } from '@/lib/firebase';
import { 
  ArrowRight, MapPin, ShieldCheck, 
  Sparkles, Home, CheckCircle,
  Train, Building2, Quote, Wind
} from 'lucide-react';
import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';

// --- 核心工具：圖片過牆代購 API ---
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
};

// --- 1. 抓取 CMS 區域百科 (★ 修正：加入排序功能) ---
async function getAreaGuides() {
  try {
    if (!db) return [];
    // ★ 關鍵：依照後台設定的 sortOrder 從小排到大
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
    // ★ 評價可以依建立時間排序，讓最新的顯示在前面
    const q = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

// --- 3. 抓取最新盤源 (優化抓圖邏輯) ---
async function getLatestProperties() {
  try {
    if (!db) return [];
    // 抓取最新 3 個準備上架或已發佈的盤源
    const q = query(collection(db, 'properties'), limit(3));
    const propSnap = await getDocs(q);
    
    // 抓取圖庫資料來匹配封面
    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

    return propSnap.docs.map(doc => {
      const data = doc.data();
      // 在圖庫中尋找封面圖
      const propImages = mediaDocs.filter(m => m.propertyId === doc.id);
      const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
      
      return { 
        id: doc.id, 
        ...data, 
        primaryImage: primaryImg 
      };
    });
  } catch (e) {
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
      
      {/* 1. Hero Section */}
      <section className="pt-20 md:pt-28 pb-16 px-4 bg-slate-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-orange-600 text-[11px] font-black mb-6 border border-slate-100 shadow-sm uppercase tracking-widest">
            <Sparkles size={16} /> 2026 赴港精英租務首選平台
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-6">
            您在香港的 <span className="text-orange-500">星級理想家</span>
          </h1>
          <HomeSearch />
        </div>
      </section>

      {/* 2. 生活圈百科 */}
      <section className="py-20 px-4 bg-white">
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
                    <img 
                      src={getProxiedUrl(area.imageUrl)} 
                      alt={area.name} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                    />
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

      {/* 3. 最新盤源 */}
      <section className="py-20 px-4 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 最新上架盤源
            </h2>
            <Link href="/properties" className="text-sm font-black text-orange-600 hover:underline">查看全部</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredProps.map((prop: any) => (
              <Link href={`/properties?search=${prop.name}`} key={prop.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col">
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
            ))}
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
