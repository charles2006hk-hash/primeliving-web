'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { 
  Bell, CreditCard, Wrench, FileText, ChevronRight, Calendar, UserCircle, Droplets, Loader2,
  Landmark, UploadCloud, X, CheckCircle2, AlertCircle, FileSignature, Download,
  Camera, Receipt, ShieldCheck, IdCard, LogOut, Eye
} from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import Script from 'next/script';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  const [tenantDocs, setTenantDocs] = useState<any[]>([]); 
  
  const [activeModal, setActiveModal] = useState<'none' | 'payment' | 'contract' | 'ticket' | 'bills' | 'profile' | 'view_doc'>('none');
  const [viewingDoc, setViewingDoc] = useState<any>(null); 

  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'stripe'>('bank');
  const [isUploading, setIsUploading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);

  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [isSignDownloading, setIsSignDownloading] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  const [ticketCategory, setTicketCategory] = useState('冷氣水電');
  const [ticketDesc, setTicketDesc] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);

  const [emergencyContact, setEmergencyContact] = useState({ name: '', phone: '', relation: '' });
  const [isIdUploaded, setIsIdUploaded] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ★ 補回遺漏的登出功能
  const handleLogout = () => { 
    localStorage.clear(); 
    router.push('/tenant-portal'); 
  };

  useEffect(() => {
    const sessionStr = localStorage.getItem('pm_tenant_session');
    if (!sessionStr) { router.push('/tenant-portal'); return; }
    const sessionData = JSON.parse(sessionStr);

    const unsubTenant = onSnapshot(doc(db, 'tenants', sessionData.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const end = new Date(data.leaseEnd);
        const now = new Date();
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        setTenantData({
          id: docSnap.id,
          name: data.name,
          amountDue: data.monthlyRent || 0, 
          dueDate: "本月 1 日", 
          daysRemaining: diffDays > 0 ? diffDays : 0,
          status: data.status === 'Active' ? '合約已生效' : '待簽約 / 待繳費',
          roomInfo: `租客編號: ${data.contractId || docSnap.id.slice(-6).toUpperCase()}`,
          isContractSigned: data.isContractSigned || !!data.signature,
          signature: data.signature || '',
          signedAt: data.signedAt?.toDate ? data.signedAt.toDate().toLocaleString() : '',
          isProfileComplete: !!(data.emergencyContact?.name && (data.idUploaded || data.isIdVerified))
        });
        if (data.emergencyContact) setEmergencyContact(data.emergencyContact);
        if (data.idUploaded || data.isIdVerified) setIsIdUploaded(true);
      }
      setLoading(false);
    });

    const qDocs = query(collection(db, 'documents'), where('formData.tenantId', '==', sessionData.id));
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        return new Date(b.createdAt?.toDate() || 0).getTime() - new Date(a.createdAt?.toDate() || 0).getTime();
      });
      setTenantDocs(docs);
    });

    return () => { unsubTenant(); unsubDocs(); };
  }, [router]);

  const latestLease = tenantDocs.find(d => d.type === 'Lease');
  const otherBills = tenantDocs.filter(d => ['Receipt', 'Statement'].includes(d.type));

  const formatCurrency = (val: number | string) => new Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD' }).format(Number(val) || 0);

  const handleSignLease = async () => {
    if (!signature.trim()) return alert("請輸入您的法定全名作為電子簽名！");
    if (!latestLease) return alert("找不到合約檔案！");
    
    setIsSigning(true);
    try {
      await updateDoc(doc(db, 'tenants', tenantData.id), { 
        signature: signature, signedAt: serverTimestamp(), isContractSigned: true, status: 'Active' 
      });
      await updateDoc(doc(db, 'documents', latestLease.id), {
        'formData.tenantSignature': signature,
        'formData.signedAt': new Date().toISOString()
      });
      alert("✅ 電子合約簽署成功，具有完整法律效力。");
    } catch (error) { console.error(error); alert("簽署失敗"); } 
    finally { setIsSigning(false); }
  };

  const handleDownloadPDF = async () => {
    if (!contractRef.current) return;
    const htmlToImage = (window as any).htmlToImage;
    const jspdfObj = (window as any).jspdf;
    if (!htmlToImage || !jspdfObj) return alert("⚠️ 系統準備中，請稍後再試！");
    
    setIsSignDownloading(true);
    try {
      const imgData = await htmlToImage.toPng(contractRef.current, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
      const pdf = new jspdfObj.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (contractRef.current.offsetHeight * pdfWidth) / contractRef.current.offsetWidth;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Document_${tenantData.name}.pdf`);
    } catch (error) { console.error(error); alert("生成 PDF 失敗。"); } 
    finally { setIsSignDownloading(false); }
  };

  const renderA4Document = (docData: any, isSigningMode = false) => {
    if (!docData) return null;
    const fd = docData.formData || {};
    const items = docData.items || [];
    
    const baseRent = Number(fd.monthlyRent) || 0;
    const deposit = Number(fd.deposit) || 0;
    const extraTotal = items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    const receiptTotal = baseRent + deposit + extraTotal;
    const statementBalance = (Number(fd.totalReceived)||0) - (Number(fd.totalReceivable)||0) - (Number(fd.reservedDamages)||0);

    const formatCurrency = (val: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'HKD' }).format(Number(val) || 0);

    return (
      <div ref={isSigningMode ? contractRef : undefined} className="w-[210mm] min-h-[297mm] bg-white px-[20mm] py-[15mm] text-slate-900 font-sans relative shadow-lg origin-top scale-[0.5] sm:scale-[0.6] md:scale-75 lg:scale-90 print:shadow-none print:scale-100">
        
        <div className="flex flex-col items-center mb-5 border-b-[3px] border-[#1e293b] pb-4">
          <img src="/PrimelivingLetterhead.jpg" alt="Prime Living Letterhead" className="h-16 object-contain mb-2" onError={(e) => { e.currentTarget.style.display = 'none'; }}/>
          <div className="text-[11px] font-bold text-slate-600 tracking-wide text-center">地址：新界沙田石門新貿中心B座22樓11室 | 電話：3996 9796 | 電郵：info@primelivinghk.com</div>
        </div>

        <div className="text-right mb-6">
          <h2 className="text-xl font-black uppercase tracking-widest text-slate-800">
            {docData.type === 'Lease' ? 'TENANCY AGREEMENT' : docData.type === 'Receipt' ? 'OFFICIAL RECEIPT' : docData.type === 'Statement' ? 'ACCOUNT STATEMENT' : 'TERMINATION AGREEMENT'}
          </h2>
          <p className="text-sm font-bold text-slate-600 tracking-[0.5em] mt-1">
            {docData.type === 'Lease' ? '租 賃 合 約' : docData.type === 'Receipt' ? '正 式 收 據' : docData.type === 'Statement' ? '對 數 結 算 單' : '退 租 協 議'}
          </p>
          <p className="text-xs font-mono mt-3">Date: {fd.docDate}</p>
        </div>

        <div className="flex justify-between gap-6 mb-6">
          <div className="flex-1 border border-slate-300 p-4 rounded-sm bg-slate-50/50">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 border-b border-slate-300 pb-2">Landlord / Manager</h3>
            <p className="font-bold text-sm">PRIME LIVING PROPERTY(HK)<br/>MANAGEMENT</p>
          </div>
          <div className="flex-1 border border-slate-300 p-4 rounded-sm bg-slate-50/50">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 border-b border-slate-300 pb-2">Tenant (租客)</h3>
            <p className="font-bold text-sm">{fd.tenantName || '__________________'}</p>
            <p className="text-xs mt-1 font-mono">Phone: {fd.tenantPhone || '__________________'}</p>
            <p className="text-xs mt-1 font-mono">ID: {fd.tenantIdNumber || '__________________'}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Premises Details (物業詳情)</div>
          <table className="w-full text-sm border-collapse border border-slate-300">
            <tbody>
              <tr><td className="border border-slate-300 p-3 font-bold w-1/4">Property Address</td><td colSpan={3} className="border border-slate-300 p-3 font-bold">{fd.propertyAddress}</td></tr>
              <tr><td className="border border-slate-300 p-3 font-bold w-1/4">Room No.</td><td className="border border-slate-300 p-3 font-bold text-blue-700 w-1/4">{fd.roomName}</td><td className="border border-slate-300 p-3 font-bold w-1/4">Lease Term</td><td className="border border-slate-300 p-3 font-mono text-xs w-1/4">{fd.leaseStart} to {fd.leaseEnd}</td></tr>
            </tbody>
          </table>
        </div>

        {docData.type === 'Statement' ? (
          <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Account Reconciliation (結算明細)</div><table className="w-full text-sm border-collapse border border-slate-300"><tbody><tr><td className="border border-slate-300 p-3 font-bold w-3/4">Total Receivable (應收總額)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrency(fd.totalReceivable)}</td></tr><tr><td className="border border-slate-300 p-3 font-bold w-3/4">Total Received / Deposit (已收總額/押金)</td><td className="border border-slate-300 p-3 text-right font-mono text-emerald-700">{formatCurrency(fd.totalReceived)}</td></tr><tr><td className="border border-slate-300 p-3 font-bold w-3/4 text-red-600">Reserved Deductions / Damages (預留損耗及扣款)</td><td className="border border-slate-300 p-3 text-right font-mono text-red-600">- {formatCurrency(fd.reservedDamages)}</td></tr></tbody><tfoot><tr className="bg-slate-50 font-black"><td className="border border-slate-300 p-3 text-right">FINAL BALANCE (最終結餘):<br/><span className="text-[10px] font-normal text-slate-500">(正數為需退還租客 / 負數為租客需補繳)</span></td><td className={`border border-slate-300 p-3 text-right font-mono text-xl ${statementBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{statementBalance >= 0 ? '+' : ''}{formatCurrency(statementBalance)}</td></tr><tr><td colSpan={2} className="border border-slate-300 p-2 text-xs">Method: <span className="font-bold">{fd.paymentMethod}</span></td></tr></tfoot></table></div>
        ) : docData.type === 'Receipt' ? (
          <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Payment Received (收款明細)</div><table className="w-full text-sm border-collapse border border-slate-300"><thead><tr className="bg-slate-50"><th className="border border-slate-300 p-3 text-left">Description</th><th className="border border-slate-300 p-3 text-right w-32">Amount</th></tr></thead><tbody>{baseRent > 0 && <tr><td className="border border-slate-300 p-3">Monthly Rent (租金)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrency(baseRent)}</td></tr>}{deposit > 0 && <tr><td className="border border-slate-300 p-3">Security Deposit (按金)</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrency(deposit)}</td></tr>}{items.map((item:any, i:number) => <tr key={i}><td className="border border-slate-300 p-3 text-slate-600">+ {item.desc}</td><td className="border border-slate-300 p-3 text-right font-mono">{formatCurrency(item.amount)}</td></tr>)}</tbody><tfoot><tr className="bg-slate-50 font-black"><td className="border border-slate-300 p-3 text-right">TOTAL RECEIVED (總共收取):</td><td className="border border-slate-300 p-3 text-right font-mono text-lg">{formatCurrency(receiptTotal)}</td></tr><tr><td colSpan={2} className="border border-slate-300 p-2 text-xs">Payment Method: <span className="font-bold">{fd.paymentMethod}</span></td></tr></tfoot></table></div>
        ) : docData.type === 'Lease' ? (
          <div className="mb-6"><div className="bg-[#1e293b] text-white px-3 py-2 text-xs font-bold uppercase">Financial Terms (財務條款)</div><table className="w-full text-sm border-collapse border border-slate-300"><tbody><tr><td className="border border-slate-300 p-3 font-bold w-1/4">Monthly Rent<br/><span className="text-[10px] text-slate-500 font-normal">每月租金</span></td><td className="border border-slate-300 p-3 font-mono font-bold text-lg w-1/4">{formatCurrency(baseRent)}</td><td className="border border-slate-300 p-3 font-bold w-1/4">Security Deposit<br/><span className="text-[10px] text-slate-500 font-normal">押金</span></td><td className="border border-slate-300 p-3 font-mono font-bold w-1/4">{formatCurrency(deposit)}</td></tr></tbody></table></div>
        ) : null}

        {fd.remarks && <div className="mb-8 p-3 border-b border-slate-300 text-xs leading-relaxed"><span className="font-bold block mb-1">Remarks (備註):</span><span className="whitespace-pre-wrap">{fd.remarks}</span></div>}

        {docData.type === 'Lease' && (
           <div className="mb-8 text-[10px] text-justify text-slate-600 space-y-2 border-t border-slate-300 pt-4">
             <p>1. The Tenant agrees to pay the rent in advance on the 1st day of each calendar month.<br/>租客同意於每月1號預繳該月租金。</p>
             <p>2. The Security Deposit shall be refunded to the Tenant without interest within 14 days after termination.<br/>於合約終止後14天內，在扣除任何損壞賠償或欠款後，押金將無息退還予租客。</p>
           </div>
        )}

        <div className="absolute bottom-[30mm] left-[20mm] right-[20mm] flex justify-between">
           <div className="w-[40%] pt-8 border-t border-slate-800 text-center relative">
             <p className="font-bold text-xs uppercase relative z-10">Landlord / Authorized Agent</p>
             <p className="text-[10px] text-slate-500 mt-1 relative z-10">業主 / 授權代理人</p>
             {docData.stampPos && (
                <div className="absolute z-0 pointer-events-none" style={{ left: docData.stampPos.x, top: docData.stampPos.y, width: '35mm', height: '35mm' }}>
                  <img src="/stamp.png" alt="Company Stamp" className="w-full h-full object-contain mix-blend-multiply" />
                </div>
             )}
           </div>
           
           <div className="w-[40%] pt-8 border-t border-slate-800 text-center relative">
             <p className="font-bold text-xs uppercase relative z-10">Tenant</p>
             <p className="text-[10px] text-slate-500 mt-1 relative z-10">租客簽署</p>
             {(tenantData.isContractSigned || fd.tenantSignature) && docData.type === 'Lease' && (
               <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full text-center z-20 bg-white/80 py-2">
                 <p className="text-4xl text-slate-800" style={{ fontFamily: "'Brush Script MT', 'Cedarville Cursive', cursive" }}>{fd.tenantSignature || tenantData.signature}</p>
                 <p className="text-[9px] text-slate-400 font-mono mt-1">Signed</p>
               </div>
             )}
           </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;
  if (!tenantData) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-12 selection:bg-orange-200 font-sans relative">
      <Script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="lazyOnload" />

      {isVerifying && (
        <div className="fixed inset-0 bg-slate-900/80 z-[200] flex flex-col items-center justify-center text-white backdrop-blur-sm animate-in fade-in">
          <Loader2 size={48} className="animate-spin text-emerald-400 mb-4" />
          <h2 className="text-2xl font-black">正在向銀行確認款項...</h2>
          <p className="text-slate-300 mt-2 font-medium">請稍候，系統即將為您結算帳單</p>
        </div>
      )}

      <div className="bg-white px-6 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <div className="font-black text-lg text-slate-800 tracking-tight">佳寓 <span className="text-orange-500 text-sm">PrimeLiving</span></div>
        <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
      </div>

      <div className="max-w-md mx-auto space-y-6 pt-6 px-4">
        <div className="flex justify-between items-center px-2">
          <div><h1 className="text-2xl font-black text-slate-900">你好, {tenantData.name}</h1></div>
          <button className="relative p-3 bg-white rounded-2xl shadow-sm border border-slate-100"><Bell size={20} className="text-slate-600" /><span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border-2 border-white"></span></button>
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
          <button disabled className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-md flex items-center justify-center gap-2 hover:bg-orange-50 transition-all active:scale-95 shadow-xl relative z-10 disabled:opacity-50 disabled:cursor-not-allowed">
            <CreditCard size={18}/> 請查閱下方單據繳費
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">剩餘租期</p><p className="text-2xl font-black text-slate-800">{tenantData.daysRemaining} <span className="text-xs font-bold text-slate-500">天</span></p></div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center overflow-hidden"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">我的帳戶</p><p className="text-sm font-black text-slate-800 truncate">{tenantData.roomInfo}</p></div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col divide-y divide-slate-50">
          <button onClick={() => setActiveModal('contract')} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group text-left">
            <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform ${tenantData.isContractSigned ? 'bg-emerald-50' : 'bg-purple-50'}`}><FileSignature size={20} className={tenantData.isContractSigned ? 'text-emerald-500' : 'text-purple-500'}/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">電子合約與簽署 {!tenantData.isContractSigned && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}</p><p className={`text-[10px] font-bold ${tenantData.isContractSigned ? 'text-slate-400' : 'text-red-500'}`}>{tenantData.isContractSigned ? '已簽署，可下載 PDF' : '尚未簽署，請立即完成'}</p></div></div><ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>
          
          <button onClick={() => setActiveModal('bills')} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group text-left">
            <div className="flex items-center gap-4"><div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Receipt size={20} className="text-cyan-500"/></div><div><p className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">歷史單據與帳單</p><p className="text-[10px] font-bold text-slate-400">查看管家開立之收據與對數單</p></div></div><ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>
        </div>
      </div>

      {activeModal === 'contract' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-100 w-full sm:max-w-[900px] rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl flex flex-col h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 bg-white rounded-t-[2.5rem] sm:rounded-t-3xl border-b border-slate-200 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><FileText className="mr-2 text-purple-600" size={24}/> 電子租賃合約</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
              <div className="flex-1 bg-slate-200 flex justify-center py-8 overflow-y-auto custom-scrollbar">
                {latestLease ? renderA4Document(latestLease, true) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                     <AlertCircle size={48} className="mb-4 opacity-50" />
                     <p className="font-bold">管家尚未發布合約</p>
                     <p className="text-xs mt-1">請稍後再回來查看</p>
                  </div>
                )}
              </div>

              {latestLease && (
                <div className="w-full md:w-[320px] bg-white border-l border-slate-200 p-6 flex flex-col justify-center">
                  {tenantData.isContractSigned ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                      <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2"/>
                      <p className="text-sm font-black text-emerald-800">合約已成功簽署</p>
                      <button onClick={handleDownloadPDF} disabled={isSignDownloading} className="mt-4 w-full py-3 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50">
                        {isSignDownloading ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>} 下載 PDF 副本
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-2 flex items-center"><FileSignature size={16} className="mr-1.5 text-purple-600"/> 請輸入您的法定全名作為電子簽名：</label>
                        <input type="text" placeholder="e.g. Chan Tai Man" value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full p-4 border-2 border-slate-200 rounded-xl text-2xl outline-none focus:border-purple-500 transition-colors text-center" style={{ fontFamily: "'Brush Script MT', 'Cedarville Cursive', cursive" }} />
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <input type="checkbox" className="mt-1 w-4 h-4 accent-purple-600 cursor-pointer" required/>
                        <span className="text-[10px] text-slate-600 leading-relaxed font-bold">本人確認上述簽名由本人親自輸入，並同意以電子方式簽署此文件。</span>
                      </label>
                      <button onClick={handleSignLease} disabled={isSigning || !signature} className="w-full py-4 bg-purple-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-purple-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                        {isSigning ? <><Loader2 size={18} className="animate-spin"/> 處理中...</> : '確認並以電子簽署'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeModal === 'bills' && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-none relative">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full sm:hidden" />
              <h3 className="font-black text-xl text-slate-800 mt-2 sm:mt-0 flex items-center"><Receipt className="mr-2 text-cyan-600" size={24}/> 歷史帳單與收據</h3>
              <button onClick={() => setActiveModal('none')} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors mt-2 sm:mt-0"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-3">
              {otherBills.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Receipt size={40} className="mx-auto mb-3 opacity-50"/>
                  <p className="text-sm font-bold">目前沒有任何帳單記錄</p>
                </div>
              ) : (
                otherBills.map(doc => (
                  <button key={doc.id} onClick={() => { setViewingDoc(doc); setActiveModal('view_doc'); }} className="w-full flex justify-between items-center p-4 border border-slate-200 rounded-xl hover:border-cyan-400 hover:shadow-md transition-all bg-white text-left group">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${doc.type === 'Receipt' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                        <FileText size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-800">{doc.type === 'Receipt' ? '繳款正式收據' : '對數結算單'}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">開立日期: {doc.formData?.docDate}</p>
                      </div>
                    </div>
                    <Eye size={18} className="text-slate-300 group-hover:text-cyan-600 transition-colors" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeModal === 'view_doc' && viewingDoc && (
        <div className="fixed inset-0 bg-slate-900/80 z-[110] flex flex-col items-center p-0 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full flex justify-end p-4 md:p-0 md:mb-4 flex-none max-w-[800px]">
             <button onClick={() => { setActiveModal('bills'); setViewingDoc(null); }} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition">
               <X size={24} />
             </button>
           </div>
           <div className="flex-1 overflow-y-auto w-full flex justify-center custom-scrollbar">
             {renderA4Document(viewingDoc)}
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
