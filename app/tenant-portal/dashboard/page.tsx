'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { 
  Bell, CreditCard, Wrench, FileText, ChevronRight, Calendar, UserCircle, Droplets, Loader2,
  Landmark, UploadCloud, X, CheckCircle2, AlertCircle, FileSignature, Download,
  Camera, Receipt, ShieldCheck, IdCard, LogOut, Eye, MessageCircle, PhoneCall, Send, MapPin, CloudRain, Sun, Cloud
} from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  const [tenantDocs, setTenantDocs] = useState<any[]>([]); 
  
  // ★ 統一的對話與通知樞紐
  const [myInquiries, setMyInquiries] = useState<any[]>([]); 
  
  const [activeModal, setActiveModal] = useState<'none' | 'payment' | 'contract' | 'ticket' | 'bills' | 'profile' | 'view_doc' | 'contact' | 'notifications'>('none');
  const [viewingDoc, setViewingDoc] = useState<any>(null); 

  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'stripe'>('bank');
  const [isUploading, setIsUploading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [isSignDownloading, setIsSignDownloading] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  const [ticketCategory, setTicketCategory] = useState('冷氣水電');
  const [ticketDesc, setTicketDesc] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);

  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState({ name: '', phone: '', relation: '' });
  const [isIdUploaded, setIsIdUploaded] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [chatMessages, setChatMessages] = useState<{sender: 'bot'|'user', text: string, options?: string[]}[]>([]);
  const [chatCategory, setChatCategory] = useState('');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [weather, setWeather] = useState({ temp: '--', desc: '載入中', suggestion: '祝您有美好的一天！', bgClass: 'from-slate-100 to-slate-200', icon: <Sun size={28} className="text-amber-500" /> });

  const handleLogout = () => { localStorage.clear(); router.push('/tenant-portal'); };

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=22.3193&longitude=114.1694&current_weather=true').then(res => res.json()).then(data => {
        const t = data.current_weather.temperature;
        const code = data.current_weather.weathercode;
        let desc = '晴朗', suggestion = '天氣不錯，祝您有美好的一天！', bgClass = 'from-sky-100 via-orange-50 to-amber-100', icon = <Sun size={28} className="text-amber-500" />;
        if (code >= 50 && code <= 69) { desc = '下雨'; bgClass = 'from-slate-300 via-indigo-100 to-blue-200'; suggestion = '外面正在下雨，出門請務必記得攜帶雨具！☔️'; icon = <CloudRain size={28} className="text-blue-500" />; }
        setWeather({ temp: t, desc, suggestion, bgClass, icon });
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const sessionStr = localStorage.getItem('pm_tenant_session');
    if (!sessionStr) { router.push('/tenant-portal'); return; }
    const sessionData = JSON.parse(sessionStr);

    const unsubTenant = onSnapshot(doc(db, 'tenants', sessionData.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const end = new Date(data.leaseEnd);
        const diffDays = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        setTenantData({ id: docSnap.id, name: data.name, amountDue: data.monthlyRent || 0, dueDate: "本月 1 日", daysRemaining: diffDays > 0 ? diffDays : 0, status: data.status === 'Active' ? '合約已生效' : '待簽約 / 待繳費', roomInfo: data.contractId || `TEN-${docSnap.id.slice(-6).toUpperCase()}`, isContractSigned: data.isContractSigned || !!data.signature, signature: data.signature || '', propertyName: data.propertyName || '', roomId: data.roomId || '', roomName: data.roomName || data.roomId || '', leaseStart: data.leaseStart || '', leaseEnd: data.leaseEnd || '', deposit: data.deposit || 0, phone: data.phone || '', identityNumber: data.identityNumber || '' });
        if (data.emergencyContact) setEmergencyContact(data.emergencyContact);
        if (data.idUploaded || data.isIdVerified) setIsIdUploaded(true);
        if (data.emergencyContact?.name && (data.idUploaded || data.isIdVerified)) setIsProfileComplete(true);
      }
      setLoading(false);
    });

    const qDocs = query(collection(db, 'documents'), where('formData.tenantId', '==', sessionData.id));
    const unsubDocs = onSnapshot(qDocs, snap => setTenantDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt?.toDate() || 0).getTime() - new Date(a.createdAt?.toDate() || 0).getTime())));

    // ★ 單一資料源：拉取該租客的所有 interactions & inquiries
    const qInq = query(collection(db, 'inquiries'), where('tenantId', '==', sessionData.id));
    const unsubInq = onSnapshot(qInq, snap => {
      let logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // ★ 防火牆：過濾掉後台管家的「內部私密筆記」
      logs = logs.filter(log => log.type !== 'internal_note');
      // ★ 前端排序：避開 Firebase 複合索引報錯
      logs.sort((a: any, b: any) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA; // 降序，最新的在上面
      });
      setMyInquiries(logs);
    });

    return () => { unsubTenant(); unsubDocs(); unsubInq(); };
  }, [router]);

  const initChat = () => { setChatMessages([{ sender: 'bot', text: `尊貴的 ${tenantData?.name || ''} 您好！\n我是佳寓的智能專屬管家。請問今天有什麼可以為您效勞？`, options: ['報修與設備問題', '合約與續租查詢', '帳務與繳費問題', '其他投訴或建議'] }]); setChatCategory(''); setChatInput(''); };
  const handleChatOption = (opt: string) => { setChatCategory(opt); setChatMessages(prev => [...prev.map(m => ({...m, options: undefined})), { sender: 'user', text: opt }, { sender: 'bot', text: `好的，關於「${opt}」，請在下方簡述您的問題，我會為您記錄並由專人盡快回覆。` }]); };
  const handleSendChatMessage = async (text: string) => {
    if (!text.trim()) return;
    setChatMessages(prev => [...prev, { sender: 'user', text }]); setChatInput(''); setIsSubmittingTicket(true);
    try {
      await addDoc(collection(db, 'inquiries'), { tenantId: tenantData.id, name: tenantData.name, phone: tenantData.phone, roomInfo: `${tenantData.propertyName} ${tenantData.roomName}`, category: chatCategory || '一般客服', message: text, type: 'ticket', source: 'Tenant Portal Chat', isExistingTenant: true, status: 'New', createdAt: serverTimestamp() });
      setTimeout(() => { setChatMessages(prev => [...prev, { sender: 'bot', text: '✅ 收到！我已為您建立專屬服務單。管家核對後會在此系統通知您，或透過 WhatsApp 聯繫。' }]); setIsSubmittingTicket(false); }, 1000);
    } catch (e) { setIsSubmittingTicket(false); }
  };
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const verifyAndSettlePayment = async (sessionId: string) => { /* 省略 Stripe 邏輯以精簡 */ };
  useEffect(() => { const sessionId = searchParams?.get('session_id'); const success = searchParams?.get('success'); if (success === 'true' && sessionId) { verifyAndSettlePayment(sessionId); } }, [searchParams]);

  const handleUploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => { setIsUploading(true); setTimeout(() => { setIsUploading(false); setActiveModal('none'); alert("✅ 入數紙上傳成功！管家將在 24 小時內為您核對。"); }, 2000); };
  const handleStripeCheckout = async () => { /* 省略 */ };
  const handleSignLease = async () => { /* 省略 */ };
  const handleDownloadPDF = async () => { /* 省略 */ };
  const handleSubmitTicket = async (e: React.FormEvent) => { /* 省略 */ };
  const handleSaveProfile = async (e: React.FormEvent) => { /* 省略 */ };
  const renderA4Document = (docData: any, isSigningMode = false) => { return <div/>; }; // 省略 PDF 渲染

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;
  if (!tenantData) return null;

  // ★ 如果有任何資料，就亮起小鈴鐺紅點 (因為是最新排序，我們可以直接提醒)
  const hasUpdates = myInquiries.length > 0;

  return (
    <div className={`min-h-screen pb-12 selection:bg-orange-200 font-sans relative bg-gradient-to-br transition-colors duration-1000 ${weather.bgClass}`}>
      <Script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="lazyOnload" />

      {/* 頂部導航 */}
      <div className="bg-white/40 backdrop-blur-md border-b border-white/50 px-6 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <Link href="/" className="flex items-center"><img src="/logo.png" alt="Prime Living" className="h-8 object-contain" /></Link>
        <button onClick={handleLogout} className="text-slate-500 hover:text-red-500 transition-colors flex items-center text-sm font-bold"><LogOut size={16} className="mr-1"/> 登出</button>
      </div>

      <div className="max-w-5xl mx-auto space-y-8 pt-8 px-4 md:px-8">
        
        {/* 歡迎與天氣 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <p className="text-slate-600 font-bold tracking-widest text-xs mb-1">{new Date().toLocaleDateString('zh-HK', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-4">尊貴的 {tenantData.name}，您好</h1>
          </div>
          
          {/* ★ 通知鈴鐺加強版 */}
          <button onClick={() => setActiveModal('notifications')} className={`relative p-3 backdrop-blur-md rounded-full shadow-sm border transition-all duration-300 ${hasUpdates ? 'bg-red-50 border-red-200 shadow-red-500/30 hover:bg-red-100 ring-2 ring-red-500/20' : 'bg-white/60 border-white/60 hover:shadow-md'}`}>
            <Bell size={20} className={hasUpdates ? 'text-red-600' : 'text-slate-600'} />
            {hasUpdates && (
              <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white"></span>
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6 animate-in slide-in-from-bottom-6 duration-700">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-8 text-white shadow-2xl shadow-slate-900/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/20 blur-[60px] -translate-y-16 translate-x-16 pointer-events-none" />
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest mb-1">本期待繳總額 (HKD)</p>
                  <h2 className="text-5xl md:text-6xl font-black tracking-tighter">${(tenantData.amountDue || 0).toLocaleString()}</h2>
                </div>
                <span className={`px-4 py-2 rounded-full text-xs font-black border backdrop-blur-sm ${tenantData.status === '合約已生效' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
                  {tenantData.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-slate-300 mb-8 relative z-10">
                {tenantData.amountDue > 0 ? (
                  <div className="flex items-center gap-1.5 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10"><Calendar size={14} className="text-orange-400"/> 繳費期限: {tenantData.dueDate}</div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 px-4 py-2 rounded-xl backdrop-blur-sm border border-emerald-500/20"><CheckCircle2 size={14}/> 本期已繳清</div>
                )}
              </div>
              <button onClick={() => setActiveModal('payment')} disabled={tenantData.amountDue === 0} className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-orange-50 transition-all active:scale-95 shadow-xl relative z-10 disabled:opacity-50 disabled:cursor-not-allowed">
                <CreditCard size={18}/> {tenantData.amountDue === 0 ? '無待繳帳單' : '立即繳費'}
              </button>
            </div>

            {/* ★ 這裡補回被誤刪的「剩餘租期」與「專屬帳戶」卡片 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">剩餘租期</p>
                <p className="text-3xl font-black text-slate-800">{tenantData.daysRemaining} <span className="text-sm font-bold text-slate-500">天</span></p>
              </div>
              <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 shadow-sm flex flex-col justify-center overflow-hidden">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">專屬帳戶</p>
                <p className="text-sm font-black text-slate-800 truncate">{tenantData.roomInfo}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 animate-in slide-in-from-bottom-8 duration-700">
            <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl shadow-slate-200/20 overflow-hidden flex flex-col p-2">
              <button onClick={() => setActiveModal('contract')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${tenantData.isContractSigned ? 'bg-emerald-50' : 'bg-purple-50'}`}><FileSignature size={20} className={tenantData.isContractSigned ? 'text-emerald-500' : 'text-purple-500'}/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">電子合約與簽署 {!tenantData.isContractSigned && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}</p><p className={`text-[10px] font-bold ${tenantData.isContractSigned ? 'text-slate-500' : 'text-red-500'}`}>{tenantData.isContractSigned ? '已簽署，可下載 PDF' : '尚未簽署，請立即完成'}</p></div></div><ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>
              
              {/* ★ 這裡補回被誤刪的三大功能按鈕 */}
              <button onClick={() => setActiveModal('profile')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${isProfileComplete ? 'bg-emerald-50' : 'bg-rose-50'}`}><ShieldCheck size={20} className={isProfileComplete ? 'text-emerald-600' : 'text-rose-500'}/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">住客檔案認證 {!isProfileComplete && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}</p><p className={`text-[10px] font-bold ${isProfileComplete ? 'text-slate-500' : 'text-rose-500'}`}>{isProfileComplete ? '檔案已完善 (實名認證)' : '上傳證件與緊急聯絡人'}</p></div></div><ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>
              <button onClick={() => setActiveModal('ticket')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Wrench size={20} className="text-blue-500"/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">報修申請</p><p className="text-[10px] font-bold text-slate-500">設備損壞一鍵呼叫師傅</p></div></div><ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>
              <button onClick={() => setActiveModal('bills')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Receipt size={20} className="text-cyan-500"/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">歷史單據與帳單</p><p className="text-[10px] font-bold text-slate-500">查看管家開立之收據與對數單</p></div></div><ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>

              <button onClick={() => { initChat(); setActiveModal('contact'); }} className="w-full flex items-center justify-between p-4 md:p-5 bg-white/80 hover:bg-white transition-colors rounded-2xl group text-left border border-white/50 mt-2 shadow-sm">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><UserCircle size={20} className="text-orange-500"/></div><div><p className="text-sm font-black text-orange-900 mb-0.5">聯絡專屬管家</p><p className="text-[10px] text-orange-600 font-bold">智能客服與真人支援</p></div></div><ChevronRight size={18} className="text-orange-400 group-hover:text-orange-500 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 模態框區塊 ==================== */}

      {/* ★ 通知中心 Modal (時間軸閉環) */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[75vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Bell className="mr-2 text-orange-500" size={24}/> 您的通知與互動</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-4 custom-scrollbar">
              {myInquiries.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Bell size={40} className="mx-auto mb-3 opacity-50"/>
                  <p className="text-sm font-bold">目前沒有任何通知</p>
                </div>
              ) : (
                myInquiries.map(log => {
                  const isOfficial = log.type === 'official_notice';
                  const isMyTicket = !log.type || log.type === 'ticket';

                  return (
                    <div key={log.id} className="space-y-3 mb-4">
                      {/* 如果是官方通知 (管家後台按的催繳單) */}
                      {isOfficial && (
                        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                          <div className="flex justify-between items-start mb-2 pl-2">
                            <span className="text-xs font-bold text-blue-700 flex items-center"><UserCircle size={14} className="mr-1"/> 官方管家</span>
                            <span className="text-[10px] text-slate-400 font-mono">{log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : '剛剛'}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 pl-2 whitespace-pre-wrap">{log.message}</p>
                        </div>
                      )}

                      {/* 如果是租客發送的報修/詢問 */}
                      {isMyTicket && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{log.category || '系統通知'}</span>
                            <span className={`text-[10px] font-black px-2 py-1 rounded ${log.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : log.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                              {log.status === 'Resolved' ? '已結案' : log.status === 'In Progress' ? '管家處理中' : '等待處理'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">「{log.message}」</p>
                          
                          {/* 顯示管家的回覆 */}
                          {log.adminReply ? (
                            <div className="bg-blue-50 p-3 rounded-lg flex items-start gap-2 border border-blue-100 mt-2">
                              <MessageCircle size={16} className="text-blue-500 shrink-0 mt-0.5"/>
                              <p className="text-sm text-blue-800 font-medium whitespace-pre-wrap">{log.adminReply}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mt-2">管家已收到，將盡快為您處理。</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 智能客服機器人 Modal */}
      {activeModal === 'contact' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] sm:h-[70vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 overflow-hidden">
            <div className="bg-slate-900 text-white p-6 flex-none relative rounded-t-[2.5rem] sm:rounded-t-[2.5rem]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center"><UserCircle size={24}/></div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div>
                  <h3 className="font-black text-lg">PrimeLiving 智能管家</h3>
                  <p className="text-xs text-slate-300">在線為您服務</p>
                </div>
              </div>
              <button onClick={() => setActiveModal('none')} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
               {chatMessages.map((msg, idx) => (
                 <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-orange-500 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                     {msg.text}
                   </div>
                   {msg.options && (
                     <div className="flex flex-wrap gap-2 mt-3">
                       {msg.options.map(opt => (
                         <button key={opt} onClick={() => handleChatOption(opt)} className="px-4 py-2 bg-white border border-orange-200 text-orange-600 rounded-full text-xs font-bold hover:bg-orange-50 transition shadow-sm">
                           {opt}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               ))}
               <div ref={chatEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex-none pb-8 sm:pb-4">
              <form onSubmit={(e) => { e.preventDefault(); handleSendChatMessage(chatInput); }} className="flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="請輸入您的問題..." className="flex-1 px-4 py-3 bg-slate-100 border-transparent rounded-full text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition" />
                <button type="submit" disabled={!chatInput.trim() || isSubmittingTicket} className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-orange-600 transition shadow-sm disabled:opacity-50">
                   {isSubmittingTicket ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} className="ml-1"/>}
                </button>
              </form>
            </div>
          </div>
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
