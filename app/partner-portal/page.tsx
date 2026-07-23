'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { db } from '@/lib/firebase';
import { 
  Building2, Image as ImageIcon, UploadCloud, Loader2, CheckCircle2, 
  MapPin, Phone, User, DollarSign, ShieldCheck, Star
} from 'lucide-react';

const REGIONS = ['香港島', '九龍', '新界'];

export default function PartnerPortalPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<{ url: string; file: File }[]>([]);
  
  // ★ 新增：封面圖片索引狀態
  const [primaryImageIndex, setPrimaryImageIndex] = useState<number>(0);

  // 表單狀態
  const [formData, setFormData] = useState({
    partnerName: '',      
    partnerContact: '',   
    inviteCode: '',       
    propertyName: '',
    region: '九龍',
    address: '',
    expectedRent: '',     
    roomCount: '3',       
    description: ''
  });

  // ★ 新增：智能記憶 (載入 localStorage 資料)
  useEffect(() => {
    const savedPartnerName = localStorage.getItem('prime_partner_name');
    const savedPartnerContact = localStorage.getItem('prime_partner_contact');
    const savedInviteCode = localStorage.getItem('prime_invite_code');

    if (savedPartnerName || savedPartnerContact || savedInviteCode) {
      setFormData(prev => ({
        ...prev,
        partnerName: savedPartnerName || '',
        partnerContact: savedPartnerContact || '',
        inviteCode: savedInviteCode || ''
      }));
    }
  }, []);

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxSide = 1200; 
          
          if (width > maxSide || height > maxSide) {
            if (width > height) {
              height = (height / width) * maxSide;
              width = maxSide;
            } else {
              width = (width / height) * maxSide;
              height = maxSide;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          let quality = 0.8;
          const attemptCompress = () => {
            canvas.toBlob((blob) => {
              if (blob && blob.size > 150 * 1024 && quality > 0.1) {
                quality -= 0.1;
                attemptCompress();
              } else {
                resolve(blob as Blob);
              }
            }, 'image/jpeg', quality);
          };
          attemptCompress();
        };
      };
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + previewUrls.length > 5) {
      return alert('最多只能上傳 5 張圖片喔！');
    }

    const newPreviews = files.map(file => ({
      url: URL.createObjectURL(file),
      file
    }));
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    e.target.value = ''; 
  };

  const removeImage = (index: number) => {
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    // ★ 如果刪除的是封面，把封面重置為第 0 張
    if (primaryImageIndex === index) {
      setPrimaryImageIndex(0);
    } else if (primaryImageIndex > index) {
      setPrimaryImageIndex(prev => prev - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 前端簡易防呆 (不再寫死密碼比對，交給後端)
    if (!formData.inviteCode.trim()) {
      return alert('請輸入邀請碼！');
    }
    if (previewUrls.length === 0) {
      return alert('請至少上傳一張盤源相片。');
    }

    setIsSubmitting(true);
    try {
      // 儲存合作夥伴資訊至 LocalStorage，下次自動載入
      localStorage.setItem('prime_partner_name', formData.partnerName);
      localStorage.setItem('prime_partner_contact', formData.partnerContact);
      localStorage.setItem('prime_invite_code', formData.inviteCode);

      const storage = getStorage();
      const uploadedImageUrls: string[] = [];

      // 將選擇為「封面」的圖片挪到陣列的第一個 (Index 0)
      const orderedPreviews = [...previewUrls];
      if (primaryImageIndex > 0 && primaryImageIndex < orderedPreviews.length) {
        const [coverImage] = orderedPreviews.splice(primaryImageIndex, 1);
        orderedPreviews.unshift(coverImage);
      }

      // 1. 圖片處理：前端壓縮並上傳至 Storage
      for (let i = 0; i < orderedPreviews.length; i++) {
        const file = orderedPreviews[i].file;
        const compressedBlob = await compressImage(file);
        
        const storageRef = ref(storage, `partner_submissions/${Date.now()}_${i}.jpg`);
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = ((i / orderedPreviews.length) * 100) + ((snapshot.bytesTransferred / snapshot.totalBytes) * (100 / orderedPreviews.length));
              setUploadProgress(progress);
            },
            (error) => reject(error),
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedImageUrls.push(url);
              resolve();
            }
          );
        });
      }

      // 2. 資料傳輸：呼叫我們自己寫的 Server API
      const response = await fetch('/api/partner-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          images: uploadedImageUrls
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '提交失敗');
      }

      setIsSuccess(true);
    } catch (error: any) {
      console.error(error);
      alert(error.message || '提交失敗，請檢查網路狀態或聯繫管理員。');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-slate-100">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">盤源提交成功！</h2>
          <p className="text-slate-500 font-medium mb-8">
            感謝您的提交。Prime Living 團隊將盡快審核您的盤源資料，審核通過後將自動上架至我們的聯營精選板塊。
          </p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md">
            繼續提交下一個盤源
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* 頭部區塊 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600 text-white rounded-2xl shadow-lg mb-4">
            <Building2 size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">聯營盤源提交通道</h1>
          <p className="text-slate-500 mt-2 font-medium">歡迎合作夥伴上傳房源，共享 Prime Living 龐大流量。</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
          
          {/* 合作夥伴資訊 */}
          <div className="p-8 border-b border-slate-100 bg-blue-50/30">
            <h3 className="text-sm font-black text-blue-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <ShieldCheck size={16} /> 1. 合作方資訊驗證
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">合作機構 / 品牌名稱 *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3 text-slate-400" />
                  {/* ★ 修正淺色字體：加上 text-slate-900 font-bold placeholder:text-slate-400 */}
                  <input required value={formData.partnerName} onChange={e => setFormData({...formData, partnerName: e.target.value})} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 bg-white text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="例如：HK港灣之家" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">聯絡人及電話 *</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input required value={formData.partnerContact} onChange={e => setFormData({...formData, partnerContact: e.target.value})} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 bg-white text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="例如：陳生 98765432" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">官方邀請碼 (Invitation Code) *</label>
                <input required value={formData.inviteCode} onChange={e => setFormData({...formData, inviteCode: e.target.value})} className="w-full px-4 py-2.5 border border-blue-200 rounded-xl text-sm outline-none focus:border-blue-500 bg-blue-50/50 font-mono text-blue-700 font-bold placeholder:text-blue-300 placeholder:font-normal shadow-sm" placeholder="請輸入邀請碼" />
              </div>
            </div>
          </div>

          {/* 盤源基本資料 */}
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-orange-500" /> 2. 盤源基礎數據
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">所屬大區 *</label>
                  <select value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 bg-white text-slate-900 font-bold shadow-sm">
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">樓盤名稱 *</label>
                  <input required value={formData.propertyName} onChange={e => setFormData({...formData, propertyName: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="例如：大圍 名城 3座" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">詳細地址 *</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="完整物業地址" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">期望總租金 (HKD) *</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input type="number" required value={formData.expectedRent} onChange={e => setFormData({...formData, expectedRent: e.target.value})} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 font-mono text-slate-900 font-black placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="例如: 18000" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">預計可分間數 *</label>
                  <input type="number" required value={formData.roomCount} onChange={e => setFormData({...formData, roomCount: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 font-mono text-slate-900 font-black placeholder:text-slate-400 placeholder:font-normal shadow-sm" placeholder="例如: 3" />
                </div>
              </div>
            </div>
          </div>

          {/* 圖片上傳區 */}
          <div className="p-8">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <ImageIcon size={16} className="text-emerald-500" /> 3. 盤源相片 (自動壓縮)
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {previewUrls.map((preview, index) => (
                <div key={index} className={`relative aspect-video rounded-xl overflow-hidden border-2 group transition-all ${primaryImageIndex === index ? 'border-emerald-500 shadow-md' : 'border-slate-200'}`}>
                  <img src={preview.url} alt="Preview" className="w-full h-full object-cover" />
                  
                  {/* ★ 新增：設定封面 UI */}
                  {primaryImageIndex === index ? (
                    <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] px-2 py-1 rounded font-black shadow-sm flex items-center gap-1">
                      <Star size={10} className="fill-white"/> 封面
                    </div>
                  ) : (
                    <button 
                      type="button" 
                      onClick={() => setPrimaryImageIndex(index)} 
                      className="absolute top-2 left-2 bg-slate-900/60 hover:bg-slate-900 text-white text-[10px] px-2 py-1 rounded font-bold backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
                    >
                      設為封面
                    </button>
                  )}

                  <button type="button" onClick={() => removeImage(index)} className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg text-xs font-bold">✕</button>
                </div>
              ))}
              
              {previewUrls.length < 5 && (
                <label className="aspect-video rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-colors bg-white group shadow-sm">
                  <UploadCloud size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors mb-2" />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600">上傳相片 (最多5張)</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
                </label>
              )}
            </div>
          </div>

          {/* 底部按鈕 */}
          <div className="p-8 pt-0 mt-4">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-4 bg-slate-900 hover:bg-blue-600 text-white rounded-xl font-black text-lg transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 size={20} className="animate-spin" /> 上傳處理中 {Math.round(uploadProgress)}%</>
              ) : (
                '確認並送出審核'
              )}
            </button>
            <p className="text-center text-[10px] text-slate-400 mt-4 font-bold">
              © Prime Living. All rights reserved. 提交即代表同意本平台之聯營合作條款。
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
