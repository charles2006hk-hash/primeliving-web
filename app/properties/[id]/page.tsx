import React from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; 
import { 
  MapPin, BedDouble, Wind, ShieldCheck, 
  ChevronLeft, Share2, Heart, CheckCircle2, 
  Navigation, School, TrainFront, MessageCircle, Phone, Sparkles, Wifi,
  Train, Store, Sun, DollarSign 
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import WechatModal from '../../../components/WechatModal'; 

// ★ 反向代理 URL 轉換器 (讓內地可以看見 Firebase 圖片)
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  // 避免重複包裝
  if (url.startsWith('/api/image')) return url;
  // 將原汁原味的 Firebase 網址，打包交給我們的 API
  return `/api/image?url=${encodeURIComponent(url)}`;
};

// --- 抓取單個房間數據 ---
async function getRoomDetail(id: string) {
  try {
    if (!db) return null;

    const docRef = doc(db, 'rooms', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    
    const data = snap.data();
    
    // 1. 抓取父級盤源名稱與詳細資訊
    let propertyInfo = { name: '精選盤源', address: '' };
    try {
      if (data.propertyId) {
        const propRef = doc(db, 'properties', data.propertyId);
        const propSnap = await getDoc(propRef);
        if (propSnap.exists()) {
          propertyInfo.name = propSnap.data().name;
          propertyInfo.address = propSnap.data().address;
        }
      }
    } catch (e) { console.warn("無法抓取盤源資訊"); }

    // 2. 從 media_library 抓取相片 (★ 加入房間專屬圖片判斷)
    let roomImages: string[] = [];
    try {
      if (data.propertyId) {
        const mediaSnap = await getDocs(collection(db, 'media_library'));
        const allMedia = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));
        
        // ★ 邏輯更新：如果房間有指派專屬圖片，優先顯示專屬圖片
        if (data.images && data.images.length > 0) {
          const assignedMedia = allMedia.filter(m => data.images.includes(m.id));
          roomImages = assignedMedia.map(m => m.url);
        } else {
          // 如果沒有指派，退回顯示盤源所有的圖片
          const linkedMedia = allMedia.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
          const primary = linkedMedia.find(m => m.isPrimary);
          const others = linkedMedia.filter(m => !m.isPrimary);
          
          if (primary) roomImages.push(primary.url);
          others.forEach(img => roomImages.push(img.url));
        }
      }
    } catch (e) { console.warn("無法抓取圖庫照片"); }
    
    return {
      id: snap.id,
      ...data,
      propertyName: propertyInfo.name,
      propertyAddress: propertyInfo.address,
      images: roomImages
    };
  } catch (error) {
    console.error("🔥 Firebase 抓取錯誤:", error);
    return null;
  }
}

export default async function PropertyDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  
  const resolvedParams = await params;
  const room: any = await getRoomDetail(resolvedParams.id);

  if (!room) notFound();

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* 1. 相片牆 (Mobile 優化) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 h-[350px] md:h-[550px] overflow-hidden bg-slate-100">
        <div className="relative group cursor-zoom-in">
          {room.images?.[0] ? (
            // ★ 套用過牆代理
            <img src={getProxiedUrl(room.images[0])} alt="主圖" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
               <span className="font-black tracking-widest uppercase opacity-20 text-3xl italic">Prime Living</span>
            </div>
          )}
          <div className="absolute bottom-4 left-4 md:hidden bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-md">
            1 / {room.images?.length || 0} 張照片
          </div>
        </div>
        <div className="hidden md:grid grid-cols-2 gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-200 relative overflow-hidden group cursor-zoom-in">
               {room.images?.[i] ? (
                 // ★ 套用過牆代理
                 <img src={getProxiedUrl(room.images[i])} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold opacity-20 text-[10px] uppercase">Prime Living</div>
               )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* 左側：詳細資訊 */}
        <div className="lg:col-span-2 space-y-10">
          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-600 font-bold text-xs uppercase tracking-widest">
               <Sparkles size={14}/> 官方直營 · 全新傢俬 · 拎包入住
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-3 tracking-tight">{room.name}</h1>
            <div className="flex items-center text-slate-500 gap-1.5 mb-6">
              <MapPin size={18} className="text-orange-500 shrink-0" />
              <span className="font-bold text-slate-700">{room.propertyName}</span>
              <span className="text-slate-300">|</span>
              <span className="text-sm truncate">{room.propertyAddress}</span>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-8">
              {(room.features || ['24h監控', '光纖寬頻', '每週保潔', '極速維修']).map((tag: string) => (
                <span key={tag} className="px-3 py-2 bg-slate-50 text-slate-600 text-[11px] font-black rounded-xl border border-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500"/> {tag}
                </span>
              ))}
            </div>

            {/* ========================================= */}
            {/* ★ 新增：Prime Score 智能評分面板 ★ */}
            {/* ========================================= */}
            <div className="bg-slate-900 rounded-[2.5rem] p-6 md:p-8 text-white mb-10 shadow-xl shadow-slate-900/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 blur-[80px] -translate-y-20 translate-x-20 pointer-events-none" />
              
              <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                
                {/* 左側：總分大字 */}
                <div className="text-center md:text-left shrink-0 md:pr-8 md:border-r border-slate-700/50">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-widest mb-3 border border-orange-500/30">
                    <Sparkles size={14} /> Prime Score
                  </div>
                  <div className="flex items-baseline justify-center md:justify-start gap-1">
                    <span className="text-6xl font-black tracking-tighter italic">{room.primeScore || 4.8}</span>
                    <span className="text-xl text-slate-400 font-bold">/5</span>
                  </div>
                  <p className="text-emerald-400 text-xs mt-2 font-black tracking-wider uppercase flex items-center justify-center md:justify-start gap-1">
                    <CheckCircle2 size={14}/> 極力推薦房源
                  </p>
                </div>

                {/* 中間：四項核心指標 */}
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                  {[
                    { icon: <Train size={16}/>, label: '通勤便捷度', score: room.scoreCommute || 4.9, desc: '步行 5 分鐘至港鐵' },
                    { label: '周邊生活圈', icon: <Store size={16}/>, score: room.scoreLifestyle || 4.8, desc: '下樓即大型商場' },
                    { label: '居住舒適度', icon: <Sun size={16}/>, score: room.scoreComfort || 4.5, desc: '高層海景，採光極佳' },
                    { label: '租金性價比', icon: <DollarSign size={16}/>, score: room.scoreValue || 4.7, desc: '同區優勢定價' },
                  ].map((item) => (
                    <div key={item.label} className="group">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                          <span className="text-orange-400">{item.icon}</span> {item.label}
                        </span>
                        <span className="text-sm font-black text-white">{item.score}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full group-hover:opacity-80 transition-opacity" 
                          style={{ width: `${(item.score / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 底部：AI 總結短評 */}
              <div className="mt-8 pt-6 border-t border-slate-700/50 relative z-10 bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm">
                 <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
                      <Sparkles size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1.5">AI 房源洞察報告</p>
                      <p className="text-sm text-slate-300 leading-relaxed font-medium">
                        {room.aiInsight || '「此房源交通優勢顯著，且租金在同屋苑同等裝修中極具競爭力。由於性價比極高，預計本週內會被預訂，建議盡早決策。」'}
                      </p>
                    </div>
                 </div>
              </div>
            </div>
            {/* ========================================= */}

          </section>

          {/* 房間配備 (動態渲染) */}
          <section className="bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100">
            <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-orange-500 rounded-full"/> 房間標配
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Wind size={24}/>, label: '分體冷氣', key: '冷氣機' },
                { icon: <Wifi size={24}/>, label: '高速Wi-Fi', key: 'Wifi' },
                { icon: <ShieldCheck size={24}/>, label: '智能門鎖', key: '智能鎖' },
                { icon: <BedDouble size={24}/>, label: '品牌床墊', key: '單人床' }
              ].map(item => (
                <div key={item.label} className="flex flex-col items-center justify-center gap-4 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1">
                  <div className="text-orange-500 bg-orange-50 p-4 rounded-2xl">{item.icon}</div>
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 交通資訊 (動態化) */}
          <section>
            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <Navigation size={22} className="text-blue-600"/> 地理位置與通勤
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="md:col-span-2 p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-md shadow-blue-200"><TrainFront size={24}/></div>
                    <div>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">最近港鐵站</p>
                        <p className="font-black text-slate-800 text-lg">{room.transportation?.station || '步行 5-8 分鐘即可抵達'}</p>
                    </div>
                  </div>
                  <span className="bg-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase text-blue-600 shadow-sm border border-blue-100 hidden sm:block">核心地段</span>
               </div>
               <div className="p-6 border border-slate-100 bg-white shadow-sm rounded-[2rem] flex flex-col gap-2">
                  <School className="text-slate-400 mb-2" size={24}/>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">香港大學 (HKU)</p>
                  <p className="font-black text-slate-800">{room.transportation?.hku || '地鐵約 15 分鐘'}</p>
               </div>
               <div className="p-6 border border-slate-100 bg-white shadow-sm rounded-[2rem] flex flex-col gap-2">
                  <School className="text-slate-400 mb-2" size={24}/>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">理工大學 (PolyU)</p>
                  <p className="font-black text-slate-800">{room.transportation?.polyu || '地鐵約 20 分鐘'}</p>
               </div>
            </div>
          </section>
        </div>

        {/* 右側：側邊預約欄 (iPhone 上會自動排到下方) */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-white border border-slate-100 rounded-[3rem] p-8 shadow-2xl shadow-slate-200/50">
            <div className="mb-8">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Monthly Rent</p>
              <div className="flex items-baseline gap-1 text-orange-600">
                 <span className="text-5xl font-black italic tracking-tighter">${(room.baseRent || 0).toLocaleString()}</span>
                 <span className="text-sm font-black uppercase">HKD</span>
              </div>
              <p className="text-slate-400 text-[10px] mt-2 font-bold italic">* 已包含水電網及管理費</p>
            </div>

            <div className="space-y-4 mb-8">
               <div className="text-[11px] font-black text-emerald-700 px-4 py-3 bg-emerald-50 rounded-2xl flex items-center justify-center gap-2 border border-emerald-100">
                  <CheckCircle2 size={16}/> 隨時入住 · 正規直營 · 學生首選
               </div>
            </div>

            <div className="space-y-3">
               <WechatModal />
               <button className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/20">
                  <Phone size={20} /> 電話諮詢
               </button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-[1.2rem] flex items-center justify-center text-orange-600 font-black italic text-xl border border-orange-100 shadow-sm">P</div>
                    <div>
                        <p className="text-sm font-black text-slate-800 mb-0.5">PrimeLiving 官方管家</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Response in 30 mins</p>
                    </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                佳寓團隊將在第一時間為您安排視頻睇樓或親臨現場。所有房源均為真實拍攝，100% 官方直營保障。
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
