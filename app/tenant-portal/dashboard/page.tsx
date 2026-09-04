'use client';

import React, { useEffect, useState, Suspense, useRef, useMemo } from 'react';
import { 
  Bell, CreditCard, Wrench, FileText, ChevronRight, Calendar, UserCircle, Droplets, Loader2,
  Landmark, UploadCloud, X, CheckCircle2, AlertCircle, FileSignature, Download,
  Camera, Receipt, ShieldCheck, IdCard, LogOut, Eye, MessageCircle, PhoneCall, Send, MapPin, CloudRain, Sun, Cloud,
  CheckSquare, Square, ChevronDown, ChevronUp, Clock, Edit3, Trash2, ArrowLeft, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, where, orderBy, setDoc, getDoc, getDocs, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';
import ContractTemplate, { ContractData } from '@/components/ContractTemplate';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';

// 財務精確計算 (單位：分 Cents) - 避免 JS 浮點數誤差
const toCents = (amount: number | string) => Math.round((Number(amount) || 0) * 100);
const fromCents = (cents: number) => cents / 100;

// 安全時間戳解析器
const getSafeTime = (val: any): number => {
  if (!val) return 0;
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  const t = new Date(val).getTime();
  return isNaN(t) ? 0 : t;
};

// ★ 提取中文期數轉為數字以便排序 (第一期 -> 1)
const getPeriodNumber = (title: string) => {
  const match = title.match(/第([一二三四五六七八九十\d]+)期/);
  if (!match) return 999;
  const numMap: Record<string, number> = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10 };
  return numMap[match[1]] || parseInt(match[1]) || 999;
};

// ★ 純前端圖片壓縮模組 (確保上傳圖片小於 150KB)
const compressImage = (file: File, maxSizeKB = 150): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf' || !file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) return reject(new Error("PDF 檔案請勿超過 5MB"));
      return resolve(file);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_DIM = 1200;
        if (width > height && width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } 
        else if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
        
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let currentSizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

        while (currentSizeKB > maxSizeKB && quality > 0.1) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          currentSizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        }

        fetch(dataUrl).then(res => res.blob()).then(blob => {
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg', lastModified: Date.now() }));
        }).catch(() => resolve(file)); 
      };
    };
    reader.onerror = () => resolve(file); 
  });
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  const [tenantDocs, setTenantDocs] = useState<any[]>([]); 
  const [myInquiries, setMyInquiries] = useState<any[]>([]); 
  // ★ 新增：專門用來存放該租客在大系統建立的「工單 (Tickets)」
  const [myTickets, setMyTickets] = useState<any[]>([]);
  
  const [activeModal, setActiveModal] = useState<'none' | 'payment' | 'contract' | 'ticket' | 'bills' | 'profile' | 'view_doc' | 'contact' | 'notifications'>('none');
  const [viewingDoc, setViewingDoc] = useState<any>(null); 

  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'paydollar'>('bank');
  const [isUploading, setIsUploading] = useState(false);
  const [isPayDollarLoading, setIsPayDollarLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [selectedOptionalBillIds, setSelectedOptionalBillIds] = useState<string[]>([]);
  const [showBillDetails, setShowBillDetails] = useState(true);

  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [isSignDownloading, setIsSignDownloading] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  // ★ 報修模組狀態擴充
  const [ticketTab, setTicketTab] = useState<'submit' | 'history'>('submit');
  const [ticketCategory, setTicketCategory] = useState('一般維修'); // 對齊大系統
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPhoto, setTicketPhoto] = useState<File | null>(null);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);
  const [viewingTicket, setViewingTicket] = useState<any>(null);
  const [ticketComment, setTicketComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState({ name: '', phone: '', relation: '' });
  const [isIdUploaded, setIsIdUploaded] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [surrenderStep, setSurrenderStep] = useState<1 | 2>(1);
  const [moveOutDate, setMoveOutDate] = useState('');
  const [surrenderReason, setSurrenderReason] = useState('');
  const [surrenderFiles, setSurrenderFiles] = useState<File[]>([]);
  const [isSubmittingSurrender, setIsSubmittingSurrender] = useState(false);
  const surrenderSigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [idType, setIdType] = useState('HKID'); 
  const [idFile, setIdFile] = useState<File | null>(null);

  const [chatMessages, setChatMessages] = useState<{sender: 'bot'|'user', text: string, options?: string[]}[]>([]);
  const [chatCategory, setChatCategory] = useState('');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [weather, setWeather] = useState({ temp: '--', desc: '載入中', suggestion: '祝您有美好的一天！', bgClass: 'from-slate-100 to-slate-200', icon: <Sun size={28} className="text-amber-500" /> });

  const handleLogout = () => { localStorage.clear(); router.push('/tenant-portal'); };
  
  const [showSigPad, setShowSigPad] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.beginPath(); ctx.moveTo(x, y); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; }
  };

  const draw = (e: any) => {
    if (!isDrawing || !sigCanvasRef.current) return;
    const rect = sigCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    const ctx = sigCanvasRef.current.getContext('2d');
    if (ctx) { ctx.lineTo(x, y); ctx.stroke(); }
  };

  const stopDrawing = () => setIsDrawing(false);
  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleConfirmSignature = async () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const base64Image = canvas.toDataURL('image/png');
    
    setIsSigning(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await updateDoc(doc(db, 'tenants', tenantData.id), { signature: base64Image, signedAt: todayStr, isContractSigned: true, status: 'Active', updatedAt: serverTimestamp() });
      if (latestLease?.id) {
        await updateDoc(doc(db, 'documents', latestLease.id), { 'formData.tenantSignature': base64Image, 'formData.signedAt': todayStr, status: 'Signed', updatedAt: serverTimestamp() });
      }
      setTenantData((prev: any) => ({ ...prev, isContractSigned: true, signature: base64Image, signedAt: todayStr }));
      setShowSigPad(false);
      alert("✅ 合約手寫簽署成功！已生成法定簽名印於合約，並同步至大後台。");
    } catch (error) { alert("❌ 簽署失敗，請檢查網路狀態。"); } finally { setIsSigning(false); }
  };

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=22.3193&longitude=114.1694&current_weather=true')
      .then(res => res.json())
      .then(data => {
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

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/tenant-data?tenantId=${sessionData.id}`);
        if (res.ok) {
          const { documents, inquiries } = await res.json();
          const sortedDocs = documents.sort((a: any, b: any) => {
             const timeA = getSafeTime(a.formData?.docDate || a.formData?.dueDate || a.createdAt);
             const timeB = getSafeTime(b.formData?.docDate || b.formData?.dueDate || b.createdAt);
             if (timeA !== timeB) return timeA - timeB;
             return getPeriodNumber(a.formData?.items?.[0]?.description || '') - getPeriodNumber(b.formData?.items?.[0]?.description || '');
          });
          setTenantDocs(sortedDocs);
          setMyInquiries(inquiries.sort((a: any, b: any) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt)));
        }
      } catch (error) { console.error("資料加載失敗:", error); }
    };

    // ★ 監聽租客對應的大系統工單 (Tickets)
    const qTickets = query(collection(db, 'tickets'), where('tenantId', '==', sessionData.id));
    const unsubTickets = onSnapshot(qTickets, (snapshot) => {
      const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      tickets.sort((a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));
      setMyTickets(tickets);
    });

    const unsubTenant = onSnapshot(doc(db, 'tenants', sessionData.id), (docSnap) => {
      if (!docSnap.exists()) {
        localStorage.removeItem('pm_tenant_session');
        router.push('/tenant-portal');
        return;
      }

      const data = docSnap.data();
      const end = new Date(data.leaseEnd || new Date());
      const diffDays = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const resolvedIdNumber = data.identityNumber || data.idNumber || data.hkid || data.passportNo || '未提供';

      setTenantData({ 
        id: docSnap.id, 
        email: data.email || '', 
        name: data.name, 
        daysRemaining: diffDays > 0 ? diffDays : 0, 
        status: data.status === 'Active' ? '合約已生效' : '待簽約 / 待繳費', 
        roomInfo: data.contractId || `TEN-${docSnap.id.slice(-6).toUpperCase()}`, 
        isContractSigned: (!!data.signature && data.signature.length > 50) || data.isContractSigned === true || data.isPhysicalSigned === true, 
        signature: data.signature || '', 
        signedAt: data.signedAt || '',
        propertyName: data.propertyName || '', 
        propertyId: data.propertyId || '', // ★ 加入 propertyId 供報修關聯
        roomId: data.roomId || '', 
        roomName: data.roomName || data.roomId || '', 
        leaseStart: data.leaseStart || '', 
        leaseEnd: data.leaseEnd || '', 
        deposit: data.deposit || 0, 
        phone: data.phone || '', 
        identityNumber: resolvedIdNumber,
        isPhysicalSigned: data.isPhysicalSigned || false,
        university: data.university || data.school || '',
        degree: data.degree || data.studyLevel || data.program || '',
        occupation: data.occupation || ''
      });

      if (data.emergencyContact) setEmergencyContact(data.emergencyContact);
      if (data.idUploaded || data.isIdVerified || data.idCardUrl) setIsIdUploaded(true);
      if (data.emergencyContact?.name && (data.idUploaded || data.isIdVerified || data.idCardUrl)) setIsProfileComplete(true);
      setLoading(false);
    });

    fetchData(); 
    const interval = setInterval(fetchData, 30000); 
    return () => { unsubTenant(); unsubTickets(); clearInterval(interval); };
  }, [router]);

  useEffect(() => {
    if (tenantDocs.length > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const thirtyDaysLater = new Date(today); thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30); thirtyDaysLater.setHours(23, 59, 59, 999);
      const autoSelectIds: string[] = [];

      tenantDocs.forEach(item => {
        if (item.status === 'Completed' || item.status === 'Paid' || item.paymentStatus === 'Paid' || item.paymentStatus === 'Under Review') return;
        let dueDateStr = item.formData?.docDate || item.formData?.dueDate || new Date().toISOString().split('T')[0];
        const dueDate = new Date(dueDateStr); dueDate.setHours(0, 0, 0, 0);
        if (dueDate > today && dueDate <= thirtyDaysLater) autoSelectIds.push(item.id);
      });
      setSelectedOptionalBillIds(autoSelectIds);
    }
  }, [tenantDocs]);

  const billingSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today); thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30); thirtyDaysLater.setHours(23, 59, 59, 999);

    const pendingDocs = tenantDocs.filter(d => !['Completed', 'Paid'].includes(d.status) && !['Paid', 'Under Review'].includes(d.paymentStatus));

    const allBills = pendingDocs.map(item => {
      const fd = item.formData || {};
      let baseAmount = Number(fd.totalAmount) || Number(fd.amount) || 0;
      
      let dueDateStr = fd.docDate || fd.dueDate || new Date().toISOString().split('T')[0];
      const dueDate = new Date(dueDateStr); dueDate.setHours(0, 0, 0, 0);
      
      const isOverdue = dueDate < today;
      let lateFee = 0;
      let isOverdue30 = false;
      
      if (isOverdue) {
         const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
         if (daysOverdue >= 30) {
            lateFee = Math.round(baseAmount * 0.05);
            isOverdue30 = true;
         }
      }

      const totalAmount = baseAmount + lateFee;

      return { 
        id: item.id, 
        title: fd.items?.[0]?.description || (item.type === 'Receipt' ? '繳款正式收據' : '待繳帳單'), 
        amount: totalAmount, 
        amountCents: toCents(totalAmount), 
        dueDateStr, 
        dueDate, 
        isOverdue,
        isOverdue30,
        isDueToday: dueDate.getTime() === today.getTime() 
      };
    });

    allBills.sort((a, b) => {
      const timeDiff = a.dueDate.getTime() - b.dueDate.getTime();
      if (timeDiff !== 0) return timeDiff;
      return getPeriodNumber(a.title) - getPeriodNumber(b.title);
    });

    const PAYDOLLAR_LIMIT_CENTS = 100000 * 100; 
    let currentCheckoutCents = 0;
    const currentCheckoutBillIds: string[] = [];
    let isSplitNeeded = false;

    for (const bill of allBills) {
      const isMandatory = bill.isOverdue || bill.isDueToday;
      const isSelected = isMandatory || selectedOptionalBillIds.includes(bill.id);

      if (isSelected) {
        if (currentCheckoutCents + bill.amountCents > PAYDOLLAR_LIMIT_CENTS) {
          isSplitNeeded = true;
          continue; 
        }
        currentCheckoutBillIds.push(bill.id);
        currentCheckoutCents += bill.amountCents;
      }
    }

    return {
      grandTotal: fromCents(allBills.reduce((sum, b) => sum + b.amountCents, 0)),
      checkoutTotal: fromCents(currentCheckoutCents), 
      checkoutBillIds: currentCheckoutBillIds,        
      isSplitNeeded,                                  
      allPendingBills: allBills, 
      hasOverdue: allBills.some(b => b.isOverdue)
    };
  }, [tenantDocs, selectedOptionalBillIds]);

  const initChat = () => { 
    setChatMessages([{ sender: 'bot', text: `尊貴的 ${tenantData?.name || ''} 您好！\n我是佳寓的智能專屬管家。請問今天有什麼可以為您效勞？`, options: ['報修與設備問題', '合約與續租查詢', '帳務與繳費問題', '其他投訴或建議'] }]); 
    setChatCategory(''); setChatInput(''); 
  };

  const handleChatOption = (opt: string) => { 
    setChatCategory(opt); 
    setChatMessages(prev => [...prev.map(m => ({...m, options: undefined})), { sender: 'user', text: opt }, { sender: 'bot', text: `好的，關於「${opt}」，請在下方簡述您的問題，我會為您記錄並由專人盡快回覆。` }]); 
  };

  const handleSendChatMessage = async (text: string) => {
    if (!text.trim()) return;
    setChatMessages(prev => [...prev, { sender: 'user', text }]); setChatInput(''); setIsSubmittingTicket(true);
    try {
      await addDoc(collection(db, 'inquiries'), { /* ...原有屬性... */ });
      
      // ★ 新增：發送推播通知給管家與銷售
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '💬 收到新租客客服訊息',
          body: `${tenantData.name} (${tenantData.roomName}): ${text}`,
          targetRoles: ['管家', '銷售', 'admin'],
          url: '/admin/inquiries'
        })
      }).catch(console.error); // catch 避免影響前端流程

      setTimeout(() => { setChatMessages(prev => [...prev, { sender: 'bot', text: '✅ 收到！我已為您記錄並通知管家。' }]); setIsSubmittingTicket(false); }, 1000);
    } catch (e) { setIsSubmittingTicket(false); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const verifyPayDollarPayment = async (orderRef: string) => {
    setIsVerifying(true);
    try {
      const payingBillIds = billingSummary.checkoutBillIds;
      const exactPayingTotal = billingSummary.checkoutTotal; 
      const response = await fetch('/api/paydollar/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef, tenantId: tenantData?.id, tenantName: tenantData?.name, roomInfo: tenantData?.roomInfo, fallbackAmount: exactPayingTotal > 0 ? exactPayingTotal : undefined, billIds: payingBillIds.length > 0 ? payingBillIds : undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '無法完成核銷手續');
      setSelectedOptionalBillIds([]);
      if (typeof window !== 'undefined') window.history.replaceState(null, '', '/tenant-portal/dashboard');
      alert("🎉 付款成功！系統已自動為您核銷帳單並開立收據，財務系統與後台皆已同步。");
    } catch (error: any) {
      alert(`⚠️ 核銷異常: ${error.message}。請保留付款明細並聯繫管家。`);
      router.replace('/tenant-portal/dashboard');
    } finally { setIsVerifying(false); }
  };

  useEffect(() => { 
    const orderRef = searchParams?.get('orderRef'); const success = searchParams?.get('success'); const failed = searchParams?.get('failed');
    if (success === 'true' && orderRef) verifyPayDollarPayment(orderRef); 
    if (failed === 'true') { alert("❌ 支付失敗或已取消，請確認您的信用卡狀態後重試。"); router.replace('/tenant-portal/dashboard'); }
  }, [searchParams]);

  const latestLease = tenantDocs.find(d => d.type === 'Lease');
  const otherBills = tenantDocs.filter(d => ['Receipt', 'Statement'].includes(d.type));

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !tenantData) return;
    setIsUploading(true);
    try {
      const payingBillIds = billingSummary.checkoutBillIds;
      const amount = billingSummary.checkoutTotal;
      await addDoc(collection(db, 'inquiries'), { tenantId: tenantData.id, name: tenantData.name || '', phone: tenantData.phone || '', roomInfo: `${tenantData.propertyName} ${tenantData.roomName}`, category: '轉帳付款核對', message: `租客已上傳轉帳/FPS截圖，申報繳付總額：$${amount.toLocaleString()} (包含 ${payingBillIds.length} 筆帳單)。請管家對帳後開立收據。`, type: 'ticket', status: 'In Progress', amount: amount, billIds: payingBillIds, createdAt: serverTimestamp() });
      for (const billId of payingBillIds) { await updateDoc(doc(db, 'documents', billId), { paymentStatus: 'Under Review', updatedAt: serverTimestamp() }); }
      alert("✅ 入數紙已成功送出！管家將於 24 小時內確認銀行進帳並開立收據。"); setActiveModal('none');
    } catch (error: any) { alert("上傳失敗，請稍後再試或聯繫管家。"); } finally { setIsUploading(false); }
  };

  const handlePayDollarCheckout = async () => {
    if (!tenantData || billingSummary.checkoutTotal <= 0) return alert("目前沒有需要繳納的金額。");
    setIsPayDollarLoading(true);
    const payingBillIds = billingSummary.checkoutBillIds;
    const amount = billingSummary.checkoutTotal;
    const orderRef = `ORD-${tenantData.id.substring(0, 5).toUpperCase()}-${Date.now()}`;
    try {
      await setDoc(doc(db, 'transactions', orderRef), { orderRef, tenantId: tenantData.id, tenantName: tenantData.name, roomInfo: `${tenantData.propertyName} - ${tenantData.roomName}`, amount: amount, billIds: payingBillIds, status: 'Pending', gateway: 'PayDollar', createdAt: serverTimestamp() });
      const response = await fetch('/api/paydollar/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountDue: amount, tenantId: tenantData.id, tenantName: tenantData.name, roomInfo: `${tenantData.propertyName} - ${tenantData.roomName}`, returnUrl: window.location.origin, orderRef, payMethod: 'ALL' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '無法生成支付請求');
      const form = document.createElement('form'); form.method = 'POST'; form.action = data.paymentPayload.endpoint;
      Object.entries(data.paymentPayload).forEach(([key, value]) => {
        if (key !== 'endpoint' && key !== 'pMethod' && value !== undefined && value !== null) {
          const input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = String(value); form.appendChild(input);
        }
      });
      document.body.appendChild(form); form.submit();
    } catch (error: any) { alert("連線金流系統出錯：" + error.message); setIsPayDollarLoading(false); }
  };

  const handleDownloadPDF = async () => {
    if (!contractRef.current) return;
    const htmlToImage = (window as any).htmlToImage; const jspdfObj = (window as any).jspdf;
    if (!htmlToImage || !jspdfObj) return alert("⚠️ 系統準備中，請稍後再試！");
    setIsSignDownloading(true);
    try {
      const element = contractRef.current;
      const imgData = await htmlToImage.toPng(element, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff', width: 794, height: 1123, cacheBust: true, filter: (node: HTMLElement) => (node instanceof HTMLImageElement ? node.complete && node.naturalWidth > 0 : true), style: { transform: 'none', transformOrigin: 'top left', margin: '0', position: 'relative' } });
      const pdf = new jspdfObj.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Contract_${tenantData.name}.pdf`);
    } catch (error) { alert("生成 PDF 失敗，請確認網路穩定或稍後再試。"); } finally { setIsSignDownloading(false); }
  };

  // ★ 全新整合的「提交報修單 (大系統 Ticket)」邏輯
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketDesc.trim()) return alert("請描述損壞情況！");
    setIsSubmittingTicket(true);
    try {
      let photoUrl = '';
      if (ticketPhoto) {
        const storage = getStorage();
        const compressedFile = await compressImage(ticketPhoto);
        const photoRef = ref(storage, `tickets/${tenantData.id}_${Date.now()}_${compressedFile.name}`);
        await uploadBytesResumable(photoRef, compressedFile);
        photoUrl = await getDownloadURL(photoRef);
      }

      // 寫入大系統專用的 `tickets` 表
      await addDoc(collection(db, 'tickets'), { 
        propertyId: tenantData.propertyId || '', // 關聯盤源
        roomId: tenantData.roomId || '',         // 關聯房間
        tenantId: tenantData.id,                 // 關聯租客
        type: 'Repair',                          // 固定為一般維修
        title: `[租客提報] ${ticketCategory}`,
        description: ticketDesc, 
        priority: 'Medium',                      // 預設中等優先級
        status: 'Open',                          // 預設待處理
        photoUrl: photoUrl,
        comments: [],                            // 初始化留言陣列
        createdAt: serverTimestamp() 
      });

      // ★ 新增：發送報修推播給管家
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔧 收到新報修工單',
          body: `租客 ${tenantData.name} 提報了「${ticketCategory}」`,
          targetRoles: ['管家', 'admin'], // 報修通常只推給管家/工程
          url: '/admin/tickets'
        })
      }).catch(console.error);
      
      alert("✅ 報修單已成功送出！您可在「我的報修紀錄」中隨時查看進度。"); 
      setTicketDesc(''); 
      setTicketPhoto(null); 
      setIsPhotoUploaded(false); 
      setTicketCategory('一般維修');
      setTicketTab('history'); // 自動切換到歷史紀錄頁籤
    } catch (error) { alert("報修失敗，請檢查網路連線。"); } finally { setIsSubmittingTicket(false); }
  };

  // ★ 租客新增留言 (Comment) 邏輯
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketComment.trim() || !viewingTicket) return;
    setIsSubmittingComment(true);
    try {
      const ticketRef = doc(db, 'tickets', viewingTicket.id);
      const newComment = {
        sender: 'Tenant',
        name: tenantData.name,
        text: ticketComment,
        timestamp: new Date().toISOString()
      };
      await updateDoc(ticketRef, {
        comments: arrayUnion(newComment),
        updatedAt: serverTimestamp()
      });

      // ★ 新增：發送留言推播給管家
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '💬 報修單有新留言',
          body: `${tenantData.name}: ${ticketComment}`,
          targetRoles: ['管家', 'admin'],
          url: '/admin/tickets'
        })
      }).catch(console.error);
      
      // 更新本地狀態讓畫面立即反應
      setViewingTicket({
        ...viewingTicket,
        comments: [...(viewingTicket.comments || []), newComment]
      });
      setTicketComment('');
    } catch (error) {
      alert("留言失敗，請稍後再試。");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyContact.name || !emergencyContact.phone) return alert("請填寫緊急聯絡人！");
    if (!idFile) return alert("請上傳證件圖檔或PDF！");
    setIsSavingProfile(true);
    try {
      const storage = getStorage();
      const compressedFile = await compressImage(idFile);
      const idRef = ref(storage, `tenants/${tenantData.id}/kyc/${idType}_${Date.now()}_${compressedFile.name}`);
      await uploadBytesResumable(idRef, compressedFile);
      const fileUrl = await getDownloadURL(idRef);
      await updateDoc(doc(db, 'tenants', tenantData.id), { emergencyContact, idCardUrl: fileUrl, idUploaded: true, isIdVerified: true, kycUpdatedAt: serverTimestamp() });
      setIsProfileComplete(true); alert("✅ KYC 檔案已成功上傳！系統已自動處理並安全存檔。"); setActiveModal('none');
    } catch (error: any) { alert(`上傳失敗: ${error.message}`); } finally { setIsSavingProfile(false); }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return alert("請寫下您的評價建議！");
    setIsSubmittingReview(true);
    
    try {
      const lastName = tenantData.name ? tenantData.name.charAt(0) : '某';
      const displayAliasName = `${lastName}同學`;

      let identityStr = '佳寓認證租客';
      if (tenantData.university) {
        identityStr = `${tenantData.university}${tenantData.degree || '學生'}`;
      } else if (tenantData.occupation) {
        identityStr = tenantData.occupation;
      }

      await addDoc(collection(db, 'testimonials'), {
        tenantId: tenantData.id,
        name: displayAliasName,     
        identity: identityStr,      
        text: reviewText.trim(),
        rating: rating,
        status: 'pending', 
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'inquiries'), {
        tenantId: tenantData.id, 
        name: tenantData.name, 
        phone: tenantData.phone || '',
        roomInfo: tenantData.roomInfo || '',
        category: '⭐ 收到新租客評價', 
        message: `真實租客 (${tenantData.name}) 給予了 ${rating} 星評價：\n「${reviewText}」\n\n👉 官網預覽名稱將自動轉換為：【${displayAliasName} / ${identityStr}】\n請前往大系統 CMS 進行審核。`,
        type: 'ticket', 
        status: 'New', 
        createdAt: serverTimestamp()
      });

      alert("💖 感謝您的寶貴評價！");
      setActiveModal('none'); 
      setReviewText(''); 
      setRating(5);
    } catch (error: any) { 
      console.error("提交評價失敗:", error);
      alert(`送出失敗，請重試！錯誤訊息: ${error.message}`); 
    } finally { 
      setIsSubmittingReview(false); 
    }
  };

  const handleConfirmSurrender = async () => {
    const canvas = surrenderSigCanvasRef.current;
    if (!canvas || !moveOutDate) return alert("請確保日期已填寫並完成簽名！");
    
    setIsSubmittingSurrender(true);
    try {
      const storage = getStorage();
      const uploadedFileUrls: string[] = [];
      const base64Signature = canvas.toDataURL('image/png');
      const todayStr = new Date().toISOString().split('T')[0];

      for (const file of surrenderFiles) {
        const isImage = file.type.startsWith('image/');
        const fileToUpload = isImage ? await compressImage(file) : file;
        const fileRef = ref(storage, `tenants/${tenantData.id}/surrender/${Date.now()}_${fileToUpload.name}`);
        await uploadBytesResumable(fileRef, fileToUpload);
        uploadedFileUrls.push(await getDownloadURL(fileRef));
      }

      await addDoc(collection(db, 'documents'), {
        type: 'Termination',
        status: 'Signed',
        formData: {
          tenantId: tenantData.id, tenantName: tenantData.name,
          propertyAddress: tenantData.propertyName, roomNo: tenantData.roomName,
          docDate: todayStr, dueDate: moveOutDate,
          moveOutDate: moveOutDate, reason: surrenderReason,
          evidenceUrls: uploadedFileUrls,
          tenantSignature: base64Signature,
          signedAt: todayStr,
          remarks: '租客已簽署退租交吉確認書，同意於交吉日騰空交還物業。'
        },
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'inquiries'), {
        tenantId: tenantData.id, name: tenantData.name, roomInfo: tenantData.roomInfo,
        category: '退租與交吉申請', 
        message: `【退租交吉通知】\n預計遷出日：${moveOutDate}\n原因：${surrenderReason || '無'}\n*租客已完成線上退租協議簽署並上傳交吉照片/影片，請管家安排退租點交與按金結算事宜。`,
        type: 'ticket', status: 'New', createdAt: serverTimestamp()
      });

      alert("✅ 退租協議簽署成功！管家已收到您的交吉通知，後續將與您結算按金。");
      setActiveModal('none'); setSurrenderStep(1); setSurrenderFiles([]);
    } catch (error) { alert("❌ 簽署失敗，請檢查網路狀態。"); } 
    finally { setIsSubmittingSurrender(false); }
  };

  const renderA4Document = (docData: any, isSigningMode = false) => {
    if (!docData) return null;
    if (docData.type === 'Lease') {
      const fd = docData.formData || {};
      return (
        <div ref={isSigningMode ? contractRef : undefined} className="w-[794px] min-h-[1123px] bg-white text-slate-900 font-sans relative shadow-lg origin-top mx-auto">
          <ContractTemplate
            data={{ tenantName: fd.tenantName || tenantData?.name || '未填寫租客', tenantPhone: fd.tenantPhone || tenantData?.phone || '未提供', tenantIdNumber: fd.tenantIdNumber || tenantData?.identityNumber || '未提供', propertyAddress: fd.propertyAddress || tenantData?.propertyName || '', roomName: fd.roomName || tenantData?.roomName || '', leaseStart: fd.leaseStart || tenantData?.leaseStart || '', leaseEnd: fd.leaseEnd || tenantData?.leaseEnd || '', monthlyRent: Number(fd.monthlyRent) || 0, securityDeposit: Number(fd.deposit) || 0, paymentSchedule: Array.isArray(fd.paymentSchedule) ? fd.paymentSchedule : [], tenantSignature: fd.tenantSignature || tenantData?.signature || ((tenantData?.isPhysicalSigned || fd.isPhysicalSigned || docData.isSmartSummary) ? "【實體合約已簽署】" : ''), signedAt: fd.signedAt || tenantData?.signedAt || (docData.isSmartSummary ? fd.docDate : '') }}
            isSigningMode={isSigningMode && !tenantData?.isContractSigned} isSigningLoading={isSigning} showStamp={true}
            onSignComplete={async (signatureBase64) => {
              setIsSigning(true);
              try {
                const todayStr = new Date().toISOString().split('T')[0];
                await updateDoc(doc(db, 'tenants', tenantData.id), { signature: signatureBase64, signedAt: todayStr, isContractSigned: true, status: 'Active', updatedAt: serverTimestamp() });
                if (latestLease?.id) await updateDoc(doc(db, 'documents', latestLease.id), { 'formData.tenantSignature': signatureBase64, 'formData.signedAt': todayStr, status: 'Signed', updatedAt: serverTimestamp() });
                alert("✅ 合約手寫簽署成功！此法定簽名筆跡已同步至您的專屬後台。");
              } catch (error) { alert("❌ 簽署失敗，請檢查網路狀態或稍後再試。"); } finally { setIsSigning(false); }
            }}
          />
        </div>
      );
    }
    const fd = docData.formData || {}; const items = docData.items || [];
    const baseRent = Number(fd.monthlyRent) || 0; const deposit = Number(fd.deposit) || 0;
    const extraTotal = items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    const receiptTotal = baseRent + deposit + extraTotal;
    const statementBalance = (Number(fd.totalReceived)||0) - (Number(fd.totalReceivable)||0) - (Number(fd.reservedDamages)||0);
    const formatCurrencyStr = (val: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'HKD' }).format(Number(val) || 0);
    const displayAddress = (fd.propertyAddress || tenantData?.propertyName).replace(new RegExp(`^${tenantData?.propertyName}\\s*`, 'i'), '').trim();
    const activeTenantSignature = fd.tenantSignature || tenantData.signature || ((tenantData.isPhysicalSigned || fd.isPhysicalSigned) ? tenantData.name : '');

    return (
      <div className="w-[794px] h-[1123px] bg-white px-[75px] py-[56px] text-slate-900 font-sans relative shadow-lg origin-top mx-auto" style={{ boxSizing: 'border-box' }}>
        <div className="flex flex-col items-center mb-5 border-b-[3px] border-[#1e293b] pb-4"><img src="/PrimelivingLetterhead.jpg" alt="Logo" className="h-16 object-contain mb-2" onError={(e) => { e.currentTarget.style.display = 'none'; }}/><div className="text-[11px] font-bold text-slate-600 tracking-wide text-center">地址：新界沙田石門新貿中心B座22樓11室 | 電話：3996 9796 | 電郵：info@primelivinghk.com</div></div>
        <div className="text-right mb-6"><h2 className="text-xl font-black uppercase tracking-widest text-slate-800">{docData.type === 'Receipt' ? 'OFFICIAL RECEIPT' : docData.type === 'Statement' ? 'ACCOUNT STATEMENT' : 'TERMINATION AGREEMENT'}</h2><p className="text-sm font-bold text-slate-600 tracking-[0.5em] mt-1">{docData.type === 'Receipt' ? '正 式 收 據' : docData.type === 'Statement' ? '對 數 結 算 單' : '退 租 協 議'}</p><p className="text-xs font-mono mt-3">Date: {fd.docDate}</p></div>
        <div className="flex justify-between gap-6 mb-6">
          <div className="flex-1 border border-slate-300 p-4 rounded-sm bg-slate-50/50"><h3 className="text-xs font-bold uppercase text-slate-500 mb-2 border-b border-slate-300 pb-2">Landlord / Manager</h3><p className="font-bold text-sm">PRIME LIVING PROPERTY(HK)<br/>MANAGEMENT</p></div>
          <div className="flex-1 border border-slate-300 p-4 rounded-sm bg-slate-50/50"><h3 className="text-xs font-bold uppercase text-slate-500 mb-2 border-b border-slate-300 pb-2">Tenant (租客)</h3><p className="font-bold text-sm">{fd.tenantName || tenantData.name || '__________________'}</p><p className="text-xs mt-1 font-mono">Phone: {fd.tenantPhone || tenantData.phone || '__________________'}</p><p className="text-xs mt-1 font-mono">ID: {fd.tenantIdNumber || tenantData.identityNumber || '未提供'}</p></div>
        </div>
        <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Premises Details (物業詳情)</div><table className="w-full text-sm border-collapse border border-slate-300 table-fixed"><tbody><tr><td className="border border-slate-300 p-3 font-bold w-1/4 break-words">Property Address</td><td colSpan={3} className="border border-slate-300 p-3 font-bold break-words">{displayAddress}</td></tr><tr><td className="border border-slate-300 p-3 font-bold w-1/4">Room No.</td><td className="border border-slate-300 p-3 font-bold text-blue-700 w-1/4 break-words">{fd.roomName || tenantData.roomName}</td><td className="border border-slate-300 p-3 font-bold w-1/4">Lease Term</td><td className="border border-slate-300 p-3 font-mono text-xs w-1/4 break-words">{fd.leaseStart || tenantData.leaseStart} to {fd.leaseEnd || tenantData.leaseEnd}</td></tr></tbody></table></div>
        {docData.type === 'Statement' ? (
          <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Account Reconciliation (結算明細)</div><table className="w-full text-sm border-collapse border border-slate-300"><tbody><tr><td className="border border-slate-300 p-3 font-bold w-3/4">Total Receivable (應收總額)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrencyStr(fd.totalReceivable)}</td></tr><tr><td className="border border-slate-300 p-3 font-bold w-3/4">Total Received / Deposit (已收總額/押金)</td><td className="border border-slate-300 p-3 text-right font-mono text-emerald-700">{formatCurrencyStr(fd.totalReceived)}</td></tr><tr><td className="border border-slate-300 p-3 font-bold w-3/4 text-red-600">Reserved Deductions / Damages (預留損耗及扣款)</td><td className="border border-slate-300 p-3 text-right font-mono text-red-600">- {formatCurrencyStr(fd.reservedDamages)}</td></tr></tbody><tfoot><tr className="bg-slate-50 font-black"><td className="border border-slate-300 p-3 text-right">FINAL BALANCE (最終結餘):<br/><span className="text-[10px] font-normal text-slate-500">(正數為需退還租客 / 負數為租客需補繳)</span></td><td className={`border border-slate-300 p-3 text-right font-mono text-xl ${statementBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{statementBalance >= 0 ? '+' : ''}{formatCurrencyStr(statementBalance)}</td></tr><tr><td colSpan={2} className="border border-slate-300 p-2 text-xs">Method: <span className="font-bold">{fd.paymentMethod}</span></td></tr></tfoot></table></div>
        ) : docData.type === 'Receipt' ? (
          <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Payment Received (收款明細)</div><table className="w-full text-sm border-collapse border border-slate-300"><thead><tr className="bg-slate-50"><th className="border border-slate-300 p-3 text-left">Description</th><th className="border border-slate-300 p-3 text-right w-32">Amount</th></tr></thead><tbody>{baseRent > 0 && <tr><td className="border border-slate-300 p-3">Monthly Rent (租金)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrencyStr(baseRent)}</td></tr>}{deposit > 0 && <tr><td className="border border-slate-300 p-3">Security Deposit (按金)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrencyStr(deposit)}</td></tr>}{items.map((item:any, i:number) => <tr key={i}><td className="border border-slate-300 p-3 text-slate-600">+ {item.desc}</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrencyStr(item.amount)}</td></tr>)}</tbody><tfoot><tr className="bg-slate-50 font-black"><td className="border border-slate-300 p-3 text-right">TOTAL RECEIVED (總共收取):</td><td className="border border-slate-300 p-3 text-right font-mono text-lg">{formatCurrencyStr(receiptTotal)}</td></tr><tr><td colSpan={2} className="border border-slate-300 p-2 text-xs">Payment Method: <span className="font-bold">{fd.paymentMethod}</span></td></tr></tfoot></table></div>
        ) : null}
        {fd.remarks && <div className="mb-8 p-3 border-b border-slate-300 text-xs leading-relaxed"><span className="font-bold block mb-1">Remarks (備註):</span><span className="whitespace-pre-wrap">{fd.remarks}</span></div>}
        <div className="absolute bottom-[60px] left-[75px] right-[75px] grid grid-cols-2 gap-16"><div className="border-t border-slate-800 text-center relative pt-2"><p className="font-bold text-xs uppercase relative z-10">Landlord / Authorized Agent</p><p className="text-[10px] text-slate-500 mt-1 relative z-10">業主 / 授權代理人</p>{(docData.isCompanyChopApplied || docData.stampPos) && (<div className="absolute z-0 pointer-events-none" style={{ left: docData.stampPos?.x || '20px', top: docData.stampPos?.y || '-60px', width: '120px', height: '120px' }}><img src="/stamp.png" alt="Company Stamp" className="w-full h-full object-contain mix-blend-multiply" style={{ filter: 'invert(16%) sepia(85%) saturate(3661%) hue-rotate(216deg) brightness(91%) contrast(103%)' }} onError={(e) => { e.currentTarget.style.display = 'none'; }}/></div>)}</div><div className="border-t border-slate-800 text-center relative pt-2">{activeTenantSignature && (<div className="absolute bottom-[100%] left-0 w-full text-center z-20 print:opacity-100 opacity-80 mb-[-12px] pointer-events-none"><p className="text-[40px] text-slate-800 leading-none whitespace-nowrap" style={{ fontFamily: "'Brush Script MT', 'Cedarville Cursive', cursive" }}>{activeTenantSignature}</p></div>)}<p className="font-bold text-xs uppercase relative z-10">Tenant</p><p className="text-[10px] text-slate-500 mt-1 relative z-10">租客簽署</p></div></div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;
  if (!tenantData) return null;

  return (
    <div className={`h-screen flex flex-col selection:bg-orange-200 font-sans relative bg-gradient-to-br transition-colors duration-1000 overflow-hidden ${weather.bgClass}`}>
      <Script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="lazyOnload" />
      
      {isVerifying && (
        <div className="fixed inset-0 bg-slate-900/80 z-[200] flex flex-col items-center justify-center text-white backdrop-blur-sm animate-in fade-in">
          <Loader2 size={48} className="animate-spin text-emerald-400 mb-4" />
          <h2 className="text-2xl font-black">正在向銀行確認款項...</h2>
          <p className="text-slate-300 mt-2 font-medium">請稍候，系統即將為您結算帳單</p>
        </div>
      )}

      <div className="bg-white/40 backdrop-blur-md border-b border-white/50 px-6 py-4 md:py-5 flex justify-between items-center z-40 shadow-sm flex-none">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="Prime Living" className="h-8 md:h-9 object-contain drop-shadow-sm" />
          <span className="font-extrabold text-xl tracking-tight text-slate-800 hidden sm:flex items-baseline gap-1">
            佳寓 <span className="text-orange-500 text-sm font-black">PrimeLiving</span>
          </span>
        </Link>
        <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 bg-white/50 hover:bg-white px-4 py-2 rounded-full transition-all flex items-center text-sm font-bold shadow-sm border border-white/60">
          <LogOut size={16} className="mr-1.5"/> 登出
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-8 pt-6 md:pt-10 pb-16 px-4 md:px-8 min-h-full flex flex-col">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              <p className="text-slate-600 font-bold tracking-widest text-xs mb-1">
                {new Date().toLocaleDateString('zh-HK', { month: 'long', day: 'numeric', weekday: 'long' })}
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-4">
                尊貴的 {tenantData.name}，您好
              </h1>
              <div className="bg-white/50 backdrop-blur-xl border border-white/60 p-4 rounded-2xl flex items-center gap-4 shadow-sm max-w-lg">
                <div className="p-2 bg-white/60 rounded-full shadow-sm">{weather.icon}</div>
                <div>
                  <p className="text-sm font-black text-slate-800">目前香港天氣：{weather.desc}，氣溫 {weather.temp}°C</p>
                  <p className="text-xs text-slate-600 mt-1 font-bold">{weather.suggestion}</p>
                </div>
              </div>
            </div>
            
            <button onClick={() => setActiveModal('notifications')} className={`relative p-3 backdrop-blur-md rounded-full shadow-sm border transition-all duration-300 ${myInquiries.some(i => i.adminReply || i.status === 'In Progress' || i.status === 'Resolved' || i.type === 'official_notice') || billingSummary.hasOverdue ? 'bg-red-50 border-red-200 shadow-red-500/30 hover:bg-red-100 ring-2 ring-red-500/20' : 'bg-white/60 border-white/60 hover:shadow-md'}`}>
              <Bell size={20} className={myInquiries.some(i => i.adminReply || i.status === 'In Progress' || i.status === 'Resolved' || i.type === 'official_notice') || billingSummary.hasOverdue ? 'text-red-600' : 'text-slate-600'} />
              {(myInquiries.some(i => i.adminReply || i.status === 'In Progress' || i.status === 'Resolved' || i.type === 'official_notice') || billingSummary.hasOverdue) && (
                <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white"></span>
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
            <div className="lg:col-span-7 space-y-6 animate-in slide-in-from-bottom-6 duration-700">
              <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-8 text-white shadow-2xl shadow-slate-900/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/20 blur-[60px] -translate-y-16 translate-x-16 pointer-events-none" />
                
                {billingSummary.hasOverdue && !billingSummary.isSplitNeeded && (
                  <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 mb-6 animate-pulse relative z-10">
                    <AlertCircle size={16} className="text-red-400 shrink-0"/>
                    <span>注意：您有逾期的帳單尚未繳付，系統已為您自動加收 5% 逾期附加費，請儘速繳付！</span>
                  </div>
                )}
                {!billingSummary.hasOverdue && billingSummary.hasUpcoming && !billingSummary.isSplitNeeded && (
                  <div className="bg-amber-500/20 border border-amber-500/40 text-amber-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 mb-6 relative z-10">
                    <Clock size={16} className="text-amber-400 shrink-0"/>
                    <span>提示：您有即將到期的帳單，已為您預設勾選可一併結算。</span>
                  </div>
                )}
                {billingSummary.isSplitNeeded && (
                  <div className="bg-purple-500/20 border border-purple-500/40 text-purple-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-start sm:items-center gap-2 mb-6 animate-pulse relative z-10">
                    <AlertCircle size={16} className="text-purple-400 shrink-0 mt-0.5 sm:mt-0"/>
                    <span>金流限額 10 萬元，系統已為您自動按期數拆單。本次將優先結算前 {billingSummary.checkoutBillIds.length} 筆舊單。</span>
                  </div>
                )}
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest mb-1">本次結帳總額 (HKD)</p>
                    <h2 className="text-5xl md:text-6xl font-black tracking-tighter">${billingSummary.checkoutTotal.toLocaleString()}</h2>
                    {billingSummary.isSplitNeeded && (
                      <p className="text-sm text-slate-400 font-bold mt-1">目前總欠款: ${billingSummary.grandTotal.toLocaleString()}</p>
                    )}
                  </div>
                  <span className={`px-4 py-2 rounded-full text-xs font-black border backdrop-blur-sm ${billingSummary.hasOverdue ? 'bg-red-500/20 text-red-400 border-red-500/30' : billingSummary.hasUpcoming ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : tenantData.status === '合約已生效' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
                    {billingSummary.hasOverdue ? '有逾期帳單' : billingSummary.hasUpcoming ? '有即將到期帳單' : tenantData.status}
                  </span>
                </div>

                <div className="mb-6 relative z-10">
                  <button onClick={() => setShowBillDetails(!showBillDetails)} className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-300 transition mb-2">
                    {showBillDetails ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    {showBillDetails ? '收起帳單明細' : '檢視詳細對數單據明細'}
                  </button>
                  
                  {showBillDetails && (
                    <div className="bg-white/10 rounded-xl p-4 space-y-3 text-xs border border-white/10 animate-in fade-in duration-200">
                      <p className="text-slate-400 font-bold mb-1.5 border-b border-white/10 pb-1">📌 本次結帳金額明細：</p>
                      {billingSummary.allPendingBills.length === 0 ? (
                        <p className="text-slate-400 py-1">目前無任何待繳單據</p>
                      ) : (
                        billingSummary.allPendingBills.map(item => {
                          const isChecked = billingSummary.checkoutBillIds.includes(item.id);
                          const isMandatory = item.isOverdue || item.isDueToday;

                          return (
                            <div key={item.id} className={`flex justify-between items-center py-1.5 px-1 rounded text-slate-200 bg-white/5 mb-1 border border-white/10 ${!isChecked ? 'opacity-50' : ''}`}>
                              <div className="flex items-center gap-2">
                                <button 
                                  disabled={isMandatory && isChecked} 
                                  onClick={() => {
                                    if (isMandatory) return;
                                    setSelectedOptionalBillIds(prev => 
                                      prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                                    );
                                  }}
                                  className={`flex items-center justify-center transition-colors ${isMandatory ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:opacity-100'}`}
                                >
                                  {isChecked ? <CheckSquare size={14} className="text-orange-500 shrink-0"/> : <Square size={14} className="text-slate-500 shrink-0"/>}
                                </button>
                                
                                <span className={`flex items-center gap-1.5 flex-wrap ${!isChecked ? 'line-through' : ''}`}>
                                  {item.isOverdue && <span className="bg-red-500/30 text-red-300 text-[9px] px-1.5 py-0.5 rounded font-black border border-red-500/30">已逾期</span>}
                                  {item.isOverdue30 && <span className="bg-rose-500/30 text-rose-200 text-[9px] px-1.5 py-0.5 rounded font-black border border-rose-500/30 animate-pulse">包含 5% 滯納金</span>}
                                  {item.title} <span className="text-[10px] text-slate-400">({item.dueDateStr})</span>
                                </span>
                              </div>
                              <span className={`font-mono font-bold ${item.isOverdue30 ? 'text-rose-400' : ''}`}>${item.amount.toLocaleString()}</span>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>

                <button onClick={() => setActiveModal('payment')} disabled={billingSummary.grandTotal === 0} className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-orange-50 transition-all active:scale-95 shadow-xl relative z-10 disabled:opacity-50 disabled:cursor-not-allowed">
                  <CreditCard size={18}/> {billingSummary.grandTotal === 0 ? '無待繳帳單' : '立即繳費'}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-1">剩餘租期</p>
                  <p className="text-3xl font-black text-slate-800">{tenantData.daysRemaining} <span className="text-sm font-bold text-slate-500">天</span></p>
                </div>
                <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 shadow-sm flex flex-col justify-center overflow-hidden">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-1">專屬帳戶</p>
                  <p className="text-sm font-black text-slate-800 truncate font-mono">
                    {tenantData.roomInfo?.length > 15 ? `TEN-${tenantData.id.slice(-6).toUpperCase()}` : tenantData.roomInfo}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 animate-in slide-in-from-bottom-8 duration-700">
              <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl shadow-slate-200/20 overflow-hidden flex flex-col p-2">
                <button onClick={() => setActiveModal('contract')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${tenantData.isContractSigned ? 'bg-emerald-50' : 'bg-purple-50'}`}>
                      <FileSignature size={20} className={tenantData.isContractSigned ? 'text-emerald-500' : 'text-purple-500'}/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">電子合約與簽署 {!tenantData.isContractSigned && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}</p>
                      <p className={`text-[10px] font-bold ${tenantData.isContractSigned ? 'text-slate-500' : 'text-red-500'}`}>{tenantData.isContractSigned ? '已簽署，可下載 PDF' : '尚未簽署，請立即完成'}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>
                
                <button onClick={() => setActiveModal('profile')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${isProfileComplete ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <ShieldCheck size={20} className={isProfileComplete ? 'text-emerald-600' : 'text-rose-500'}/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">住客檔案認證 (KYC) {!isProfileComplete && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}</p>
                      <p className={`text-[10px] font-bold ${isProfileComplete ? 'text-slate-500' : 'text-rose-500'}`}>{isProfileComplete ? '檔案已完善 (實名認證)' : '上傳證件與緊急聯絡人'}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>
                
                <button onClick={() => { setActiveModal('ticket'); setTicketTab('submit'); setViewingTicket(null); }} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Wrench size={20} className="text-blue-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">報修申請與進度</p>
                      <p className="text-[10px] font-bold text-slate-500">設備損壞一鍵呼叫師傅</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>
                
                <button onClick={() => setActiveModal('bills')} className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-white/80 transition-colors rounded-2xl group text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Receipt size={20} className="text-cyan-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">歷史單據與帳單</p>
                      <p className="text-[10px] font-bold text-slate-500">查看管家開立之收據與對數單</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>
                
                <button onClick={() => { initChat(); setActiveModal('contact'); }} className="w-full flex items-center justify-between p-4 md:p-5 bg-white/80 hover:bg-white transition-colors rounded-2xl group text-left border border-white/50 mt-2 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <UserCircle size={20} className="text-orange-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-orange-900 mb-0.5">聯絡專屬管家</p>
                      <p className="text-[10px] text-orange-600 font-bold">智能客服與真人支援</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-orange-400 group-hover:text-orange-500 transition-colors" />
                </button>

                <button onClick={() => { setActiveModal('surrender'); setSurrenderStep(1); }} className="w-full flex items-center justify-between p-4 md:p-5 bg-white/80 hover:bg-white transition-colors rounded-2xl group text-left border border-white/50 mt-2 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <LogOut size={20} className="text-rose-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-rose-900 mb-0.5">退租與交吉管理</p>
                      <p className="text-[10px] text-rose-600 font-bold">上傳交還證明並簽署退租書</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-rose-400 group-hover:text-rose-500 transition-colors" />
                </button>

                <button onClick={() => setActiveModal('review')} className="w-full flex items-center justify-between p-4 md:p-5 bg-white/80 hover:bg-white transition-colors rounded-2xl group text-left border border-white/50 mt-2 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Sun size={20} className="text-amber-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-900 mb-0.5">服務評價與建議</p>
                      <p className="text-[10px] text-amber-600 font-bold">您的五星好評是我們的動力</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-amber-400 group-hover:text-amber-500 transition-colors" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-12 text-center pb-4 opacity-60 hover:opacity-100 transition-opacity flex-none">
            <div className="flex items-center justify-center gap-2 mb-1">
              <img src="/logo.png" alt="Prime Living" className="h-4 object-contain grayscale" />
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">佳寓 PrimeLiving</span>
            </div>
            <p className="text-[9px] font-bold text-slate-400 tracking-wider">© {new Date().getFullYear()} PRIME LIVING PROPERTY (HK) MANAGEMENT LTD.</p>
          </div>
        </div>
      </div>

      {/* 通知 Modal */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[75vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Bell className="mr-2 text-orange-500" size={24}/> 您的通知與互動</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-4 custom-scrollbar">
              {billingSummary.hasOverdue && (
                <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm relative overflow-hidden mb-4 animate-in slide-in-from-top-2">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  <div className="flex justify-between items-start mb-2 pl-2">
                    <span className="text-xs font-bold text-red-700 flex items-center"><AlertCircle size={14} className="mr-1"/> 系統自動催繳</span>
                    <span className="text-[10px] text-slate-400 font-mono">今天</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 pl-2 whitespace-pre-wrap">
                    您有逾期尚未繳納的帳單。若逾期超過 30 天，系統已為您自動加收 5% 的逾期附加費，請盡速前往繳款以免影響居住權益。
                  </p>
                </div>
              )}

              {myInquiries.length === 0 && !billingSummary.hasOverdue ? (
                <div className="text-center py-10 text-slate-400">
                  <Bell size={40} className="mx-auto mb-3 opacity-50"/>
                  <p className="text-sm font-bold">目前沒有任何管家通知</p>
                </div>
              ) : (
                myInquiries.map(log => {
                  const isOfficial = log.type === 'official_notice'; 
                  const isMyTicket = !log.type || log.type === 'ticket'; 
                  
                  const handleDeleteLog = async () => {
                    if (confirm('確定要刪除這條通知紀錄嗎？')) {
                      try { await deleteDoc(doc(db, 'inquiries', log.id)); } 
                      catch (e) { alert('刪除失敗'); }
                    }
                  };

                  return (
                    <div key={log.id} className="space-y-3 mb-4 group relative">
                      <button onClick={handleDeleteLog} className="absolute -top-2 -right-2 z-10 bg-white border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm">
                        <Trash2 size={12} />
                      </button>

                      {isOfficial && (
                        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                          <div className="flex justify-between items-start mb-2 pl-2">
                            <span className="text-xs font-bold text-blue-700 flex items-center"><UserCircle size={14} className="mr-1"/> 官方管家</span>
                            <span className="text-[10px] text-slate-400 font-mono">{log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : '剛剛'}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 pl-2 whitespace-pre-wrap">{log.message || log.content}</p>
                        </div>
                      )}
                      {isMyTicket && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{log.category || '系統通知'}</span>
                            <span className={`text-[10px] font-black px-2 py-1 rounded ${log.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : log.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                              {log.status === 'Resolved' ? '已結案' : log.status === 'In Progress' ? '管家處理中' : '等待處理'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">「{log.message || log.content}」</p>
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

      {/* 聯絡管家 Modal */}
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
                         <button key={opt} onClick={() => handleChatOption(opt)} className="px-4 py-2 bg-white border border-orange-200 text-orange-600 rounded-full text-xs font-bold hover:bg-orange-50 transition shadow-sm">{opt}</button>
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

      {activeModal === 'review' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Sun className="mr-2 text-amber-500" size={24}/> 服務評價與建議</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitReview} className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-6">
              <div className="text-center">
                <p className="text-sm font-bold text-slate-600 mb-4">請問您對佳寓的居住體驗滿意嗎？</p>
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} type="button" onClick={() => setRating(star)} className="focus:outline-none hover:scale-110 transition-transform">
                      <Sun size={40} className={star <= rating ? "text-amber-400 fill-amber-400 drop-shadow-md" : "text-slate-300"} />
                    </button>
                  ))}
                </div>
                <p className="text-xs font-black text-amber-600">{rating === 5 ? '非常滿意，極力推薦！' : rating >= 4 ? '很滿意，住得很舒適！' : '還有進步空間'}</p>
              </div>
              <div>
                <p className="text-xs font-black text-slate-800 mb-2">想對管家說的話或建議 (選填)：</p>
                <textarea rows={4} value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="感謝管家的照顧..." className="w-full p-4 border border-slate-200 rounded-2xl text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all resize-none font-medium shadow-sm" />
              </div>
              <button type="submit" disabled={isSubmittingReview} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-md hover:bg-amber-600 transition-all active:scale-95 shadow-xl shadow-amber-500/20 disabled:opacity-50">
                {isSubmittingReview ? <><Loader2 size={18} className="animate-spin inline mr-2"/> 送出中...</> : '確認送出評價'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ★ 退租與交吉管理 Modal */}
      {activeModal === 'surrender' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh] overflow-hidden relative border border-slate-200">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-900 text-white flex-none z-20">
              <div>
                <h3 className="font-black text-lg sm:text-xl flex items-center"><LogOut className="mr-2 text-rose-400" size={24}/> 退租暨交吉管理</h3>
                <p className="text-[10px] text-slate-400 mt-1">Surrender of Tenancy & Handover Confirmation</p>
              </div>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col relative custom-scrollbar">
              {surrenderStep === 1 ? (
                <div className="p-6 space-y-6 animate-in slide-in-from-left-4">
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl">
                    <p className="text-sm font-black text-rose-900 mb-1 flex items-center gap-2"><AlertCircle size={16}/> 辦理退租須知</p>
                    <p className="text-xs text-rose-700 leading-relaxed font-medium">依據合約與香港租賃法例，租客需於交吉日將物業以<strong className="text-rose-900">空置及清潔狀態</strong>交還。請確實填寫遷出日期並上傳屋況與鎖匙留存證明照。</p>
                  </div>
                  
                  <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-2">預計遷出交吉日 *</label>
                      <input type="date" required value={moveOutDate} onChange={e => setMoveOutDate(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500 font-bold bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-2">退租原因 (選填)</label>
                      <input type="text" value={surrenderReason} onChange={e => setSurrenderReason(e.target.value)} placeholder="例如：畢業回國、工作調職..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500 font-bold bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-2 flex justify-between">
                        <span>上傳交還證明 (相片或影片) *</span>
                        <span className="text-[10px] text-slate-400 font-normal">可多選，例如清潔後的房間、冷氣遙控、門匙</span>
                      </label>
                      <div className="relative">
                        <input type="file" multiple accept="image/*,video/mp4,video/quicktime" onChange={e => { if (e.target.files) setSurrenderFiles(Array.from(e.target.files)); }} className="hidden" id="surrender-files" />
                        <label htmlFor="surrender-files" className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${surrenderFiles.length > 0 ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-rose-400 hover:bg-rose-50'}`}>
                          {surrenderFiles.length > 0 ? <><CheckCircle2 size={28} className="mb-2"/><span className="text-sm font-black">已選取 {surrenderFiles.length} 個檔案</span></> : <><UploadCloud size={28} className="mb-2"/><span className="text-sm font-bold">點擊上傳圖檔或影片</span></>}
                        </label>
                      </div>
                    </div>
                  </div>

                  <button onClick={() => { if (!moveOutDate || surrenderFiles.length === 0) return alert("請填寫遷出日期並上傳至少一張證明照片！"); setSurrenderStep(2); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-xl">
                    下一步：檢閱並簽署退租書 <ChevronRight size={18}/>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col h-full animate-in slide-in-from-right-4">
                  <div className="flex-1 p-6 overflow-y-auto bg-slate-200 flex justify-center custom-scrollbar">
                    {/* A4 法律退租書預覽 */}
                    <div className="w-[794px] min-h-max bg-white p-10 sm:p-16 shadow-lg text-slate-900 origin-top scale-[0.45] sm:scale-75 md:scale-90 transition-transform border border-slate-300">
                      <h2 className="text-2xl font-black text-center mb-1 uppercase tracking-widest">Notice of Surrender & Handover</h2>
                      <h3 className="text-lg font-bold text-center mb-8 tracking-[0.5em]">退租通知暨交吉確認書</h3>
                      
                      <div className="space-y-4 text-sm leading-relaxed font-medium">
                        <p><strong>This Agreement is made between (立約雙方) :</strong></p>
                        <p>Landlord / Authorized Agent (業主/授權代理人)：<br/><span className="font-bold border-b border-slate-400 inline-block min-w-[300px]">PRIME LIVING PROPERTY (HK) MANAGEMENT</span></p>
                        <p>Tenant (租客)：<br/><span className="font-bold border-b border-slate-400 inline-block min-w-[300px]">{tenantData?.name} ({tenantData?.identityNumber})</span></p>
                        
                        <p className="pt-4"><strong>Premises (物業地址) :</strong><br/><span className="font-bold">{tenantData?.propertyName} - {tenantData?.roomName}</span></p>
                        
                        <div className="border border-slate-800 p-4 mt-6 bg-slate-50 text-xs text-justify">
                          <p className="mb-2">1. The Tenant hereby gives notice and confirms to surrender the Tenancy and deliver vacant possession of the Premises to the Landlord on <strong className="text-rose-600 text-sm border-b border-rose-600">{moveOutDate}</strong> (the "Handover Date").</p>
                          <p className="mb-2">租客特此發出通知並確認，將於 <strong className="text-rose-600">{moveOutDate}</strong>（「交吉日」）退回上述物業之租賃權，並將物業以空置狀態交還予業主。</p>
                          
                          <p className="mb-2">2. The Tenant agrees to deliver the Premises in good, clean and tenantable condition (fair wear and tear excepted), and return all keys/access cards.</p>
                          <p className="mb-2">租客同意將物業以良好、清潔及可租用的狀態（自然損耗除外）交還，並歸還所有鑰匙與門禁卡。</p>
                          
                          <p className="mb-2">3. The Security Deposit shall be refunded to the Tenant within the legally or contractually agreed period after the Handover Date, subject to deductions for any outstanding rent, damages, cleaning fees, or unpaid utilities.</p>
                          <p>按金將於交吉日後，依據合約約定之期限內退還予租客；唯業主有權從中扣除任何未繳租金、維修清潔費或結欠之水電煤費用。</p>
                        </div>
                      </div>
                      
                      <div className="mt-16 grid grid-cols-2 gap-12">
                        <div className="border-t border-slate-800 pt-2 text-center text-xs">
                           <p className="font-bold uppercase">Landlord / Authorized Agent</p>
                           <p className="text-slate-500">業主 / 授權代理人</p>
                        </div>
                        <div className="border-t border-slate-800 pt-2 text-center text-xs relative">
                           {/* 簽名預覽區 */}
                           <p className="font-bold uppercase relative z-10">Tenant (租客簽署)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 電子簽名板區塊 */}
                  <div className="bg-white border-t border-slate-200 p-0 flex-none shadow-[0_-10px_30px_rgba(0,0,0,0.1)] z-30">
                    <div className="p-3 bg-slate-900 text-white flex justify-between items-center text-xs font-bold">
                      <span>請在下方電子簽名板簽署：</span>
                      <button onClick={() => { const canvas = surrenderSigCanvasRef.current; if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); }} className="text-rose-400 hover:text-white transition">清除重簽</button>
                    </div>
                    <canvas 
                      ref={surrenderSigCanvasRef} 
                      className="w-full h-40 bg-slate-50 cursor-crosshair touch-none" 
                      width={800} height={200}
                      onMouseDown={(e) => {
                        setIsDrawing(true); const canvas = surrenderSigCanvasRef.current; if (!canvas) return;
                        const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d');
                        if (ctx) { ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; }
                      }}
                      onMouseMove={(e) => {
                        if (!isDrawing || !surrenderSigCanvasRef.current) return;
                        const rect = surrenderSigCanvasRef.current.getBoundingClientRect(); const ctx = surrenderSigCanvasRef.current.getContext('2d');
                        if (ctx) { ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke(); }
                      }}
                      onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)}
                      onTouchStart={(e) => {
                        setIsDrawing(true); const canvas = surrenderSigCanvasRef.current; if (!canvas) return;
                        const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d');
                        if (ctx) { ctx.beginPath(); ctx.moveTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; }
                      }}
                      onTouchMove={(e) => {
                        if (!isDrawing || !surrenderSigCanvasRef.current) return;
                        const rect = surrenderSigCanvasRef.current.getBoundingClientRect(); const ctx = surrenderSigCanvasRef.current.getContext('2d');
                        if (ctx) { ctx.lineTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top); ctx.stroke(); }
                      }}
                      onTouchEnd={() => setIsDrawing(false)}
                    />
                    <div className="flex p-3 gap-3">
                      <button onClick={() => setSurrenderStep(1)} className="px-6 py-3 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition">上一步</button>
                      <button onClick={handleConfirmSurrender} disabled={isSubmittingSurrender} className="flex-1 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50">
                        {isSubmittingSurrender ? <><Loader2 className="animate-spin" size={18}/> 上傳建檔中...</> : <><CheckCircle2 size={18}/> 確認簽署並申請退租</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 繳費 Modal */}
      {activeModal === 'payment' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0">選擇付款方式</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                <button onClick={() => setPaymentMethod('bank')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all flex justify-center items-center gap-2 ${paymentMethod === 'bank' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Landmark size={18}/> 轉帳/FPS</button>
                <button onClick={() => setPaymentMethod('paydollar')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all flex justify-center items-center gap-2 ${paymentMethod === 'paydollar' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}><CreditCard size={18}/> 線上刷卡 (PayDollar)</button>
              </div>
              
              {paymentMethod === 'bank' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-300 space-y-5">
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
                    <CheckCircle2 className="text-blue-600 shrink-0 mt-0.5" size={18}/>
                    <div>
                      <p className="text-sm font-black text-blue-900 mb-1">推薦使用：0% 手續費</p>
                      <p className="text-xs text-blue-700 font-medium">請轉帳至以下指定戶口，並上傳入數紙以供管家核對。</p>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">本次應付總額 (HKD)</p>
                      <p className="text-3xl font-black text-slate-800">${billingSummary.checkoutTotal.toLocaleString()}</p>
                    </div>
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex justify-between items-center"><p className="text-xs font-bold text-slate-500">帳戶銀行</p><p className="text-sm font-bold text-slate-800">恆生銀行 (HANG SENG BANK)</p></div>
                      <div className="flex justify-between items-center"><p className="text-xs font-bold text-slate-500">帳戶名稱</p><p className="text-[10px] font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">PRIME LIVING PROPERTY (HK) MANAGEMENT LIMITED</p></div>
                      <div className="flex justify-between items-center"><p className="text-xs font-bold text-slate-500">銀行帳號</p><p className="text-sm font-mono font-black text-slate-800 bg-slate-100 px-2 py-1 rounded">305-876757-883</p></div>
                    </div>
                  </div>
                  <div className="relative">
                    <input type="file" onChange={handleUploadReceipt} disabled={isUploading} className="hidden" id="receipt-upload" accept="image/*,.pdf" />
                    <label htmlFor="receipt-upload" className={`flex items-center justify-center w-full py-4 rounded-2xl cursor-pointer font-black transition-all shadow-lg ${isUploading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'}`}>
                      {isUploading ? <><Loader2 size={18} className="animate-spin mr-2" /> 檔案上傳中...</> : <><UploadCloud size={18} className="mr-2" /> 點擊上傳轉帳截圖</>}
                    </label>
                  </div>
                </div>
              )}
              
              {paymentMethod === 'paydollar' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18}/>
                    <div>
                      <p className="text-sm font-black text-amber-900 mb-1">注意：將收取 2% 處理費</p>
                      <p className="text-xs text-amber-700 font-medium">線上刷卡由 PayDollar (AsiaPay) 提供安全支付支援，費用包含金流平台手續費。</p>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white">
                    <div className="flex justify-between items-center"><p className="text-sm font-bold text-slate-600">本期帳單金額</p><p className="font-mono font-bold text-slate-800">${billingSummary.checkoutTotal.toLocaleString()}</p></div>
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100"><p className="text-sm font-bold text-slate-600">系統處理費 (2%)</p><p className="font-mono font-bold text-amber-600">+ ${fromCents(Math.round(toCents(billingSummary.checkoutTotal) * 0.02)).toLocaleString()}</p></div>
                    <div className="flex justify-between items-end pt-1"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">結帳總額</p><p className="text-3xl font-black text-purple-700">${(fromCents(toCents(billingSummary.checkoutTotal) + Math.round(toCents(billingSummary.checkoutTotal) * 0.02))).toLocaleString()}</p></div>
                  </div>
                  <button onClick={handlePayDollarCheckout} disabled={isPayDollarLoading} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex justify-center items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-70">
                    {isPayDollarLoading ? <><Loader2 size={18} className="animate-spin"/> 連線安全金流...</> : <>前往安全結帳 <ChevronRight size={18}/></>}
                  </button>
                  <div className="flex justify-center items-center gap-2">
                    <img src="https://www.paydollar.com/b2c2/images/logo_paydollar.gif" alt="PayDollar" className="h-4 object-contain opacity-50 grayscale hover:grayscale-0 transition-all" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 合約與簽署 Modal */}
      {activeModal === 'contract' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-100 w-full max-w-[1000px] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col h-[90vh] overflow-hidden relative border border-slate-200">
            
            {showSigPad && (
              <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center flex-none">
                  <div>
                    <h4 className="font-bold text-lg">親筆電子簽名</h4>
                    <p className="text-xs text-slate-300">請在下方空白處用手指或滑鼠簽名</p>
                  </div>
                  <button onClick={() => setShowSigPad(false)} className="p-2 hover:bg-slate-800 rounded-full transition"><X size={20}/></button>
                </div>
                
                <div className="flex-1 bg-slate-50 relative cursor-crosshair touch-none">
                  <div className="absolute inset-x-8 inset-y-12 border-2 border-dashed border-slate-300 rounded-xl pointer-events-none flex items-center justify-center">
                    <span className="text-slate-300 font-bold text-3xl opacity-30 select-none">簽名區</span>
                  </div>
                  <canvas 
                    ref={sigCanvasRef} 
                    className="w-full h-full relative z-10" 
                    width={800} height={400}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                  />
                </div>
                
                <div className="p-4 bg-white border-t border-slate-200 flex gap-4 flex-none shadow-sm">
                  <button onClick={clearSignature} className="px-6 py-3 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition">清除重寫</button>
                  <button onClick={handleConfirmSignature} disabled={isSigning} className="flex-1 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition flex items-center justify-center gap-2">
                    {isSigning ? <><Loader2 className="animate-spin" size={18}/> 儲存中...</> : <><CheckCircle2 size={18}/> 確認簽署並印於合約</>}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-slate-200 flex-none relative z-20">
              <h3 className="font-black text-lg sm:text-xl text-slate-800 flex items-center">
                <FileText className="mr-2 text-purple-600" size={24}/> 電子租賃合約
              </h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row relative z-10">
              <div className="flex-1 bg-slate-200 flex justify-center py-6 overflow-y-auto custom-scrollbar relative min-h-[400px]">
                {latestLease ? (
                  <div className="origin-top scale-[0.45] sm:scale-75 md:scale-90 lg:scale-100 transition-transform h-max pb-12">
                    {renderA4Document(latestLease, true)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                    <AlertCircle size={48} className="mb-4 opacity-50" />
                    <p className="font-bold">管家尚未發布合約</p>
                  </div>
                )}
              </div>
              
              {latestLease && (
                <div className="w-full md:w-[320px] bg-white border-t md:border-t-0 md:border-l border-slate-200 p-6 flex flex-col justify-center flex-none gap-4">

                  {latestLease.stampDutyUrl && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center animate-in fade-in slide-in-from-top-4">
                      <div 
                        onClick={() => window.open(latestLease.stampDutyUrl, '_blank')}
                        className="w-full h-36 bg-slate-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-blue-200 relative group shadow-sm cursor-pointer"
                        title="點擊放大預覽"
                      >
                        <iframe 
                          src={`${latestLease.stampDutyUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} 
                          className="absolute top-0 left-0 w-[200%] h-[200%] pointer-events-none origin-top-left scale-50" 
                          frameBorder="0" 
                        />
                        <div className="absolute inset-0 z-10 bg-transparent" />
                        <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                          <Eye size={24} className="text-white drop-shadow-md" />
                        </div>
                      </div>

                      <p className="text-sm font-black text-blue-900 mb-1">合約具法律效力</p>
                      <p className="text-[10px] text-blue-700 leading-normal mb-3">
                        已完成政府印花稅繳納手續
                      </p>
                      <a
                        href={latestLease.stampDutyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-md flex items-center justify-center gap-1.5"
                      >
                        <Download size={14}/> 下載印花稅單
                      </a>
                    </div>
                  )}

                  {(tenantData?.signature || tenantData?.isContractSigned || tenantData?.isPhysicalSigned) ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <div 
                        onClick={handleDownloadPDF}
                        className="w-full h-36 bg-slate-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-emerald-200 relative group shadow-sm cursor-pointer"
                        title="點擊下載 PDF"
                      >
                         <div className="w-[65%] h-[85%] bg-white shadow-sm border border-slate-200 p-2 flex flex-col gap-1.5 relative overflow-hidden">
                           <div className="w-1/2 h-1.5 bg-slate-300 rounded-full mx-auto mb-1"></div>
                           <div className="w-full h-1 bg-slate-200 rounded-full"></div>
                           <div className="w-5/6 h-1 bg-slate-200 rounded-full"></div>
                           <div className="w-full h-1 bg-slate-200 rounded-full"></div>
                           <div className="w-4/5 h-1 bg-slate-200 rounded-full"></div>
                           <div className="mt-auto flex justify-between items-end">
                             <div className="w-6 h-6 rounded-full border border-red-500/50 flex items-center justify-center rotate-12"><div className="w-4 h-4 rounded-full bg-red-500/20"></div></div>
                             <div className="text-[10px] text-emerald-600 font-[cursive] -rotate-12 whitespace-nowrap">Signed</div>
                           </div>
                         </div>
                         <div className="absolute inset-0 bg-emerald-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                           <Download size={24} className="text-white drop-shadow-md" />
                         </div>
                      </div>

                      <p className="text-sm font-black text-emerald-800 mb-1">合約已成功簽署</p>
                      <button onClick={handleDownloadPDF} disabled={isSignDownloading} className="mt-3 w-full py-2.5 bg-white border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50">
                        {isSignDownloading ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} 下載 PDF 副本
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-purple-50 p-5 rounded-xl border border-purple-200 shadow-sm text-center">
                        <FileSignature size={32} className="mx-auto text-purple-500 mb-2"/>
                        <p className="text-sm font-black text-purple-900 mb-1">等待您的親筆簽署</p>
                        <p className="text-[11px] text-purple-700 leading-normal mb-4">
                          請核對合約內容無誤後，點擊下方按鈕進行電子觸控簽名。簽名將直接印於合約底部。
                        </p>
                        <button onClick={() => setShowSigPad(true)} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition shadow-md flex items-center justify-center gap-2">
                          <Edit3 size={16}/> 開啟簽名板
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 檔案認證 Modal (已升級 KYC) */}
      {activeModal === 'profile' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><ShieldCheck className="mr-2 text-emerald-600" size={24}/> 住客檔案認證 (KYC)</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isProfileComplete ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center mb-6">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-100">
                    <ShieldCheck size={32} className="text-emerald-500"/>
                  </div>
                  <h4 className="text-lg font-black text-emerald-900 mb-2">檔案已完善，感謝配合！</h4>
                  <p className="text-xs text-emerald-700 font-medium leading-relaxed">您的身分證明文件與緊急聯絡人已加密儲存於管理中心。</p>
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
                      <p className="text-[10px] text-amber-700 font-bold leading-relaxed">依據管理規範，請上傳有效的身分證明文件並確實填寫緊急聯絡人資料。</p>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-xs font-black text-slate-800">1. 身分證明文件上傳</p>
                    </div>
                    
                    <select 
                      value={idType} 
                      onChange={e => setIdType(e.target.value)} 
                      className="w-full mb-3 p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 bg-white shadow-sm"
                    >
                      <option value="HKID">香港身份證 (HKID)</option>
                      <option value="CNID">內地身份證</option>
                      <option value="Passport">護照 (Passport)</option>
                      <option value="ExitEntryPermit">港澳通行證</option>
                      <option value="StudentCard">學校就讀證明</option>
                    </select>

                    <div className="relative">
                      <input 
                        type="file" 
                        id="id-upload" 
                        accept="image/*,.pdf" 
                        className="hidden" 
                        onChange={(e) => { 
                          if (e.target.files?.[0]) { 
                            setIdFile(e.target.files[0]);
                            setIsIdUploaded(true); 
                          } 
                        }} 
                      />
                      <label htmlFor="id-upload" className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isIdUploaded ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-emerald-400 hover:bg-emerald-50'}`}>
                        {isIdUploaded ? (
                          <>
                            <CheckCircle2 size={28} className="mb-2"/> 
                            <span className="text-sm font-black text-emerald-700 truncate px-4">{idFile?.name || '證件已夾帶'}</span>
                            <span className="text-[10px] text-emerald-600 mt-1">(支援圖片自動壓縮優化)</span>
                          </>
                        ) : (
                          <>
                            <IdCard size={28} className="mb-2"/> 
                            <span className="text-sm font-bold">點擊上傳 {idType === 'Passport' ? '護照' : idType === 'StudentCard' ? '就讀證明' : '證件'}</span>
                            <span className="text-[10px] text-slate-400 mt-1">支援 PNG / JPG / PDF (自動壓縮)</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-black text-slate-800 mb-4">2. 緊急聯絡人資訊 (必填)</p>
                    <div className="space-y-3">
                      <input type="text" placeholder="聯絡人姓名 (Name)" required value={emergencyContact.name} onChange={e => setEmergencyContact({...emergencyContact, name: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all font-bold" />
                      <div className="flex gap-3">
                        <input type="tel" placeholder="聯絡電話 (Phone)" required value={emergencyContact.phone} onChange={e => setEmergencyContact({...emergencyContact, phone: e.target.value})} className="w-2/3 p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all font-bold" />
                        <select required value={emergencyContact.relation} onChange={e => setEmergencyContact({...emergencyContact, relation: e.target.value})} className="w-1/3 p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 bg-white font-bold">
                          <option value="" disabled>關係</option><option value="父母">父母</option><option value="配偶">配偶</option><option value="親屬">親屬</option><option value="朋友">朋友</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={isSavingProfile || !isIdUploaded} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:bg-slate-400">
                    {isSavingProfile ? <><Loader2 size={18} className="animate-spin"/> 安全加密上傳中...</> : '確認送出 KYC 檔案'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ★ 全新升級：雙向報修進度與留言系統 Modal */}
      {activeModal === 'ticket' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh] sm:h-[80vh] overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            
            <div className="flex justify-between items-center p-6 bg-slate-900 text-white flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-700 rounded-full sm:hidden" />
              <h3 className="font-black text-xl mt-2 sm:mt-0 flex items-center"><Wrench className="mr-2 text-blue-400" size={24}/> 報修申請與進度追蹤</h3>
              <button onClick={() => { setActiveModal('none'); setViewingTicket(null); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>

            {viewingTicket ? (
              <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
                 <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 flex-none">
                   <button onClick={() => setViewingTicket(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"><ArrowLeft size={20}/></button>
                   <div>
                     <h4 className="font-black text-slate-800">{viewingTicket.title}</h4>
                     <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${viewingTicket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : viewingTicket.status === 'InProgress' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                       {viewingTicket.status === 'Resolved' ? '✅ 已解決' : viewingTicket.status === 'InProgress' ? '👨‍🔧 處理中 / 聯絡中' : '⏳ 等待受理'}
                     </span>
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                   {/* 報修原始內容 */}
                   <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                     <p className="text-[10px] text-slate-400 font-mono mb-2">{viewingTicket.createdAt?.toDate ? viewingTicket.createdAt.toDate().toLocaleString('zh-HK') : '剛剛'}</p>
                     <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{viewingTicket.description}</p>
                     {viewingTicket.photoUrl && (
                       <a href={viewingTicket.photoUrl} target="_blank" rel="noreferrer">
                         <img src={viewingTicket.photoUrl} alt="損壞照片" className="mt-3 rounded-xl border border-slate-200 max-h-40 object-cover hover:opacity-80 transition cursor-pointer" />
                       </a>
                     )}
                   </div>

                   {/* 管理員官方進度備註 */}
                   {viewingTicket.adminRemarks && (
                     <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 shadow-sm relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                       <p className="text-xs font-black text-blue-800 mb-1 flex items-center"><UserCircle size={14} className="mr-1"/> 管家最新進度</p>
                       <p className="text-sm font-bold text-blue-900 whitespace-pre-wrap">{viewingTicket.adminRemarks}</p>
                     </div>
                   )}

                   {/* 雙向留言板區塊 */}
                   <div className="pt-4 space-y-3">
                     {viewingTicket.comments?.map((msg: any, idx: number) => (
                       <div key={idx} className={`flex flex-col ${msg.sender === 'Tenant' ? 'items-end' : 'items-start'}`}>
                         <span className="text-[9px] text-slate-400 mb-1 px-1">{msg.sender === 'Tenant' ? '您' : '管家師傅'} • {new Date(msg.timestamp).toLocaleTimeString('zh-HK', {hour:'2-digit', minute:'2-digit'})}</span>
                         <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.sender === 'Tenant' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                           {msg.text}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* 留言輸入框 */}
                 {viewingTicket.status !== 'Resolved' && (
                   <div className="p-4 bg-white border-t border-slate-200 flex-none pb-8 sm:pb-4">
                     <form onSubmit={handleAddComment} className="flex gap-2">
                       <input type="text" value={ticketComment} onChange={e => setTicketComment(e.target.value)} placeholder="給管家或師傅留言..." className="flex-1 px-4 py-3 bg-slate-100 border-transparent rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition font-bold" />
                       <button type="submit" disabled={!ticketComment.trim() || isSubmittingComment} className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-blue-700 transition shadow-sm disabled:opacity-50">
                          {isSubmittingComment ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} className="ml-1"/>}
                       </button>
                     </form>
                   </div>
                 )}
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex bg-slate-100 p-2 mx-6 mt-6 rounded-2xl flex-none">
                  <button onClick={() => setTicketTab('submit')} className={`flex-1 py-2 text-sm font-black rounded-xl transition-all ${ticketTab === 'submit' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>提交新報修</button>
                  <button onClick={() => setTicketTab('history')} className={`flex-1 py-2 text-sm font-black rounded-xl transition-all ${ticketTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>我的報修紀錄 {myTickets.length > 0 && `(${myTickets.length})`}</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                  {ticketTab === 'submit' ? (
                    <form onSubmit={handleSubmitTicket} className="space-y-6 animate-in slide-in-from-left-4">
                      <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3">
                        <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={18}/>
                        <p className="text-[10px] text-blue-800 font-bold leading-relaxed">請具體描述損壞情況並提供照片。送出後，您可以切換至「我的報修紀錄」查看最新處理進度並與師傅留言溝通。</p>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 mb-3">請選擇損壞項目 *</p>
                        <div className="grid grid-cols-2 gap-3">
                          {['一般維修', '入伙裝修', '退租翻新', '單位清潔'].map(cat => (
                            <button key={cat} type="button" onClick={() => setTicketCategory(cat)} className={`py-3 px-4 rounded-xl text-sm font-bold transition-colors border ${ticketCategory === cat ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{cat}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 mb-3">狀況描述 *</p>
                        <textarea rows={4} required placeholder="例如：冷氣開了不冷，而且會滴水..." value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none placeholder:text-slate-400 text-slate-900 font-bold shadow-sm bg-slate-50" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 mb-3 flex justify-between">
                          <span>上傳照片 (選填)</span>
                          <span className="text-slate-400 font-normal">幫助師傅更快判斷</span>
                        </p>
                        <div className="relative shadow-sm">
                          <input type="file" id="photo-upload" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setTicketPhoto(e.target.files[0]); setIsPhotoUploaded(true); } }} />
                          <label htmlFor="photo-upload" className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isPhotoUploaded ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-blue-400 hover:bg-blue-50'}`}>
                            {isPhotoUploaded ? <><CheckCircle2 size={28} className="mb-2"/> <span className="text-sm font-black truncate px-4 max-w-[250px]">{ticketPhoto?.name || '照片已成功夾帶'}</span></> : <><Camera size={28} className="mb-2"/> <span className="text-sm font-bold">點擊拍照或上傳圖檔</span></>}
                          </label>
                        </div>
                      </div>
                      <button type="submit" disabled={isSubmittingTicket} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-xl disabled:opacity-50">
                        {isSubmittingTicket ? <><Loader2 size={18} className="animate-spin"/> 正在安全送出...</> : '確認送出報修單'}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-3 animate-in slide-in-from-right-4 pb-8">
                      {myTickets.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                          <Wrench size={40} className="mx-auto mb-3 opacity-30"/>
                          <p className="text-sm font-bold">目前沒有任何報修紀錄</p>
                        </div>
                      ) : (
                        myTickets.map(ticket => (
                          <button key={ticket.id} onClick={() => setViewingTicket(ticket)} className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-blue-400 hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${ticket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ticket.status === 'InProgress' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {ticket.status === 'Resolved' ? '✅ 已解決' : ticket.status === 'InProgress' ? '👨‍🔧 處理中 / 聯絡中' : '⏳ 等待受理'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleDateString('zh-HK') : ''}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{ticket.title}</h4>
                            <p className="text-xs text-slate-500 truncate mb-3">{ticket.description}</p>
                            
                            {ticket.adminRemarks && (
                              <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-3">
                                <p className="text-[10px] font-bold text-slate-700 flex items-center"><UserCircle size={12} className="mr-1"/> 管家最新回覆：</p>
                                <p className="text-xs text-blue-700 truncate font-medium">{ticket.adminRemarks}</p>
                              </div>
                            )}

                            <div className="flex justify-between items-center text-[10px] font-bold text-blue-500 pt-2 border-t border-slate-100">
                              <span className="flex items-center gap-1"><MessageSquare size={12}/> {ticket.comments?.length || 0} 則留言</span>
                              <span className="group-hover:translate-x-1 transition-transform flex items-center">查看詳情 <ChevronRight size={14}/></span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 帳單列表 Modal */}
      {activeModal === 'bills' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Receipt className="mr-2 text-cyan-600" size={24}/> 歷史帳單與收據</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-3 custom-scrollbar">
              {otherBills.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Receipt size={40} className="mx-auto mb-3 opacity-50"/>
                  <p className="text-sm font-bold">目前沒有任何帳單記錄</p>
                </div>
              ) : (
                [...otherBills]
                  .map(doc => {
                    const dynamicTitle = doc.formData?.items?.[0]?.description || (doc.type === 'Receipt' ? '繳款正式收據' : '對數結算單');
                    const isPending = doc.status === 'Pending' || doc.paymentStatus === 'Unpaid';
                    const amount = doc.formData?.totalAmount || doc.formData?.amount;

                    return (
                      <button key={doc.id} onClick={() => { setViewingDoc(doc); setActiveModal('view_doc'); }} className={`w-full flex justify-between items-center p-4 border rounded-xl hover:shadow-md transition-all text-left group ${isPending ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400' : 'bg-white border-slate-200 hover:border-cyan-400'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${doc.type === 'Receipt' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-800 flex flex-wrap items-center gap-2">
                              {dynamicTitle}
                              {isPending && <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-200 whitespace-nowrap">待繳費</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-1">
                              到期/更新日: {doc.formData?.docDate || doc.formData?.dueDate || (doc.createdAt?.toDate ? doc.createdAt.toDate().toLocaleDateString() : (typeof doc.createdAt === 'string' ? doc.createdAt.split('T')[0] : ''))}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                           {amount && <span className="text-sm font-black font-mono text-slate-700 hidden sm:block">${Number(amount).toLocaleString()}</span>}
                           <Eye size={18} className="text-slate-300 group-hover:text-cyan-600 transition-colors shrink-0" />
                        </div>
                      </button>
                    )
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 查看特定單據 Modal */}
      {activeModal === 'view_doc' && viewingDoc && (
        <div className="fixed inset-0 bg-slate-900/80 z-[110] flex flex-col items-center p-0 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full flex justify-end p-4 md:p-0 md:mb-4 flex-none max-w-[800px]">
             <button onClick={() => { setActiveModal('bills'); setViewingDoc(null); }} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition">
               <X size={24} />
             </button>
           </div>
           <div className="flex-1 overflow-y-auto w-full flex justify-center custom-scrollbar">
             <div className="origin-top scale-[0.45] sm:scale-75 md:scale-90 lg:scale-100 transition-transform h-[1123px] w-[794px]">
                {renderA4Document(viewingDoc)}
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
