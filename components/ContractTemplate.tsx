'use client';

import React, { useRef, useState, useEffect } from 'react';

// ============================================================================
// 1. 標準合約資料與元件屬性定義
// ============================================================================
export interface PaymentScheduleItem {
  date: string;
  description: string;
  amount: number;
}

export interface ContractData {
  tenantName: string;
  tenantPhone: string;
  tenantIdNumber: string;
  propertyAddress: string;
  roomName: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  securityDeposit: number;
  paymentSchedule?: PaymentScheduleItem[];
  tenantSignature?: string;
  signedAt?: string;
}

interface ContractTemplateProps {
  data: ContractData;
  isSigningMode?: boolean;
  onSignComplete?: (signatureBase64: string) => Promise<void>;
  isSigningLoading?: boolean;
  showStamp?: boolean;
  stampUrl?: string;
}

// 香港傳統公司原子章藍墨水濾鏡
const BLUE_STAMP_FILTER = 'invert(24%) sepia(98%) saturate(1834%) hue-rotate(202deg) brightness(94%) contrast(101%)';

export default function ContractTemplate({
  data,
  isSigningMode = false,
  onSignComplete,
  isSigningLoading = false,
  showStamp = true,
  stampUrl = '/stamp.png'
}: ContractTemplateProps) {
  // --- Canvas 觸控簽名板相關狀態 ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!isSigningMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [isSigningMode]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleConfirmSignature = async () => {
    if (!hasSignature || !canvasRef.current || !onSignComplete) return;
    const signatureBase64 = canvasRef.current.toDataURL('image/png');
    await onSignComplete(signatureBase64);
  };

  const isImageSignature = data.tenantSignature?.startsWith('data:image');

  // ★ 核心修復：當未傳入 paymentSchedule 時，自動依照租期與租金運算標準 4 期收費表
  const resolvePaymentSchedule = (): PaymentScheduleItem[] => {
    if (data.paymentSchedule && data.paymentSchedule.length > 0) {
      return data.paymentSchedule;
    }
    const startStr = data.leaseStart || new Date().toISOString().split('T')[0];
    const rent = Number(data.monthlyRent) || 0;
    const dep = Number(data.securityDeposit) || rent * 2;
    
    // 計算第四期 (半年後)
    const midDate = new Date(startStr);
    midDate.setMonth(midDate.getMonth() + 1);
    const midDateStr = isNaN(midDate.getTime()) ? startStr : midDate.toISOString().split('T')[0];

    return [
      { date: startStr, description: '第一期：合約押金 (2個月)', amount: dep },
      { date: startStr, description: '第二期：首半年租金預繳', amount: rent * 6 },
      { date: startStr, description: '第三期：全年水電煤預繳費用', amount: 3000 },
      { date: midDateStr, description: '第四期：尾半年租金預繳', amount: rent * 6 }
    ];
  };

  const scheduleItems = resolvePaymentSchedule();

  return (
    <div className="w-[794px] h-auto min-h-[1123px] bg-white px-[60px] py-[48px] text-slate-900 font-sans relative shadow-lg origin-top mx-auto select-none flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
      
      {/* ======================= 上半部：合約正文與條款 ======================= */}
      <div>
        {/* --- Header：官方雙語抬頭 --- */}
        <div className="flex flex-col items-center border-b-[3px] border-slate-800 pb-4 mb-6">
          <img 
            src="/PrimelivingLetterhead.jpg" 
            alt="Prime Living Letterhead" 
            className="h-16 object-contain mb-2" 
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="text-[11px] font-bold text-slate-600 tracking-wide text-center">
            地址：新界沙田石門新貿中心B座22樓11室 | 電話：3996 9796 | 電郵：info@primelivinghk.com
          </div>
          <h2 className="text-2xl font-black tracking-widest text-slate-900 mt-4">TENANCY AGREEMENT</h2>
          <p className="text-sm font-bold tracking-[0.5em] text-slate-600 mt-0.5">租 賃 合 約 (Licence Agreement)</p>
        </div>

        {/* --- 雙方基本資料 --- */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
          <div className="border border-slate-300 p-3.5 rounded bg-slate-50/50">
            <p className="font-bold text-[10px] text-slate-400 uppercase border-b pb-1 mb-1.5">1. Landlord / Manager (甲方)</p>
            <p className="font-bold text-slate-800">PRIME LIVING PROPERTY(HK) MANAGEMENT LIMITED</p>
            <p className="text-slate-500 mt-1">商業登記碼 : 80097524</p>
          </div>
          <div className="border border-slate-300 p-3.5 rounded bg-slate-50/50">
            <p className="font-bold text-[10px] text-slate-400 uppercase border-b pb-1 mb-1.5">2. Licensee / Tenant (乙方 / 獲許可人)</p>
            <p className="font-bold text-slate-900 text-sm">{data.tenantName || '__________________'}</p>
            <p className="font-mono mt-0.5">Phone: {data.tenantPhone || '未提供'}</p>
            <p className="font-mono mt-0.5">ID / HKID: {data.tenantIdNumber || '未提供'}</p>
          </div>
        </div>

        {/* --- 前言宣告 --- */}
        <div className="mb-5 text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 border-l-4 border-slate-800">
          <span className="font-bold text-slate-900">前言：</span>
          雙方同意甲方將安排乙方入住 <span className="font-bold text-slate-900 underline">{data.propertyAddress}</span> 的單位，並授權乙方使用 <span className="font-bold text-blue-700 underline">{data.roomName}</span> (以下稱「許用房間」)。前提是乙方須遵守大廈公契及與其他人共同使用公寓單位內的公共設備。
        </div>

        {/* --- PREMISES & FINANCIAL TERMS --- */}
        <div className="mb-6">
          <div className="bg-slate-900 text-white px-3 py-1.5 text-xs font-bold uppercase">Premises Details & Financial Terms (物業與財務詳情)</div>
          <table className="w-full text-xs border-collapse border border-slate-300">
            <tbody>
              <tr>
                <td className="border border-slate-300 p-2.5 bg-slate-50 font-bold w-1/4">Property Address (地址)</td>
                <td colSpan={3} className="border border-slate-300 p-2.5 font-bold text-slate-900">{data.propertyAddress}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2.5 bg-slate-50 font-bold">Room No. (房間)</td>
                <td className="border border-slate-300 p-2.5 font-bold text-blue-700">{data.roomName}</td>
                <td className="border border-slate-300 p-2.5 bg-slate-50 font-bold w-1/4">Lease Term (許用期)</td>
                <td className="border border-slate-300 p-2.5 font-mono font-bold">{data.leaseStart} 至 {data.leaseEnd}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2.5 bg-slate-50 font-bold">Monthly Rent (每月租金)</td>
                <td className="border border-slate-300 p-2.5 font-mono font-bold text-sm text-red-600">HK${data.monthlyRent.toLocaleString()}</td>
                <td className="border border-slate-300 p-2.5 bg-slate-50 font-bold">Security Deposit (押金)</td>
                <td className="border border-slate-300 p-2.5 font-mono font-bold text-sm">HK${data.securityDeposit.toLocaleString()} (兩個月)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* =========================================================================
            ★ SCHEDULE OF PAYMENTS (合約收費與期數表) - 確保永久存在
            ========================================================================= */}
        <div className="mb-6">
          <div className="bg-slate-800 text-white px-3 py-1.5 text-xs font-bold uppercase">Schedule of Payments (合約收費與期數表)</div>
          <table className="w-full text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="border border-slate-300 p-2 text-left w-1/4">Date (繳期)</th>
                <th className="border border-slate-300 p-2 text-left">Description (項目與期數)</th>
                <th className="border border-slate-300 p-2 text-right w-1/4">Amount (應繳金額)</th>
              </tr>
            </thead>
            <tbody>
              {scheduleItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="border border-slate-300 p-2 font-mono text-slate-600">{item.date}</td>
                  <td className="border border-slate-300 p-2 font-bold">{item.description}</td>
                  <td className="border border-slate-300 p-2 text-right font-mono font-bold">HK${item.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- 核心法律條款摘要 --- */}
        <div className="mb-8 space-y-1.5 text-[11px] text-slate-700 leading-normal border-t border-b border-slate-200 py-3">
          <p><strong>1. 租費繳納：</strong>乙方須於每月 1 號預繳該月租金。延誤繳費甲方有權立即終止協議並收取法定滯納金。</p>
          <p><strong>2. 押金退還：</strong>合約屆滿或終止並交還鎖匙後十四個工作日內，在扣除任何人為損壞及欠款後，押金將無息退還。</p>
          <p><strong>3. 水電煤收費：</strong>不包含在月租內。水電煤由公寓各床位/房間按照實際帳單均攤承擔。</p>
          <p><strong>4. 公寓常規規則 (附件一承諾)：</strong>乙方必須實名入住，嚴禁擅自轉租、分租或與非授權人士共用房間；嚴禁在公寓內從事非法活動、吸煙、飼養寵物或發出噪音干擾其他室友寧靜權。若有違反，甲方有權立即終止合約並沒收全數押金。</p>
        </div>
      </div>

      {/* ======================= 下半部：簽署區域與手寫面板 ======================= */}
      <div className="mt-auto">
        <div className="grid grid-cols-2 gap-12 pt-8 border-t-2 border-slate-800 text-center relative mt-6">
          
          {/* 左側：業主/管理公司 印章展示 */}
          <div className="relative pt-6">
            {showStamp && stampUrl && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 pointer-events-none z-0">
                <img
                  src={stampUrl}
                  alt="Company Stamp"
                  className="w-full h-full object-contain mix-blend-multiply select-none"
                  style={{ filter: BLUE_STAMP_FILTER }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <p className="font-bold text-xs uppercase relative z-10 text-slate-900">Landlord / Authorized Agent</p>
            <p className="text-[10px] text-slate-500 mt-0.5 relative z-10">甲方授權簽章 / 香港佳寓物業管理</p>
          </div>

          {/* 右側：租客簽名展示區 */}
          <div className="relative pt-6">
            {data.tenantSignature ? (
              isImageSignature ? (
                <img
                  src={data.tenantSignature}
                  alt="Tenant Signature"
                  className="absolute -top-6 left-1/2 -translate-x-1/2 max-h-16 max-w-[180px] object-contain select-none pointer-events-none z-10"
                />
              ) : (
                <div className="absolute -top-4 left-0 w-full text-center pointer-events-none z-10">
                  <span className="text-3xl font-bold text-slate-800" style={{ fontFamily: "'Brush Script MT', cursive" }}>
                    {data.tenantSignature}
                  </span>
                </div>
              )
            ) : (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs italic text-red-400">
                (尚未完成簽署 Unsigned)
              </span>
            )}
            <p className="font-bold text-xs uppercase text-slate-900">Tenant ({data.tenantName})</p>
            <p className="text-[10px] text-slate-500 mt-0.5">乙方 / 租客親筆簽署</p>
            {data.signedAt && <p className="text-[9px] text-slate-400 font-mono mt-1">Signed on: {data.signedAt}</p>}
          </div>
        </div>

        {/* --- HTML5 Touch Canvas 手寫板 --- */}
        {isSigningMode && (
          <div className="mt-8 pt-6 border-t-2 border-dashed border-slate-300 bg-slate-50 p-4 rounded-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                請在下方白框內使用手寫簽名（手機/平板可直接用手簽寫）：
              </span>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-200 px-2.5 py-1 rounded"
                disabled={isSigningLoading}
              >
                重寫 (Clear)
              </button>
            </div>

            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-44 bg-white border-2 border-slate-300 rounded-lg cursor-crosshair touch-none shadow-inner"
            />

            <button
              type="button"
              onClick={handleConfirmSignature}
              disabled={!hasSignature || isSigningLoading}
              className="mt-3 w-full py-3.5 bg-purple-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-purple-700 shadow-md disabled:bg-slate-300 disabled:text-slate-500 transition-all active:scale-95"
            >
              {isSigningLoading ? '正在同步簽名至後台資料庫...' : '確認此筆跡並送出簽署'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
