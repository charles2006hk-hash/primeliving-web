'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Receipt, User, Home, Calendar, CreditCard, MessageCircle, 
  Wallet, CheckCircle2, AlertCircle, Loader2, QrCode, ArrowRight, ShieldCheck
} from 'lucide-react';

export default function TenantInvoicePage() {
  const params = useParams();
  const orderRef = params.orderRef as string;

  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const [payMethod, setPayMethod] = useState<'WECHAT' | 'ALIPAY' | 'CC'>('WECHAT');
  const [payUrl, setPayUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  useEffect(() => {
    if (!orderRef || !db) return;

    const unsub = onSnapshot(doc(db, 'quick_orders', orderRef), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOrderData(data);
        if (data.paymentStatus === 'Paid' || data.status === 'Refunded' || data.status === 'Voided') {
          setPayUrl('');
        }
      } else {
        setNotFound(true);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore 監聽失敗:", error);
      setNotFound(true);
      setLoading(false);
    });

    return () => unsub();
  }, [orderRef]);

  const handleGeneratePayment = async () => {
    if (!orderData) return;
    setIsGenerating(true);
    setGenerateError('');

    try {
      const res = await fetch('/api/paydollar/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef: orderData.orderRef,
          amount: orderData.amount,
          roomName: orderData.roomName,
          payMethod: payMethod
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '無法取得金流授權，請稍後再試');
      }

      const params = new URLSearchParams();
      Object.entries(data.paymentPayload).forEach(([key, value]) => {
        if (key !== 'endpoint' && value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      
      setPayUrl(`${data.paymentPayload.endpoint}?${params.toString()}`);

    } catch (err: any) {
      setGenerateError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    setPayUrl('');
    setGenerateError('');
  }, [payMethod]);

  const formatMoney = (amount: number | string) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-sm w-full border border-slate-100">
          <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
          <h2 className="text-xl font-black text-slate-800 mb-2">查無此帳單</h2>
          <p className="text-sm text-slate-500">此付款連結無效或單據已被刪除，請聯繫您的管家重新確認。</p>
        </div>
      </div>
    );
  }

  const isPaid = orderData.paymentStatus === 'Paid';
  
  const EXPIRY_HOURS = 72;
  const createdAtTime = orderData.createdAt ? new Date(orderData.createdAt).getTime() : 0;
  const isExpired = createdAtTime > 0 && (Date.now() > createdAtTime + EXPIRY_HOURS * 60 * 60 * 1000);

  const isInvalid = orderData.status === 'Refunded' || orderData.status === 'Voided' || isExpired;

  return (
    // ★ 核心變更：使用 fixed inset-0 z-[9999] 完全覆蓋網站原始排版與所有彈窗
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-50/95 backdrop-blur-sm py-8 px-4 sm:px-6 font-sans flex flex-col items-center justify-start sm:justify-center selection:bg-blue-100">
      
      <div className="mb-6 flex flex-col items-center shrink-0">
        <img src="/logo.png" alt="Prime Living" className="h-10 object-contain opacity-90 mb-3 drop-shadow-sm" />
        <h1 className="text-lg font-black text-slate-800 tracking-wide drop-shadow-sm">線上專屬繳費單</h1>
      </div>

      <div className="max-w-md w-full bg-white border border-slate-200/60 rounded-[2rem] shadow-2xl overflow-hidden shrink-0 mb-10">
        
        <div className={`p-6 sm:p-8 text-center relative ${isPaid ? 'bg-emerald-50 border-b border-emerald-100' : isInvalid ? 'bg-slate-100 border-b border-slate-200' : 'bg-blue-600 border-b border-blue-700'}`}>
          <p className={`text-xs font-bold mb-2 uppercase tracking-widest ${isPaid ? 'text-emerald-600' : isInvalid ? 'text-slate-500' : 'text-blue-200'}`}>
            {isPaid ? '已結清 (Paid)' : isExpired ? '已逾期失效 (Expired)' : isInvalid ? '已作廢 (Voided)' : '應付總額 (Total Due)'}
          </p>
          <p className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${isPaid ? 'text-emerald-700' : isInvalid ? 'text-slate-400 line-through' : 'text-white'}`}>
            <span className="text-2xl mr-1 sm:mr-2 opacity-80">HKD</span> 
            {formatMoney(orderData.amount)}
          </p>
          
          {isPaid && (
            <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 border border-emerald-200 shadow-sm">
              <CheckCircle2 size={14} /> 完成付款
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-5 bg-white">
          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-2 font-medium"><Receipt size={16} className="text-slate-400"/> 帳單編號</span>
              <span className="font-mono font-bold text-slate-800">{orderData.orderRef}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-2 font-medium"><User size={16} className="text-slate-400"/> 租客姓名</span>
              <span className="font-bold text-slate-800">{orderData.tenantName}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-2 font-medium"><Home size={16} className="text-slate-400"/> 承租單位</span>
              <span className="font-bold text-slate-800 truncate max-w-[150px] sm:max-w-[200px]" title={orderData.roomInfo}>{orderData.roomInfo}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-2 font-medium"><Calendar size={16} className="text-slate-400"/> 開單日期</span>
              <span className="font-mono font-bold text-slate-800">{orderData.date}</span>
            </div>
            <div className="flex justify-between items-start pt-1">
              <span className="text-slate-500 font-medium shrink-0 mr-4">款項用途</span>
              <span className="font-bold text-slate-800 text-right leading-snug">{orderData.remarks}</span>
            </div>
          </div>
        </div>

        {!isPaid && !isInvalid && (
          <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 space-y-6">
            
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider text-center">選擇付款方式</label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button onClick={() => setPayMethod('WECHAT')} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${payMethod === 'WECHAT' ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' : 'border-transparent bg-white hover:border-slate-200'}`}>
                  <MessageCircle size={24} className={payMethod === 'WECHAT' ? 'text-emerald-500' : 'text-slate-300'} />
                  <span className={`text-[10px] sm:text-xs font-bold ${payMethod === 'WECHAT' ? 'text-emerald-700' : 'text-slate-500'}`}>微信支付</span>
                </button>
                <button onClick={() => setPayMethod('ALIPAY')} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${payMethod === 'ALIPAY' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-transparent bg-white hover:border-slate-200'}`}>
                  <Wallet size={24} className={payMethod === 'ALIPAY' ? 'text-blue-500' : 'text-slate-300'} />
                  <span className={`text-[10px] sm:text-xs font-bold ${payMethod === 'ALIPAY' ? 'text-blue-700' : 'text-slate-500'}`}>支付寶</span>
                </button>
                <button onClick={() => setPayMethod('CC')} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${payMethod === 'CC' ? 'border-amber-500 bg-amber-50/50 shadow-sm' : 'border-transparent bg-white hover:border-slate-200'}`}>
                  <CreditCard size={24} className={payMethod === 'CC' ? 'text-amber-500' : 'text-slate-300'} />
                  <span className={`text-[10px] sm:text-xs font-bold ${payMethod === 'CC' ? 'text-amber-700' : 'text-slate-500'}`}>信用卡</span>
                </button>
              </div>
            </div>

            {payUrl ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center animate-in zoom-in-95 duration-300">
                <div className="bg-white p-3 rounded-2xl mx-auto w-fit shadow-inner border border-slate-100 mb-4">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(payUrl)}`} alt="QR Code" className="w-40 h-40 sm:w-48 sm:h-48" />
                </div>
                
                <a href={payUrl} className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition shadow-lg shadow-blue-600/20 active:scale-95 mb-4">
                  手機直接前往付款 <ArrowRight size={18} />
                </a>

                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  若使用電腦開啟，請用手機掃描上方二維碼。<br/>
                  完成付款後，此頁面將會自動跳轉。
                </p>
              </div>
            ) : (
              <button 
                onClick={handleGeneratePayment}
                disabled={isGenerating}
                className="w-full py-4 sm:py-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-slate-900/20 disabled:opacity-50 active:scale-95 text-sm sm:text-base"
              >
                {isGenerating ? (
                  <><Loader2 size={20} className="animate-spin" /> 正在連接安全金流...</>
                ) : (
                  <><ShieldCheck size={20} /> 取得安全付款連結</>
                )}
              </button>
            )}

            {generateError && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2 border border-red-100">
                <AlertCircle size={16} className="shrink-0" /> {generateError}
              </div>
            )}

          </div>
        )}
      </div>

      <p className="text-center text-[10px] sm:text-xs text-slate-400 mt-2 font-medium px-4 flex items-center justify-center gap-1.5 shrink-0 pb-10">
        <ShieldCheck size={14} className="text-emerald-500" />
        支付全程經由 PCI-DSS 認證的 256-bit 加密環境處理
      </p>
    </div>
  );
}
