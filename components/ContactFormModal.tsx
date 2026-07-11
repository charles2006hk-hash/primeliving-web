'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { X, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactFormModal({ isOpen, onClose }: ContactFormModalProps) {
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
    honeypot: '' // ★ 防禦機制：蜜罐欄位
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); // ★ 新增：前端錯誤提示狀態

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; 
    setErrorMsg('');

    // ==========================================
    // 🛡️ 1. 資安防護：蜜罐陷阱 (Honeypot)
    // ==========================================
    if (formData.honeypot) {
      console.warn("Spam detected.");
      onClose(); // 機器人填了隱藏欄位，直接關閉不理會
      return;
    }

    // ==========================================
    // 🛡️ 2. 資安防護：防連點冷卻機制 (Cooldown)
    // ==========================================
    const lastSubmit = localStorage.getItem('pm_last_inquiry');
    if (lastSubmit && Date.now() - parseInt(lastSubmit) < 60000) {
      setErrorMsg("⚠️ 您提交得太頻繁了，請等待一分鐘後再試。");
      return;
    }

    // ==========================================
    // 🛡️ 3. 資料品質自檢 (Validation)
    // ==========================================
    // 電話號碼檢查 (最少 8 位數字)
    const digitsOnly = formData.phone.replace(/\D/g, '');
    if (digitsOnly.length < 8) {
      setErrorMsg("❌ 電話號碼格式錯誤，請至少包含 8 位數字。");
      return;
    }

    // Email 或微信格式基本檢查
    if (formData.contactMethod.length < 5) {
      setErrorMsg("❌ 請輸入正確的微信號或 Email (過短)。");
      return;
    }
    if (formData.contactMethod.includes('@') && !formData.contactMethod.includes('.')) {
      setErrorMsg("❌ Email 格式似乎不正確，請檢查是否有漏打後綴 (如 .com)。");
      return;
    }

    // 驗證通過，開始送出
    setIsSubmitting(true);

    try {
      const finalBudget = formData.budget === 'custom' ? formData.customBudget : formData.budget;
      const { honeypot, ...dataToSave } = { ...formData, budget: finalBudget };

      const docRef = await addDoc(collection(db, 'inquiries'), {
        ...dataToSave,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      fetch('/api/send-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docRef.id, ...dataToSave }),
      });

      // 紀錄最後送出時間
      localStorage.setItem('pm_last_inquiry', Date.now().toString());

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        setFormData({ name: '', gender: '未填寫', school: '', degree: '碩士 (Master)', duration: '12個月 (一年死約)', roomType: '單人房 (Single)', budget: '6000-9000', customBudget: '', phone: '', contactMethod: '', requirements: '', referrer: '', honeypot: '' });
      }, 3000);
    } catch (error) {
      console.error("提交失敗:", error);
      setErrorMsg("伺服器連線發生錯誤，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // ★ 設定 z-[9999] 確保永遠在最上層
    <div className="fixed inset-0 z-[9999] flex justify-center items-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 overflow-hidden">
        
        {/* 固定頭部 */}
        <div className="bg-emerald-500 p-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg">預約諮詢 / 需求配對</h3>
          <button type="button" onClick={onClose} className="hover:bg-emerald-600 p-1 rounded-full transition"><X size={20} /></button>
        </div>

        {isSuccess ? (
          <div className="p-10 flex flex-col items-center text-center my-auto">
            <CheckCircle size={48} className="text-emerald-500 mb-4" />
            <h4 className="text-xl font-black text-slate-800 mb-2">提交成功！</h4>
            <p className="text-slate-500 text-sm">我們的租務專員將會盡快與您聯繫。</p>
          </div>
        ) : (
          <>
            {/* ★ 前端錯誤提示區塊 */}
            {errorMsg && (
              <div className="bg-red-50 text-red-600 px-4 py-3 text-sm font-bold flex items-center shrink-0 border-b border-red-100">
                <AlertCircle size={16} className="mr-2 shrink-0" /> {errorMsg}
              </div>
            )}

            {/* 內部滾動內容區 */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1">
              
              {/* 🛡️ 隱藏的蜜罐欄位 (不可視，防機器人) */}
              <div className="opacity-0 absolute -left-[9999px] top-0" aria-hidden="true">
                <input type="text" name="honeypot" tabIndex={-1} autoComplete="off" value={formData.honeypot} onChange={e => setFormData({...formData, honeypot: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">您的稱呼 *</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" placeholder="例如：陳同學" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">性別</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50">
                    <option value="未填寫">請選擇</option><option value="男">男</option><option value="女">女</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">就讀學校 / 工作地點 *</label>
                  <input required value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" placeholder="例如：香港大學" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">學位 / 身份</label>
                  <select value={formData.degree} onChange={e => setFormData({...formData, degree: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50">
                    <option value="本科 (Undergrad)">本科 (Undergrad)</option><option value="碩士 (Master)">碩士 (Master)</option><option value="博士 (PhD)">博士 (PhD)</option><option value="工作人士">工作人士</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">期望房型</label>
                  <select value={formData.roomType} onChange={e => setFormData({...formData, roomType: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50">
                    <option value="單人房 (Single)">單人房 (Single)</option><option value="雙人房 (Shared)">雙人房 (Shared)</option><option value="獨立套房 (Ensuite)">獨立套房 (Ensuite)</option><option value="整租 (Whole Flat)">整租 (Whole Flat)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">租期</label>
                  <select value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50">
                    <option value="6個月內 (短租)">6個月內 (短租)</option><option value="12個月 (一年死約)">12個月 (一年死約)</option><option value="12個月以上">12個月以上</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">預算範圍 (HKD)</label>
                  <select value={formData.budget} onChange={e => setFormData({...formData, budget: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50">
                    <option value="6000-9000">6,000 - 9,000</option><option value="10000-15000">10,000 - 15,000</option><option value="15000以上">15,000 以上</option><option value="custom">自訂填寫...</option>
                  </select>
                </div>
                {formData.budget === 'custom' && (
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-600 mb-1">請輸入預算</label>
                    <input required value={formData.customBudget} onChange={e => setFormData({...formData, customBudget: e.target.value})} className="w-full p-2 border border-emerald-300 rounded-lg text-sm outline-none bg-emerald-50" placeholder="例如: 8500" />
                  </div>
                )}
              </div>

              <hr className="border-slate-100 my-2" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">聯絡電話 *</label>
                  <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50 font-mono" placeholder="請包含區號" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">微信號 或 Email *</label>
                  <input required value={formData.contactMethod} onChange={e => setFormData({...formData, contactMethod: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50" placeholder="WeChat ID / Email" />
                </div>
              </div>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">其他要求或備註 (選填)</label>
                <textarea rows={2} value={formData.requirements} onChange={e => setFormData({...formData, requirements: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none focus:border-emerald-500 bg-slate-50 resize-none" placeholder="例如：需有海景、能不能養寵物..." />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-600 mb-1">推薦人姓名及電話 (選填)</label>
                <input value={formData.referrer} onChange={e => setFormData({...formData, referrer: e.target.value})} className="w-full p-2 border border-purple-200 rounded-lg text-sm outline-none focus:border-purple-500 bg-purple-50" placeholder="若有佳寓租客/員工推薦，請填寫" />
              </div>
            </div>

            {/* 固定底部按鈕區 */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition shadow-sm">取消</button>
              <button type="submit" disabled={isSubmitting} className="flex-[2] py-3 bg-emerald-500 text-white rounded-xl font-bold flex justify-center items-center hover:bg-emerald-600 transition disabled:opacity-50 shadow-md">
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Send size={18} className="mr-2" /> 送出諮詢</>}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
