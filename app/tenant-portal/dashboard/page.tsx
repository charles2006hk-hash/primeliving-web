'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Search, Phone, Mail, Clock, CheckCircle2, Trash2, 
  MessageSquare, AlertCircle, Loader2, UserCheck, UserPlus, Home, Send
} from 'lucide-react';

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({}); // 儲存每個卡片的回覆輸入

  // 監聽資料庫 (包含盤源與房間，用來解析亂碼 ID)
  useEffect(() => {
    if (!db) return;
    const qInq = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'));
    const unsubInq = onSnapshot(qInq, snap => setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    const unsubProp = onSnapshot(collection(db, 'properties'), snap => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubRoom = onSnapshot(collection(db, 'rooms'), snap => setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    setLoading(false);
    return () => { unsubInq(); unsubProp(); unsubRoom(); };
  }, []);

  const getStatusConfig = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'pending' || s === 'new') return { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', label: '待處理 / 新訊息' };
    if (s === 'contacted' || s === 'in progress') return { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: '處理跟進中' };
    if (s === 'resolved') return { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: '已結案' };
    return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', label: status || '未知狀態' };
  };

  // 自動將 ID 轉為真實名稱
  const resolveRoomName = (item: any) => {
    let text = item.roomInfo || '';
    const foundRoom = rooms.find(r => r.id === text || r.id === item.roomId);
    if (foundRoom) {
      const foundProp = properties.find(p => p.id === foundRoom.propertyId);
      return `${foundProp?.name || ''} - ${foundRoom.name}`;
    }
    return text;
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try { await updateDoc(doc(db, 'inquiries', id), { status: newStatus, updatedAt: new Date() }); } 
    catch (e) { alert("更新狀態失敗"); }
  };

  const handleSendReply = async (id: string) => {
    const text = replyTexts[id];
    if (!text?.trim()) return;
    try {
      await updateDoc(doc(db, 'inquiries', id), { 
        adminReply: text, 
        status: 'In Progress', // 回覆後自動轉為跟進中
        repliedAt: new Date() 
      });
      setReplyTexts(prev => ({ ...prev, [id]: '' })); // 清空輸入框
      alert("回覆已成功發送給租客！");
    } catch (e) { alert("發送回覆失敗"); }
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
      try { await deleteDoc(doc(db, 'inquiries', id)); } catch (e) { alert("刪除失敗"); }
    }
  };

  const filteredInquiries = inquiries.filter(item => 
    (item.name || '').includes(searchTerm) || (item.phone || '').includes(searchTerm) || (item.message || '').includes(searchTerm)
  );

  if (loading) return <div className="min-h-full flex justify-center items-center"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  return (
    <div className="min-h-full flex flex-col animate-in fade-in duration-300">
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center"><MessageSquare className="mr-2 text-blue-600" /> 客戶需求 CRM</h2>
          <p className="text-sm text-slate-500 mt-1">統一管理來自「官網」與「租客入口」的詢問，並直接回覆租客。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-rose-50 text-rose-600 rounded-lg"><AlertCircle size={20}/></div><div><p className="text-xs font-bold text-slate-500 uppercase">待處理新訊息</p><p className="text-xl font-black text-slate-800">{inquiries.filter(i => i.status === 'New' || i.status === 'Pending').length}</p></div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Clock size={20}/></div><div><p className="text-xs font-bold text-slate-500 uppercase">處理跟進中</p><p className="text-xl font-black text-slate-800">{inquiries.filter(i => i.status === 'Contacted' || i.status === 'In Progress').length}</p></div></div>
        <div className="bg-slate-900 p-4 rounded-xl shadow-md flex items-center gap-4 text-white"><div className="p-3 bg-white/10 rounded-lg"><UserCheck size={20}/></div><div><p className="text-xs font-bold text-slate-400 uppercase">現有租客工單</p><p className="text-xl font-black text-white">{inquiries.filter(i => i.isExistingTenant).length}</p></div></div>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" placeholder="搜尋客戶姓名、電話或內容..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-100 bg-slate-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"/></div>
      </div>

      {/* 高密度小型卡片列表 */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-10">
        {filteredInquiries.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-slate-200 border-dashed"><MessageSquare size={32} className="mx-auto text-slate-300 mb-2"/><p className="text-sm text-slate-500 font-bold">目前沒有任何客戶訊息</p></div>
        ) : (
          filteredInquiries.map(item => {
            const statusStyle = getStatusConfig(item.status);
            const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('zh-HK') : '近期';
            const realRoomName = resolveRoomName(item);

            return (
              <div key={item.id} className={`bg-white rounded-xl border ${statusStyle.border} shadow-sm flex flex-col md:flex-row hover:shadow-md transition-all overflow-hidden`}>
                
                {/* 資訊區塊 (縮小比例) */}
                <div className="w-full md:w-[220px] bg-slate-50 p-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    {item.isExistingTenant ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded border border-indigo-200">現有租客</span> : <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded border border-emerald-200">官網新客</span>}
                    <span className="text-[10px] font-mono text-slate-400">{dateStr.split(' ')[0]}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-800">{item.name || '未留姓名'}</h3>
                  <div className="mt-2 space-y-1.5">
                    <a href={`tel:${item.phone}`} className="flex items-center text-xs font-bold text-slate-600 hover:text-blue-600 transition"><Phone size={12} className="mr-1.5"/> {item.phone || '未留電話'}</a>
                    {item.isExistingTenant && realRoomName && (
                      <div className="flex items-center text-xs font-black text-indigo-600 mt-1"><Home size={12} className="mr-1.5 shrink-0"/> {realRoomName}</div>
                    )}
                  </div>
                </div>

                {/* 內容與回覆區塊 */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500">分類：{item.category || item.type || '一般詢問'}</span>
                      <span className={`px-2 py-1 text-[10px] font-black rounded border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>{statusStyle.label}</span>
                    </div>
                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap font-medium">
                      {item.message || '無具體訊息...'}
                    </p>
                    
                    {/* ★ 顯示已存在的回覆 */}
                    {item.adminReply && (
                      <div className="mt-2 text-sm text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-100 font-bold flex gap-2">
                        <MessageSquare size={16} className="shrink-0 mt-0.5"/> <div><span className="text-[10px] text-blue-500 block mb-0.5">管家已回覆：</span>{item.adminReply}</div>
                      </div>
                    )}
                  </div>

                  {/* 底部操作與回覆輸入框 */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 pt-3 border-t border-slate-100 gap-3">
                    
                    {/* 回覆輸入框 */}
                    <div className="flex-1 flex gap-2 w-full">
                      <input type="text" placeholder="回覆此租客 (發送後將顯示於租客 App 鈴鐺)..." value={replyTexts[item.id] || ''} onChange={e => setReplyTexts({...replyTexts, [item.id]: e.target.value})} className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-colors" />
                      <button onClick={() => handleSendReply(item.id)} disabled={!replyTexts[item.id]?.trim()} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center hover:bg-blue-700 disabled:opacity-50 transition">
                        <Send size={14} className="mr-1"/> 發送
                      </button>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => updateStatus(item.id, 'New')} className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${item.status === 'New' || item.status === 'Pending' ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>待處理</button>
                      <button onClick={() => updateStatus(item.id, 'In Progress')} className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${item.status === 'In Progress' || item.status === 'Contacted' ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>跟進中</button>
                      <button onClick={() => updateStatus(item.id, 'Resolved')} className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${item.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>結案</button>
                      <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-1"><Trash2 size={16} /></button>
                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
