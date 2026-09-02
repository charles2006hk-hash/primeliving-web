'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, limit, orderBy, addDoc, serverTimestamp, where } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { 
  Search, MapPin, Home as HomeIcon, ChevronDown, Sparkles, 
  ShieldCheck, Wind, Quote, CheckCircle, Home, Train, Building2, ArrowRight, Loader2, X, AlertCircle,
  // ★ 新增：用於房間標準配置的圖標
  Refrigerator, Waves, ChefHat, Briefcase, Coffee, Archive, Bath, BedDouble, Monitor, LampDesk, Plug, Shirt, Trash2, Fan, Droplets, BookOpen
} from 'lucide-react';

import WeatherAmbientBackground from '@/components/WeatherAmbientBackground';
import HomeSearch from '@/components/HomeSearch';

// ============================================================================
// ★ 智能圖標匹配器：根據 CMS 填寫的關鍵字，自動渲染對應的 SVG 圖示
// ============================================================================
const getAmenityIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('冰箱')) return <Refrigerator size={16} />;
  if (lower.includes('洗') || lower.includes('烘')) return <Waves size={16} />;
  if (lower.includes('爐') || lower.includes('箱') || lower.includes('鍋')) return <ChefHat size={16} />;
  if (lower.includes('風')) return <Wind size={16} />;
  if (lower.includes('空調') || lower.includes('冷氣')) return <Fan size={16} />;
  if (lower.includes('行李') || lower.includes('置物')) return <Briefcase size={16} />;
  if (lower.includes('桌') || lower.includes('椅')) return <Coffee size={16} />; 
  if (lower.includes('櫃')) return <Archive size={16} />;
  if (lower.includes('馬桶') || lower.includes('浴') || lower.includes('廁')) return <Bath size={16} />;
  if (lower.includes('床') || lower.includes('被')) return <BedDouble size={16} />;
  if (lower.includes('書桌') || lower.includes('辦公')) return <Monitor size={16} />;
  if (lower.includes('衣架') || lower.includes('衣櫃')) return <Shirt size={16} />;
  if (lower.includes('插') || lower.includes('電')) return <Plug size={16} />;
  if (lower.includes('燈')) return <LampDesk size={16} />;
  if (lower.includes('垃圾')) return <Trash2 size={16} />;
  if (lower.includes('掃') || lower.includes('拖')) return <Sparkles size={16} />;
  if (lower.includes('抹布') || lower.includes('清潔')) return <Droplets size={16} />;
  if (lower.includes('書架')) return <BookOpen size={16} />;
  return <CheckCircle size={16} />; // 預設圖標
};

// 圖片代理處理
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/api/image')) return url;
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// 支援繁簡體與模糊匹配的百科字典
const ENCYCLOPEDIA_LIST = [
  { id: 'pavilia-farm', aliases: ['柏傲莊', '柏傲庄'] },
  { id: 'festival-city', aliases: ['名城'] },
  { id: 'the-arles', aliases: ['星凱堤岸', '星凯堤岸'] },
  { id: 'the-palazzo', aliases: ['御龍山', '御龙山'] },
  { id: 'residence-oasis', aliases: ['蔚藍灣畔', '蔚蓝湾畔'] },
  { id: 'nan-fung-plaza', aliases: ['南豐廣場', '南丰广场'] },
  { id: 'baker-circle', aliases: ['曦匯', '曦汇'] },
  { id: 'mei-fung-gardens', aliases: ['美豐花園', '美丰花园'] },
  { id: 'mei-ling-cabin', aliases: ['美菱居'] },
  { id: 'serenity-park', aliases: ['太湖花園', '太湖花园'] },
  { id: 'greenery-plaza', aliases: ['翠怡花園', '翠怡花园'] },
  { id: 'tai-po-centre', aliases: ['大埔中心'] },
  { id: 'uptown-plaza', aliases: ['新達廣場', '新达广场'] }
];

const findEncyclopediaId = (name: string) => {
  if (!name) return null;
  const matched = ENCYCLOPEDIA_LIST.find(record =>
    record.aliases.some(alias => name.includes(alias))
  );
  return matched ? matched.id : null;
};

// ★ 常見百家姓氏與穩定 Hash 函數 (根據樓盤 ID 分配固定姓氏)
const COMMON_SURNAMES = ['陳', '李', '張', '王', '何', '林', '黃', '劉', '吳', '蔡', '楊', '鄭', '郭', '黎', '周'];

const getSurnameForProperty = (propId: string) => {
  if (!propId) return '陳';
  let hash = 0;
  for (let i = 0; i < propId.length; i++) {
    hash = propId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COMMON_SURNAMES.length;
  return COMMON_SURNAMES[index];
};

// 智能遮罩單位名稱 (e.g., 美豐花園B-7F2 -> 美豐花園B座中層)
const maskPropertyName = (name: string) => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 2) {
    const prefix = parts[0].trim();
    const suffix = parts.slice(1).join('-').trim();
    
    const prefixMatch = prefix.match(/^(.+?)([A-Za-z]|\d{1,2})$/);
    let estate = prefix;
    let blockStr = '';
    if (prefixMatch) {
      estate = prefixMatch[1].trim();
      blockStr = `${prefixMatch[2].toUpperCase()}座`;
    }

    const floorMatch = suffix.match(/^(\d+)/);
    let floorLevel = '中層';
    if (floorMatch) {
      const floor = parseInt(floorMatch[1], 10);
      if (floor >= 15) floorLevel = '高層';
      else if (floor <= 5) floorLevel = '低層';
    }
    
    return `${estate}${blockStr}${floorLevel}`;
  }
  return name;
};

export default function HomePage(): React.JSX.Element {
  const router = useRouter();

  // ★ 取得當前部署環境的公司專屬 ID (多租戶隔離)[cite: 4]
  const COMPANY_ID = process.env.NEXT_PUBLIC_COMPANY_ID || 'prime_living_hk';

  const [areaGuides, setAreaGuides] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [featuredProps, setFeaturedProps] = useState<any[]>([]);
  // ★ 動態獲取房間配置資料[cite: 4]
  const [amenitiesData, setAmenitiesData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [loadingArea, setLoadingArea] = useState<string | null>(null);
  const [fullArea, setFullArea] = useState<string | null>(null);
  const [leadName, setLeadName] = useState<string>('');
  const [leadPhone, setLeadPhone] = useState<string>('');
  const [leadReq, setLeadReq] = useState<string>('');
  const [submittingLead, setSubmittingLead] = useState<boolean>(false);

  useEffect(() => {
    async function fetchAllData() {
      try {
        if (!db) return;
        
        // ★ 加入 companyId 過濾條件[cite: 4]
        const qArea = query(collection(db, 'area_guides'), where('companyId', '==', COMPANY_ID), orderBy('sortOrder', 'asc'));
        const snapArea = await getDocs(qArea);
        
        const guides = snapArea.docs.map(d => {
          const data = d.data();
          const eId = findEncyclopediaId(data.name);
          return { 
            id: d.id, 
            ...data, 
            encyclopediaId: eId || encodeURIComponent(data.name), 
            hasEncyclopedia: !!eId, 
            imageUrl: data.imageUrl || data.img || '' 
          };
        });
        setAreaGuides(guides);

        // ★ 加入 companyId 過濾條件[cite: 4]
        const qTest = query(collection(db, 'testimonials'), where('companyId', '==', COMPANY_ID), orderBy('createdAt', 'desc'));
        const snapTest = await getDocs(qTest);
        setTestimonials(snapTest.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => t.status === 'published'));

        // ★ 抓取房間標準配置設定[cite: 4]
        const qSettings = query(collection(db, 'settings'), where('companyId', '==', COMPANY_ID), where('type', '==', 'amenities'));
        const snapSettings = await getDocs(qSettings);
        if (!snapSettings.empty) {
          setAmenitiesData(snapSettings.docs[0].data());
        }

        // ★ 加入 companyId 過濾條件[cite: 4]
        const qProp = query(collection(db, 'properties'), where('companyId', '==', COMPANY_ID), orderBy('createdAt', 'desc'), limit(3));
        const propSnap = await getDocs(qProp);
        
        const qRooms = query(collection(db, 'rooms'), where('companyId', '==', COMPANY_ID));
        const roomsSnap = await getDocs(qRooms);
        const allRooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        
        const qMedia = query(collection(db, 'media_library'), where('companyId', '==', COMPANY_ID));
        const mediaSnap = await getDocs(qMedia);
        const mediaDocs = mediaSnap.docs.map(d => ({id: d.id, ...d.data() as any}));

        const propsData = propSnap.docs.map(doc => {
          const data = doc.data();
          const propImages = mediaDocs.filter(m => m.propertyId === doc.id);
          const primaryImg = propImages.find(m => m.isPrimary)?.url || propImages[0]?.url || null;
          
          const allPropRooms = allRooms.filter(r => r.propertyId === doc.id && r.webStatus === 'published');
          const availableRooms = allPropRooms.filter(r => String(r.status).toLowerCase() !== 'occupied');
          const hasPublishedRooms = availableRooms.length > 0;
          
          let minPrice = 0, maxPrice = 0;
          let hasHigh = false, hasMid = false, hasLow = false;

          if (allPropRooms.length > 0) {
            const prices = allPropRooms.map(r => Number(r.baseRent) || 0).filter(p => p > 0);
            if (prices.length > 0) {
              minPrice = Math.min(...prices);
              maxPrice = Math.max(...prices);
            }
            
            allPropRooms.forEach(r => {
               const roomStr = String(r.name || '') + String(r.features || '').toLowerCase();
               if (roomStr.includes('高層') || roomStr.includes('high')) hasHigh = true;
               if (roomStr.includes('中層') || roomStr.includes('mid')) hasMid = true;
               if (roomStr.includes('低層') || roomStr.includes('low')) hasLow = true;
            });
            if (!hasHigh && !hasMid && !hasLow) hasMid = true; 
          }

          const eId = findEncyclopediaId(data.name);

          return { 
            id: doc.id, 
            ...data, 
            primaryImage: primaryImg, 
            hasPublishedRooms,
            minPrice,
            maxPrice,
            floors: { hasHigh, hasMid, hasLow },
            encyclopediaId: eId || encodeURIComponent(data.name),
            hasEncyclopedia: !!eId
          };
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

  const handleAreaClick = (e: React.MouseEvent<HTMLButtonElement>, area: any) => {
    e.preventDefault();
    setLoadingArea(area.id); 
    
    setTimeout(() => {
      setLoadingArea(null);
      if (area.hasEncyclopedia) {
         router.push(`/encyclopedia/${area.encyclopediaId}`);
      } else {
         router.push(`/properties?search=${area.encyclopediaId}`);
      }
    }, 400);
  };

  const handleAreaLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingLead(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        companyId: COMPANY_ID, // ★ 強制綁定該筆名單至當前公司[cite: 4]
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

  // ★ 處理要渲染的配置資料 (如果 CMS 還沒填過，就用預設值防呆)[cite: 4]
  const displayAmenities = [
    {
      category: "公共區域必備", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100",
      items: amenitiesData?.publicArea || ["雙門大冰箱", "洗衣機 / 洗脫烘", "微波爐 / 烤箱 / 氣炸鍋", "Dyson 吹風機", "客廳空調 / 冷風機", "大件行李置物架", "客廳飯桌與座椅", "洗臉池與獨立鞋櫃", "馬桶與浴室冷暖通風"]
    },
    {
      category: "個人房間必備", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
      items: amenitiesData?.privateRoom || ["單人/雙人床及舒適床墊", "專屬書桌與人體工學椅", "獨立衣櫃與衣架", "多國通用延長線插板", "房間獨立變頻空調", "護眼檯燈", "全新被褥 (含被/單/套)", "收納層架與個人垃圾簍"]
    },
    {
      category: "公共易耗品", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100",
      items: amenitiesData?.consumables || ["掃把、簸箕與拖把", "洗碗精與清潔抹布", "空氣清新劑與垃圾袋"]
    }
  ];

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 overflow-hidden selection:bg-orange-200">
      
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

        {/* ============================================================================ */}
        {/* ★ 動態渲染：拎包入住配置區塊[cite: 4] */}
        {/* ============================================================================ */}
        <section className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 border-b border-slate-300/50 pb-4 gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 drop-shadow-sm">
                 <div className="w-2 h-8 bg-orange-500 rounded-full shadow-md shadow-orange-500/50"/> 房間標準配置
              </h2>
              <p className="text-sm font-bold text-slate-500 mt-2 ml-5">真・拎包入住，為您準備齊全的家電與生活用品</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayAmenities.map((section, idx) => (
              <div key={idx} className={`p-6 md:p-8 rounded-[2rem] border ${section.border} bg-white/70 backdrop-blur-xl shadow-xl shadow-slate-200/40 hover:bg-white/90 transition-all duration-300`}>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${section.bg} ${section.color} font-black text-sm tracking-widest mb-6`}>
                  {section.category}
                </div>
                <ul className="space-y-4">
                  {section.items.map((itemStr: string, itemIdx: number) => (
                    <li key={itemIdx} className="flex items-start gap-3">
                      <div className={`mt-0.5 ${section.color} opacity-70`}>{getAmenityIcon(itemStr)}</div>
                      <span className="text-sm font-bold text-slate-700 leading-snug">{itemStr}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
                      onClick={(e) => handleAreaClick(e, area)} 
                      disabled={loadingArea === area.id} 
                      className="w-full mt-auto py-4 bg-white border border-slate-100 rounded-2xl font-black text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                    >
                      {loadingArea === area.id ? (
                        <><Loader2 className="animate-spin" size={18}/> 正在前往百科...</>
                      ) : (
                        <>探索百科與房源 <ArrowRight size={18} /></>
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
              const handlePropClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!prop.hasPublishedRooms) {
                  e.preventDefault();
                  setFullArea(maskPropertyName(prop.name)); 
                }
              };

              const hrefUrl = prop.hasEncyclopedia 
                 ? `/encyclopedia/${prop.encyclopediaId}` 
                 : `/properties?search=${prop.encyclopediaId}`;

              return (
                <Link 
                  href={hrefUrl} 
                  onClick={handlePropClick}
                  key={prop.id} 
                  className="group bg-white/70 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:bg-white/90 transition-all duration-300 border border-white/80 flex flex-col relative cursor-pointer"
                >
                  
                  {!prop.hasPublishedRooms && (
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white px-5 py-2.5 rounded-full font-black tracking-widest shadow-xl shadow-orange-500/30 border-2 border-white/20 flex items-center gap-2 transform transition-transform scale-105">
                        <Sparkles size={16} className="text-yellow-200" />
                        感謝 {getSurnameForProperty(prop.id)}同學 預訂
                      </div>
                    </div>
                  )}

                  <div className="h-52 relative overflow-hidden bg-slate-100 shrink-0">
                    {prop.primaryImage ? (
                      <img src={getProxiedUrl(prop.primaryImage)} alt={prop.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 font-black italic"><HomeIcon size={32} className="mb-2 opacity-20" />Prime Living</div>
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-black text-slate-800 shadow-sm border border-white/50 z-10">
                      <MapPin size={12} className="inline mr-1 text-orange-500"/> {prop.region} {prop.district}
                    </div>
                  </div>

                  <div className="p-6 relative z-10">
                    <h3 className="font-black text-lg mb-2 truncate text-slate-900">
                      {maskPropertyName(prop.name)}
                    </h3>
                    
                    <div className="flex flex-col gap-1 mb-4">
                      {prop.minPrice > 0 ? (
                        <p className="text-xl font-bold text-red-500 tracking-tight">
                          ${prop.minPrice.toLocaleString()} {prop.maxPrice > prop.minPrice ? `- ${prop.maxPrice.toLocaleString()}` : ''} <span className="text-xs text-slate-500 font-normal">/月</span>
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-slate-500 italic">價格詳情請點擊</p>
                      )}
                      
                      <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                         {prop.floors?.hasHigh && <span>高層</span>}
                         {prop.floors?.hasHigh && (prop.floors.hasMid || prop.floors.hasLow) && <span>|</span>}
                         {prop.floors?.hasMid && <span>中層</span>}
                         {prop.floors?.hasMid && prop.floors.hasLow && <span>|</span>}
                         {prop.floors?.hasLow && <span>低層</span>}
                         {!prop.floors?.hasHigh && !prop.floors?.hasMid && !prop.floors?.hasLow && <span>中層優選</span>}
                      </div>
                    </div>

                    <div className="flex gap-4 border-t border-slate-200/60 pt-4 text-[10px] font-black">
                      <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700">
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

      {fullArea !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] overflow-y-auto custom-scrollbar">
            
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
            
            <h3 className="text-2xl font-black text-slate-900 mb-2 text-center">
              抱歉，【{maskPropertyName(fullArea)}】目前已全數租滿！
            </h3>
            <p className="text-slate-600 mb-8 font-medium max-w-2xl mx-auto text-center">
              佳寓的高性價比房源通常會被迅速預訂。請留下您的需求，若有租客提前退租或新盤上架，專屬管家會為您優先保留。
            </p>

            <form onSubmit={handleAreaLeadSubmit} className="max-w-2xl mx-auto bg-slate-50 p-6 rounded-2xl shadow-inner border border-slate-200 text-left grid grid-cols-2 gap-4 mb-8">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">您的稱呼 *</label>
                <input 
                  required 
                  type="text" 
                  value={leadName} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadName(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="例如: 陳同學"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">聯絡電話 / WeChat *</label>
                <input 
                  required 
                  type="text" 
                  value={leadPhone} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadPhone(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="輸入電話或微信號"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">預期入住時間與預算</label>
                <input 
                  type="text" 
                  value={leadReq} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadReq(e.target.value)} 
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white placeholder:text-slate-400" 
                  placeholder="例如: 8月中入住，預算 $6000 左右"
                />
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
