'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // ★ 引入 Next.js 原生路由
import { collection, getDocs, query, limit, orderBy, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { 
  Search, MapPin, Home as HomeIcon, ChevronDown, Sparkles, 
  ShieldCheck, Wind, Quote, CheckCircle, Home, Train, Building2, ArrowRight, Loader2, X, AlertCircle
} from 'lucide-react';

import WeatherAmbientBackground from '@/components/WeatherAmbientBackground';
import HomeSearch from '@/components/HomeSearch';

// 圖片代理處理，避免跨域或直接讀取失敗
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// ★ 明確指定回傳型別 JSX.Element 避免 TSC 結尾解析錯誤
export default function HomePage(): React.JSX.Element {
  const router = useRouter(); // ★ 實例化 Next.js 路由

  // --- 基礎數據狀態 ---
  const [areaGuides, setAreaGuides] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [featuredProps, setFeaturedProps] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // --- 滿租轉化機制 (Lead Generation) 狀態 ---
  const [loadingArea, setLoadingArea] = useState<string | null>(null);
  const [fullArea, setFullArea] = useState<string | null>(null);
  const [leadName, setLeadName] = useState<string>('');
  const [leadPhone, setLeadPhone] = useState<string>('');
  const [leadReq, setLeadReq] = useState<string>('');
  const [submittingLead, setSubmittingLead] = useState<boolean>(false);

  // 初始化拉取 Firebase 數據
  useEffect(() => {
    async function fetchAllData() {
      try {
        if (!db) return;
        const qArea = query(collection(db, 'area_guides'), orderBy('sortOrder', 'asc'));
        const snapArea = await getDocs(qArea);
        setAreaGuides(snapArea.docs.map(d => ({ id: d.id, ...d.data(), imageUrl: d.data().imageUrl || d.data().img || ''})));

        const qTest = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
        const snapTest = await getDocs(qTest);
        setTestimonials(snapTest.docs.map(d => ({ id: d.id, ...d.data() })));

        const qProp = query(collection(db, 'properties'), orderBy('createdAt', 'desc'), limit(3));
        const propSnap = await getDocs(qProp);
        const roomsSnap = await getDocs(collection(db, 'rooms'));
        const allRooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const mediaSnap = await getDocs(collection(db, 'media_library'));
        const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

        const propsData = propSnap.docs.map(doc => {
          const data = doc.data();
          const propImages = mediaDocs.filter(m => m.propertyId === doc.id);
          const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
          
          const hasPublishedRooms = allRooms.some(r => r.propertyId === doc.id && r.webStatus === 'published' && String(r.status).toLowerCase() !== 'occupied');
          
          return { id: doc.id, ...data, primaryImage: primaryImg, hasPublishedRooms };
        });
        setFeaturedProps(propsData);
      } catch (e) { 
        console.error("載入首頁數據失敗:", e); 
      } finally { 
        setLoading(false); 
      }
    }
    fetchAllData();
  }, []);

  // ★ 將完整區域名稱丟入搜尋引擎
  const handleAreaClick = (e: React.MouseEvent<HTMLButtonElement>, areaName: string) => {
    e.preventDefault();
    setLoadingArea(areaName);
    
    setTimeout(() => {
      setLoadingArea(null);
      // 直接傳遞完整名稱，新版計分引擎會自動提取關鍵字
      router.push(`/properties?search=${encodeURIComponent(areaName)}`);
    }, 400);
  };

  // ★ 嚴格化表單事件型別 (React.FormEvent<HTMLFormElement>)
  const handleAreaLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingLead(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        tenantId: `visitor_${Date.now()}`,
        name: leadName,
        phone: leadPhone,
        message: `【首頁卡片-候補需求】\n目標樓盤/區域：${fullArea}\n預期入住與預算：${leadReq}`,
        type: 'official_notice',
        status: 'New', 
        createdAt: serverTimestamp(),
        isExistingTenant: false 
      });
      alert('✅ 需求已成功發送給管家團隊！若有房源釋出將第一時間通知您。');
      setFullArea(null); 
      setLeadName(''); 
      setLeadPhone(''); 
      setLeadReq('');
    } catch (error) {
      console.error("寫入 CRM 失敗:", error);
      alert('發送失敗，請稍後再試或直接聯絡客服。');
    } finally {
      setSubmittingLead(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 overflow-hidden selection:bg-orange-200">
      
      {/* 沉浸式極光背景層 */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-60 mix-blend-overlay"><WeatherAmbientBackground /></div>
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-orange-400/30 blur-[120px] mix-blend-multiply" />
        <div className="absolute top-[15%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-rose-400/20 blur-[130px] mix-blend-multiply" />
        <div className="absolute -bottom-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-400/25 blur-[150px] mix-blend-multiply" />
      </div>

      <div className="relative z-10 pt-24 md:pt-32 pb-24 space-y-32">
        
        <section className="max-w-7xl mx-auto px-4 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/50 text-orange-600 text-xs font-black tracking-widest mb-6 shadow-sm">
            <Sparkles size={14} /> 2026 赴港精英租房首選平台
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight leading-[1.15]">
            您在香港的<br className="sm:hidden" />
            <span className="text-orange-500 whitespace-nowrap inline-block mt-2 sm:mt-0"> 星級理想家</span>
          </h1>
          <div className="w-full max-w-4xl drop-shadow-2xl">
            <HomeSearch />
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-900 mb-3 drop-shadow-sm">精選生活圈百科</h2>
            <p className="text-sm text-slate-600 font-bold">深入調研區域優勢，為您匹配最適合的大學/通勤圈</p>
          </div>

          {loading ? (
             <div className="py-20 flex justify-center items-center bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-xl">
               <Loader2 className="animate-spin text-orange-500 mr-2" size={24} />
               <p className="text-slate-600 font-bold">載入中...</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {areaGuides.map((area: any) => (
                <div key={area.id} className="group bg-white/60 backdrop-blur-xl border border-white/80 rounded-[2.5rem] overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:bg-white/80 hover:-translate-y-2 shadow-xl shadow-slate-200/40">
                  <div className="h-64 relative overflow-hidden bg-slate-200">
                    {area.imageUrl ? (
                      <img src={getProxiedUrl(area.imageUrl)} alt={area.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 font-bold">尚無圖片</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent flex items-end p-6">
                      <h3 className="text-xl font-black text-white">{area.name}</h3>
                    </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <p className="text-sm text-slate-700 leading-relaxed mb-6 font-medium line-clamp-3">{area.desc}</p>
                    <div className="space-y-4 mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-500/10 p-2 rounded-lg text-blue-600"><Train size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.transport}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-600"><Building2 size={16}/></div>
                        <p className="text-xs font-bold text-slate-800">{area.estates}</p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => handleAreaClick(e, area.name)} 
                      disabled={loadingArea === area.name} 
                      className="w-full mt-auto py-4 bg-white border border-slate-100 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                    >
                      {loadingArea === area.name ? (
                        <><Loader2 className="animate-spin" size={18}/> 正在前往...</>
                      ) : (
                        <>探索此區房源 <ArrowRight size={18} /></>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-12 border-b border-slate-300/50 pb-4">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 drop-shadow-sm">
               <div className="w-2 h-8 bg-orange-500 rounded-full shadow-md shadow-orange-500/50"/> 最新上架盤源
            </h2>
            <Link href="/properties" className="text-sm font-black text-orange-600 hover:underline">查看全部</Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredProps.map((prop: any) => {
              
              // ★ 嚴格定義 Link 內部 onClick 型別
              const handlePropClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!prop.hasPublishedRooms) {
                  e.preventDefault();
                  setFullArea(prop.name); 
                }
              };

              return (
                <Link 
                  href={`/properties?search=${encodeURIComponent(prop.name)}`} 
                  onClick={handlePropClick}
                  key={prop.id} 
                  className="group bg-white/70 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:bg-white/90 transition-all duration-300 border border-white/80 flex flex-col relative cursor-pointer"
                >
                  
                  {!prop.hasPublishedRooms && (
                    <div className="absolute inset-0 bg-slate-100/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-slate-800 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-lg -rotate-12 border-2 border-slate-700">
                        SOLD OUT
                      </div>
                    </div>
                  )}

                  <div className="h-52 relative overflow-hidden bg-slate-100 shrink-0">
                    {prop.primaryImage ? (
                      <img src={getProxiedUrl(prop.primaryImage)} alt={prop.name} className={`w-full h-full object-cover transition-transform duration-500 ${prop.hasPublishedRooms ? 'group-hover:scale-105' : 'grayscale-[30%]'}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 font-black italic"><HomeIcon size={32} className="mb-2 opacity-20" />Prime Living</div>
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-black text-slate-800 shadow-sm border border-white/50 z-10">
                      <MapPin size={12} className="inline mr-1 text-orange-500"/> {prop.region} {prop.district}
                    </div>
                  </div>

                  <div className="p-6 relative z-10">
                    <h3 className={`font-black text-lg mb-4 truncate ${prop.hasPublishedRooms ? 'text-slate-900' : 'text-slate-500'}`}>{prop.name}</h3>
                    <div className="flex gap-4 border-t border-slate-200/60 pt-4 text-[10px] font-black">
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-md ${prop.hasPublishedRooms ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        <ShieldCheck size={14}/> 官方直營
                      </span>
                      
                      {prop.hasPublishedRooms ? (
                        <span className="flex items-center gap-1 bg-cyan-50 px-2 py-1 rounded-md text-cyan-700">
                          <Wind size={14}/> 拎包入住
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 bg-rose-50 px-2 py-1 rounded-md text-rose-700">
                          <AlertCircle size={14}/> 點擊候補登記
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-16 tracking-tight drop-shadow-sm">聽聽租客怎麼說</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.length === 0 && !loading ? (
               <div className="col-span-2 py-10 text-center text-slate-400 font-bold bg-white/50 backdrop-blur-xl rounded-3xl border border-dashed border-slate-300">
                 目前尚未有租客評價
               </div>
            ) : (
              testimonials.map((t: any) => (
                <div key={t.id} className="bg-white/70 backdrop-blur-xl p-10 rounded-[2.5rem] relative border border-white/80 shadow-xl shadow-slate-200/40 hover:bg-white/90 transition-colors">
                  <Quote className="absolute top-8 right-8 text-orange-300 opacity-40 drop-shadow-sm" size={48} />
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-white font-black text-xl italic shadow-md shadow-orange-500/30">{t.name?.[0]}</div>
                    <div>
                      <h4 className="font-black text-slate-900">{t.name}</h4>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">{t.identity}</p>
                    </div>
                  </div>
                  <p className="text-slate-700 text-lg font-medium leading-relaxed drop-shadow-sm">「{t.text}」</p>
                  <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest bg-emerald-500/10 w-fit px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    <CheckCircle size={14}/> 身份已認證租客
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>

      {/* ★ 嚴格 JSX 判斷：使用 !== null，防止字串隱式轉換引發 TSC Error */}
      {fullArea !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] overflow-y-auto custom-scrollbar">
            
            <button 
              onClick={() => setFullArea(null)} 
              className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition"
            >
              <X size={24}/>
            </button>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-rose-400"></div>
            
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-amber-500" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2 text-center">
              抱歉，【{fullArea}】目前已全數租滿！
            </h3>
            <p className="text-slate-600 mb-8 font-medium max-w-2xl mx-auto text-center">
              佳寓的高性價比房源通常會被迅速預訂。請留下您的需求，若有租客提前退租或新盤上架，專屬管家會為您優先保留。
            </p>

            <form onSubmit={handleAreaLeadSubmit} className="max-w-2xl mx-auto bg-slate-50/80 p-6 rounded-2xl shadow-inner border border-slate-200 text-left grid grid-cols-2 gap-4 mb-8">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">您的稱呼 *</label>
                <input required type="text" value={leadName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 陳同學"/>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">聯絡電話 / WeChat *</label>
                <input required type="text" value={leadPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadPhone(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="輸入電話或微信號"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">預期入住時間與預算</label>
                <input type="text" value={leadReq} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadReq(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 8月中入住，預算 $6000 左右"/>
              </div>
              <div className="col-span-2 mt-2">
                <button type="submit" disabled={submittingLead} className="w-full bg-orange-500 text-white font-black text-lg py-3.5 rounded-xl hover:bg-orange-600 transition-all shadow-md flex justify-center items-center active:scale-[0.98]">
                  {submittingLead ? <Loader2 className="animate-spin" size={24}/> : '送出候補優先登記'}
                </button>
              </div>
            </form>

            <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-200">
              <h4 className="text-xl font-black text-slate-900 mb-4">為您推薦其他熱門區域</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[ 
                  { name: '大埔中心 (近教大)', status: '尚有少量空房', search: '大埔' }, 
                  { name: '沙田市中心 (近中大)', status: '熱門房源', search: '沙田' }, 
                  { name: '紅磡 (近理大/城大)', status: '即將滿租', search: '紅磡' } 
                ].map((rec, idx) => (
                  <Link href={`/properties?search=${encodeURIComponent(rec.search)}`} key={idx} onClick={() => setFullArea(null)} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-slate-200 cursor-pointer group flex flex-col p-4">
                    <h5 className="font-bold text-slate-800 text-sm">{rec.name}</h5>
                    <p className="text-xs text-emerald-600 mt-1.5 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {rec.status}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
