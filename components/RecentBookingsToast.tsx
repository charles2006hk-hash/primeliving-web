'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, MapPin, X } from 'lucide-react';

// 模擬真實的近期入住數據
const RECENT_BOOKINGS = [
  { name: '陳同學', area: '大圍 名城', identity: '香港中文大學', time: '剛剛' },
  { name: '李同學', area: '紅磡 海濱南岸', identity: '香港理工大學', time: '10分鐘前' },
  { name: '王同學', area: '大圍 柏傲莊', identity: '香港城市大學', time: '半小時前' },
  { name: '張同學', area: '將軍澳 康城', identity: '香港科技大學', time: '1小時前' },
  { name: '劉先生', area: '沙田市中心', identity: '香港科學園', time: '剛剛' },
];

export default function RecentBookingsToast() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (isDismissed) return;

    let showTimer: NodeJS.Timeout;
    let hideTimer: NodeJS.Timeout;

    const triggerToast = () => {
      // 隨機挑選下一筆資料 (確保不會連續抽到同一筆)
      setCurrentIndex((prev) => {
        let nextIdx = Math.floor(Math.random() * RECENT_BOOKINGS.length);
        if (nextIdx === prev) nextIdx = (nextIdx + 1) % RECENT_BOOKINGS.length;
        return nextIdx;
      });

      setIsVisible(true);

      // 顯示 6 秒後隱藏
      hideTimer = setTimeout(() => {
        setIsVisible(false);

        // 隱藏後，隨機等待 15 ~ 40 秒再次觸發 (模擬真實隨機頻率)
        const nextDelay = Math.floor(Math.random() * 25000) + 15000;
        showTimer = setTimeout(triggerToast, nextDelay);
      }, 6000);
    };

    // 頁面載入後，隨機等待 8 ~ 15 秒才出現第一個
    const initialDelay = Math.floor(Math.random() * 7000) + 8000;
    showTimer = setTimeout(triggerToast, initialDelay);

    // 清理計時器，避免記憶體洩漏
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isDismissed]);

  if (isDismissed) return null;

  const currentBooking = RECENT_BOOKINGS[currentIndex];

  return (
    <div 
      className={`fixed bottom-6 left-6 z-[100] transition-all duration-1000 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-white/90 backdrop-blur-xl border border-white/50 p-4 rounded-2xl shadow-2xl shadow-orange-500/10 flex items-start gap-4 max-w-sm relative group pr-10">
        
        {/* 關閉按鈕：點擊後徹底不再顯示 */}
        <button 
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="關閉通知"
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
