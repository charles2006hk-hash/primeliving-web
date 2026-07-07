'use client';

import React, { useState, useEffect } from 'react';
import { CloudSun, ThermometerSun, AlertTriangle, Wind, Sparkles, Loader2 } from 'lucide-react';

export default function WeatherBanner() {
  const [greeting, setGreeting] = useState('你好');
  const [timeStr, setTimeStr] = useState('');
  
  // 天氣資料狀態
  const [temp, setTemp] = useState<number | string>('--');
  const [humidity, setHumidity] = useState<number | string>('--');
  const [forecast, setForecast] = useState<string>('正在與香港天文台連線中...');
  const [warningMsg, setWarningMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. 處理打招呼與時間
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

      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'long' };
      setTimeStr(now.toLocaleDateString('zh-HK', options));
    };

    updateTime();
    const timeTimer = setInterval(updateTime, 60000);

    // 2. 抓取香港天文台即時 API
    const fetchHKOWeather = async () => {
      try {
        // A. 抓取即時溫濕度與警告 (rhrread)
        const currentRes = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc');
        const currentData = await currentRes.json();
        
        // 取得「香港天文台」觀測站的溫度 (若無則取陣列第一個)
        const obsTemp = currentData.temperature.data.find((d: any) => d.place === '香港天文台')?.value || currentData.temperature.data[0]?.value;
        setTemp(obsTemp);
        
        // 取得濕度
        const obsHum = currentData.humidity.data[0]?.value;
        setHumidity(obsHum);

        // 取得即時天氣警告 (如果有)
        if (currentData.warningMessage && currentData.warningMessage.length > 0) {
          setWarningMsg(currentData.warningMessage.join(' '));
        } else {
          setWarningMsg('');
        }

        // B. 抓取天氣預報當作貼心小提醒 (flw)
        const forecastRes = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=tc');
        const forecastData = await forecastRes.json();
        
        // 組合今日預報與未來幾天展望
        setForecast(`${forecastData.forecastDesc} ${forecastData.outlook}`);
        setIsLoading(false);

      } catch (error) {
        console.error('HKO API 載入失敗:', error);
        setForecast('目前暫時無法取得天文台天氣資訊，請稍後再試。');
        setIsLoading(false);
      }
    };

    fetchHKOWeather();
    // 設定每 15 分鐘自動更新一次天氣，避免過度消耗 API
    const weatherTimer = setInterval(fetchHKOWeather, 15 * 60 * 1000);

    return () => {
      clearInterval(timeTimer);
      clearInterval(weatherTimer);
    };
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

        {/* 右側：天文台天氣資訊與貼心提醒 */}
        <div className="flex-1 bg-slate-50/80 border border-slate-100 rounded-2xl p-4 relative z-10 w-full">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2 border-b border-slate-200/60 pb-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm font-bold">
                <Loader2 size={16} className="animate-spin" />
                正在同步天文台數據...
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-slate-700 font-black">
                  <ThermometerSun size={18} className="text-red-500"/>
                  <span>即時氣溫 {temp}°C</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-sm">
                  <Wind size={16} className="text-cyan-600"/>
                  <span>濕度 {humidity}%</span>
                </div>
                {/* 如果有天氣警告，以紅色突顯顯示 */}
                {warningMsg && (
                  <div className="flex items-center gap-1.5 text-red-600 font-black text-sm bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                    <AlertTriangle size={14} />
                    <span>{warningMsg.split('。')[0]}</span> 
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-xs md:text-sm text-slate-600 font-medium leading-relaxed">
            <strong className="text-orange-600">佳寓天氣報：</strong> {forecast}
          </p>
        </div>

      </div>
    </div>
  );
}
