'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, MapPin, X } from 'lucide-react';

// 模擬真實的近期入住數據 (後續可串接 Firebase)
const RECENT_BOOKINGS = [
  { name: '陳同學', area: '大圍 名城', identity: '香港中文大學', time: '剛剛' },
  { name: '李同學', area: '紅磡 海濱南岸', identity: '香港理工大學', time: '10分鐘前' },
  { name: '王同學', area: '大圍 柏傲莊', identity: '香港城市大學', time: '半小時前' },
  { name: '張同學', area: '將軍澳 康城', identity: '香港科技大學', time: '1小時前' },
];

export default function RecentBookingsToast() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (isDismissed) return;

    // 初次載入延遲 3 秒後彈出第一個
    const initialTimer = setTimeout(() => setIsVisible(true), 3000);

    // 設定輪播循環：每 10 秒換下一個 (顯示 5 秒，隱藏 5 秒)
    const cycleInterval = setInterval(() => {
      setIsVisible(false); // 先隱藏
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % RECENT_BOOKINGS.length);
        setIsVisible(true); // 換人後再顯示
      }, 1000); // 等待淡出動畫完成

      // 顯示 5 秒後自動隱藏
      setTimeout(() => {
        setIsVisible(false);
      }, 6000); 

    }, 10000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(cycleInterval);
    };
  }, [isDismissed]);

  if (isDismissed) return null;

  const currentBooking = RECENT_BOOKINGS[currentIndex];

  return (
    <div 
      className={`fixed bottom-6 left-6 z-[100] transition-all duration-700 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-white/90 backdrop-blur-xl border border-white/50 p-4 rounded-2xl shadow-2xl shadow-orange-500/10 flex items-start gap-4 max-w-sm relative group pr-10">
        
        {/* 關閉按鈕 */}
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>

        {/* 左側圖示 */}
        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full flex items-center justify-center shrink-0 shadow-inner">
          <Sparkles size={18} className="text-white" />
        </div>

        {/* 文字內容 */}
        <div>
          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1 flex items-center gap-1">
            <CheckCircle2 size={12} /> 最新入住成功
          </p>
          <p className="text-sm font-bold text-slate-800 leading-snug">
            歡迎 <span className="text-orange-600">{currentBooking.name}</span> 入住 <br/>
            <span className="flex items-center gap-1 mt-1 text-slate-600 font-medium">
              <MapPin size={14} className="text-purple-500"/> {currentBooking.area}
            </span>
          </p>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">
            {currentBooking.time} · 來自 {currentBooking.identity}
          </p>
        </div>
      </div>
    </div>
  );
}
