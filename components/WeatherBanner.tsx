'use client';

import React, { useState, useEffect } from 'react';
import { CloudSun, ThermometerSun, Umbrella, Wind, Sparkles } from 'lucide-react';

export default function WeatherBanner() {
  const [greeting, setGreeting] = useState('你好');
  const [timeStr, setTimeStr] = useState('');

  // 根據使用者本地時間動態變換打招呼用語
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hour = now.getHours();
      
      if (hour >= 5 && hour < 12) {
        setGreeting('早上好');
      } else if (hour >= 12 && hour < 18) {
        setGreeting('下午好');
      } else {
        setGreeting('晚上好');
      }

      // 格式化日期 (例如：7月7日 星期二)
      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'long' };
      setTimeStr(now.toLocaleDateString('zh-HK', options));
    };

    updateTime();
    // 設定每分鐘更新一次時間防呆
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 -mt-8 relative z-20 mb-8">
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-white flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
        
        {/* 背景裝飾光暈 */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-400/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-400/10 blur-[60px] rounded-full pointer-events-none" />

        {/* 左側：打招呼與時間 */}
        <div className="flex items-start gap-4 relative z-10 w-full md:w-auto">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-200 rounded-2xl flex items-center justify-center text-orange-600 shrink-0 shadow-inner">
            <CloudSun size={28} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              {greeting}，佳寓的夥伴們！ <Sparkles size={18} className="text-orange-400 animate-pulse"/>
            </h2>
            <p className="text-sm font-bold text-slate-500 mt-1">{timeStr} · 香港</p>
          </div>
        </div>

        {/* 右側：天氣資訊與貼心提醒 */}
        <div className="flex-1 bg-slate-50/80 border border-slate-100 rounded-2xl p-4 relative z-10 w-full">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2 border-b border-slate-200/60 pb-3">
            <div className="flex items-center gap-1.5 text-slate-700 font-black">
              <ThermometerSun size={18} className="text-red-500"/>
              <span>目前氣溫 30°C</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-sm">
              <Wind size={16} className="text-cyan-600"/>
              <span>濕度 78%</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-sm">
              <Umbrella size={16} className="text-blue-500"/>
              <span>降雨機率 40%</span>
            </div>
          </div>
          <p className="text-xs md:text-sm text-slate-600 font-medium leading-relaxed">
            <strong className="text-orange-600">小提醒：</strong> 今日天氣炎熱，局部地區可能有驟雨。出門看房或通勤請記得攜帶雨具，並隨時補充水分。未來幾天將持續高溫，請注意防曬喔！
          </p>
        </div>

      </div>
    </div>
  );
}
