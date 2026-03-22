'use client';
import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

export default function WechatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-[#07C160] text-white px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all flex items-center gap-2"
      >
        <MessageCircle size={20}/> 微信諮詢
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full relative text-center">
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-slate-400"><X/></button>
            <h3 className="text-xl font-black mb-2">添加專屬顧問</h3>
            <p className="text-slate-500 text-sm mb-6">掃描下方二維碼，即刻獲取最新房源細節與預約睇樓</p>
            <div className="aspect-square bg-slate-100 rounded-2xl mb-6 flex items-center justify-center border-2 border-dashed border-slate-200">
               {/* 這裡換成您的真實微信 QR Code 圖片 */}
               <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">QR Code Placeholder</span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PrimeLiving Service</p>
          </div>
        </div>
      )}
    </>
  );
}