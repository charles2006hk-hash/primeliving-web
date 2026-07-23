'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, ExternalLink, Loader2, Settings } from 'lucide-react';

const PARTNER_URL = 'http://www.hkgwzj.cn/'; // ★ 強制降級使用 HTTP 進行探測與跳轉

export default function PartnerMaintenancePage() {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState({ hours: 48, minutes: 0, seconds: 0 });
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // 1. 處理 48 小時倒數計時邏輯 (利用 localStorage 鎖定初次訪問時間)
    let targetTime = localStorage.getItem('partner_maintenance_target');
    if (!targetTime) {
      // 若無紀錄，設定為 48 小時後
      const newTarget = new Date().getTime() + 48 * 60 * 60 * 1000;
      targetTime = newTarget.toString();
      localStorage.setItem('partner_maintenance_target', targetTime);
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = parseInt(targetTime!) - now;

      if (distance < 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        hours: Math.floor((distance % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60)), // 允許超過24小時的顯示
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    // 2. 每小時自動探測對方伺服器狀態 (3600000 毫秒)
    const checkPartnerStatus = async () => {
      try {
        // 使用 no-cors 發送 HTTP 請求。若對方伺服器完全掛掉或 DNS 錯誤，會進入 catch
        // 若只是憑證錯誤，HTTP 請求"有可能"成功不報錯
        await fetch(PARTNER_URL, { mode: 'no-cors', cache: 'no-store' });
        // 若沒有拋出異常，嘗試自動跳轉
        window.location.href = PARTNER_URL;
      } catch (error) {
        console.log("Partner site is still unreachable or enforcing strict SSL.");
      }
    };

    const pingInterval = setInterval(checkPartnerStatus, 3600000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(pingInterval);
    };
  }, []);

  // 手動觸發測試
  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await fetch(PARTNER_URL, { mode: 'no-cors', cache: 'no-store' });
      // 延遲一點點讓用戶看到 Loading 動畫
      setTimeout(() => {
        window.location.href = PARTNER_URL;
      }, 1000);
    } catch (error) {
      setTimeout(() => {
        setIsChecking(false);
        alert("對方伺服器目前仍無法建立安全連線，請稍後再試。");
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      
      {/* 頂部導航 */}
      <div className="absolute top-0 left-0 w-full p-6">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors w-max">
          <ArrowLeft size={20} />
          返回佳寓首頁
        </Link>
      </div>

      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden text-center p-8 md:p-12 relative">
        {/* 頂部裝飾條 */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500"></div>

        {/* 圖示 */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse"></div>
          <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center shadow-sm">
            <Settings className="text-blue-600 animate-[spin_4s_linear_infinite]" size={40} />
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-4">
          HK港灣之家 系統升級維護中
        </h1>
        
        <p className="text-slate-600 font-medium mb-8 leading-relaxed max-w-lg mx-auto">
          我們的聯營機構 <strong>金港灣集團 (HK港灣之家)</strong> 目前正進行伺服器與安全憑證的例行升級。為保障您的瀏覽體驗與資訊安全，我們暫時停止直接跳轉。
        </p>

        {/* 倒數計時區塊 */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-8 inline-block w-full max-w-md">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">預計恢復倒數計時</p>
          <div className="flex justify-center gap-4 text-slate-800">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black font-mono bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 w-20">
                {String(timeLeft.hours).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-bold text-slate-500 mt-2 uppercase">Hours</span>
            </div>
            <span className="text-3xl font-black text-slate-300 mt-2">:</span>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black font-mono bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 w-20">
                {String(timeLeft.minutes).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-bold text-slate-500 mt-2 uppercase">Mins</span>
            </div>
            <span className="text-3xl font-black text-slate-300 mt-2">:</span>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black font-mono bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 w-20 text-blue-600">
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-bold text-slate-500 mt-2 uppercase">Secs</span>
            </div>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button 
            onClick={handleManualCheck}
            disabled={isChecking}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            {isChecking ? <Loader2 className="animate-spin" size={20} /> : <ExternalLink size={20} />}
            {isChecking ? '測試連線中...' : '嘗試手動連結'}
          </button>
          
          <a 
            href="http://www.hkgwzj.cn/" 
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200 font-bold py-3 px-8 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            title="無視警告強制訪問 (不建議)"
          >
            <ShieldAlert size={20} />
            強制略過 (HTTP模式)
          </a>
        </div>
        
        <p className="text-[10px] text-slate-400 mt-6 flex items-center justify-center gap-1">
          系統每 60 分鐘會自動探測一次，若對方恢復將自動引導您前往。
        </p>
      </div>
    </div>
  );
}
