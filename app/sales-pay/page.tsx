'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { 
  CreditCard, User, Phone, DollarSign, CheckCircle2, AlertCircle,
  Loader2, IdCard, Home, Lock, Building2
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

// ==========================================
// 型態定義
// ==========================================
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

/**
 * 1. 核心業務 UI 組件 
 * (被 Suspense 封裝，相容 Next.js App Router 與 Vercel CSR Bailout 限制)
 */
function SalesQuickPayContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  // 交易回調狀態：嚴格區分 成功 / 失敗 / 未授權
  const [isSuccess, setIsSuccess] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [successOrderRef, setSuccessOrderRef] = useState('');
  const [paidDetail, setPaidDetail] = useState('核實支付渠道中...');

  // 授權金鑰狀態
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  // CRM 數據狀態 (經由 BFF 代理 API 載入，不直連 Firebase Web SDK)
  const [rooms, setRooms] = useState<Room[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [crmStaffList, setCrmStaffList] = useState<string[]>(['公司行政 (Office)']);
  const [savedStaffList, setSavedStaffList] = useState<string[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // 現場填表欄位
  const [formData, setFormData] = useState({
    passcode: '',
    propertyId: '',
    roomId: '',
    roomName: '',
    region: '',
    tenantName: '',
    idNumber: '',
    phone: '',
    amount: '',
    remarks: '首期租金 / 預約訂金',
    salesPerson: ''
  });

  // ==========================================
  // A. 初始化：讀取本地儲存的內部通行碼與經手人歷史
  // ==========================================
  useEffect(() => {
    const savedPin = localStorage.getItem('SALES_PAY_TOKEN');
    if (savedPin) {
      setFormData(prev => ({ ...prev, passcode: savedPin }));
      setIsAuthorized(true);
    }
    const localStaff = localStorage.getItem('SALES_STAFF_HISTORY');
    if (localStaff) {
      try {
        setSavedStaffList(JSON.parse(localStaff));
      } catch (e) {
        // 解析異常則重置
      }
    }
  }, []);

  // ==========================================
  // B. BFF 代理載入 CRM 數據 (完全免除 Firebase Permission-Denied)
  // ==========================================
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
          if (!formData.salesPerson && json.data.staffList?.length > 0) {
            setFormData(prev => ({ ...prev, salesPerson: json.data.staffList[0] }));
          }
        }
      } catch (err) {
        console.error('[初始化失敗] 無法連接盤源數據代理:', err);
      } finally {
        if (isMounted) setDbLoading(false);
      }
    };

    fetchFormData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 合併 CRM 名單與本地記憶，形成智能推薦選項
  const combinedStaffList = useMemo(() => {
    return Array.from(new Set([...crmStaffList, ...savedStaffList]));
  }, [crmStaffList, savedStaffList]);

  // 依物業過濾房間：🟢未出租(Vacant) > 🟠維修中(Maintenance) > ⚪已出租(Occupied)
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

  // ==========================================
  // C. PayDollar 支付閘道跳轉 URL 參數監聽與覈銷
  // ==========================================
  useEffect(() => {
    const success = searchParams?.get('success');
    const failed = searchParams?.get('failed');
    const orderRef = searchParams?.get('orderRef');
    const payRef = searchParams?.get('PayRef') || searchParams?.get('payRef');
    const payMethod = searchParams?.get('PayMethod') || searchParams?.get('payMethod') || 'CC';

    if (failed === 'true') {
      setIsFailed(true);
      setIsSuccess(false);
      setSuccessOrderRef(orderRef || '交易取消/網關受限');
    } else if (success === 'true' && orderRef) {
      setIsSuccess(true);
      setIsFailed(false);
      setSuccessOrderRef(orderRef);

      // 非同步調用後端，把 WeChat Pay / Alipay / 信用卡細節更新回財務單據
      fetch('/api/paydollar/quick-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef, payRef, payMethod })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setPaidDetail(data.detail || '線上收款確認');
          }
        })
        .catch(() => setPaidDetail('已收款 (付款渠道待同步)'));
    }
  }, [searchParams]);

  // ==========================================
  // D. 授權與快取操作
  // ==========================================
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

  // ==========================================
  // E. 提交下單表單
  // ==========================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenantName || !formData.phone || !formData.amount || !formData.roomId) {
      return alert('請完整填寫客戶姓名、電話、選擇單位及正確金額！');
    }

    saveStaffHistory(formData.salesPerson);
    setLoading(true);

    try {
      const response = await fetch('/api/paydollar/quick-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      // 若後端拋回 401 授權過期，自動清除本地快取
      if (response.status === 401) {
        handleLockOut();
        throw new Error(data.error || '授權已過期，請輸入最新的公司銷售授權碼');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || '無法連接金流系統');
      }

      // 動態建立隱藏 Form 轉跳往 PayDollar 安全閘道
      const { paymentPayload } = data;
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = paymentPayload.endpoint;

      Object.entries(paymentPayload).forEach(([key, value]) => {
        if (key !== 'endpoint' && value !== undefined && value !== null) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
      });

      document.body.appendChild(form);
      form.submit();
    } catch (error: any) {
      alert(`⚠️ 建立收款單失敗: ${error.message}`);
      setLoading(false);
    }
  };

  // ==========================================
  // 視圖 A：未登入授權面板
  // ==========================================
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-900 border border-slate-800 max-w-sm w-full rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20">
              <Lock size={32} />
            </div>
            <h2 className="text-xl font-black text-white">銷售現場收款授權</h2>
            <p className="text-xs text-slate-400">
              請輸入經營運中心授權的內部通行金鑰以解鎖收款終端
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="password"
                required
                placeholder="輸入通行金鑰 (PIN Code)"
                value={pinInput}
                onChange={e => {
                  setPinInput(e.target.value);
                  setAuthError('');
                }}
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-white outline-none focus:border-blue-500 transition"
              />
              {authError && (
                <p className="text-red-400 text-xs font-bold text-center mt-2">{authError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition shadow-lg shadow-blue-600/20 text-sm"
            >
              解鎖並保持登入
            </button>
          </form>

          <p className="text-[10px] text-slate-600 text-center">
            認證授權過期時間：30 天 | 僅限內部專員使用
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 視圖 B：付款失敗 / 網關拒絕
  // ==========================================
  if (isFailed) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-800 border border-red-500/30 max-w-md w-full rounded-3xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
            <AlertCircle size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">交易失敗或被取消</h2>
            <p className="text-sm text-slate-400 mt-2">
              PayDollar 網關拒絕交易或刷卡人手動取消。
              <br />
              <span className="text-red-400 font-bold">⚠️ 此款項【未成立】，未計入大系統帳目！</span>
            </p>
            <div className="mt-4 p-3 bg-slate-900 rounded-xl font-mono text-xs text-red-400 border border-slate-700">
              單據參考號: {successOrderRef}
            </div>
          </div>
          <button
            onClick={() => (window.location.href = '/sales-pay')}
            className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl transition shadow-lg"
          >
            返回重新嘗試收款
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 視圖 C：付款成功完結
  // ==========================================
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-3xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">現場收款成功！</h2>
            <p className="text-sm text-slate-400 mt-2">
              款項已安全入帳至大系統【現場待認領隊列】，公司財務中心可即時查閱對平。
            </p>
            <div className="mt-4 p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 border border-slate-700 space-y-1">
              <div>訂單編號: {successOrderRef}</div>
              <div className="text-amber-400 font-bold">付款渠道: {paidDetail}</div>
            </div>
          </div>
          <button
            onClick={() => (window.location.href = '/sales-pay')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition shadow-lg"
          >
            返回下一筆收款
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 視圖 D：主體表單 (雙層過濾 + 智能推薦)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-10 px-4 font-sans flex justify-center">
      <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl">
        {/* 頂部標題 */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-5 mb-6">
          <div>
            <span className="text-[10px] font-black tracking-widest text-orange-400 uppercase bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
              Internal Sales Only
            </span>
            <h1 className="text-2xl font-black text-white mt-2 flex items-center gap-2">
              <CreditCard className="text-blue-500" size={26} />
              銷售現場快速收款
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLockOut}
              className="text-xs text-slate-400 hover:text-red-400 font-bold transition px-2 py-1 bg-slate-900 rounded-lg border border-slate-700"
            >
              鎖定終端
            </button>
            <img src="/logo.png" alt="Logo" className="h-8 opacity-80 hidden sm:block" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. 經辦銷售員 (支持自由鍵入與歷史推薦) */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">
              收款經辦銷售員 (自由鍵入或選取) *
            </label>
            <input
              type="text"
              required
              list="staff-suggestions"
              placeholder="請輸入或選擇經辦人"
              value={formData.salesPerson}
              onChange={e => setFormData({ ...formData, salesPerson: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
            />
            <datalist id="staff-suggestions">
              {combinedStaffList.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {/* 2. 第一步：先挑選主大樓/物業 (已過濾 Test / 假樓盤) */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 flex justify-between">
              <span>所屬大樓 / 盤源物業 *</span>
              {dbLoading && (
                <span className="text-blue-400 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> 載入中...
                </span>
              )}
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <select
                required
                value={formData.propertyId}
                onChange={e => handlePropertyChange(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  -- 步驟 1：請選擇主盤源大廈 --
                </option>
                {properties.map(prop => (
                  <option key={prop.id} value={prop.id} className="font-bold py-1">
                    {prop.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. 第二步：意向單位 (由大廈二次過濾 + 🟢未出租強制排序至頂部) */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">
              意向/承租單位 (🟢 未出租優先置頂) *
            </label>
            <div className="relative">
              <Home className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <select
                required
                disabled={!formData.propertyId}
                value={formData.roomId}
                onChange={e => handleRoomChange(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-slate-200 outline-none focus:border-blue-500 disabled:opacity-40"
              >
                <option value="" disabled>
                  -- 步驟 2：請先選上方大樓以篩選房間 --
                </option>
                {filteredSortedRooms.map(room => {
                  const statusLabel =
                    room.status === 'Vacant'
                      ? '🟢 未出租'
                      : room.status === 'Maintenance'
                      ? '🟠 維修中'
                      : '⚪ 已出租';
                  return (
                    <option key={room.id} value={room.id} className="font-bold py-1">
                      {statusLabel} | {room.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* 4. 租客全名與電話 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                客戶/租客全名 *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 text-slate-500" size={16} />
                <input
                  type="text"
                  required
                  placeholder="e.g. Chan Tai Man"
                  value={formData.tenantName}
                  onChange={e => setFormData({ ...formData, tenantName: e.target.value })}
                  className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                聯絡電話 *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 text-slate-500" size={16} />
                <input
                  type="tel"
                  required
                  placeholder="e.g. 68888640"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 5. 證件號碼 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 flex justify-between">
              <span>證件號碼 / HKID (選填)</span>
              <span className="text-[10px] text-slate-500">供大系統自動配對索引</span>
            </label>
            <div className="relative">
              <IdCard className="absolute left-3 top-3.5 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="e.g. A123456(7) 或後4碼"
                value={formData.idNumber}
                onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
                className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 uppercase"
              />
            </div>
          </div>

          {/* 6. 收款全額 */}
          <div>
            <label className="block text-xs font-bold text-emerald-400 mb-1">
              收款金額 (HKD) *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-emerald-500" size={20} />
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-emerald-500/50 rounded-xl text-xl font-mono font-black text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* 7. 款項用途 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">
              款項用途 / 備註 *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 兩個月押金 + 首月租金訂金"
              value={formData.remarks}
              onChange={e => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
            />
          </div>

          {/* 提交按鈕 */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || dbLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 transition shadow-xl shadow-blue-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  正在產生付款訂單...
                </>
              ) : (
                <>
                  <CreditCard size={20} />
                  立即前往線上刷卡收款
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-slate-500 mt-6">
          付款完成後，款項將由 PayDollar 安全驗證並列入大系統【現場暫收對帳隊列】
        </p>
      </div>
    </div>
  );
}

/**
 * 2. 預設導出頁面模組：
 * 通過 <Suspense> 包裝，解決 Next.js App Router 下 CSR Bailout 警告
 */
export default function SalesQuickPayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-blue-500" />
        </div>
      }
    >
      <SalesQuickPayContent />
    </Suspense>
  );
}
