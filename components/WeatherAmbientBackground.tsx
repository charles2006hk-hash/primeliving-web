'use client';

import React, { useEffect, useState } from 'react';

export default function WeatherAmbientBackground() {
  const [weatherType, setWeatherType] = useState<'hot' | 'cool' | 'rain' | 'default'>('default');

  useEffect(() => {
    // 這裡放入獲取天氣的邏輯 (此處為模擬邏輯)
    // 實際可串接香港天文台 API 或 OpenWeather
    const fetchWeather = async () => {
      try {
        // 模擬即時數據
        const temp = 31; 
        const condition = 'Sunny';

        if (condition.includes('Rain') || condition.includes('Cloud')) {
          setWeatherType('rain');
        } else if (temp >= 28) {
          setWeatherType('hot');
        } else if (temp <= 20) {
          setWeatherType('cool');
        } else {
          setWeatherType('default');
        }
      } catch (e) {
        setWeatherType('default');
      }
    };
    
    fetchWeather();
  }, []);

  // 根據不同天氣設定光暈的 Tailwind 顏色組合
  const glowStyles = {
    hot: {
      topRight: 'bg-orange-500/10',
      bottomLeft: 'bg-amber-400/10'
    },
    cool: {
      topRight: 'bg-cyan-500/10',
      bottomLeft: 'bg-blue-400/10'
    },
    rain: {
      topRight: 'bg-indigo-500/10',
      bottomLeft: 'bg-slate-500/10'
    },
    default: {
      topRight: 'bg-orange-500/5',
      bottomLeft: 'bg-blue-500/5'
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none transition-colors duration-1000 z-0">
      {/* 右上角主光暈 */}
      <div 
        className={`absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] ${glowStyles[weatherType].topRight} blur-[120px] rounded-full transition-all duration-3000 ease-in-out`} 
      />
      {/* 左下角輔助光暈 */}
      <div 
        className={`absolute bottom-[-10%] left-[-10%] w-[30rem] h-[30rem] ${glowStyles[weatherType].bottomLeft} blur-[100px] rounded-full transition-all duration-3000 ease-in-out`} 
      />
    </div>
  );
}
