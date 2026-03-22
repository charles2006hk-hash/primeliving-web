'use client'; // ★ 告訴 Next.js 這是客戶端組件，可以使用 onClick

import React from 'react';
import { MapPin, Home, Search, ChevronDown } from 'lucide-react';

export default function HomeSearch() {
  const handleSearch = () => {
    const uni = (document.getElementById('uni-select') as HTMLSelectElement).value;
    const type = (document.getElementById('type-select') as HTMLSelectElement).value;
    window.location.href = `/properties?uni=${uni}&type=${type}`;
  };

  return (
    <div className="w-full max-w-3xl bg-white p-1.5 rounded-full shadow-lg border border-slate-100 flex items-center gap-1 ring-2 ring-slate-50">
      <div className="flex-1 flex items-center pl-4 py-2 bg-slate-50/50 rounded-full border border-slate-100 cursor-pointer">
        <MapPin size={16} className="text-orange-400 mr-2" />
        <select 
          id="uni-select"
          className="flex-1 bg-transparent text-slate-800 outline-none text-xs font-bold appearance-none cursor-pointer"
        >
          <option value="">選擇大學 / 區域</option>
          <option value="hku">港大 (HKU)</option>
          <option value="polyu">理大 (PolyU)</option>
          <option value="cityu">城大 (CityU)</option>
          <option value="cbd">中環區</option>
        </select>
        <ChevronDown size={14} className="text-slate-400 mr-3" />
      </div>
      
      <div className="hidden md:flex flex-1 items-center pl-4 py-2 bg-slate-50/50 rounded-full border border-slate-100 cursor-pointer">
        <Home size={16} className="text-slate-400 mr-2" />
        <select 
          id="type-select"
          className="flex-1 bg-transparent text-slate-800 outline-none text-xs font-bold appearance-none cursor-pointer"
        >
          <option value="">選擇房型</option>
          <option value="single">單人私密房間</option>
          <option value="ensuite">獨立套廁房</option>
        </select>
        <ChevronDown size={14} className="text-slate-400 mr-3" />
      </div>

      <button 
        onClick={handleSearch}
        className="bg-orange-500 hover:bg-orange-600 text-white w-10 h-10 rounded-full font-bold flex items-center justify-center transition-all shadow-md shrink-0 active:scale-90"
      >
        <Search size={18} />
      </button>
    </div>
  );
}