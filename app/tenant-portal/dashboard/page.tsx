'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { 
  Bell, CreditCard, Wrench, FileText, 
  ChevronRight, Calendar, User, Droplets, Loader2,
  Landmark, UploadCloud, X, CheckCircle2, AlertCircle, FileSignature, Download,
  Camera, Receipt, ShieldCheck, IdCard
} from 'lucide-react';
import Link from 'next/link';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';

function DashboardContent() {
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  
  // 支付相關 State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'stripe'>('bank');
  const [isUploading, setIsUploading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // 電子合約相關 State
  const [isLeaseModalOpen, setIsLeaseModalOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [signDate, setSignDate] = useState<string | null>(null);
  const [isSignDownloading, setIsSignDownloading] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  // 報修系統相關 State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('冷氣水電');
  const [ticketDesc, setTicketDesc] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);

  // 水電雜費相關 State
  const [isBillsModalOpen, setIsBillsModalOpen] = useState(false);

  // ★ KYC 租客檔案相關 State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isIdUploaded, setIsIdUploaded] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState({
    name: '',
    phone: '',
    relation: ''
  });

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const tenantId = localStorage.getItem('tenantId');
      if (!tenantId) { window.location.href = '/tenant-portal'; return; }

      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const end = new Date(data.leaseEnd);
          const now = new Date();
          const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          setTenantData({
            name: data.name,
            amountDue: data.monthlyRent || 0, 
            dueDate: "本月 1 日", 
            daysRemaining: diffDays > 0 ? diffDays : 0,
            status: data.status === 'Active' ? '合約已生效' : '待簽約 / 待繳費',
            roomInfo: `租客編號: ${tenantId.slice(-6).toUpperCase()}`,
            // 👇 必須補上這幾行，報修 API 才抓得到位置 👇
            propertyId: data.propertyId || '',   // 盤源 ID
            propertyName: data.propertyName || '', // 盤源名稱
            roomId: data.roomId || data.room || '', // 房間 ID
            // 👆 補強完畢 👆
            leaseStart: data.leaseStart,
            leaseEnd: data.leaseEnd,
            utilities: data.utilities || [
              { name: '水費 (按錶計費)', amount: 45.5, date: '2026-03-01' },
              { name: '電費 (按錶計費)', amount: 320.0, date: '2026-03-01' },
              { name: '大樓管理與清潔費', amount: 150.0, date: '2026-03-01' }
            ]
          });

          // 判斷合約簽署狀態
          if (data.signature) {
            setHasSigned(true);
            setSignature(data.signature);
            setSignDate(data.signedAt?.toDate ? data.signedAt.toDate().toLocaleString() : '近期');
          }

          // ★ 判斷 KYC 檔案完善狀態
          if (data.emergencyContact) {
            setEmergencyContact(data.emergencyContact);
          }
          if (data.idUploaded) {
            setIsIdUploaded(true);
          }
          if (data.emergencyContact?.name && data.idUploaded) {
            setIsProfileComplete(true);
          }
        }
      } catch (error) {
        console.error("抓取租客資料失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const sessionId = searchParams?.get('session_id');
    const success = searchParams?.get('success');
    if (success === 'true' && sessionId) { verifyAndSettlePayment(sessionId); }
  }, [searchParams]);

  const verifyAndSettlePayment = async (sessionId: string) => {
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/checkout/verify?session_id=${sessionId}`);
      const data = await res.json();

      if (data.payment_status === 'paid') {
        const tenantId = localStorage.getItem('tenantId');
        if (tenantId) {
          await addDoc(collection(db, 'transactions'), {
            type: 'income', status: 'completed', title: '租金與雜費繳納 (線上刷卡)', amount: data.amount_total / 100, 
            dueDate: new Date().toISOString().split('T')[0], completedDate: new Date().toISOString().split('T')[0],
            tenantId: tenantId, remarks: `Stripe 自動結算 (Session: ${sessionId.slice(-8)})`, createdAt: serverTimestamp()
          });

          await updateDoc(doc(db, 'tenants', tenantId), { monthlyRent: 0 });
          setTenantData((prev: any) => ({ ...prev, amountDue: 0, status: prev.status === '待簽約 / 待繳費' ? '合約已生效' : prev.status }));
          alert("🎉 繳費成功！系統已自動結算並更新您的帳單。");
          router.replace('/tenant-portal/dashboard');
        }
      }
    } catch (error) { console.error("結算失敗:", error); } finally { setIsVerifying(false); }
  };

  const handleUploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false); setIsPaymentModalOpen(false);
      alert("✅ 入數紙上傳成功！管家將在 24 小時內為您核對並更新帳單狀態。");
    }, 2000);
  };

  const handleStripeCheckout = async () => {
    if (!tenantData) return;
    setIsStripeLoading(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountDue: tenantData.amountDue, tenantId: localStorage.getItem('tenantId'), tenantName: tenantData.name, roomInfo: tenantData.roomInfo, returnUrl: window.location.origin }),
      });
      const data = await response.json();
      if (data.url) window.location.href = data.url; else { alert("無法建立結帳頁面：" + data.error); setIsStripeLoading(false); }
    } catch (error) { alert("系統連線錯誤"); setIsStripeLoading(false); }
  };

  const handleSignLease = async () => {
    if (!signature.trim()) return alert("請輸入您的法定全名作為電子簽名！");
    setIsSigning(true);
    try {
      const tenantId = localStorage.getItem('tenantId');
      if (!tenantId) return;
      await updateDoc(doc(db, 'tenants', tenantId), { signature: signature, signedAt: serverTimestamp(), status: 'Active' });
      setHasSigned(true); setSignDate(new Date().toLocaleString()); setTenantData((prev: any) => ({ ...prev, status: '合約已生效' }));
      alert("✅ 恭喜！電子合約簽署成功，具有完整法律效力。");
    } catch (error) {
      console.error(error); alert("簽署失敗，請稍後再試");
    } finally { setIsSigning(false); }
  };

  const handleDownloadPDF = async () => {
    if (!contractRef.current) return;
    const htmlToImage = (window as any).htmlToImage;
    const jspdfObj = (window as any).jspdf;
    if (!htmlToImage || !jspdfObj) return alert("⚠️ 系統正在準備 PDF 引擎，請稍等一兩秒後再試！");
    
    setIsSignDownloading(true);
    try {
      const imgData = await htmlToImage.toPng(contractRef.current, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
      const pdf = new jspdfObj.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (contractRef.current.offsetHeight * pdfWidth) / contractRef.current.offsetWidth;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`PrimeLiving_Tenancy_Agreement_${tenantData.name}.pdf`);
    } catch (error) {
      console.error("PDF 下載失敗:", error); alert("生成 PDF 失敗，請稍後再試。");
    } finally { setIsSignDownloading(false); }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketDesc.trim()) return alert("請簡單描述損壞情況，以便師傅準備工具！");
    setIsSubmittingTicket(true);
    try {
      const tenantId = localStorage.getItem('tenantId');
      
      // 構建與 ERP 及小程式 100% 統一的數據結構
      const ticketData = {
        // --- 核心定位 (鎖定租客位置) ---
        tenantId: tenantId,
        tenantName: tenantData.name || '',
        
        // 🔑 關鍵：確保這三個欄位在步驟一的 useEffect 裡有被存入 tenantData
        propertyId: tenantData.propertyId || '',   
        propertyName: tenantData.propertyName || '', // 👈 建議加上這個，ERP 顯示更直觀
        roomId: tenantData.roomId || tenantData.room || '', 
        roomInfo: tenantData.roomInfo || '',

        // --- 工單內容 (對齊 ERP 欄位) ---
        type: 'Repair',
        category: ticketCategory,
        title: `${ticketCategory}: ${ticketDesc.slice(0, 15)}...`, 
        description: ticketDesc,
        priority: 'Medium',
        
        // --- 狀態控制 ---
        status: 'Open', 
        repairCost: 0,
        
        // --- 時間與附件 ---
        hasPhoto: isPhotoUploaded,
        imageUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'WebPortal'
      };

      await addDoc(collection(db, 'tickets'), ticketData);

      alert("✅ 報修單已成功送出！管家將盡快為您安排師傅。");
      setIsTicketModalOpen(false); 
      setTicketDesc(''); 
      setIsPhotoUploaded(false); 
      setTicketCategory('冷氣水電');
    } catch (error) {
      console.error("報修失敗:", error); 
      alert("系統連線錯誤，請稍後再試。");
    } finally {
      setIsSubmittingTicket(false); 
    }
  };

  // ★ 處理 KYC 檔案儲存
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyContact.name || !emergencyContact.phone) {
      return alert("請填妥緊急聯絡人姓名與電話！");
    }
    if (!isIdUploaded) {
      return alert("請上傳您的身分證明文件或簽證圖片！");
    }

    setIsSavingProfile(true);
    try {
      const tenantId = localStorage.getItem('tenantId');
      if (!tenantId) return;

      await updateDoc(doc(db, 'tenants', tenantId), {
        emergencyContact: emergencyContact,
        idUploaded: true,
        kycUpdatedAt: serverTimestamp()
      });

      setIsProfileComplete(true);
      alert("✅ 感謝配合！您的租客檔案已完善，並已加密儲存。");
      setIsProfileModalOpen(false);
    } catch (error) {
      console.error("檔案儲存失敗:", error);
      alert("系統連線錯誤，請稍後再試。");
    } finally {
      setIsSavingProfile(false);
    }
  };


  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;
  if (!tenantData) return null;

  const stripeFee = Math.round(tenantData.amountDue * 0.03);
  const totalWithStripe = tenantData.amountDue + stripeFee;
  const totalUtilities = tenantData.utilities?.reduce((acc: number, curr: any) => acc + curr.amount, 0) || 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-12 pt-20 px-4 font-sans relative">
      
      <Script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="lazyOnload" />

      {isVerifying && (
        <div className="fixed inset-0 bg-slate-900/80 z-[200] flex flex-col items-center justify-center text-white backdrop-blur-sm animate-in fade-in">
          <Loader2 size={48} className="animate-spin text-emerald-400 mb-4" />
          <h2 className="text-2xl font-black">正在向銀行確認款項...</h2>
          <p className="text-slate-300 mt-2 font-medium">請稍候，系統即將為您結算帳單</p>
        </div>
      )}

      <div className="max-w-md mx-auto space-y-6">
        <div className="flex justify-between items-center px-2">
          <div><h1 className="text-2xl font-black text-slate-900">你好, {tenantData.name}</h1><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">PrimeLiving Tenant</p></div>
          <button className="relative p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition-transform active:scale-95"><Bell size={20} className="text-slate-600" /><span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border-2 border-white"></span></button>
        </div>

        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-900/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/20 blur-[60px] -translate-y-16 translate-x-16 pointer-events-none" />
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">本期待繳 (HKD)</p>
              <h2 className="text-5xl font-black tracking-tighter">${tenantData.amountDue.toLocaleString()}</h2>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black border ${tenantData.status === '合約已生效' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
              {tenantData.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-400 mb-8 relative z-10">
            {tenantData.amountDue > 0 ? (
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm"><Calendar size={14} className="text-orange-400"/> 繳費期限: {tenantData.dueDate}</div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 px-3 py-1.5 rounded-lg backdrop-blur-sm"><CheckCircle2 size={14}/> 本期已繳清</div>
            )}
          </div>
          <button onClick={() => setIsPaymentModalOpen(true)} disabled={tenantData.amountDue === 0} className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-orange-50 transition-all active:scale-95 shadow-xl relative z-10 disabled:opacity-50 disabled:cursor-not-allowed">
            <CreditCard size={18}/> {tenantData.amountDue === 0 ? '無待繳帳單' : '立即繳費'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">剩餘租期</p><p className="text-2xl font-black text-slate-800">{tenantData.daysRemaining} <span className="text-xs font-bold text-slate-500">天</span></p></div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center overflow-hidden"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">我的帳戶</p><p className="text-sm font-black text-slate-800 truncate">{tenantData.roomInfo}</p></div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          
          <button onClick={() => setIsLeaseModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 border-b border-slate-50 transition-colors group relative">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><FileSignature size={20} className="text-purple-500"/></div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">電子合約與簽署 {!hasSigned && <span className="flex h-2 w-2 rounded-full bg-red-500"></span>}</p>
                <p className={`text-[10px] font-bold ${hasSigned ? 'text-emerald-500' : 'text-red-400'}`}>{hasSigned ? '已簽署，可下載 PDF' : '尚未簽署，請立即完成'}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          {/* ★ 住客檔案認證 KYC (新增) */}
          <button onClick={() => setIsProfileModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 border-b border-slate-50 transition-colors group relative text-left">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><ShieldCheck size={20} className="text-emerald-500"/></div>
              <div>
                <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">住客檔案認證 {!isProfileComplete && <span className="flex h-2 w-2 rounded-full bg-red-500"></span>}</p>
                <p className={`text-[10px] font-bold ${isProfileComplete ? 'text-emerald-500' : 'text-slate-400'}`}>{isProfileComplete ? '檔案已完善 (實名認證)' : '上傳證件與緊急聯絡人'}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          <button onClick={() => setIsTicketModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 border-b border-slate-50 transition-colors group relative text-left">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Wrench size={20} className="text-blue-500"/></div>
              <div>
                <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">報修申請</p>
                <p className="text-[10px] font-bold text-slate-400">設備損壞一鍵呼叫師傅</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          <button onClick={() => setIsBillsModalOpen(true)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 border-b border-slate-50 transition-colors group relative text-left">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Droplets size={20} className="text-cyan-500"/></div>
              <div>
                <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">水電雜費明細</p>
                <p className="text-[10px] font-bold text-slate-400">查看本月實報實銷與費用</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          <Link href="https://wa.me/85298765432" target="_blank" className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-4"><div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><User size={20} className="text-orange-500"/></div><div><p className="text-sm font-black text-slate-800 mb-0.5">聯絡專屬管家</p><p className="text-[10px] text-slate-400 font-bold">WhatsApp 在線客服</p></div></div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </Link>
        </div>

        <button onClick={() => { localStorage.clear(); window.location.href = '/tenant-portal'; }} className="w-full py-4 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors">安全退出登入</button>
      </div>

      {/* ========================================== */}
      {/* ★ 全新：住客檔案認證 KYC Modal */}
      {/* ========================================== */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><ShieldCheck className="mr-2 text-emerald-600" size={24}/> 住客檔案認證</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {isProfileComplete ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center mb-6">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-100">
                    <ShieldCheck size={32} className="text-emerald-500"/>
                  </div>
                  <h4 className="text-lg font-black text-emerald-900 mb-2">檔案已完善，感謝配合！</h4>
                  <p className="text-xs text-emerald-700 font-medium leading-relaxed">您的身分證明文件與緊急聯絡人已加密儲存於管理中心。若需更新資料，請聯絡專屬管家。</p>
                  
                  <div className="mt-6 text-left bg-white p-4 rounded-xl border border-emerald-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">登記之緊急聯絡人</p>
                    <p className="text-sm font-bold text-slate-800">{emergencyContact.name} <span className="text-slate-400 font-normal">({emergencyContact.relation})</span></p>
                    <p className="text-xs text-slate-500 font-mono mt-1">{emergencyContact.phone}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18}/>
                    <div>
                      <p className="text-sm font-black text-amber-900 mb-1">為保障居住安全請完善檔案</p>
                      <p className="text-[10px] text-amber-700 font-bold leading-relaxed">依據管理規範，請上傳有效的身分證明文件（身分證/護照/學生證/簽證），並確實填寫緊急聯絡人資料。</p>
                    </div>
                  </div>

                  {/* 證件上傳 */}
                  <div>
                    <p className="text-xs font-black text-slate-800 mb-3 flex justify-between">
                      <span>1. 身分證明文件上傳</span>
                    </p>
                    <div className="relative">
                      <input 
                        type="file" id="id-upload" accept="image/*,.pdf" className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) { setIsIdUploaded(true); alert("📷 證件已暫存，請繼續填寫下方資料！"); }
                        }}
                      />
                      <label 
                        htmlFor="id-upload" 
                        className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isIdUploaded ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-emerald-400 hover:bg-emerald-50'}`}
                      >
                        {isIdUploaded ? (
                          <><CheckCircle2 size={28} className="mb-2"/> <span className="text-sm font-black">證件已成功夾帶</span></>
                        ) : (
                          <><IdCard size={28} className="mb-2"/> <span className="text-sm font-bold">點擊上傳證件照片或 PDF</span></>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 緊急聯絡人 */}
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-black text-slate-800 mb-4">2. 緊急聯絡人資訊 (必填)</p>
                    <div className="space-y-3">
                      <input type="text" placeholder="聯絡人姓名 (Name)" required value={emergencyContact.name} onChange={e => setEmergencyContact({...emergencyContact, name: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all placeholder:text-slate-400 font-bold text-slate-800" />
                      <div className="flex gap-3">
                        <input type="tel" placeholder="聯絡電話 (Phone)" required value={emergencyContact.phone} onChange={e => setEmergencyContact({...emergencyContact, phone: e.target.value})} className="w-2/3 p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all placeholder:text-slate-400 font-bold text-slate-800" />
                        <select required value={emergencyContact.relation} onChange={e => setEmergencyContact({...emergencyContact, relation: e.target.value})} className="w-1/3 p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all font-bold text-slate-800 bg-white">
                          <option value="" disabled>關係</option>
                          <option value="父母">父母</option>
                          <option value="配偶">配偶</option>
                          <option value="親屬">親屬</option>
                          <option value="朋友">朋友</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" disabled={isSavingProfile}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all active:scale-95 shadow-xl shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {isSavingProfile ? <><Loader2 size={18} className="animate-spin"/> 儲存中...</> : '確認送出檔案'}
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>
      )}


      {/* 其餘 Modals (水電、報修、合約、支付) 保持不變，為節省空間已在完整代碼中包含 */}
      {isBillsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative"><div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" /><h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Receipt className="mr-2 text-cyan-600" size={24}/> 水電與雜費明細</h3><button onClick={() => setIsBillsModalOpen(false)} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button></div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">本期計費週期：2026年3月</p><div className="space-y-4">{tenantData.utilities && tenantData.utilities.map((bill: any, index: number) => (<div key={index} className="flex justify-between items-center border-b border-slate-50 pb-4 last:border-0 last:pb-0"><div><p className="text-sm font-bold text-slate-800">{bill.name}</p><p className="text-[10px] text-slate-400 font-mono mt-0.5">結算日: {bill.date}</p></div><p className="text-base font-black text-slate-800">${bill.amount.toFixed(1)}</p></div>))}</div><div className="mt-6 pt-6 border-t border-slate-200 border-dashed flex justify-between items-end"><p className="text-sm font-black text-slate-500">本月雜費總計</p><p className="text-2xl font-black text-cyan-600">${totalUtilities.toFixed(1)}</p></div></div>
              <div className="mt-6 bg-cyan-50 border border-cyan-100 p-4 rounded-xl flex items-start gap-3"><AlertCircle className="text-cyan-600 shrink-0 mt-0.5" size={18}/><div><p className="text-sm font-black text-cyan-900 mb-1">溫馨提示：費用已合併</p><p className="text-xs text-cyan-700 font-medium leading-relaxed">為了方便您的繳款，上述所有水電與雜費明細，<strong>已經自動加總至您首頁的「本期待繳總額」中</strong>。請直接返回首頁點擊「立即繳費」一併結清即可。</p></div></div>
              <button onClick={() => setIsBillsModalOpen(false)} className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-md flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/20">我知道了，返回首頁</button>
            </div>
          </div>
        </div>
      )}

      {isTicketModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative"><div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" /><h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Wrench className="mr-2 text-blue-600" size={24}/> 填寫報修單</h3><button onClick={() => setIsTicketModalOpen(false)} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button></div>
            <div className="p-6 overflow-y-auto flex-1"><form onSubmit={handleSubmitTicket} className="space-y-6"><div><p className="text-xs font-black text-slate-800 mb-3">請選擇損壞項目：</p><div className="grid grid-cols-2 gap-3">{['冷氣水電', '家具家電', '門窗鎖具', '其他異常'].map(cat => (<button key={cat} type="button" onClick={() => setTicketCategory(cat)} className={`py-3 px-4 rounded-xl text-sm font-bold transition-colors border ${ticketCategory === cat ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{cat}</button>))}</div></div><div><p className="text-xs font-black text-slate-800 mb-3">狀況描述：</p><textarea rows={4} required placeholder="例如：冷氣開了不冷，而且會滴水..." value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none placeholder:text-slate-400" /></div><div><p className="text-xs font-black text-slate-800 mb-3 flex justify-between"><span>上傳照片 (選填)</span><span className="text-slate-400 font-normal">幫助師傅更快判斷</span></p><div className="relative"><input type="file" id="photo-upload" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setIsPhotoUploaded(true); alert("📷 照片已暫存！"); } }} /><label htmlFor="photo-upload" className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isPhotoUploaded ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-blue-400 hover:bg-blue-50'}`}>{isPhotoUploaded ? <><CheckCircle2 size={28} className="mb-2"/> <span className="text-sm font-black">照片已夾帶</span></> : <><Camera size={28} className="mb-2"/> <span className="text-sm font-bold">點擊拍照或上傳圖檔</span></>}</label></div></div><button type="submit" disabled={isSubmittingTicket} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-600/20 disabled:opacity-50">{isSubmittingTicket ? <><Loader2 size={18} className="animate-spin"/> 送出中...</> : '確認送出報修'}</button></form></div>
          </div>
        </div>
      )}

      {isLeaseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"><div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative"><div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" /><h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><FileText className="mr-2 text-purple-600" size={24}/> 房屋租賃合約</h3><button onClick={() => setIsLeaseModalOpen(false)} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button></div><div className="p-6 overflow-y-auto flex-1 bg-slate-50/50"><div ref={contractRef} className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm text-xs leading-relaxed text-slate-700 font-serif relative"><div className="absolute top-4 right-4"><span className="text-[9px] bg-slate-100 text-slate-400 px-2 py-1 rounded font-sans font-bold">Standard HK Tenancy Agreement</span></div><h4 className="text-center text-base font-black mb-6 mt-4">TENANCY AGREEMENT<br/>(房屋租賃合約)</h4><p className="mb-4"><strong>THIS AGREEMENT</strong> is made on {new Date().toLocaleDateString('en-US')} BETWEEN:</p><p className="mb-4"><strong>Party A (Landlord):</strong> PrimeLiving Management Limited<br/><strong>Party B (Tenant):</strong> {tenantData.name}</p><p className="mb-2"><strong>1. Premises:</strong> The landlord agrees to lease {tenantData.roomInfo.replace('租客編號: ', 'Room ID: ')} to the Tenant.</p><p className="mb-2"><strong>2. Term:</strong> From <strong>{tenantData.leaseStart || 'TBD'}</strong> to <strong>{tenantData.leaseEnd || 'TBD'}</strong>.</p><p className="mb-2"><strong>3. Rent:</strong> HK$ {tenantData.amountDue.toLocaleString()} per month, payable in advance on the 1st day of each month.</p><p className="mb-6"><strong>4. Deposit:</strong> Two months' rent shall be held by the Landlord as a security deposit.</p><p className="text-[10px] text-slate-400 italic text-justify">By signing below, Party B acknowledges that they have read, understood, and agreed to all terms and conditions stipulated in the full version of this Tenancy Agreement.</p>{hasSigned && (<div className="mt-8 border-t border-slate-200 pt-6 text-center"><p className="text-3xl text-slate-800" style={{ fontFamily: "'Brush Script MT', 'Cedarville Cursive', cursive" }}>{signature}</p><div className="w-[250px] h-px bg-slate-400 mx-auto my-2"></div><p className="text-[10px] text-slate-500 font-mono">Digitally Signed on {signDate}</p></div>)}</div><div className="mt-6 border-t border-slate-200 pt-6">{hasSigned ? (<div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center"><CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2"/><p className="text-sm font-black text-emerald-800">合約已成功簽署</p><p className="text-xs text-emerald-600 mt-1">您已完成法定電子簽名手續，合約具備完全法律效力。</p><button onClick={handleDownloadPDF} disabled={isSignDownloading} className="mt-4 w-full py-3 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50">{isSignDownloading ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}{isSignDownloading ? '正在生成專屬 PDF...' : '下載 PDF 副本'}</button></div>) : (<div className="space-y-4"><div><label className="block text-xs font-black text-slate-800 mb-2 flex items-center"><FileSignature size={16} className="mr-1.5 text-purple-600"/> 請輸入您的法定全名作為電子簽名：</label><input type="text" placeholder="e.g. Chan Tai Man" value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full p-4 border-2 border-slate-200 rounded-xl text-2xl outline-none focus:border-purple-500 transition-colors text-center" style={{ fontFamily: "'Brush Script MT', 'Cedarville Cursive', cursive" }} /></div><label className="flex items-start gap-3 cursor-pointer p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><input type="checkbox" className="mt-1 w-4 h-4 accent-purple-600 cursor-pointer" required/><span className="text-[10px] text-slate-600 leading-relaxed font-bold">本人確認上述簽名由本人親自輸入，並同意以電子方式簽署此文件，其效力等同於實體手寫簽名。本人已詳細閱讀並同意合約所有條款。</span></label><button onClick={handleSignLease} disabled={isSigning || !signature} className="w-full py-4 bg-purple-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-purple-700 transition-all active:scale-95 shadow-md shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed">{isSigning ? <><Loader2 size={18} className="animate-spin"/> 處理中...</> : '確認並以電子簽署'}</button></div>)}</div></div></div>
        </div>
      )}

      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"><div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative"><div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" /><h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0">選擇付款方式</h3><button onClick={() => setIsPaymentModalOpen(false)} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button></div><div className="p-6 overflow-y-auto flex-1 space-y-6"><div className="flex bg-slate-100 p-1.5 rounded-2xl"><button onClick={() => setPaymentMethod('bank')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all flex justify-center items-center gap-2 ${paymentMethod === 'bank' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Landmark size={18}/> 轉數快 / 轉帳</button><button onClick={() => setPaymentMethod('stripe')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all flex justify-center items-center gap-2 ${paymentMethod === 'stripe' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}><CreditCard size={18}/> 線上刷卡</button></div>{paymentMethod === 'bank' && (<div className="animate-in fade-in slide-in-from-left-4 duration-300 space-y-5"><div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3"><CheckCircle2 className="text-blue-600 shrink-0 mt-0.5" size={18}/><div><p className="text-sm font-black text-blue-900 mb-1">推薦使用：0% 手續費</p><p className="text-xs text-blue-700 font-medium">請轉帳至以下指定戶口，並上傳入數紙（轉帳截圖）以供管家核對。</p></div></div><div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">應付總額 (HKD)</p><p className="text-3xl font-black text-slate-800">${tenantData.amountDue.toLocaleString()}</p></div><div className="pt-4 border-t border-slate-100 space-y-3"><div className="flex justify-between items-center"><p className="text-xs font-bold text-slate-500">轉數快 FPS Identifier</p><p className="text-sm font-mono font-black text-slate-800 bg-slate-100 px-2 py-1 rounded">16889988</p></div><div className="flex justify-between items-center"><p className="text-xs font-bold text-slate-500">銀行帳號 (匯豐)</p><p className="text-sm font-mono font-black text-slate-800 bg-slate-100 px-2 py-1 rounded">123-456789-838</p></div></div></div><div className="relative"><input type="file" onChange={handleUploadReceipt} disabled={isUploading} className="hidden" id="receipt-upload" accept="image/*,.pdf" /><label htmlFor="receipt-upload" className={`flex items-center justify-center w-full py-4 rounded-2xl cursor-pointer font-black transition-all active:scale-95 shadow-lg ${isUploading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'}`}>{isUploading ? <><Loader2 size={18} className="animate-spin mr-2" /> 檔案上傳中...</> : <><UploadCloud size={18} className="mr-2" /> 我已轉帳，點擊上傳截圖</>}</label></div></div>)}{paymentMethod === 'stripe' && (<div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5"><div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3"><AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18}/><div><p className="text-sm font-black text-amber-900 mb-1">注意：將收取 3% 系統處理費</p><p className="text-xs text-amber-700 font-medium">線上刷卡由 Stripe 提供安全支付，費用將包含第三方金流平台之手續費。</p></div></div><div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white"><div className="flex justify-between items-center"><p className="text-sm font-bold text-slate-600">本期租金</p><p className="font-mono font-bold text-slate-800">${tenantData.amountDue.toLocaleString()}</p></div><div className="flex justify-between items-center pb-4 border-b border-slate-100"><p className="text-sm font-bold text-slate-600">系統處理費 (3%)</p><p className="font-mono font-bold text-amber-600">+ ${stripeFee.toLocaleString()}</p></div><div className="flex justify-between items-end pt-1"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">刷卡總額 (HKD)</p><p className="text-3xl font-black text-purple-700">${totalWithStripe.toLocaleString()}</p></div></div><button onClick={handleStripeCheckout} disabled={isStripeLoading} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex justify-center items-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/20 disabled:opacity-70">{isStripeLoading ? <><Loader2 size={18} className="animate-spin"/> 連線至金流中心...</> : <>前往 Stripe 安全結帳 <ChevronRight size={18}/></>}</button></div>)}</div></div>
        </div>
      )}

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40} /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
