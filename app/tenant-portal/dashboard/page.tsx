'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; 
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Users, Plus, Search, FileText, Receipt, Calendar, Home, Phone, AlertCircle, Edit, Trash2, X, Loader2, CheckCircle2, Clock, Mail, ChevronRight, MessageSquare, CreditCard, Eye
} from 'lucide-react';
import DocumentGeneratorModal from '@/components/DocumentGeneratorModal';

type TenantStatus = 'Pending' | 'Active' | 'Terminated'; 

interface Tenant {
  id: string;
  name: string;
  phone: string;
  identityNumber: string; 
  propertyId: string;
  roomId: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  deposit: number;
  status: TenantStatus;
  documentIds: string[]; 
  createdAt: any;
  wechatOpenId?: string;
  // ★ 擴充狀態欄位
  isContractSigned?: boolean;
  signature?: string;
  amountDue?: number;
}

export default function TenantsPage() {
  const router = useRouter(); 
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]); 
  const [tickets, setTickets] = useState<any[]>([]); // ★ 新增：儲存所有報修與訊息紀錄
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [drawerTab, setDrawerTab] = useState<'contract' | 'finance' | 'crm'>('contract');

  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docModalType, setDocModalType] = useState<'Lease' | 'Receipt' | 'Termination' | 'Statement'>('Lease');
  const [editDocData, setEditDocData] = useState<any>(null);

  const [formData, setFormData] = useState<Partial<Tenant>>({
    name: '', phone: '', identityNumber: '', propertyId: '', roomId: '', 
    leaseStart: '', leaseEnd: '', monthlyRent: 0, deposit: 0, status: 'Pending', documentIds: [],
    wechatOpenId: ''
  });

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!db) return;
    
    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), orderBy('createdAt', 'desc')), snap => {
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
      setLoading(false);
    });

    const unsubProps = onSnapshot(collection(db, 'properties'), snap => {
      setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), snap => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubDocs = onSnapshot(query(collection(db, 'documents'), orderBy('updatedAt', 'desc')), snap => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // ★ 新增監聽 tickets 用來計算 CRM 未讀訊息數
    const unsubTickets = onSnapshot(collection(db, 'tickets'), snap => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    return () => { unsubTenants(); unsubProps(); unsubRooms(); unsubDocs(); unsubTickets(); };
  }, []);

  const openModal = (tenant?: Tenant) => {
    if (tenant) {
      setEditingId(tenant.id);
      setFormData(tenant);
    } else {
      setEditingId(null);
      const today = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(today.getFullYear() + 1);
      setFormData({ 
        name: '', phone: '', identityNumber: '', propertyId: '', roomId: '', wechatOpenId: '',
        leaseStart: today.toISOString().split('T')[0], leaseEnd: nextYear.toISOString().split('T')[0], 
        monthlyRent: 0, deposit: 0, status: 'Pending', documentIds: []
      });
    }
    setIsModalOpen(true);
  };

  const openDrawer = (tenant: Tenant, tab: 'contract' | 'finance' | 'crm' = 'contract') => {
    setSelectedTenant(tenant);
    setDrawerTab(tab);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.propertyId || !formData.roomId) return alert("請填寫必填欄位！");
    setIsSaving(true);
    try {
      const room = rooms.find(r => r.id === formData.roomId);
      const roomName = room?.name || 'ROOM';
      const autoContractId = `${roomName}-${formData.phone?.slice(-4) || '0000'}-${new Date().getFullYear()}`;
      const dataToSave = { 
        ...formData, contractId: autoContractId, monthlyRent: Number(formData.monthlyRent) || 0, deposit: Number(formData.deposit) || 0
      };

      if (editingId) {
        await updateDoc(doc(db, 'tenants', editingId), { ...dataToSave, updatedAt: serverTimestamp() });
        if (selectedTenant?.id === editingId) setSelectedTenant({ ...selectedTenant, ...dataToSave } as Tenant);
      } else {
        await addDoc(collection(db, 'tenants'), { ...dataToSave, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'rooms', formData.roomId!), { status: 'Occupied', webStatus: 'draft' });
      }
      alert(`✅ 租約已儲存！\n租客專屬登入編號：${autoContractId}`);
      setIsModalOpen(false);
    } catch (error) { 
      console.error(error); alert("❌ 儲存失敗"); 
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此租客紀錄嗎？(相關財務數據將保留為孤立紀錄)")) return;
    await deleteDoc(doc(db, 'tenants', id));
    if (selectedTenant?.id === id) setSelectedTenant(null);
  };

  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || '未知盤源';
  const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name || '未知房間';
  
  const filteredTenants = tenants.filter(t => 
    (t.name || '').includes(searchTerm) || (t.phone || '').includes(searchTerm) || getPropertyName(t.propertyId).includes(searchTerm)
  );

  return (
    <div className="min-h-full flex flex-col animate-in fade-in duration-300 relative overflow-hidden">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center"><Users className="mr-2 text-blue-600" /> 租客與租約管理</h2>
          <p className="text-sm text-slate-500 mt-1">管理租客資料、租期，並連動合約文件與帳單。</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => openModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-md hover:bg-blue-700 transition"><Plus size={18} className="mr-1" /> 新增租約</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24}/></div><div><p className="text-xs font-bold text-slate-500 uppercase">總履約中租客</p><p className="text-2xl font-black text-slate-800">{tenants.filter(t => t.status === 'Active').length}</p></div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Clock size={24}/></div><div><p className="text-xs font-bold text-slate-500 uppercase">未生效租約 (即將入駐)</p><p className="text-2xl font-black text-slate-800">{tenants.filter(t => t.status === 'Pending').length}</p></div></div>
        <div className="bg-slate-900 p-4 rounded-xl shadow-md flex items-center gap-4 text-white"><div className="p-3 bg-white/10 text-white rounded-lg"><Receipt size={24}/></div><div><p className="text-xs font-bold text-slate-400 uppercase">本月待產生帳單</p><p className="text-2xl font-black text-white">{tenants.filter(t => t.status === 'Active').length} <span className="text-sm font-normal text-slate-400">份</span></p></div></div>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4 flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" placeholder="搜尋姓名、電話或盤源名稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/></div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center"><Loader2 className="animate-spin text-blue-600" size={40} /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr><th className="p-4 font-bold">租客姓名 / 聯絡</th><th className="p-4 font-bold">入駐盤源 / 房間</th><th className="p-4 font-bold">租期 (起訖)</th><th className="p-4 font-bold text-right">月租金</th><th className="p-4 font-bold">狀態</th><th className="p-4 font-bold text-center">連動管理 (狀態指示)</th><th className="p-4 font-bold text-center">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">目前沒有符合的租客紀錄</td></tr>
                ) : (
                  filteredTenants.map(tenant => {
                    // ==========================================
                    // 🎯 智能狀態指示器邏輯 (Stateful Indicators)
                    // ==========================================
                    
                    // 1. 合約狀態判斷
                    const hasLease = documents.some(d => d.formData?.tenantId === tenant.id && d.type === 'Lease');
                    const isSigned = tenant.isContractSigned || !!tenant.signature;
                    let contractColor = "bg-slate-100 text-slate-400";
                    let contractTooltip = "未發布合約";
                    let contractIndicator = <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>;

                    if (hasLease && !isSigned) {
                      contractColor = "bg-amber-50 text-amber-600 border border-amber-200";
                      contractTooltip = "等待租客回簽";
                      contractIndicator = <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white animate-pulse"></span>;
                    } else if (hasLease && isSigned) {
                      contractColor = "bg-emerald-50 text-emerald-600 border border-emerald-200";
                      contractTooltip = "合約已簽署";
                      contractIndicator = <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white rounded-full p-0.5 border-[1.5px] border-white"><CheckCircle2 size={10}/></span>;
                    }

                    // 2. 帳單狀態判斷
                    const hasUnpaid = (tenant.amountDue || 0) > 0;
                    const financeColor = hasUnpaid ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-emerald-50 text-emerald-600";
                    const financeTooltip = hasUnpaid ? `有待繳帳款 ($${tenant.amountDue})` : "帳務正常";
                    const financeIndicator = hasUnpaid ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white animate-pulse"></span> : null;

                    // 3. CRM 狀態判斷
                    const pendingTickets = tickets.filter(t => t.tenantId === tenant.id && t.status === 'Open').length;
                    const crmColor = pendingTickets > 0 ? "bg-blue-50 text-blue-600 border border-blue-200" : "bg-slate-50 text-slate-400";
                    const crmTooltip = pendingTickets > 0 ? `有 ${pendingTickets} 個待處理訊息/報修` : "無未處理事項";
                    const crmIndicator = pendingTickets > 0 ? <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-black flex items-center justify-center rounded-full border border-white shadow-sm">{pendingTickets}</span> : null;

                    return (
                      <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4"><div className="font-bold text-slate-800">{tenant.name}</div><div className="text-xs text-slate-500 flex items-center mt-1"><Phone size={12} className="mr-1"/> {tenant.phone}</div></td>
                        <td className="p-4"><div className="text-sm font-bold text-blue-700 flex items-center gap-1"><Home size={14}/> {getPropertyName(tenant.propertyId)}</div><div className="text-xs text-slate-500 mt-1 pl-5 text-indigo-600 font-bold">房間：{getRoomName(tenant.roomId)}</div></td>
                        <td className="p-4"><div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded inline-block">{tenant.leaseStart || '未設定'}</div><div className="text-xs text-slate-400 mt-1 pl-1">至 {tenant.leaseEnd || '未設定'}</div></td>
                        <td className="p-4 text-right font-mono font-bold text-red-600">${(tenant.monthlyRent || 0).toLocaleString()}</td>
                        <td className="p-4">{tenant.status === 'Active' && <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-bold flex items-center w-max"><CheckCircle2 size={12} className="mr-1"/> 履約中</span>}{tenant.status === 'Pending' && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold flex items-center w-max"><Clock size={12} className="mr-1"/> 未生效</span>}{tenant.status === 'Terminated' && <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded-full text-xs font-bold flex items-center w-max"><AlertCircle size={12} className="mr-1"/> 已退租</span>}</td>
                        <td className="p-4">
                          {/* ★ 三大有狀態連動按鈕 */}
                          <div className="flex justify-center gap-3">
                            <button onClick={() => openDrawer(tenant, 'contract')} className={`relative p-2 rounded-lg transition-all hover:shadow-md ${contractColor}`} title={contractTooltip}>
                              <FileText size={18}/>{contractIndicator}
                            </button>
                            <button onClick={() => openDrawer(tenant, 'finance')} className={`relative p-2 rounded-lg transition-all hover:shadow-md ${financeColor}`} title={financeTooltip}>
                              <Receipt size={18}/>{financeIndicator}
                            </button>
                            <button onClick={() => openDrawer(tenant, 'crm')} className={`relative p-2 rounded-lg transition-all hover:shadow-md ${crmColor}`} title={crmTooltip}>
                              <MessageSquare size={18}/>{crmIndicator}
                            </button>
                          </div>
                        </td>
                        <td className="p-4"><div className="flex justify-center gap-1"><button onClick={() => openModal(tenant)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition"><Edit size={16}/></button><button onClick={() => handleDelete(tenant.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition"><Trash2 size={16}/></button></div></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedTenant(null)} />
          <div className="relative w-full md:w-[600px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start flex-none">
              <div>
                <div className="flex items-center gap-3 mb-2"><h2 className="text-2xl font-black text-slate-800">{selectedTenant.name}</h2>{selectedTenant.status === 'Active' && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">履約中</span>}{selectedTenant.status === 'Pending' && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">未生效</span>}</div>
                <div className="text-sm font-bold text-blue-700 flex items-center gap-1 mb-1"><Home size={14}/> {getPropertyName(selectedTenant.propertyId)} - {getRoomName(selectedTenant.roomId)}</div>
                <p className="text-sm text-slate-500 flex items-center gap-1"><Phone size={14}/> {selectedTenant.phone}</p>
              </div>
              <button onClick={() => setSelectedTenant(null)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-full transition"><X size={20}/></button>
            </div>

            <div className="flex px-6 bg-slate-50 border-b border-slate-200 gap-6 flex-none">
              <button onClick={() => setDrawerTab('contract')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${drawerTab === 'contract' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>📝 合約與檔案</button>
              <button onClick={() => setDrawerTab('finance')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${drawerTab === 'finance' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>💰 帳務與催繳</button>
              <button onClick={() => setDrawerTab('crm')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${drawerTab === 'crm' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>💬 CRM與互動</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              
              {/* Tab 1: 合約與檔案 */}
              {drawerTab === 'contract' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-bold text-slate-800">電子合約與退租文件</h4>
                      <p className="text-xs text-slate-500 mt-1">管理該租客的所有法務合約</p>
                    </div>
                    <button onClick={() => { setEditDocData(null); setDocModalType('Lease'); setIsDocModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition shadow-sm text-sm">
                      + 產生新合約
                    </button>
                  </div>

                  <div className="space-y-3">
                    {documents.filter(d => d.formData?.tenantId === selectedTenant.id && ['Lease', 'Termination'].includes(d.type)).length === 0 ? (
                       <p className="text-center text-sm text-slate-400 py-4">目前沒有任何合約記錄</p>
                    ) : (
                      documents.filter(d => d.formData?.tenantId === selectedTenant.id && ['Lease', 'Termination'].includes(d.type)).map(docItem => (
                        <div key={docItem.id} className="flex justify-between items-center p-4 border border-slate-100 rounded-xl hover:border-indigo-200 transition-colors bg-white">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${docItem.type === 'Lease' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}><FileText size={20} /></div>
                            <div>
                              <p className="font-bold text-sm text-slate-800">{docItem.type === 'Lease' ? '房屋租賃合約' : '退租協議'}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">最後更新: {docItem.updatedAt?.toDate ? docItem.updatedAt.toDate().toLocaleDateString() : docItem.formData?.docDate}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditDocData(docItem); setIsDocModalOpen(true); }} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition" title="預覽與修改"><Eye size={16}/></button>
                            <button onClick={async () => { if(confirm('確定要刪除這份文件嗎？刪除後無法恢復。')) { await deleteDoc(doc(db, 'documents', docItem.id)); } }} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition" title="刪除檔案"><Trash2 size={16}/></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: 帳務與催繳 */}
              {drawerTab === 'finance' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-bold text-slate-800">歷史帳單與收據</h4>
                      <p className="text-xs text-slate-500 mt-1">管理該租客的繳費收據與對數單</p>
                    </div>
                    <button onClick={() => { setEditDocData(null); setDocModalType('Statement'); setIsDocModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 transition shadow-sm text-sm">
                      + 開立收據 / 對數單
                    </button>
                  </div>

                  <div className="space-y-3">
                    {documents.filter(d => d.formData?.tenantId === selectedTenant.id && ['Receipt', 'Statement'].includes(d.type)).length === 0 ? (
                       <p className="text-center text-sm text-slate-400 py-4">目前沒有任何財務單據記錄</p>
                    ) : (
                      documents.filter(d => d.formData?.tenantId === selectedTenant.id && ['Receipt', 'Statement'].includes(d.type)).map(docItem => (
                        <div key={docItem.id} className="flex justify-between items-center p-4 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors bg-white">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${docItem.type === 'Receipt' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}><Receipt size={20} /></div>
                            <div>
                              <p className="font-bold text-sm text-slate-800">{docItem.type === 'Receipt' ? '繳款正式收據' : '對數結算單'}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">最後更新: {docItem.updatedAt?.toDate ? docItem.updatedAt.toDate().toLocaleDateString() : docItem.formData?.docDate}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditDocData(docItem); setIsDocModalOpen(true); }} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition" title="預覽與修改"><Eye size={16}/></button>
                            <button onClick={async () => { if(confirm('確定要刪除這份財務單據嗎？')) { await deleteDoc(doc(db, 'documents', docItem.id)); } }} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition" title="刪除檔案"><Trash2 size={16}/></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: CRM與互動 */}
              {drawerTab === 'crm' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"><h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest">微信積分綁定 (P-Dollar)</h4>{selectedTenant.wechatOpenId ? (<div className="flex items-center justify-between bg-amber-50 p-3 rounded-lg border border-amber-100"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center text-amber-700 font-black"><MessageSquare size={16}/></div><div><p className="text-sm font-bold text-amber-900">已綁定微信帳號</p><p className="text-[10px] text-amber-600 font-mono">{selectedTenant.wechatOpenId}</p></div></div><button onClick={() => router.push('/tenants/users')} className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded hover:bg-amber-200 transition">查看 P-Dollar</button></div>) : (<div className="text-center bg-slate-50 p-4 rounded-lg"><p className="text-sm font-bold text-slate-600">尚未綁定微信</p><p className="text-xs text-slate-400 mt-1">租客需在小程式首頁進行身份認證</p></div>)}</div>
                  <div><div className="flex justify-between items-end mb-3"><h4 className="font-black text-slate-800 flex items-center gap-2"><Mail size={16} className="text-slate-400"/> 發送公司信件</h4></div><div className="space-y-2"><button onClick={() => router.push(`/letters?tenant=${encodeURIComponent(selectedTenant.name)}`)} className="w-full flex items-center justify-between bg-white border border-slate-200 p-3 rounded-lg hover:border-amber-400 hover:shadow-sm transition group"><div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Mail size={16} className="text-slate-400 group-hover:text-amber-500"/> 發送「欠租催繳」信件</div><ChevronRight size={16} className="text-slate-400"/></button><button onClick={() => router.push(`/letters?tenant=${encodeURIComponent(selectedTenant.name)}`)} className="w-full flex items-center justify-between bg-white border border-slate-200 p-3 rounded-lg hover:border-amber-400 hover:shadow-sm transition group"><div className="flex items-center gap-2 text-sm font-bold text-slate-700"><AlertCircle size={16} className="text-slate-400 group-hover:text-amber-500"/> 發送「退租/搬出」指引</div><ChevronRight size={16} className="text-slate-400"/></button></div></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
            <div className="flex justify-between items-center p-4 border-b bg-slate-50 flex-none"><h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Users className="text-blue-600" size={20}/> {editingId ? '編輯租約' : '建立新租約'}</h3><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20}/></button></div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/50">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4"><div className="text-xs font-black text-blue-600 uppercase border-b border-blue-100 pb-2">1. 租客基本資料</div><div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-bold text-slate-500 mb-1">姓名 *</label><input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500 font-bold" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1">聯絡電話 *</label><input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1">身份證 / 護照號碼</label><input value={formData.identityNumber} onChange={e => setFormData({...formData, identityNumber: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" /></div><div><label className="block text-[10px] font-bold text-indigo-500 mb-1">WeChat OpenID</label><input value={formData.wechatOpenId || ''} onChange={e => setFormData({...formData, wechatOpenId: e.target.value})} className="w-full p-2 border border-indigo-200 bg-indigo-50 rounded-lg text-sm font-mono outline-none focus:ring-2 ring-indigo-500" /></div></div></div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4"><div className="text-xs font-black text-indigo-600 uppercase border-b border-indigo-100 pb-2">2. 盤源與房間關聯</div><div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-bold text-slate-500 mb-1">選擇主盤源 *</label><select required value={formData.propertyId} onChange={e => setFormData({...formData, propertyId: e.target.value, roomId: ''})} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 ring-indigo-500 bg-white"><option value="">-- 請選擇盤源 --</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1">選擇房間 *</label><select required disabled={!formData.propertyId} value={formData.roomId} onChange={e => setFormData({...formData, roomId: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 ring-indigo-500 bg-white disabled:bg-slate-100"><option value="">-- 請選擇房間 --</option>{rooms.filter(r => r.propertyId === formData.propertyId).map(r => (<option key={r.id} value={r.id}>{r.name} - ${(r.baseRent || 0).toLocaleString()}</option>))}</select></div></div></div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4"><div className="text-xs font-black text-emerald-600 uppercase border-b border-emerald-100 pb-2 flex justify-between items-center"><span>3. 租期與帳單設定</span><select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as TenantStatus})} className="text-xs border bg-slate-50 rounded p-1 outline-none font-bold"><option value="Pending">未生效</option><option value="Active">履約中</option><option value="Terminated">已退租</option></select></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center"><Calendar size={12} className="mr-1"/>起租日 *</label><input type="date" required value={formData.leaseStart} onChange={e => setFormData({...formData, leaseStart: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center"><Calendar size={12} className="mr-1"/>退租日 *</label><input type="date" required value={formData.leaseEnd} onChange={e => setFormData({...formData, leaseEnd: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none" /></div><div><label className="block text-[10px] font-bold text-red-500 mb-1">每月租金定價 ($) *</label><input type="number" required value={formData.monthlyRent || ''} onChange={e => setFormData({...formData, monthlyRent: Number(e.target.value)})} className="w-full p-2 border border-red-200 bg-red-50 rounded-lg text-sm font-mono font-bold text-red-600 outline-none focus:ring-2 ring-red-500 text-right" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1">押金 / 按金 ($)</label><input type="number" value={formData.deposit || ''} onChange={e => setFormData({...formData, deposit: Number(e.target.value)})} className="w-full p-2 border rounded-lg text-sm font-mono outline-none text-right" /></div></div></div>
              <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-slate-50 py-3"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition">取消</button><button type="submit" disabled={isSaving} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition disabled:opacity-50 flex justify-center items-center">{isSaving ? <Loader2 size={18} className="animate-spin" /> : '確認儲存'}</button></div>
            </form>
          </div>
        </div>
      )}

      <DocumentGeneratorModal
        isOpen={isDocModalOpen}
        onClose={() => { setIsDocModalOpen(false); setEditDocData(null); }}
        defaultType={docModalType}
        tenant={selectedTenant}
        properties={properties}
        rooms={rooms}
        existingDoc={editDocData}
      />
    </div>
  );
}
