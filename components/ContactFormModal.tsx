'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { X, Send, Loader2, CheckCircle } from 'lucide-react';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactFormModal({ isOpen, onClose }: ContactFormModalProps) {
  const [formData, setFormData] = useState({
    school: '',
    enrollmentDate: '',
    requirements: '',
    phone: '',
    contactMethod: '' // 微信或 Email
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. 寫入 Firebase Firestore (供後台 CRM 跟進)
      const docRef = await addDoc(collection(db, 'inquiries'), {
        ...formData,
        status: 'pending', // 預設為待處理
        createdAt: serverTimestamp(),
      });

      // 2. 呼叫 Next.js API 發送 Email 通知
      await fetch('/api/send-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docRef.id, ...formData }),
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        setFormData({ school: '', enrollmentDate: '', requirements: '', phone: '', contactMethod: '' });
      }, 3000);
    } catch (error) {
      console.error("提交失敗:", error);
      alert("抱歉，系統發生錯誤，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
        <div className="bg-emerald-500 p-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg">預約諮詢 / 需求配對</h3>
          <button onClick={onClose} className="hover:bg-emerald-600 p-1 rounded-full transition"><X size={20} /></button>
        </div>

        {isSuccess ? (
          <div className="p-10 flex flex-col items-center text-center">
            <CheckCircle size={48} className="text-emerald-500 mb-4" />
            <h4 className="text-xl font-black text-slate-800 mb-2">提交成功！</h4>
            <p className="text-slate-500 text-sm">我們的租務專員將會盡快透過您留下的聯絡方式與您聯繫。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">準備就讀學校 / 工作地點 *</label>
              <input required value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" placeholder="例如：香港大學、中環..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">預計起租時間 *</label>
                <input type="month" required value={formData.enrollmentDate} onChange={e => setFormData({...formData, enrollmentDate: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">聯絡電話 *</label>
                <input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50 font-mono" placeholder="請包含區號" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">微信號 或 Email *</label>
              <input required value={formData.contactMethod} onChange={e => setFormData({...formData, contactMethod: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" placeholder="WeChat ID / Email" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">特殊要求或備註</label>
              <textarea rows={3} value={formData.requirements} onChange={e => setFormData({...formData, requirements: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50 resize-none" placeholder="例如：需要套廁、預算範圍、能否接受合租..." />
            </div>
            
            <button type="submit" disabled={isSubmitting} className="w-full py-3 mt-2 bg-emerald-500 text-white rounded-xl font-bold flex justify-center items-center hover:bg-emerald-600 transition disabled:opacity-50">
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Send size={18} className="mr-2" /> 送出諮詢</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
