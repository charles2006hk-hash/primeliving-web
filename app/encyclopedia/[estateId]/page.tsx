'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  MapPin, Search, Home, Building2, BedDouble, Navigation, LayoutList, Building, Sparkles, Map, 
  CheckCircle2, X, Loader2, Star, ArrowRight, MessageCircle, ChevronDown, ChevronUp,
  // ★ 已經補上遺漏的 Wind 圖標
  Refrigerator, Waves, ChefHat, Briefcase, Coffee, Archive, Bath, Monitor, LampDesk, Plug, Shirt, Trash2, Fan, Droplets, BookOpen, Wind, Compass
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// ==========================================
// ★ 智能圖標匹配器
// ==========================================
const getAmenityIcon = (name: string) => {
  if (!name) return <CheckCircle2 size={16} />;
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
  return <CheckCircle2 size={16} />;
};

// ==========================================
// 1. 圖片安全處理與隱私遮罩元件
// ==========================================
const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.includes('firebasestorage.googleapis.com')) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url; 
};

const SafeImage = ({ src, alt, className, onClick }: { src: string, alt?: string, className?: string, onClick?: () => void }) => {
  const safeSrc = getProxiedUrl(src);
  return (
    <img 
      src={safeSrc} 
      alt={alt || '圖片'} 
      className={`object-cover ${className || ''}`} 
      loading="lazy"
      onClick={onClick}
    />
  );
};

const getEstateCover = (estateName?: string) => {
  if (!estateName) return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800'; 
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('柏傲莊') || estateName.includes('柏傲庄')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('海濱南岸') || estateName.includes('海滨南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('康城')) return 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&q=80&w=800';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800';
};

const getFloorLevel = (id: string) => {
  if (!id) return '中層';
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rem = sum % 3;
  return rem === 0 ? '高層' : rem === 1 ? '中層' : '低層';
};

const getPriceRange = (price: number) => {
  if (!price || price === 0) return '價格待定';
  const base = Math.floor(price / 1000) * 1000;
  const range = price < 8000 ? 1000 : (base % 2 === 0 ? 2000 : 3000);
  let lower = base;
  if (price - base < 500 && range > 1000) { lower -= 1000; }
  const upper = lower + range;
  return `$${lower.toLocaleString()} - $${upper.toLocaleString()}`;
};

interface EncyclopediaData {
  id: string;
  title: string;
  searchKeyword: string; 
  aliases: string[]; 
  targetAudience: string; 
  trafficDesc: string; 
  trafficMapUrl: string; 
  estateIntro: string; 
  estateImages: string[]; 
  facilitiesText?: string; 
  facilities?: string[]; 
  facilityImages?: string[]; 
  roomAmenitiesUrl?: string; 
  roomAmenitiesImages?: string[];
  roomAmenities?: string[];
  highlightsUrl?: string; 
  highlights?: string[];
  publicAreaImages: string[]; 
  roomTypes: {
    name: string; 
    floorPlanUrl: string; 
    roomImages: string[]; 
  }[];
}

const mockDatabase: Record<string, EncyclopediaData> = {
  'festival-city': {
    id: 'festival-city',
    title: '大圍 名城',
    searchKeyword: '名城',
    aliases: ['名城'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學、香港恆生大學、香港都會大學\n【適合人群】學生、上班族。',
    trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站。',
    trafficMapUrl: '', 
    estateIntro: '大圍名城(Festival City)是香港新界沙田區的大型私人屋苑，坐落於港鐵大圍站上蓋。',
    estateImages: ['https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=1200'],
    facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
    publicAreaImages: [],
    roomTypes: []
  },
  'pavilia-farm': {
    id: 'pavilia-farm',
    title: '大圍 柏傲莊',
    searchKeyword: '柏傲莊',
    aliases: ['柏傲莊', '柏傲庄'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學',
    trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站。',
    trafficMapUrl: '', 
    estateIntro: '位於香港新界沙田區車公廟路18號，於2022年下半年開始開放入住。',
    estateImages: ['https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=1200'],
    facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
    publicAreaImages: [],
    roomTypes: []
  },
};

// ==========================================
// 3. 拉取大系統房源 (★ 支援多租戶過濾)
// ==========================================
async function getRelatedRooms(searchKeywordStr: string, companyId: string) {
  let rooms: any[] = [];
  try {
    if (!db) return [];
    const propSnap = await getDocs(query(collection(db, 'properties'), where('companyId', '==', companyId)));
    const propMap: Record<string, string> = {};
    propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

    const roomSnap = await getDocs(query(collection(db, 'rooms'), where('companyId', '==', companyId)));
    const mediaSnap = await getDocs(query(collection(db, 'media_library'), where('companyId', '==', companyId)));
    const mediaDocs = mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    const internalRooms = roomSnap.docs.map(doc => {
      const data = doc.data();
      let primaryImage = mediaDocs.find(m => m.id === data.images?.[0])?.url;
      if (!primaryImage) {
         const roomImages = mediaDocs.filter(m => m.propertyId === data.propertyId && m.status === 'linked');
         primaryImage = roomImages.find(m => m.isPrimary)?.url || roomImages[0]?.url || null;
      }
      return {
        id: doc.id, ...data, propertyName: propMap[data.propertyId] || '', estateName: propMap[data.propertyId] || '',
        primaryImage, isCompetitor: false, createdAt: data.createdAt?.seconds || Date.now() / 1000
      };
    });

    let competitorRooms: any[] = [];
    try {
      const compSnap = await getDocs(query(collection(db, 'competitor_listings'), where('companyId', '==', companyId)));
      competitorRooms = compSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, name: data.name || data.title, baseRent: data.price || 0, status: data.status || 'Available', webStatus: data.webStatus || 'published',
          propertyName: data.district || data.estateName, estateName: data.estateName || '', primaryImage: data.imageUrl || null,
          // ★ 新增這兩行：取得方向與描述
          direction: data.direction || (data.features && data.features.length > 0 ? data.features[0] : ''),
          description: data.description || '',
          isCompetitor: true, createdAt: data.createdAt?.seconds || Date.now() / 1000
        };
      });
    } catch(e) {}

    const keywords = searchKeywordStr.split(/[,，]/).map(k => k.trim().toLowerCase()).filter(k => k);

    rooms = [...internalRooms, ...competitorRooms]
      .filter(r => r.webStatus === 'published' || String(r.status).toLowerCase() === 'occupied')
      .filter(r => {
         const targetStr = (r.propertyName + ' ' + r.estateName + ' ' + r.name).toLowerCase();
         return keywords.some(kw => targetStr.includes(kw));
      });

    rooms.sort((a, b) => {
      const hashA = a.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
      const hashB = b.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
      if (hashA !== hashB) return hashB - hashA;
      return b.createdAt - a.createdAt;
    });

  } catch (error) {}
  
  return rooms.slice(0, 8); 
}

// ==========================================
// 4. 頁面渲染
// ==========================================
export default function EstateEncyclopediaPage({ params }: { params: Promise<{ estateId: string }> | { estateId: string } }) {
  // ★ 多租戶隔離
  const COMPANY_ID = process.env.NEXT_PUBLIC_COMPANY_ID || 'prime_living_hk';

  const [data, setData] = useState<{ estate: EncyclopediaData, rooms: any[] } | null>(null);
  const [amenitiesData, setAmenitiesData] = useState<any>(null); // ★ 動態獲取房間配置資料
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [bookingRoom, setBookingRoom] = useState<any>(null);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadReq, setLeadReq] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);

  const [expandedRooms, setExpandedRooms] = useState<number[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const resolvedParams = await Promise.resolve(params);
        const rawId = decodeURIComponent(resolvedParams.estateId);
        
        const defaultMock = mockDatabase[rawId] || Object.values(mockDatabase).find(m => m.aliases.some(alias => rawId.includes(alias)));
        const searchAliases = defaultMock ? defaultMock.aliases : [];
        const searchName = defaultMock ? defaultMock.title : rawId;
        
        let estateData: EncyclopediaData | null = null;

        const guidesSnap = await getDocs(query(collection(db, 'area_guides'), where('companyId', '==', COMPANY_ID)));
        let matchedDoc: any = null;
        
        guidesSnap.forEach(doc => {
          const d = doc.data();
          if (
            doc.id === rawId || d.id === rawId || d.name === rawId || d.name === searchName || 
            searchAliases.some(alias => d.name?.includes(alias)) ||
            (d.aliases && d.aliases.some((alias: string) => rawId.includes(alias)))
          ) {
             matchedDoc = { id: doc.id, ...d };
          }
        });

        if (matchedDoc) {
             estateData = {
               id: matchedDoc.id, title: matchedDoc.name || '', searchKeyword: matchedDoc.searchKeyword || '', aliases: matchedDoc.aliases || [],
               targetAudience: matchedDoc.targetAudience || '', trafficDesc: matchedDoc.trafficDesc || '', trafficMapUrl: matchedDoc.trafficMapUrl || '',
               estateIntro: matchedDoc.estateIntro || matchedDoc.desc || '', estateImages: matchedDoc.estateImages || (matchedDoc.imageUrl ? [matchedDoc.imageUrl] : []),
               facilitiesText: matchedDoc.facilitiesText || '', facilities: matchedDoc.facilities || [], facilityImages: matchedDoc.facilityImages || [], 
               roomAmenitiesUrl: matchedDoc.roomAmenitiesUrl || '', roomAmenitiesImages: matchedDoc.roomAmenitiesImages || (matchedDoc.roomAmenitiesUrl ? [matchedDoc.roomAmenitiesUrl] : []),
               roomAmenities: matchedDoc.roomAmenities || [], highlightsUrl: matchedDoc.highlightsUrl || '', highlights: matchedDoc.highlights || [],
               publicAreaImages: matchedDoc.publicAreaImages || [], roomTypes: matchedDoc.roomTypes || [] 
             };
        } else {
           estateData = defaultMock || null;
        }
        
        if (!estateData) {
           notFound(); return;
        }

        // ★ 抓取全域房間標準配置設定
        const qSettings = query(collection(db, 'settings'), where('companyId', '==', COMPANY_ID), where('type', '==', 'amenities'));
        const snapSettings = await getDocs(qSettings);
        if (!snapSettings.empty) {
          setAmenitiesData(snapSettings.docs[0].data());
        }

        const roomData = await getRelatedRooms(estateData.searchKeyword, COMPANY_ID);
        
        const processedRooms = roomData.map(room => {
           const floorLevel = getFloorLevel(room.id);
           let rawEstateName = room.estateName || room.propertyName || '優質屋苑';
           rawEstateName = rawEstateName.replace(/[A-Za-z0-9\-\s]+$/, '').trim();
           return { ...room, floorLevel, displayTitle: `${rawEstateName} | ${floorLevel}精選單位`, displayPrice: getPriceRange(room.baseRent) };
        });

        setData({ estate: estateData, rooms: processedRooms });
      } catch (error) {
        console.error("載入百科失敗:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params, COMPANY_ID]);

  const handleLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    
    setSubmittingLead(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        companyId: COMPANY_ID, 
        tenantId: `visitor_${Date.now()}`,
        name: leadName,
        phone: leadPhone,
        message: `【百科頁面-預約看房】\n意向樓盤：${bookingRoom.displayTitle}\n系統房源ID (參考)：${bookingRoom.id}\n預期入住與預算：${leadReq}`,
        type: 'official_notice',
        status: 'New', 
        createdAt: serverTimestamp(),
        isExistingTenant: false 
      });
      alert('✅ 預約已成功發送給管家團隊！我們將在24小時內與您聯絡安排帶看。');
      setBookingRoom(null); setLeadName(''); setLeadPhone(''); setLeadReq('');
    } catch (error) { alert('發送失敗，請稍後再試。'); } finally { setSubmittingLead(false); }
  };

  const toggleRoom = (idx: number) => {
    setExpandedRooms(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  if (loading) {
    return (<div className="min-h-screen flex justify-center items-center bg-slate-50"><Loader2 className="animate-spin text-orange-500" size={40}/></div>);
  }

  if (!data) return null;
  const { estate, rooms: relatedRooms } = data;

  // 處理要渲染的配置資料
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
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 selection:bg-orange-200 pb-24 font-sans">
      
      {lightboxImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/95 p-4 md:p-10 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-orange-400 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-50"><X size={28} /></button>
          <img src={getProxiedUrl(lightboxImage)} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Enlarged" />
        </div>
      )}

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 blur-[120px] mix-blend-multiply" />
        <div className="absolute top-[20%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-rose-400/20 blur-[130px] mix-blend-multiply" />
      </div>

      <div className="relative pt-24 md:pt-28 z-10 max-w-7xl mx-auto px-4 mb-8">
        <div id="intro" className="h-[450px] md:h-[550px] rounded-[3rem] overflow-hidden shadow-2xl shadow-slate-200/50 relative group scroll-mt-32 flex flex-col justify-end p-8 md:p-12">
          <div className="absolute inset-0">
            {estate.estateImages && estate.estateImages[0] ? (
              <SafeImage src={estate.estateImages[0]} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
            ) : (
              <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">尚無封面圖片</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
          </div>
          <div className="relative z-10 text-white max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-[10px] font-black tracking-widest shadow-sm">
              <MapPin size={14} /> 小區生活圈百科
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight drop-shadow-lg mb-4">{estate.title}</h1>
            <p className="text-slate-200 font-medium leading-relaxed whitespace-pre-wrap text-sm md:text-base drop-shadow-md">{estate.targetAudience}</p>
          </div>
        </div>
      </div>

      <div className="sticky top-[80px] z-50 flex justify-center mb-10 px-4">
         <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg shadow-slate-200/50 rounded-full px-2 py-2 flex gap-1 overflow-x-auto custom-scrollbar max-w-full">
            {[
              { id: '#intro', icon: Building, label: '小區介紹' },
              { id: '#traffic', icon: Navigation, label: '交通攻略' },
              { id: '#facilities', icon: Sparkles, label: '設施與亮點' },
              { id: '#floorplans', icon: LayoutList, label: '戶型圖則' },
              { id: '#available-rooms', icon: Home, label: '可租盤源' }
            ].map(nav => (
              <a key={nav.id} href={nav.id} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black text-slate-600 hover:bg-orange-500 hover:text-white transition-all whitespace-nowrap">
                <nav.icon size={16}/> {nav.label}
              </a>
            ))}
         </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-8 space-y-8 min-w-0">
          
          <section className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3"><div className="w-2 h-8 bg-orange-500 rounded-full"/> 關於本小區</h2>
            <p className="text-slate-700 leading-relaxed font-medium text-lg mb-6 whitespace-pre-wrap">{estate.estateIntro}</p>
            {estate.estateImages && estate.estateImages.length > 1 && (
              <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4 custom-scrollbar">
                {estate.estateImages.slice(1).map((img, i) => (
                  <div key={i} className="shrink-0 w-72 md:w-80 h-48 snap-center cursor-zoom-in" onClick={() => setLightboxImage(img)}>
                    <SafeImage src={img} className="w-full h-full rounded-2xl object-cover hover:opacity-90 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {estate.trafficDesc && (
            <section id="traffic" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
              <h2 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-3"><div className="w-2 h-8 bg-orange-500 rounded-full"/> 交通與通勤</h2>
              <p className="text-slate-700 leading-relaxed font-medium text-base mb-6 whitespace-pre-wrap">{estate.trafficDesc}</p>
              {estate.trafficMapUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200/50 shadow-sm h-[300px] cursor-zoom-in" onClick={() => setLightboxImage(estate.trafficMapUrl)}>
                  <SafeImage src={estate.trafficMapUrl} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
              )}
            </section>
          )}

          <section id="facilities" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3"><div className="w-2 h-8 bg-orange-500 rounded-full"/> 屋苑設施與亮點</h2>
            
            {(estate.facilities?.length ? estate.facilities.length > 0 : estate.facilitiesText) && (
              <div className="mb-8">
                <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="text-orange-500" size={18}/> 小區設施</h3>
                {estate.facilities && estate.facilities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {estate.facilities.map((f: string, i: number) => (
                      <span key={i} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm border border-blue-100/50">{f}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-700 leading-relaxed font-medium text-base whitespace-pre-wrap">{estate.facilitiesText}</p>
                )}
              </div>
            )}

            {estate.facilityImages && estate.facilityImages.length > 0 && (
              <div className="mb-10">
                <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4 custom-scrollbar">
                  {estate.facilityImages.map((img, i) => (
                    img && (
                      <div key={i} className="shrink-0 w-72 md:w-80 h-48 snap-center cursor-zoom-in" onClick={() => setLightboxImage(img)}>
                        <SafeImage src={img} className="w-full h-full rounded-2xl object-cover hover:opacity-90 transition-opacity" />
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* ============================================================================ */}
            {/* ★ 整合：動態圖示版「房間標準配置」放入百科內頁 */}
            {/* ============================================================================ */}
            <div className="mb-10 pt-8 border-t border-slate-200/50">
               <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 text-xl"><BedDouble className="text-orange-500" size={24}/> 房間標準配置 (拎包入住清單)</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {displayAmenities.map((section, idx) => (
                   <div key={idx} className={`p-5 rounded-2xl border ${section.border} bg-white shadow-sm`}>
                     <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${section.bg} ${section.color} font-black text-sm tracking-widest mb-4`}>
                       {section.category}
                     </div>
                     <ul className="space-y-3">
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
            </div>

            {(estate.highlights?.length ? estate.highlights.length > 0 : estate.highlightsUrl) && (
              <div className="mb-8 pt-8 border-t border-slate-200/50">
                 <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 text-xl"><Star className="text-orange-500" size={24}/> 佳寓服務亮點</h3>
                 {estate.highlights && estate.highlights.length > 0 ? (
                   <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 space-y-3">
                     {estate.highlights.map((hl: string, i: number) => (
                       <div key={i} className="bg-white px-5 py-3 rounded-xl shadow-sm text-sm font-bold text-amber-900 leading-relaxed flex items-start gap-2">
                         <span className="text-amber-500 mt-0.5 shrink-0">✨</span> {hl}
                       </div>
                     ))}
                   </div>
                 ) : (
                   <div className="rounded-2xl overflow-hidden shadow-sm h-48 border border-slate-200/50 cursor-zoom-in" onClick={() => setLightboxImage(estate.highlightsUrl!)}>
                      <SafeImage src={estate.highlightsUrl!} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                   </div>
                 )}
              </div>
            )}
          </section>

          {estate.publicAreaImages && estate.publicAreaImages.length > 0 && (
            <section id="public-areas" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
              <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3"><div className="w-2 h-8 bg-orange-500 rounded-full"/> 公共區域展示</h2>
              <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4 custom-scrollbar">
                {estate.publicAreaImages.map((img: string, i: number) => (
                  <div key={i} className="relative shrink-0 w-64 md:w-72 h-72 snap-center cursor-zoom-in rounded-[2rem] overflow-hidden shadow-sm border border-slate-100 group" onClick={() => setLightboxImage(img)}>
                    <SafeImage src={img} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                    <div className="absolute bottom-4 right-4 text-[10px] font-black text-white/90 bg-black/30 px-2 py-1 rounded-lg backdrop-blur-md">HK港灣之家</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {estate.roomTypes && estate.roomTypes.length > 0 && (
            <section id="floorplans" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
              <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3"><div className="w-2 h-8 bg-orange-500 rounded-full"/> 戶型介紹與圖則</h2>
              <div className="space-y-6">
                {estate.roomTypes.map((rt, idx) => (
                  <div key={idx} className="border-b border-slate-200/60 pb-6 last:border-0 last:pb-0">
                    <button onClick={() => toggleRoom(idx)} className="w-full flex items-center justify-between text-left group">
                      <h3 className="text-lg font-black text-white bg-slate-900 px-5 py-2.5 rounded-2xl w-max shadow-md shadow-slate-900/20 group-hover:bg-orange-500 transition-colors">
                        {rt.name}
                      </h3>
                      <div className="p-2 bg-slate-100 rounded-full text-slate-500 group-hover:text-orange-500 transition-colors">
                        {expandedRooms.includes(idx) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </button>
                    {expandedRooms.includes(idx) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 animate-in slide-in-from-top-4 fade-in duration-300">
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/60">
                          <p className="text-sm font-black text-slate-500 mb-3 flex items-center gap-2"><Map size={16}/> 戶型圖則 (點擊放大)</p>
                          <div className="h-48 md:h-56 rounded-2xl overflow-hidden bg-white cursor-zoom-in" onClick={() => { if(rt.floorPlanUrl) setLightboxImage(rt.floorPlanUrl); }}>
                             {rt.floorPlanUrl ? <SafeImage src={rt.floorPlanUrl} className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">尚無圖則</div>}
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/60 min-w-0">
                          <p className="text-sm font-black text-slate-500 mb-3 flex items-center gap-2"><BedDouble size={16}/> 房間實景 ({rt.roomImages?.length || 0} 張)</p>
                          <div className="flex overflow-x-auto gap-3 snap-x snap-mandatory pb-2 custom-scrollbar">
                            {rt.roomImages && rt.roomImages.length > 0 ? (
                              rt.roomImages.map((img, i) => (
                                 <div key={i} className="shrink-0 w-[85%] h-48 md:h-56 snap-center cursor-zoom-in" onClick={() => setLightboxImage(img)}>
                                   <SafeImage src={img} className="w-full h-full rounded-2xl object-cover hover:opacity-90 transition-opacity" />
                                 </div>
                              ))
                            ) : (
                              <div className="w-full h-48 md:h-56 flex items-center justify-center text-slate-400 font-bold">尚無實景圖</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        <div className="lg:col-span-4 hidden lg:block">
           <div className="sticky top-[160px] bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl shadow-slate-900/20 text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 blur-[40px] -translate-y-10 translate-x-10 pointer-events-none" />
              <Building className="text-orange-400 mb-6" size={40}/>
              <h3 className="text-2xl font-black mb-4">對 {estate.title} 感興趣？</h3>
              <p className="text-slate-400 font-medium leading-relaxed mb-8">
                佳寓團隊隨時為您提供本屋苑的最新租盤資訊。所有房源均配備全套高品質傢俬，並享受專屬管家服務。
              </p>
              <a href="#available-rooms" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl shadow-lg shadow-orange-500/30 transition-all flex justify-center items-center gap-2 active:scale-95 mb-4">
                立即查看本區房源
              </a>
              <div className="pt-6 border-t border-slate-800">
                <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">為什麼選擇佳寓</p>
                <ul className="space-y-3 text-sm font-bold text-slate-300">
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 100% 真實房源</li>
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 免收中介費</li>
                  <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-400"/></div> 星級直營管理</li>
                </ul>
              </div>
           </div>
        </div>

      </div>

      <div id="available-rooms" className="relative z-10 max-w-7xl mx-auto px-4 mt-24 scroll-mt-32">
        <div className="flex justify-between items-end mb-10 border-b border-slate-300/50 pb-4">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 drop-shadow-sm">
             <div className="w-2 h-8 bg-orange-500 rounded-full shadow-md shadow-orange-500/50"/> 本區可租盤源
          </h2>
          <span className="text-sm font-black text-orange-600 bg-orange-100 px-3 py-1 rounded-lg">共 {relatedRooms.length} 套</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {relatedRooms.length === 0 ? (
             <div className="col-span-full py-24 text-center bg-white/50 backdrop-blur-xl rounded-[2.5rem] border border-dashed border-slate-300 shadow-sm">
               <Search size={48} className="mx-auto text-slate-300 mb-4"/>
               <p className="text-slate-600 font-black text-lg">目前該區暫無空置房源</p>
             </div>
          ) : (
            relatedRooms.map((room) => {
              const isSoldOut = room.webStatus === 'draft' || String(room.status).toLowerCase() === 'occupied';
              const finalImage = room.primaryImage ? getProxiedUrl(room.primaryImage) : (room.isCompetitor ? getEstateCover(room.propertyName || room.estateName) : null);

              return (
                <div key={room.id} onClick={() => { if(!isSoldOut) setBookingRoom(room) }} className={`group bg-white/70 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border border-white/80 transition-all duration-300 flex flex-col relative cursor-pointer ${isSoldOut ? 'opacity-90' : 'hover:shadow-2xl hover:-translate-y-1'}`}>
                   {isSoldOut && (
                     <div className="absolute inset-0 bg-slate-100/40 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center pointer-events-none">
                       <div className="bg-slate-800 text-white px-6 py-2 rounded-full font-black tracking-widest shadow-xl -rotate-12 border-2 border-slate-700 backdrop-blur-md scale-110">
                         SOLD OUT
                       </div>
                     </div>
                   )}
                   <div className="relative h-56 bg-slate-100 overflow-hidden shrink-0">
                     {finalImage ? (
                       <img src={finalImage} alt={room.displayTitle} className={`w-full h-full object-cover transition-transform duration-700 ${isSoldOut ? 'grayscale-[60%] opacity-80' : 'group-hover:scale-105'}`} />
                     ) : (
                       <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black italic"><Home size={32} className="mb-2 opacity-20"/>Prime Living</div>
                     )}
                     <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-slate-800 shadow-sm flex items-center gap-1 z-10 border border-white/50">
                        <MapPin size={12} className={room.isCompetitor ? 'text-purple-500' : 'text-orange-500'}/> {room.estateName || room.propertyName}
                     </div>
                     {room.isCompetitor && (
                       <div className="absolute top-4 right-4 bg-purple-600/95 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm flex items-center gap-1 z-10 border border-white/50">
                          <Building2 size={12}/> HK港灣之家
                       </div>
                     )}
                   </div>
                   <div className="p-6 flex flex-col flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <h3 className={`text-lg font-black leading-tight line-clamp-2 ${isSoldOut ? 'text-slate-400' : 'text-slate-900'}`}>{room.displayTitle}</h3>
                      <div className="text-right shrink-0">
                        <span className={`font-black text-xl tracking-tight ${isSoldOut ? 'text-slate-400' : (room.isCompetitor ? 'text-purple-600' : 'text-orange-600')}`}>
                          {room.displayPrice}
                        </span>
                      </div>
                    </div>

                    {/* ★ 新增：動態顯示行家盤的座向與描述 (Graceful Fallback) */}
                    {room.isCompetitor && (room.direction || room.description) && (
                      <div className="flex flex-col gap-1.5 mt-1 mb-2">
                         {room.direction && (
                           <span className="flex items-center gap-1 text-slate-500 text-[11px] font-bold">
                             <Compass size={12} className="text-orange-400"/> 座向/景觀：{room.direction}
                           </span>
                         )}
                         {room.description && (
                           <span className="text-slate-500 text-xs leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-2 italic">
                             {room.description}
                           </span>
                         )}
                      </div>
                    )}

                    <div className="mt-auto pt-4 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-black text-slate-500">
                        <span className={`flex items-center gap-1 px-2 py-1 rounded-md ${isSoldOut ? 'bg-slate-100 text-slate-400' : 'bg-cyan-50 text-cyan-700'}`}><BedDouble size={14}/> 拎包入住</span>
                        <span className={`px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1 shadow-sm ${isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-orange-500'}`}>{isSoldOut ? '已租出' : <>預約看房 <ArrowRight size={14}/></>}</span>
                     </div>
                   </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {bookingRoom !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <button onClick={() => setBookingRoom(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition"><X size={24}/></button>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-rose-400"></div>
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <MessageCircle size={32} className="text-blue-500" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2 text-center">預約看房與了解詳情</h3>
            <p className="text-slate-500 mb-8 font-medium text-center text-sm">
              對 <span className="text-orange-600 font-bold">{bookingRoom.displayTitle}</span> 感興趣嗎？請留下您的聯絡方式，專屬管家會為您提供精確租金與詳細資訊。
            </p>
            <form onSubmit={handleLeadSubmit} className="space-y-4 mb-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">您的稱呼 *</label>
                <input required type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 陳同學"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">聯絡電話 / WeChat *</label>
                <input required type="text" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="輸入電話或微信號"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">預期入住時間</label>
                <input type="text" value={leadReq} onChange={(e) => setLeadReq(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 bg-white" placeholder="例如: 8月中入住"/>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={submittingLead} className="w-full bg-slate-900 text-white font-black text-lg py-3.5 rounded-xl hover:bg-orange-500 transition-all shadow-md flex justify-center items-center active:scale-[0.98]">
                  {submittingLead ? <Loader2 className="animate-spin" size={24}/> : '送出預約'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
