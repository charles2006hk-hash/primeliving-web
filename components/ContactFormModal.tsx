'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { X, Send, Loader2, Bot, MessageCircle, PhoneCall, AlertCircle } from 'lucide-react';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string; // 允許傳入房源名稱
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  type?: 'text' | 'options' | 'form' | 'success';
  options?: string[];
}

export default function ContactFormModal({ isOpen, onClose, propertyName }: ContactFormModalProps) {
  // 對話狀態
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState(0); // 0: 打招呼, 1: 填寫表單, 2: 完成
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ★ 100% 保留您原有的表單資料結構
  const [formData, setFormData] = useState({
    name: '',
    gender: '未填寫',
    school: '',
    degree: '碩士 (Master)',
    duration: '12個月 (一年死約)',
    roomType: '單人房 (Single)',
    budget: '6000-9000',
    customBudget: '',
    phone: '',
    contactMethod: '',
    requirements: '',
    referrer: '',
    honeypot: '' // 防禦機制
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 初始化對話
  useEffect(() => {
    if (isOpen) {
      setMessages([
        {
          id: Date.now().toString(),
          sender: 'bot',
          text: `您好！歡迎來到 PrimeLiving 佳寓。${propertyName ? `我看到您正在關注「${propertyName}」，` : ''}請問有什麼可以為您效勞？`,
          type: 'options',
          options: ['預約看房 / 視頻睇樓', '諮詢租金與租期', '索取房屋詳細資料', '其他問題諮詢']
        }
      ]);
      setStep(0);
      setErrorMsg('');
      setFormData(prev => ({ ...prev, requirements: propertyName ? `[關注房源]: ${propertyName}\n` : '' }));
    }
  }, [isOpen, propertyName]);

  // 自動捲動到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 客戶點擊初始選項
  const handleOptionClick = (opt: string) => {
    setFormData(prev => ({ ...prev, requirements: prev.requirements + `[客戶需求]: ${opt}\n` }));
    
    setMessages(prev => [
      ...prev.map(m => ({ ...m, type: 'text' })), // 隱藏選項按鈕
      { id: Date.now().toString() + '1', sender: 'user', text: opt },
      { 
        id: Date.now().toString() + '2', 
        sender: 'bot', 
        text: '好的！為了讓專員為您精準配對並提供詳細資料，請花 30 秒填寫這張需求卡：',
        type: 'form' 
      }
    ]);
    setStep(1);
  };

  // ★ 完美保留您原有的驗證與發送邏輯
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; 
    setErrorMsg('');

    // 1. 蜜罐防護
    if (formData.honeypot) { onClose(); return; }

    // 2. 防連點機制
    const lastSubmit = localStorage.getItem('pm_last_inquiry');
    if (lastSubmit && Date.now() - parseInt(lastSubmit) < 60000) {
      setErrorMsg("⚠️ 您提交得太頻繁了，請等待一分鐘後再試。"); return;
    }

    // 3. 資料驗證
    const digitsOnly = formData.phone.replace(/\D/g, '');
    if (digitsOnly.length < 8) { setErrorMsg("❌ 電話號碼格式錯誤，請至少包含 8 位數字。"); return; }
    if (formData.contactMethod.length < 5) { setErrorMsg("❌ 請輸入正確的微信號或 Email (過短)。"); return; }
    if (formData.contactMethod.includes('@') && !formData.contactMethod.includes('.')) {
      setErrorMsg("❌ Email 格式似乎不正確。"); return;
    }

    setIsSubmitting(true);

    try {
      const finalBudget = formData.budget === 'custom' ? formData.customBudget : formData.budget;
      const { honeypot, ...dataToSave } = { ...formData, budget: finalBudget };

      // ★ 寫入資料庫 (兼容新版 CRM 的欄位標籤)
      const docRef = await addDoc(collection(db, 'inquiries'), {
        ...dataToSave,
        status: 'New', 
        isExistingTenant: false, // 標記為官網新客
        category: '官網新客諮詢',
        roomInfo: propertyName || '一般諮詢',
        source: 'Website Chatbot',
        createdAt: serverTimestamp(),
      });

      // ★ 觸發您的自動發信 API
      fetch('/api/send-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docRef.id, ...dataToSave }),
      });

      localStorage.setItem('pm_last_inquiry', Date.now().toString());

      // 更新對話畫面為成功
      setStep(2);
      setMessages(prev => [
        ...prev.filter(m => m.type !== 'form'), // 移除表單氣泡
        { id: Date.now().toString() + '3', sender: 'user', text: '✅ 已送出我的租房需求卡' },
        { 
          id: Date.now().toString() + '4', 
          sender: 'bot', 
          text: '收到！我們已為您建立專屬服務單並發送通知給專員。團隊將在 30 分鐘內與您聯繫！急需協助可點擊下方按鈕：', 
          type: 'success' 
        }
      ]);
      
      // 清空表單
      setFormData({ name: '', gender: '未填寫', school: '', degree: '碩士 (Master)', duration: '12個月 (一年死約)', roomType: '單人房 (Single)', budget: '6000-9000', customBudget: '', phone: '', contactMethod: '', requirements: '', referrer: '', honeypot: '' });

    } catch (error) {
      console.error("提交失敗:", error);
      setErrorMsg("伺服器連線發生錯誤，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end md:justify-center items-end md:items-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#f3f4f6] w-full md:max-w-[420px] h-[85vh] md:h-[700px] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-300">
        
        {/* 頂部 Header (微信/客服風格) */}
        <div className="bg-[#1e293b] text-white p-4 px-6 flex justify-between items-center shadow-md relative z-10 flex-none">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                <Bot size={22} className="text-white"/>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1e293b] rounded-full"></span>
            </div>
            <div>
              <h3 className="font-black text-base tracking-wide">PrimeLiving 官方專員</h3>
              <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">Response in 30 mins</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
            <X size={20} />
          </button>
        </div>

        {/* 聊天對話與表單區域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
              
              {/* 機器人頭像 */}
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0 mr-2 mt-1 shadow-sm">
                  <Bot size={16}/>
                </div>
              )}

              <div className={`max-w-[88%] ${msg.type === 'form' ? 'w-full' : ''}`}>
                {/* 訊息文字泡泡 */}
                {msg.text && (
                  <div className={`p-3.5 text-[14px] leading-relaxed shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-[#95ec69] text-[#000000] rounded-2xl rounded-tr-sm font-medium' 
                      : 'bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-100 font-medium'
                  }`}>
                    {msg.text}
                  </div>
                )}

                {/* 選項按鈕 */}
                {msg.type === 'options' && msg.options && (
                  <div className="flex flex-col gap-2 mt-3 pl-2">
                    {msg.options.map(opt => (
                      <button key={opt} onClick={() => handleOptionClick(opt)} className="bg-white border border-emerald-200 text-emerald-700 py-2.5 px-4 rounded-xl text-sm font-bold hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm text-left active:scale-95">
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* ★ 內嵌結構化表單 (Mini Program Card Style) */}
                {msg.type === 'form' && step === 1 && (
                  <form onSubmit={handleSubmitForm} className="bg-white rounded-2xl p-4 shadow-md border border-slate-200 mt-3 w-full animate-in zoom-in-95 duration-300">
                    <div className="text-emerald-700 font-black border-b border-emerald-100 pb-2 mb-3 text-sm flex items-center gap-1.5">
                      📝 租房需求登記卡
                    </div>
                    
                    {errorMsg && (
                      <div className="bg-red-50 text-red-600 p-2 text-xs font-bold rounded flex items-center mb-3">
                        <AlertCircle size={14} className="mr-1 shrink-0" /> {errorMsg}
                      </div>
                    )}

                    <div className="space-y-3 h-[300px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                      <div className="opacity-0 absolute -left-[9999px] top-0" aria-hidden="true"><input type="text" name="honeypot" tabIndex={-1} autoComplete="off" value={formData.honeypot} onChange={e => setFormData({...formData, honeypot: e.target.value})} /></div>

                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">您的稱呼 *</label><input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50" placeholder="如：陳同學" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">性別</label><select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50"><option value="未填寫">請選擇</option><option value="男">男</option><option value="女">女</option></select></div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">學校/工作地點 *</label><input required value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50" placeholder="如：香港大學" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">學位/身份</label><select value={formData.degree} onChange={e => setFormData({...formData, degree: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50"><option value="本科 (Undergrad)">本科</option><option value="碩士 (Master)">碩士</option><option value="博士 (PhD)">博士</option><option value="工作人士">工作人士</option></select></div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">期望房型</label><select value={formData.roomType} onChange={e => setFormData({...formData, roomType: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50"><option value="單人房 (Single)">單人房</option><option value="雙人房 (Shared)">雙人房</option><option value="獨立套房 (Ensuite)">獨立套房</option><option value="整租 (Whole Flat)">整租</option></select></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">預計租期</label><select value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50"><option value="6個月內 (短租)">6個月內</option><option value="12個月 (一年死約)">12個月</option><option value="12個月以上">12個月以上</option></select></div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">預算 (HKD)</label><select value={formData.budget} onChange={e => setFormData({...formData, budget: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50"><option value="6000-9000">6k-9k</option><option value="10000-15000">10k-15k</option><option value="15000以上">15k+</option><option value="custom">自訂</option></select></div>
                        {formData.budget === 'custom' && <div><label className="block text-[10px] font-bold text-emerald-600 mb-1">請輸入預算</label><input required value={formData.customBudget} onChange={e => setFormData({...formData, customBudget: e.target.value})} className="w-full p-2 border border-emerald-300 rounded text-xs outline-none bg-emerald-50" placeholder="如: 8500" /></div>}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">聯絡電話 *</label><input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50 font-mono" placeholder="含區號" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 mb-1">微信 / Email *</label><input required value={formData.contactMethod} onChange={e => setFormData({...formData, contactMethod: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50" placeholder="WeChat/Email" /></div>
                      </div>
                      
                      <div><label className="block text-[10px] font-bold text-slate-500 mb-1">其他要求 (選填)</label><textarea rows={2} value={formData.requirements} onChange={e => setFormData({...formData, requirements: e.target.value})} className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-emerald-500 bg-slate-50 resize-none" placeholder="如：需有海景、養寵物..." /></div>
                      <div><label className="block text-[10px] font-bold text-purple-600 mb-1">推薦人 (選填)</label><input value={formData.referrer} onChange={e => setFormData({...formData, referrer: e.target.value})} className="w-full p-2 border border-purple-200 rounded text-xs outline-none focus:border-purple-500 bg-purple-50" placeholder="佳寓租客/員工姓名" /></div>
                    </div>

                    <button type="submit" disabled={isSubmitting} className="w-full mt-3 py-2.5 bg-emerald-500 text-white rounded-xl font-bold flex justify-center items-center hover:bg-emerald-600 transition disabled:opacity-50 shadow-sm text-sm">
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} className="mr-1.5" /> 送出給專員</>}
                    </button>
                  </form>
                )}

                {/* 完成後的快速聯絡按鈕 */}
                {msg.type === 'success' && (
                  <div className="flex gap-2 mt-3 pl-1">
                    <a href="https://wa.me/85239969796" target="_blank" rel="noopener noreferrer" className="flex-1 bg-green-500 text-white py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-green-600 shadow-sm transition">
                      <MessageCircle size={14}/> WhatsApp
                    </a>
                    <a href="tel:+85239969796" className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-blue-700 shadow-sm transition">
                      <PhoneCall size={14}/> 專人專線
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
