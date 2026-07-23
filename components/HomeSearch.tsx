'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Home, Search, ChevronDown, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';

// 定義香港大專院校與熱門租房區域的映射 (Deep Research 數據)
const UNI_AREAS = [
  { value: "cuhk_shatin", label: "中大 CUHK (沙田 / 大圍 / 火炭)" },
  { value: "eduhk_taipo", label: "教大 EdUHK (大埔 / 太和)" },
  { value: "polyu_hunghom", label: "理大 PolyU (紅磡 / 黃埔 / 何文田)" },
  { value: "cityu_hkbu", label: "城大 CityU / 浸大 HKBU (九龍塘 / 石硤尾)" },
  { value: "hku_west", label: "港大 HKU (西營盤 / 堅尼地城 / 薄扶林)" },
  { value: "hkust_tko", label: "科大 HKUST (將軍澳 / 坑口 / 寶琳)" },
  { value: "hkmu_mk", label: "都大 HKMU (何文田 / 旺角)" },
  { value: "lingnan_tm", label: "嶺大 Lingnan (屯門 / 兆康)" },
  { value: "cbd_central", label: "港島商業區 (中環 / 灣仔 / 銅鑼灣)" }
];

export default function HomeSearch() {
  const router = useRouter();
  
  // 狀態管理
  const [uni, setUni] = useState('');
  const [roomType, setRoomType] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<'idle' | 'full' | 'success'>('idle');

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uni) {
      alert('請先選擇您就讀的大學或想租住的區域！');
      return;
    }

    setIsSearching(true);
    setSearchResult('idle');

    // 模擬 1.5 秒資料庫檢索延遲
    setTimeout(() => {
      setIsSearching(false);
      
      // 邏輯判斷：假設目前只有 中大(沙田)、教大(大埔)、理大(紅磡) 有空房
      // 實際生產環境中，這裡應替換為 Firebase 的庫存查詢結果
      const isAvailable = uni.includes('shatin') || uni.includes('taipo') || uni.includes('hunghom');
      
      if (isAvailable) {
        // 如果有房，直接帶參數跳轉到列表頁
        router.push(`/properties?search=${encodeURIComponent(uni.split('_')[1] || uni)}&type=${roomType}`);
      } else {
        // 觸發「已租滿」並顯示候補轉化表單
        setSearchResult('full');
      }
    }, 1500);
  };

  const handleSubmitLead = (e: React.FormEvent) => {
    e.preventDefault();
    alert('✅ 需求已成功發送給管家團隊！若有房源釋出將第一時間通知您。');
    setSearchResult('idle');
    setUni('');
    setRoomType('');
  };

  return (
    <div className="w-full flex flex-col items-center">
      
      {/* 搜尋框主體 (保留您原本的 UI 設計) */}
      <div className="w-full max-w-3xl bg-white p-1.5 rounded-full shadow-lg border border-slate-100 flex items-center gap-1 ring-4 ring-white/40 mb-8 z-20 relative">
        <div className="flex-1 flex items-center pl-4 py-2.5 bg-slate-50/80 rounded-full border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
          <MapPin size={18} className="text-orange-500 mr-2 shrink-0" />
          <select 
            value={uni}
            onChange={(e) => setUni(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none text-sm font-bold appearance-none cursor-pointer w-full truncate"
          >
            <option value="">選擇大學 / 區域</option>
            {UNI_AREAS.map(area => (
              <option key={area.value} value={area.value}>{area.label}</option>
            ))}
          </select>
          <ChevronDown size={16} className="text-slate-400 mr-3 shrink-0" />
        </div>
        
        <div className="hidden md:flex flex-1 items-center pl-4 py-2.5 bg-slate-50/80 rounded-full border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
          <Home size={18} className="text-slate-400 mr-2 shrink-0" />
          <select 
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 outline-none text-sm font-bold appearance-none cursor-pointer w-full"
          >
            <option value="">選擇房型 (不限)</option>
            <option value="single">單人私密房間</option>
            <option value="ensuite">獨立套廁房</option>
          </select>
          <ChevronDown size={16} className="text-slate-400 mr-3 shrink-0" />
        </div>

        <button 
          onClick={() => handleSearch()}
          disabled={isSearching}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white px-6 py-2.5 rounded-full font-black flex items-center justify-center transition-all shadow-md shrink-0 active:scale-95 gap-2"
        >
          {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
          <span className="hidden sm:inline">搜尋</span>
        </button>
      </div>

      {/* 搜尋過渡狀態 */}
      {isSearching && (
        <div className="text-center py-6 animate-in fade-in">
          <div className="inline-flex items-center gap-3 bg-white/80 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-white">
            <Loader2 className="animate-spin text-orange-500" size={24} />
            <p className="text-slate-700 font-bold">系統正在為您匹配最新的直營房源庫存...</p>
          </div>
        </div>
      )}

      {/* 滿租轉化表單與推薦 (Lead Generation) */}
      {searchResult === 'full' && !isSearching && (
        <div className="animate-in slide-in-from-top-4 duration-500 w-full max-w-4xl mx-auto z-10 relative">
          <div className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-rose-400"></div>
            
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-amber-500" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">
              抱歉，該區域的優質單位目前已全數租滿！
            </h3>
            <p className="text-slate-600 mb-8 font-medium max-w-2xl mx-auto">
              佳寓的高性價比房源通常會被迅速預訂。請留下您的需求，若有租客提前退租或新盤上架，專屬管家會為您優先保留。
            </p>
            
            {/* 需求收集表單 */}
            <form onSubmit={handleSubmitLead} className="max-w-2xl mx-auto bg-slate-50/80 p-6 rounded-2xl shadow-inner border border-slate-200 text-left grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">您的稱呼 *</label>
                <input required type="text" className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white shadow-sm" placeholder="例如: 陳同學"/>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">聯絡電話 / WeChat *</label>
                <input required type="text" className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white shadow-sm" placeholder="輸入電話或微信號"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">預期入住時間與預算</label>
                <input type="text" className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white shadow-sm" placeholder="例如: 8月中入住，預算 $6000 左右"/>
              </div>
              <div className="col-span-2 mt-4">
                <button type="submit" className="w-full bg-slate-900 text-white font-black text-lg py-3.5 rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
                  送出候補優先登記
                </button>
              </div>
            </form>
          </div>

          {/* 推薦其他熱門區域 */}
          <div className="text-left mt-8 bg-white/40 p-6 rounded-3xl border border-white/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-black text-slate-900 drop-shadow-sm">為您推薦其他熱門區域</h4>
              <Link href="/properties" className="text-sm font-bold text-orange-600 flex items-center hover:underline">
                查看全部房源 <ArrowRight size={16} className="ml-1"/>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { name: '大埔中心 (近教大)', status: '尚有少量空房', search: 'taipo' },
                { name: '沙田市中心 (近中大)', status: '熱門房源', search: 'shatin' },
                { name: '紅磡 (近理大/城大)', status: '即將滿租', search: 'hunghom' }
              ].map((rec, idx) => (
                <Link href={`/properties?search=${rec.search}`} key={idx} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-200 cursor-pointer group flex flex-col">
                  <div className="h-28 bg-slate-100 flex items-center justify-center relative overflow-hidden shrink-0">
                    <Home size={32} className="text-slate-300 group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-orange-500/0 group-hover:bg-orange-500/5 transition-colors"></div>
                  </div>
                  <div className="p-4">
                    <h5 className="font-bold text-slate-800 text-sm truncate">{rec.name}</h5>
                    <p className="text-xs text-emerald-600 mt-1.5 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {rec.status}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
