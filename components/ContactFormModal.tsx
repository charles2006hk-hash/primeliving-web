'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageCircle, PhoneCall, Loader2, Bot } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyName?: string; // 允許傳入房源名稱，讓機器人更聰明
}

interface ChatMessage {
  sender: 'bot' | 'user';
  text: string;
  type?: 'text' | 'options' | 'success';
  options?: string[];
}

export default function ContactFormModal({ isOpen, onClose, propertyName }: ContactFormModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [step, setStep] = useState(0); // 0: 詢問需求, 1: 詢問聯絡方式, 2: 完成
  const [userIntent, setUserIntent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 當 Modal 打開時，初始化聊天內容
  useEffect(() => {
    if (isOpen) {
      setMessages([
        {
          sender: 'bot',
          text: `您好！歡迎來到 PrimeLiving 佳寓。${propertyName ? `我看到您正在關注「${propertyName}」，` : ''}請問有什麼可以為您效勞？`,
          type: 'options',
          options: ['預約看房 / 視頻睇樓', '諮詢租金與租期', '索取房屋詳細資料', '其他問題諮詢']
        }
      ]);
      setStep(0);
      setChatInput('');
      setUserIntent('');
    }
  }, [isOpen, propertyName]);

  // 自動捲動到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOptionClick = (opt: string) => {
    // 隱藏選項，將選項轉為 user 的發言
    setMessages(prev => [
      ...prev.map(m => ({ ...m, type: 'text' })), 
      { sender: 'user', text: opt }
    ]);
    handleBotLogic(opt);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSubmitting) return;

    const text = chatInput.trim();
    setMessages(prev => [...prev, { sender: 'user', text }]);
    setChatInput('');
    handleBotLogic(text);
  };

  const handleBotLogic = async (userText: string) => {
    if (step === 0) {
      setUserIntent(userText);
      setStep(1);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: '好的沒問題！為了方便專屬管家與您聯繫並提供資料，請在此留下您的「姓名」與「WhatsApp / WeChat 號碼」：'
        }]);
      }, 600);
    } 
    else if (step === 1) {
      setStep(2);
      setIsSubmitting(true);
      try {
        // ★ 將收集到的資訊送入 CRM，標記為官網新客
        await addDoc(collection(db, 'inquiries'), {
          name: '官網訪客',
          phone: userText, 
          message: `[客戶需求]: ${userIntent}\n[聯絡資料]: ${userText}`,
          roomInfo: propertyName || '一般官網諮詢',
          category: '官網新客諮詢',
          source: 'Website Chatbot',
          isExistingTenant: false, // ★ 讓後台顯示「官網新客」綠色標籤
          status: 'New',
          createdAt: serverTimestamp()
        });

        setTimeout(() => {
          setMessages(prev => [...prev, {
            sender: 'bot',
            text: '✅ 收到！我們已為您建立專屬服務單。專員將會在 30 分鐘內與您聯繫！如果您急需協助，也可以直接點擊下方按鈕找我們：',
            type: 'success'
          }]);
          setIsSubmitting(false);
        }, 800);

      } catch (error) {
        console.error(error);
        setMessages(prev => [...prev, { sender: 'bot', text: '❌ 抱歉，系統連線發生異常，請直接點擊下方按鈕聯絡我們。' }]);
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end md:justify-center items-end md:items-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#f3f4f6] w-full md:max-w-[400px] h-[85vh] md:h-[650px] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-300">
        
        {/* 頂部 Header (深色高質感) */}
        <div className="bg-[#1e293b] text-white p-4 px-6 flex justify-between items-center shadow-md relative z-10 flex-none">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                <Bot size={22} className="text-white"/>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1e293b] rounded-full"></span>
            </div>
            <div>
              <h3 className="font-black text-base tracking-wide">PrimeLiving 官方管家</h3>
              <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">Response in 30 mins</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
            <X size={20} />
          </button>
        </div>

        {/* 聊天對話區域 (WeChat Style) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
              
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0 mr-2 mt-1 shadow-sm">
                  <Bot size={16}/>
                </div>
              )}

              <div className="max-w-[80%]">
                <div className={`p-3.5 text-[14px] leading-relaxed shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-[#95ec69] text-[#000000] rounded-2xl rounded-tr-sm font-medium' // 微信綠色
                    : 'bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-100 font-medium' // 白色
                }`}>
                  {msg.text}
                </div>

                {/* 機器人提供的選項按鈕 */}
                {msg.type === 'options' && msg.options && (
                  <div className="flex flex-col gap-2 mt-3 pl-2">
                    {msg.options.map(opt => (
                      <button 
                        key={opt} 
                        onClick={() => handleOptionClick(opt)} 
                        className="bg-white border border-emerald-200 text-emerald-700 py-2.5 px-4 rounded-xl text-sm font-bold hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm text-left active:scale-95"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* 完成後的快速聯絡按鈕 */}
                {msg.type === 'success' && (
                  <div className="flex gap-3 mt-4 pl-2">
                    <a href="https://wa.me/85239969796" target="_blank" rel="noopener noreferrer" className="flex-1 bg-green-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-green-600 shadow-sm transition">
                      <MessageCircle size={16}/> WhatsApp
                    </a>
                    <a href="tel:+85239969796" className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-blue-700 shadow-sm transition">
                      <PhoneCall size={16}/> 電話聯絡
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 底部輸入框 */}
        <div className="p-4 bg-[#f3f4f6] border-t border-slate-200 flex-none pb-8 md:pb-4">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input 
              type="text" 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              placeholder={step === 2 ? "諮詢已送出..." : "輸入訊息..."} 
              disabled={step === 2}
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-shadow shadow-sm disabled:bg-slate-100" 
            />
            <button 
              type="submit" 
              disabled={!chatInput.trim() || isSubmitting || step === 2} 
              className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-emerald-600 transition shadow-sm disabled:opacity-50"
            >
               {isSubmitting ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} className="ml-0.5"/>}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
