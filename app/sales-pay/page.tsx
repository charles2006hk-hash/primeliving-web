'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { 
  CreditCard, User, Phone, MapPin, DollarSign, FileText, 
  CheckCircle2, AlertCircle, Loader2, Send, Building2, IdCard
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

// 1. 將原有邏輯拆分為核心業務組件
function SalesQuickPayContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successOrderRef, setSuccessOrderRef] = useState('');

  // 現場填表欄位
  const [formData, setFormData] = useState({
    region: '太湖花園',
    roomName: 'Room A',
    tenantName: '',
    idNumber: '',
    phone: '',
    amount: '',
    remarks: '合約預約金 / 首期租金',
    salesPerson: 'Charles'
  });

  const [staffList] = useState([
    'Charles', 'Joyce', 'Tolloy Yu', '公司行政 (Office)'
  ]);

  const [regionList] = useState([
    '太湖花園 (Tai Wo)', '碧濤花園 (Pictorial)', '新貿中心 (Shing Chuen)', '其他物業'
  ]);

  const [roomList] = useState([
    'Room A', 'Room B', 'Room C', 'Room D', 'Room E', '整租 / 獨立單位'
  ]);

  // 檢查是否從 PayDollar 成功返回
  useEffect(() => {
    const success = searchParams?.get('success');
    const orderRef = searchParams?.get('orderRef');
    if (success === 'true' && orderRef) {
      setIsSuccess(true);
      setSuccessOrderRef(orderRef);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenantName || !formData.phone || !formData.amount) {
      return alert('請完整填寫客戶姓名、電話及金額！');
    }

    setLoading(true);
    try {
      const response = await fetch('/api/paydollar/quick-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '無法連接金流系統');
      }

      // 動態建立表單並轉跳至 PayDollar 安全閘道
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

  // 付款成功完成畫面
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
              款項已記錄至大後台【現場待認領隊列】，公司財務帳目已自動同步。
            </p>
            <div className="mt-4 p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 border border-slate-700">
              訂單編號: {successOrderRef}
            </div>
          </div>
          <button
            onClick={() => window.location.href = '/sales-pay'}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition shadow-lg"
          >
            返回下一筆收款
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-10 px-4 font-sans flex justify-center">
      <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl">
        
        {/* 標題區 */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-5 mb-6">
          <div>
            <span className="text-[10px] font-black tracking-widest text-orange-400 uppercase bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
              Internal Sales Only
            </span>
            <h1 className="text-2xl font-black text-white mt-2 flex items-center gap-2">
              <CreditCard className="text-blue-500" size={26} />
              銷售現場專用快速收款
            </h1>
          </div>
          <img src="/logo.png" alt="Logo" className="h-8 opacity-80" />
        </div>

        {/* 填寫表單 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* 1. 經辦人與物業地區 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">收款經辦銷售員 *</label>
              <select
                value={formData.salesPerson}
                onChange={e => setFormData({ ...formData, salesPerson: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
              >
                {staffList.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">所屬地區/屋苑 *</label>
              <select
                value={formData.region}
                onChange={e => setFormData({ ...formData, region: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
              >
                {regionList.map(reg => <option key={reg} value={reg}>{reg}</option>)}
              </select>
            </div>
          </div>

          {/* 2. 房間選擇 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">意向/預定房間 *</label>
            <select
              value={formData.roomName}
              onChange={e => setFormData({ ...formData, roomName: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-200 outline-none focus:border-blue-500"
            >
              {roomList.map(room => <option key={room} value={room}>{room}</option>)}
            </select>
          </div>

          {/* 3. 客戶姓名與電話 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">客戶/租客全名 *</label>
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
              <label className="block text-xs font-bold text-slate-400 mb-1">聯絡電話 *</label>
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

          {/* 4. 證件號碼 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 flex justify-between">
              <span>證件號碼 / HKID (選填)</span>
              <span className="text-[10px] text-slate-500">用於大系統日後自動認領配對</span>
            </label>
            <div className="relative">
              <IdCard className="absolute left-3 top-3.5 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="e.g. A123456(7) 或後4碼"
                value={formData.idNumber}
                onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
                className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 5. 收款金額 */}
          <div>
            <label className="block text-xs font-bold text-emerald-400 mb-1">收款金額 (HKD) *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-emerald-500" size={20} />
              <input
                type="number"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-emerald-500/50 rounded-xl text-xl font-mono font-black text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* 6. 金額備註 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">款項用途 / 備註 *</label>
            <input
              type="text"
              required
              placeholder="e.g. 兩個月押金 + 首月租金訂金"
              value={formData.remarks}
              onChange={e => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
            />
          </div>

          {/* 送出按鈕 */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
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
          付款完成後，款項將由 PayDollar 安全驗證並列入大後台【現場暫收對帳表】
        </p>

      </div>
    </div>
  );
}

// 2. 預設導出頁面：使用 Suspense 封裝主組件，通過 Vercel 建置檢驗
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
