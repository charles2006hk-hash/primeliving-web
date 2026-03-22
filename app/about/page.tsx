// app/about/page.tsx

import React from 'react';
import { ShieldCheck, Heart, Users, MapPin, CheckCircle2, Award, Coffee } from 'lucide-react';
import WechatModal from '@/components/WechatModal';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* 1. 品牌視覺 Header */}
      <section className="relative py-24 bg-slate-900 text-center px-4 overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1582213776866-6a50cf2c39ac?auto=format&fit=crop&q=80')] bg-cover bg-center" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tighter">
            不止於租房，更是您的<span className="text-orange-500">香港之家</span>
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto font-medium text-lg leading-relaxed">
            佳寓 PrimeLiving 創立於香港，致力於打破資訊不對稱，為每一位赴港精英提供最高標準的直營公寓服務。
          </p>
        </div>
      </section>

      {/* 2. 品牌數據統計 (增加權威感) */}
      <section className="max-w-6xl mx-auto -mt-10 px-4 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '覆蓋高校', value: '8+', unit: '所' },
            { label: '直營房源', value: '500+', unit: '套' },
            { label: '滿意度', value: '99', unit: '%' },
            { label: '專業團隊', value: '24/7', unit: '服務' },
          ].map((item) => (
            <div key={item.label} className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 text-center">
              <p className="text-3xl font-black text-slate-900 mb-1">{item.value}<span className="text-sm text-orange-500 ml-1">{item.unit}</span></p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 核心優勢 (圖文並茂) */}
      <section className="py-24 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-black text-slate-900 mb-4">為什麼數千名學子選擇佳寓？</h2>
          <div className="w-20 h-1.5 bg-orange-500 mx-auto rounded-full"/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { 
              icon: <ShieldCheck size={32} />, 
              title: "100% 官方直營", 
              desc: "拒絕二房東與黑中介。我們擁有所有物業的直接營運權，確保合同真實合法，受香港法律保障。"
            },
            { 
              icon: <Award size={32} />, 
              title: "標準化高品質", 
              desc: "所有房源統一精裝修，配備品牌傢俬電器。水電網全包，入住即享受，無需處理繁瑣雜務。"
            },
            { 
              icon: <Heart size={32} />, 
              title: "有溫度的管家", 
              desc: "專屬中文客服與維修團隊。從抵港接機諮詢到日常報修，24小時內響應，讓家長更放心。"
            }
          ].map((feature, idx) => (
            <div key={idx} className="group p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 transition-all hover:bg-white hover:shadow-2xl hover:-translate-y-2">
              <div className="text-orange-500 mb-6 bg-white w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-4">{feature.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 品牌願景 (沉浸式卡片) */}
      <section className="pb-24 px-4 max-w-6xl mx-auto">
        <div className="bg-slate-900 rounded-[3rem] p-8 md:p-16 text-white flex flex-col md:flex-row items-center gap-12 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[100px]" />
          <div className="flex-1 space-y-6">
            <h2 className="text-3xl md:text-4xl font-black leading-tight">不僅是您的房東<br/>更是您在香港的守護者</h2>
            <p className="text-slate-400 leading-relaxed font-medium">
              在佳寓，我們不僅提供一張床位。我們舉辦節日聚會、分享求職資訊、提供抵港生活指南。我們希望每一位選擇佳寓的青年，都能在這座城市找到屬於自己的歸屬感。
            </p>
            <div className="pt-4">
              <WechatModal />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4">
             <img src="https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80" className="rounded-2xl aspect-square object-cover rotate-3" alt="Meeting"/>
             <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80" className="rounded-2xl aspect-square object-cover -rotate-3 translate-y-8" alt="Students"/>
          </div>
        </div>
      </section>
    </div>
  );
}