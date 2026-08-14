// app/sales-pay/page.tsx
'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { 
  CreditCard, User, DollarSign, CheckCircle2, AlertCircle,
  Loader2, Home, Lock, Building2, Calculator, QrCode, Copy, Check,
  Download, Share, MessageCircle, Wallet, IdCard, Link as LinkIcon
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Room {
  id: string;
  propertyId: string;
  name: string;
  status: 'Vacant' | 'Occupied' | 'Maintenance';
  baseRent?: number;
}

interface Property {
  id: string;
  name: string;
  status?: string;
}

const generateUniqueOrderRef = (baseId: string) => {
  const timestamp = new Date().getTime().toString().slice(-6);
  return `${baseId}-R${timestamp}`;
};

function SalesQuickPayContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const [isSuccess, setIsSuccess] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [successOrderRef, setSuccessOrderRef] = useState('');
  const [paidDetail, setPaidDetail] = useState('核實支付渠道中...');
  
  // ★ 改為存儲動態繳費單網址
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [pendingOrderRef, setPendingOrderRef] = useState('');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [crmStaffList, setCrmStaffList] = useState<string[]>(['公司行政 (Office)']);
  const [savedStaffList, setSavedStaffList] = useState<string[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // ★ 表單狀態：已移除 payMethod，交給租客自己選擇
  const [formData, setFormData] = useState({
    passcode: '',
    propertyId: '',
    roomId: '',
    roomName: '',
    region: '',
    tenantName: '',
    idNumber: '', 
    amount: '', 
    remarks: '首期租金 / 預約訂金',
    salesPerson: ''
  });

  const pricingSummary = useMemo(() => {
    const rawVal = parseFloat(formData.amount) || 0;
    const subtotalCents = Math.round(rawVal * 100);
    const surchargeCents = Math.round(subtotalCents * 0.03); 
    const totalCents = subtotalCents + surchargeCents;

    return {
      subtotal: (subtotalCents / 100).toFixed(2),
      surcharge: (surchargeCents / 100).toFixed(2),
      total: (totalCents / 100).toFixed(2)
    };
  }, [formData.amount]);

  useEffect(() => {
    const savedPin = localStorage.getItem('SALES_PAY_TOKEN');
    let defaultStaff = '';
    
    const localStaff = localStorage.getItem('SALES_STAFF_HISTORY');
    if (localStaff) {
      try { 
        const parsedList = JSON.parse(localStaff);
        setSavedStaffList(parsedList); 
        if (parsedList.length > 0) defaultStaff = parsedList[0];
      } catch (e) {}
    }

    setFormData(prev => ({ 
      ...prev, 
      passcode: savedPin || '',
      salesPerson: defaultStaff 
    }));
    
    if (savedPin) setIsAuthorized(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchFormData = async () => {
      try {
        const res = await fetch('/api/sales/form-data');
        const json = await res.json();
        if (json.success && isMounted) {
          setCrmStaffList(json.data.staffList || ['公司行政 (Office)']);
          setProperties(json.data.properties || []);
          setRooms(json.data.rooms || []);
          setFormData(prev => ({ 
            ...prev, 
            salesPerson: prev.salesPerson || (json.data.staffList?.[0] || '公司行政 (Office)') 
          }));
        }
      } catch (err) {
        console.error('[初始化失敗] 盤源 Proxy 錯誤:', err);
      } finally {
        if (isMounted) setDbLoading(false);
      }
    };

    fetchFormData();
    return () => { isMounted = false; };
  }, []);

  const combinedStaffList = useMemo(() => {
    return Array.from(new Set([...savedStaffList, ...crmStaffList]));
  }, [crmStaffList, savedStaffList]);

  const filteredSortedRooms = useMemo(() => {
    if (!formData.propertyId) return [];
    return rooms
      .filter(r => r.propertyId === formData.propertyId)
      .sort((a, b) => {
        const getWeight = (status: string) => {
          if (status === 'Vacant') return 0;
          if (status === 'Maintenance') return 1;
          return 2;
        };
        const weightDiff = getWeight(a.status) - getWeight(b.status);
        if (weightDiff !== 0) return weightDiff;
        return a.name.localeCompare(b.name);
      });
  }, [rooms, formData.propertyId]);

  const handlePropertyChange = (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    setFormData(prev => ({
      ...prev,
      propertyId: propId,
      region: prop ? prop.name : '',
      roomId: '',
      roomName: ''
    }));
  };

  const handleRoomChange = (roomId: string) => {
    const selectedRoom = rooms.find(r => r.id === roomId);
    if (selectedRoom) {
      setFormData(prev => ({
        ...prev,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        amount: prev.amount || (selectedRoom.baseRent ? String(selectedRoom.baseRent) : '')
      }));
    } else {
      setFormData(prev => ({ ...prev, roomId: '', roomName: '' }));
    }
  };

  // 監聽單據實時付款狀態
  useEffect(() => {
    if (!pendingOrderRef || !db) return;

    const unsub = onSnapshot(doc(db, 'quick_orders', pendingOrderRef), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.paymentStatus === 'Paid') {
          setIsSuccess(true);
          setSuccessOrderRef(pendingOrderRef);
          setPaidDetail(data.paymentMethodDetail || '線上支付');
          setInvoiceUrl(''); 
        } else if (data.status === 'Refunded' || data.status === 'Voided') {
          setIsFailed(true);
          setSuccessOrderRef(pendingOrderRef);
          setInvoiceUrl('');
        }
      }
    });

    return () => unsub(); 
  }, [pendingOrderRef]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return setAuthError('請輸入授權通行密碼');
    const cleanPin = pinInput.trim();
    setFormData(prev => ({ ...prev, passcode: cleanPin }));
    localStorage.setItem('SALES_PAY_TOKEN', cleanPin);
    setIsAuthorized(true);
    setAuthError('');
  };

  const handleLockOut = () => {
    localStorage.removeItem('SALES_PAY_TOKEN');
    setFormData(prev => ({ ...prev, passcode: '' }));
    setIsAuthorized(false);
    setPinInput('');
  };

  const saveStaffHistory = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const nextList = Array.from(new Set([cleanName, ...savedStaffList])).slice(0, 10);
    setSavedStaffList(nextList);
    localStorage.setItem('SALES_STAFF_HISTORY', JSON.stringify(nextList));
  };

  const createPaymentRequest = async () => {
    setLoading(true);
    try {
      const safeRoomId = formData.roomId.substring(0, 10); 
      const baseOrderRef = `SQP-${safeRoomId}`;
      const uniqueOrderRef = generateUniqueOrderRef(baseOrderRef);

      const requestData = {
        ...formData,
        payMethod: 'WECHAT', // 傳遞預設值以通過舊版 API 驗證，實際由租客頁面決定
        orderRef: uniqueOrderRef 
      };

      const response = await fetch('/api/paydollar/quick-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (response.status === 401) {
        handleLockOut();
        throw new Error(data.error || '授權已過期，請輸入最新的公司銷售授權碼');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || '無法連接金流系統');
      }

      const { orderRef } = data;
      
      // ★ 直接產生指向我們新開發的專屬繳費單頁面連結
      const generatedInvoiceUrl = `${window.location.origin}/pay/${orderRef}`;
      
      setInvoiceUrl(generatedInvoiceUrl);
      setPendingOrderRef(orderRef);

    } catch (error: any) {
      alert(`⚠️ 建立收款單失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenantName || !formData.amount || !formData.roomId) {
      return alert('請完整填寫客戶姓名、選擇單位及正確金額！');
    }
    saveStaffHistory(formData.salesPerson);
    await createPaymentRequest();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert("複製失敗，請手動全選連結複製");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Prime Living 專屬繳費單`,
          text: `您好，這是您的專屬線上繳費單，應付金額 HKD $${pricingSummary.total}。\n您可以自由選擇微信、支付寶或信用卡進行付款：\n`,
          url: invoiceUrl,
        });
      } catch (err) {
        console.log('分享取消或發生錯誤', err);
      }
    } else {
      handleCopyLink(); 
    }
  };

  const handleDownloadQr = async () => {
    setIsDownloading(true);
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=20&data=${encodeURIComponent(invoiceUrl)}`;
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = `PrimeLiving_Invoice_${pendingOrderRef}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("下載失敗，請嘗試直接長按上方二維碼並選擇「儲存圖片」");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950 flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="bg-slate-900 border border-slate-800 max-w-sm w-full rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20">
              <Lock size={32} />
            </div>
            <h2 className="text-xl font-black text-white">銷售現場開單授權</h2>
            <p className="text-xs text-slate-400">請輸入內部授權金鑰以解鎖開單終端</p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="password"
                required
                placeholder="輸入通行金鑰 (PIN Code)"
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setAuthError(''); }}
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-white outline-none focus:border-blue-500 transition"
              />
              {authError && <p className="text-red-400 text-xs font-bold text-center mt-2">{authError}</p>}
            </div>
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition shadow-lg shadow-blue-600/20 text-sm"
            >
              解鎖並保持登入
            </button>
          </form>
          <p className="text-[10px] text-slate-600 text-center">認證授權過期時間：30 天 | 僅限內部專員使用</p>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900 flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="bg-slate-800 border border-red-500/30 max-w-md w-full rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
            <AlertCircle size={32} className="sm:w-10 sm:h-10" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">繳費單已失效或被作廢</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              此張單據已經過期或被手動標記為無效。<br />
            </p>
            <div className="mt-4 p-2 sm:p-3 bg-slate-900 rounded-xl font-mono text-xs text-red-400 border border-slate-700 break-all">
              單號: {successOrderRef}
            </div>
          </div>
          <button
            onClick={() => (window.location.href = '/sales-pay')}
            className="w-full py-3.5 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl sm:rounded-2xl transition shadow-lg text-sm"
          >
            返回重新開立新單
          </button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900 flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 size={32} className="sm:w-10 sm:h-10" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">現場收款成功！</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              客戶已成功完成付款。款項已安全入帳至大系統，公司財務中心可即時查閱。
            </p>
            <div className="mt-4 p-2 sm:p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 border border-slate-700 space-y-1 break-all">
              <div>單號: {successOrderRef}</div>
              <div className="text-amber-400 font-bold">渠道: {paidDetail}</div>
            </div>
          </div>
          <button
            onClick={() => (window.location.href = '/sales-pay')}
            className="w-full py-3.5 sm:py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl sm:rounded-2xl transition shadow-lg text-sm"
          >
            返回開立下一張單
          </button>
        </div>
      </div>
    );
  }

  // ★ 顯示新版的動態繳費單網址 QR Code
  if (invoiceUrl) {
    const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(invoiceUrl)}`;
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
        <div className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5 sm:space-y-6 relative overflow-hidden">
          
          <div className="text-center">
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center justify-center gap-2">
              <LinkIcon className="text-blue-400" size={20} /> 專屬繳費單已生成
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-1 break-all px-2">單號：{pendingOrderRef}</p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-2xl mx-auto w-fit shadow-inner">
            <img src={qrCodeImageUrl} alt="Invoice QR Code" className="w-40 h-40 sm:w-56 sm:h-56" />
          </div>

          <div className="text-center space-y-1">
            <p className="text-slate-400 text-xs sm:text-sm">應繳總額</p>
            <p className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">HKD ${pricingSummary.total}</p>
          </div>
          
          <div className="p-3 sm:p-4 rounded-xl space-y-2 border bg-blue-900/20 border-blue-500/30 text-center">
            <p className="text-[11px] sm:text-xs text-blue-300 font-bold leading-relaxed">
              請出示此二維碼讓租客掃描，<br/>或點擊下方按鈕將網址發送給租客。<br/>
              <span className="text-[10px] text-slate-400 mt-1 block font-normal">租客可在自己的手機上自由選擇微信、支付寶或信用卡付款。此連結永久有效。</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-slate-700">
            <button 
              onClick={handleNativeShare} 
              className="py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Share size={14} /> 發送至手機
            </button>
            <button 
              onClick={handleDownloadQr} 
              disabled={isDownloading}
              className="py-2.5 sm:py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              下載二維碼
            </button>
            <button 
              onClick={handleCopyLink} 
              className="col-span-2 py-2.5 sm:py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 font-bold rounded-xl text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition border border-slate-600"
            >
              {copied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14} />}
              {copied ? '已複製' : '複製純文字網址'}
            </button>
          </div>
          
          <button 
            onClick={() => { setInvoiceUrl(''); setPendingOrderRef(''); }}
            className="w-full pt-1 sm:pt-2 text-slate-500 hover:text-slate-300 font-bold text-[11px] sm:text-xs transition underline underline-offset-4"
          >
            返回修改表單內容
          </button>

          <p className="text-center text-[10px] sm:text-xs text-slate-500 font-bold animate-pulse flex items-center justify-center gap-1.5 mt-1 sm:mt-2">
            <Loader2 size={12} className="animate-spin" />
            正在等待付款，完成將自動跳轉...
          </p>
        </div>
      </div>
    );
  }

  // 視圖 D：主開單表單
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900 text-slate-100 py-6 sm:py-10 px-3 sm:px-4 font-sans flex justify-center">
      <div className="max-w-md sm:max-w-xl w-full h-max bg-slate-800 border border-slate-700 rounded-3xl p-5 sm:p-8 shadow-2xl mb-10">
        
        <div className="flex items-center justify-between border-b border-slate-700 pb-4 sm:pb-5 mb-5 sm:mb-6">
          <div>
            <span className="text-[9px] sm:text-[10px] font-black tracking-widest text-orange-400 uppercase bg-orange-500/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-orange-500/20">
              Internal Sales Only
            </span>
            <h1 className="text-lg sm:text-2xl font-black text-white mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2">
              <CreditCard className="text-blue-500" size={22} />
              開立線上繳費單
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleLockOut}
              className="text-[10px] sm:text-xs text-slate-400 hover:text-red-400 font-bold transition px-2 py-1 bg-slate-900 rounded-lg border border-slate-700"
            >
              鎖定
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1">收款經辦人 *</label>
              <input
                type="text"
                required
                list="staff-suggestions"
                placeholder="經辦人"
                value={formData.salesPerson}
                onChange={e => setFormData({ ...formData, salesPerson: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 sm:p-3 text-[13px] sm:text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
              />
              <datalist id="staff-suggestions">
                {combinedStaffList.map(name => <option key={name} value={name} />)}
              </datalist>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1">客戶/租客全名 *</label>
              <div className="relative">
                <User className="absolute left-2.5 sm:left-3 top-3 sm:top-3.5 text-slate-500" size={16} />
                <input
                  type="text"
                  required
                  placeholder="e.g. Chan Tai Man"
                  value={formData.tenantName}
                  onChange={e => setFormData({ ...formData, tenantName: e.target.value })}
                  className="w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-xl text-[13px] sm:text-sm font-bold text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 證件號碼 */}
            <div className="col-span-2">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1">證件號碼 (選填)</label>
              <div className="relative">
                <IdCard className="absolute left-2.5 sm:left-3 top-3 sm:top-3.5 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="e.g. 110105199001011234 或後4碼"
                  value={formData.idNumber}
                  onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
                  className="w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-xl text-[13px] sm:text-sm font-bold text-white outline-none focus:border-blue-500 uppercase"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-700 pt-3 sm:pt-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1 flex justify-between">
                <span>大樓 / 盤源物業 *</span>
                {dbLoading && <span className="text-blue-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /></span>}
              </label>
              <div className="relative">
                <Building2 className="absolute left-2.5 sm:left-3 top-3 sm:top-3.5 text-slate-500" size={16} />
                <select
                  required
                  value={formData.propertyId}
                  onChange={e => handlePropertyChange(e.target.value)}
                  className="w-full pl-8 sm:pl-10 pr-8 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-xl text-[13px] sm:text-sm font-bold text-slate-200 outline-none focus:border-blue-500 appearance-none truncate"
                >
                  <option value="" disabled>-- 請選擇主盤源大廈 --</option>
                  {properties.map(prop => (
                    <option key={prop.id} value={prop.id} className="font-bold py-1">{prop.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1">意向/承租單位 *</label>
              <div className="relative">
                <Home className="absolute left-2.5 sm:left-3 top-3 sm:top-3.5 text-slate-500" size={16} />
                <select
                  required
                  disabled={!formData.propertyId}
                  value={formData.roomId}
                  onChange={e => handleRoomChange(e.target.value)}
                  className="w-full pl-8 sm:pl-10 pr-8 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-xl text-[13px] sm:text-sm font-bold text-slate-200 outline-none focus:border-blue-500 disabled:opacity-40 appearance-none truncate"
                >
                  <option value="" disabled>-- 請先選上方大樓 --</option>
                  {filteredSortedRooms.map(room => {
                    const statusLabel =
                      room.status === 'Vacant' ? '🟢 未出租' :
                      room.status === 'Maintenance' ? '🟠 維修' : '⚪ 已出租';
                    return (
                      <option key={room.id} value={room.id} className="font-bold py-1">
                        {statusLabel} | {room.name}
                      </option>
                    );
                  })}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-[11px] sm:text-xs font-bold text-blue-400 mb-1">應收本金金額 (HKD) *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 sm:top-3.5 text-blue-500" size={18} />
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-slate-950 border border-blue-500/50 rounded-xl text-lg sm:text-xl font-mono font-black text-blue-400 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-3 sm:p-4 space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-bold">
                <Calculator size={12} className="text-slate-500" />
                款項本金 (Subtotal)
              </span>
              <span className="font-mono">${pricingSummary.subtotal}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-amber-400/90 font-medium">
              <span>+ 線上交易刷卡手續費 (3%)</span>
              <span className="font-mono">${pricingSummary.surcharge}</span>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-slate-800 flex items-center justify-between mt-1">
              <span className="text-[13px] sm:text-sm font-black text-white">總收取刷卡總額</span>
              <span className="text-base sm:text-lg font-mono font-black text-emerald-400">
                HKD ${pricingSummary.total}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 mb-1">款項用途 / 備註 *</label>
            <input
              type="text"
              required
              placeholder="e.g. 兩個月押金 + 首月租金訂金"
              value={formData.remarks}
              onChange={e => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 border border-slate-700 rounded-xl text-[13px] sm:text-sm font-bold text-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-3 sm:pt-4">
            <button
              type="submit"
              disabled={loading || dbLoading}
              className="w-full py-3.5 sm:py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl sm:rounded-2xl font-black text-[13px] sm:text-md flex items-center justify-center gap-1.5 sm:gap-2 transition shadow-lg shadow-blue-600/20 disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  開單中...
                </>
              ) : (
                <>
                  <LinkIcon size={18} />
                  產生專屬繳費單 (${pricingSummary.total})
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-[9px] sm:text-[11px] text-slate-500 mt-4 sm:mt-6 px-2">
          按下開單後，系統將生成永久繳費單連結。租客可於自己手機上自由選擇微信、支付寶或信用卡進行結帳。
        </p>
      </div>
    </div>
  );
}

export default function SalesQuickPayPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-blue-500" />
        </div>
      }
    >
      <SalesQuickPayContent />
    </Suspense>
  );
}
