import React from 'react';
import { collection, getDocs, query, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  ArrowRight, MapPin, BedDouble, ShieldCheck, 
  Sparkles, Home, Star, Users, CheckCircle,
  Train, Building2, Layout, Quote, MessageSquare, Wind, Wifi
} from 'lucide-react';
import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';

// --- ★ 核心工具：圖片過牆代購 API ---
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
};

// --- 1. 抓取 CMS 區域百科 ---
async function getAreaGuides() {
  try {
    if (!db) return [];
    const snap = await getDocs(collection(db, 'area_guides'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("CMS Areas Fetch Error:", e);
    return [];
  }
}

// --- 2. 抓取 CMS 租客好評 ---
async function getTestimonials() {
  try {
    if (!db) return [];
    const snap = await getDocs(collection(db, 'testimonials'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("CMS Testimonials Fetch Error:", e);
    return [];
  }
}

// --- 3. 抓取最新盤源 (只顯示大盤源封面) ---
async function getLatestProperties() {
  try {
    if (!db) return [];
    const q = query(collection(db, 'properties'), limit(3));
    const propSnap = await getDocs(q);
    
    const mediaSnap = await getDocs(collection(db, 'media_library'));
    const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

    return propSnap.docs.map(doc => {
      const data = doc.data();
      const propImages = mediaDocs.filter(m => m.propertyId === doc.id && m.status === 'linked');
      const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
      return { id: doc.id, ...data, primaryImage: primaryImg };
    });
  } catch (e) {
    return [];
  }
}

export default async function HomePage() {
  // 並行抓取所有實時數據
  const [areaGuides, testimonials, featuredProps] = await Promise.all([
    getAreaGuides(),
    getTestimonials(),
    getLatestProperties()
  ]);

  // 信任背書數據
  const TRUST_STATS = [
    { label: '官方直營房源', value: '100%', icon: <ShieldCheck className="text-blue-500" /> },
    { label: '精英租客選擇', value: '500+', icon: <Users className="text-orange-500" /> },
    { label: '售後響應速度', value: '30min', icon: <Sparkles className="text-emerald-500" /> },
  ];

  return (
    <main className="min-h-screen bg-white selection:bg-orange-200">
      
      {/* 1. Hero Section */}
      <section className="pt-20 md:pt-28 pb-16 px-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-50 via-white to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-orange-600 text-[11px] font-black mb-6 border border-orange-100 shadow-xl shadow-orange-500/5 uppercase tracking-widest">
            <Sparkles size={16} /> 2026 赴港精英租務首選平台
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-6">
            專為您打造的 <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-400">香港星級理想家</span>
          </h1>
          <p className="text-base text-slate-500 mb-10 max-w-2xl font-medium leading-relaxed">
            佳寓 PrimeLiving 提供官方直營高品質公寓。水電網全包、專屬管家維修，讓您的赴港生活從第一天起就精緻體面。
          </p>
          <HomeSearch />
        </div>
      </section>

      {/* 2. 信任數據區塊 */}
      <section className="py-8 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
          {TRUST_STATS.map((stat, i) => (
            <div key={i} className="flex items-center justify-center gap-4 text-white">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">{stat.icon}</div>
              <div>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 區域百科 - 數據來自 CMS */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">精選生活圈百科</h2>
            <p className="text-slate-500 font-medium">深入調研區域優勢，為您匹配最適合的大學/通勤圈</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {areaGuides.length === 0 ? (
                <div className="col-span-3 py-10 text-center text-slate-400 font-bold">請在 ERP 的 CMS 中新增區域百科</div>
            ) : (
                areaGuides.map((area: any) => (
                <div key={area.id} className="group bg-slate-50 rounded-[2.5rem] overflow-hidden border border-slate-100 flex flex-col transition-all hover:shadow-2xl hover:border-orange-200">
                    <div className="h-56 relative overflow-hidden">
                    <img src={getProxiedUrl(area.imageUrl)} alt={area.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
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
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">交通資訊</p><p className="text-xs font-bold text-slate-800">{area.transport}</p></div>
                        </div>
                        <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Building2 size={16}/></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">推薦屋苑</p><p className="text-xs font-bold text-slate-800">{area.estates}</p></div>
                        </div>
                    </div>
                    <Link href={`/properties?search=${area.name}`} className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 group-hover:bg-slate-900 group-hover:text-white transition-all">
                        探索此區房源 <ArrowRight size={18} />
                    </Link>
                    </div>
                </div>
                ))
            )}
          </div>
        </div>
      </section>

      {/* 4. 最新盤源 - 數據來自 Properties */}
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
              <Link href={`/properties?search=${prop.name}`} key={prop.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100">
                <div className="h-52 relative overflow-hidden bg-slate-100">
                  {prop.primaryImage ? (
                    <img src={getProxiedUrl(prop.primaryImage)} alt={prop.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black italic">Prime Living</div>
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

      {/* 5. 聽聽租客怎麼說 - 數據來自 CMS */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">聽聽租客怎麼說</h2>
            <p className="text-slate-500 font-medium">已有超過 500 位精英租客在佳寓開啟了他們的香港之旅</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.map((t: any) => (
              <div key={t.id} className="bg-slate-50 p-10 rounded-[3rem] shadow-sm border border-slate-100 relative">
                <Quote className="absolute top-8 right-8 text-orange-200 opacity-30" size={48} />
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 font-black text-xl italic border border-orange-200">
                      {t.name?.[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">{t.name}</h4>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">{t.identity}</p>
                    </div>
                  </div>
                  <p className="text-slate-600 text-lg font-medium leading-relaxed italic">「{t.text}」</p>
                  <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    <CheckCircle size={14}/> 身份已認證租客
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. 底部 CTA */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto bg-slate-900 rounded-[3rem] p-10 md:p-20 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent opacity-50" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-8 tracking-tight">準備好入住您的香港理想家了嗎？</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/properties" className="w-full sm:w-auto px-10 py-5 bg-orange-500 text-white rounded-2xl font-black text-lg hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 active:scale-95">
                立即瀏覽最新房源
              </Link>
              <button className="w-full sm:w-auto px-10 py-5 bg-white/10 text-white border border-white/20 rounded-2xl font-black text-lg hover:bg-white/20 transition-all backdrop-blur-md">
                聯繫專屬管家
              </button>
            </div>
            <p className="mt-8 text-slate-400 text-xs font-medium">平均預訂週期僅需 48 小時，優質房源手慢無</p>
          </div>
        </div>
      </section>
      
    </main>
  );
}
