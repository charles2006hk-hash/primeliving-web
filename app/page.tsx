'use client';

import React from 'react';
import { 
  ArrowRight, MapPin, BedDouble, ShieldCheck, 
  Sparkles, Home, Star, Users, CheckCircle,
  Train, Building2, Layout, Quote, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';

// ★ 信任背書數據
const TRUST_STATS = [
  { label: '官方直營房源', value: '100%', icon: <ShieldCheck className="text-blue-500" /> },
  { label: '精英租客選擇', value: '500+', icon: <Users className="text-orange-500" /> },
  { label: '售後響應速度', value: '30min', icon: <Sparkles className="text-emerald-500" /> },
];

// ★ AI 整理：核心區域深度介紹
const AREA_GUIDES = [
  {
    name: "大圍/沙田 (東鐵核心)",
    tags: ["城大/浸大/中大首選", "交通樞紐"],
    desc: "香港留學生的「最強後花園」。大圍名城與沙田第一城是標誌性屋苑，自成大型生活圈。",
    transport: "東鐵線 15 分鐘直達各大學",
    estates: "名城 · 柏傲莊 · 沙田第一城",
    layouts: "3房2廳 (建築 900-1100呎) 為主",
    img: "https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800",
    link: "/properties?uni=cityu"
  },
  {
    name: "紅磡/何文田 (理大生活圈)",
    tags: ["理大 PolyU 步行圈", "美食天堂"],
    desc: "最具生活煙火氣的區域。海濱南岸擁有全港頂尖會所設施，深受追求品質的高才與學生喜愛。",
    transport: "步行 8-12 分鐘至理大/紅磡站",
    estates: "海濱南岸 · 曦匯 · 半島豪庭",
    layouts: "2房/3房 (實用 430-600呎) 為多",
    img: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=800",
    link: "/properties?uni=polyu"
  },
  {
    name: "港島西區 (港大精英區)",
    tags: ["港大 HKU 門戶", "高才聚居"],
    desc: "充滿英倫人文氣息。翰林峰、寶翠園等高級住宅林立，鄰近中環 CBD，交通極其便利。",
    transport: "地鐵 2-5 分鐘直達港大/中環",
    estates: "翰林峰 · 寶翠園 · 瑧蓺",
    layouts: "開放式/1房 (實用 200-400呎)",
    img: "https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800",
    link: "/properties?uni=hku"
  }
];

// ★ 真實租客好評 (口碑管理)
const TESTIMONIALS = [
  {
    name: "張同學",
    identity: "HKU 碩士生",
    text: "剛到香港人生地不熟，PrimeLiving 的管家非常專業，線上睇樓到簽約不到一天搞定，拎包入住太省心了！",
    rating: 5
  },
  {
    name: "李先生",
    identity: "高才通精英",
    text: "對比了很多中介，這裡的官方直營讓人很放心。報修系統響應很快，住在這裡很有安全感。",
    rating: 5
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      
      {/* 1. Hero Section */}
      <section className="pt-20 md:pt-28 pb-16 px-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-50 via-white to-white relative overflow-hidden">
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-orange-600 text-[11px] font-black mb-6 border border-orange-100 shadow-xl shadow-orange-500/5 uppercase tracking-widest animate-bounce">
            <Sparkles size={16} /> 2026 赴港精英租務首選平台
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-6">
            專為您打造的 <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-400">香港星級理想家</span>
          </h1>
          <p className="text-base text-slate-500 mb-10 max-w-2xl font-medium leading-relaxed">
            佳寓 PrimeLiving 提供官方直營高品質公寓，涵蓋全港名校熱點。水電網全包、專屬管家維修，讓您的赴港生活從第一天起就精緻體面。
          </p>
          <HomeSearch />
        </div>
      </section>

      {/* 2. 信任數據區塊 (提升公司實力感) */}
      <section className="py-8 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
          {TRUST_STATS.map((stat, i) => (
            <div key={i} className="flex items-center justify-center gap-4 text-white">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 區域百科與戶型介紹 (深度資訊) */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">精選生活圈百科</h2>
            <p className="text-slate-500 font-medium">深入調研區域優勢，為您匹配最適合的大學/通勤圈</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {AREA_GUIDES.map((area, idx) => (
              <div key={idx} className="group bg-slate-50 rounded-[2.5rem] overflow-hidden border border-slate-100 flex flex-col transition-all hover:shadow-2xl hover:border-orange-200">
                <div className="h-56 relative overflow-hidden">
                  <img src={area.img} alt={area.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                  <div className="absolute bottom-6 left-6">
                    <div className="flex gap-2 mb-2">
                      {area.tags.map(t => <span key={t} className="bg-orange-500 text-white text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-widest">{t}</span>)}
                    </div>
                    <h3 className="text-xl font-black text-white">{area.name}</h3>
                  </div>
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <p className="text-sm text-slate-600 leading-relaxed mb-6 font-medium">{area.desc}</p>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Train size={16}/></div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">通勤便利</p>
                        <p className="text-xs font-bold text-slate-800">{area.transport}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Building2 size={16}/></div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">熱門屋苑</p>
                        <p className="text-xs font-bold text-slate-800">{area.estates}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Layout size={16}/></div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">主流戶型</p>
                        <p className="text-xs font-bold text-slate-800">{area.layouts}</p>
                      </div>
                    </div>
                  </div>

                  <Link href={area.link} className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-all">
                    探索此區房源 <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. 口碑與好評 (建立信任感) */}
      <section className="py-20 px-4 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-16">
            <div className="text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">聽聽租客怎麼說</h2>
              <p className="text-slate-500 font-medium">已有超過 500 位精英租客在佳寓開啟了他們的香港之旅</p>
            </div>
            <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex text-orange-500"><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/></div>
              <span className="font-black text-slate-800">4.9 / 5.0</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 relative">
                <Quote className="absolute top-8 right-8 text-orange-100" size={64} />
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 font-black text-xl italic border border-orange-200">
                      {t.name[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">{t.name}</h4>
                      <p className="text-xs text-orange-600 font-bold uppercase tracking-widest">{t.identity}</p>
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

      {/* 5. 底部 CTA (導流) */}
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
