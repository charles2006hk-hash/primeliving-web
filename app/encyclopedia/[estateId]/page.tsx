'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, Search, Home, Building2, BedDouble, ChevronRight, Users, Navigation, LayoutList, Building, Sparkles, Map, CheckCircle2, X, Loader2, Star, ArrowRight, MessageCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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

// ★ 修復：補回缺失的行家盤封面生成函數，解決白屏崩潰問題
const getEstateCover = (estateName?: string) => {
  if (!estateName) return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800'; 
  if (estateName.includes('名城')) return 'https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('柏傲莊') || estateName.includes('柏傲庄')) return 'https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('海濱南岸') || estateName.includes('海滨南岸')) return 'https://images.unsplash.com/photo-1555541492-f04620603099?auto=format&fit=crop&q=80&w=800';
  if (estateName.includes('康城')) return 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&q=80&w=800';
  return 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&q=80&w=800';
};

// 根據 ID 計算穩定的樓層描述 (低/中/高層)
const getFloorLevel = (id: string) => {
  if (!id) return '中層';
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rem = sum % 3;
  return rem === 0 ? '高層' : rem === 1 ? '中層' : '低層';
};

// 將精準價格轉換為 2000-3000 幅度的區間
const getPriceRange = (price: number) => {
  if (!price || price === 0) return '價格待定';
  const base = Math.floor(price / 1000) * 1000;
  const range = price < 8000 ? 1000 : (base % 2 === 0 ? 2000 : 3000);
  let lower = base;
  if (price - base < 500 && range > 1000) { lower -= 1000; }
  const upper = lower + range;
  return `$${lower.toLocaleString()} - $${upper.toLocaleString()}`;
};

// ==========================================
// 2. CMS 資料庫介面定義與過渡期 Mock 資料
// ==========================================
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

const DUMMY_MAP = 'https://images.unsplash.com/photo-1555931202-b8830f80bb1a?auto=format&fit=crop&q=80&w=1200';
const DUMMY_ESTATE = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=1200';
const DUMMY_FACILITY = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&q=80&w=1200';
const DUMMY_ROOM = 'https://images.unsplash.com/photo-1522771731470-ea457f920257?auto=format&fit=crop&q=80&w=800';
const DUMMY_FLOORPLAN = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800';

const mockDatabase: Record<string, EncyclopediaData> = {
  'pavilia-farm': {
    id: 'pavilia-farm',
    title: '大圍 柏傲莊',
    searchKeyword: '柏傲莊',
    aliases: ['柏傲莊', '柏傲庄'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學\n【適合人群】學生、上班族。交通便利，新界、九龍、港島主要辦公區都適合。',
    trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站，只需乘港鐵一個站6分鐘便可到達九龍塘站，到紅磡站、大學站亦只需15分鐘。位於東鐵線，只需半個小時到口岸。小區樓下便是地鐵站和公交站。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '位於香港新界沙田區車公廟路18號，於2022年下半年開始開放入住。小區內部直通大圍地鐵站和大型商場圍方（下雨可不用打傘），坐落於獅子山腳，依傍護城河，山水相依，屋苑園林景觀優美別緻，周邊生活配套齊全。',
    estateImages: [DUMMY_ESTATE, 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1200'],
    facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM, DUMMY_ROOM],
    roomTypes: [
      { name: '三房一廁 陽台大單間A-D', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM, DUMMY_ROOM] },
      { name: '四房二廁 獨衛陽台大單間A', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }
    ]
  },
  'festival-city': {
    id: 'festival-city',
    title: '大圍 名城',
    searchKeyword: '名城',
    aliases: ['名城'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學、香港恆生大學、香港都會大學\n【適合人群】學生、上班族。交通便利，新界、九龍、港島主要辦公區都適合。',
    trafficDesc: '位於大圍地鐵站上蓋，步行約3-8分鐘即可到達地鐵站，只需乘港鐵一個站6分鐘便可到達九龍塘站，到紅磡站、大學站亦只需15分鐘。位於東鐵線，只需半個小時到口岸。小區樓下便是地鐵站和公交站。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '大圍名城(Festival City)是香港新界沙田區的大型私人屋苑，坐落於港鐵大圍站上蓋。屋苑分三期發展，共有12座、提供4,264個單位，主打3至4房大戶型，因交通極其便利且鄰近多間大學，深受家庭及學生租客歡迎。',
    estateImages: ['https://images.unsplash.com/photo-1549416878-b9ca95e26903?auto=format&fit=crop&q=80&w=1200'],
    facilitiesText: '屋苑實行24小時安保管理。配套會所包含：泳池、健身房、自習室、琴房、各類室內球場等設施。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '四房二廁 獨衛陽台大單間A', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'the-arles': {
    id: 'the-arles',
    title: '火炭 星凱堤岸',
    searchKeyword: '星凱堤岸',
    aliases: ['星凱堤岸', '星凯堤岸'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學、香港恒生大学、香港都会大学\n【适合上班族位置】交通便利，新界、九龙、港岛主要办公区都适合。',
    trafficDesc: '火炭地铁站B/D口，出站口即见，步行约3-8分钟即可到达地铁站，只需乘坐港铁一站三分钟便可到达大学站，只需乘港铁三个站10分钟便可到达九龙塘站，到红磡站亦只需15分钟左右。位于东铁线，只需不到半个小时到口岸。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '位于香港新界沙田区火炭坳背街1号，于2023年上半年开始开放入住，小区毗邻火炭地铁站和小区自带商场，设国际级幼稚园、餐厅和超级市场，屋苑平台风景优美别致，部分房型可看到赛马景观，周边生活配套齐全。',
    estateImages: ['https://images.unsplash.com/photo-1628592102751-ba83b035e07c?auto=format&fit=crop&q=80&w=1200'],
    facilitiesText: '屋苑实行24小时安保管理。配套会所：室内外游泳池、健身房、咖啡厅、自习休闲区域、钢琴室、多功能室、儿童乐园等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [
      { name: '四房一厕 大单间A-D', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] },
      { name: '五房二厕 独卫阳台大单间A', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }
    ]
  },
  'the-palazzo': {
    id: 'the-palazzo',
    title: '火炭 御龍山',
    searchKeyword: '御龍山',
    aliases: ['御龍山', '御龙山'],
    targetAudience: '【適合學校】香港中文大學、香港城市大學、香港理工大學、香港浸會大學、香港教育大學、香港恒生大学(可租學生的戶型少)\n【適合上班族】交通便利，新界、港島主要办公区都适合。',
    trafficDesc: '火炭地铁站C口，出站口即见，步行约2-6分钟即可到达地铁站，只需乘坐港铁一站三分钟便可到达大学站，只需乘港铁三个站10分钟便可到达九龙塘站，到红磡站亦只需15分钟左右位于东铁线，只需不到半个小时到口岸。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '位于香港新界沙田区火炭乐景街28号，小区楼下及左边有餐厅和超级市场，屋苑平台风景优美别致，部分房型可看到赛马景观，周边生活配套齐全。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑实行24小时安保管理建筑会所：桑拿浴室、蒸气浴室、乒乓球室、保龄球场、电影院、音乐室、健康舞室、健身室、室内/室外游泳池、香薰水疗等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '御龍山標準戶型', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'residence-oasis': {
    id: 'residence-oasis',
    title: '坑口 蔚藍灣畔',
    searchKeyword: '蔚藍灣畔',
    aliases: ['蔚藍灣畔', '蔚蓝湾畔'],
    targetAudience: '【適合學校】香港科技大學\n【適合上班族】交通便利，新界、九龍、港島主要办公区都适合。',
    trafficDesc: '位于坑口地铁站上盖，步行约3-8分钟即可到达地铁站，乘坐11号专线小巴(B1出口) 10分钟直达科技大学，乘坐地铁30分钟到达港岛核心区域。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '蔚蓝湾畔位于将军澳坑口培成路15号，是一个铁路上盖式私人屋苑，于2005年入伙开始入住。小区内部直通坑口地铁站和大型商场连理街，包含多间连锁商店和食肆，满足各种需求。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑实行24小时安保管理。除现时一般屋苑提供的设施如室内泳池、多用途运动场、桌球室、健身中心、桑拿浴室等之外，亦提供宴会厅、户外烧烤场及网球场。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: 'F戶型/標準單間', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'nan-fung-plaza': {
    id: 'nan-fung-plaza',
    title: '坑口 南豐廣場',
    searchKeyword: '南豐廣場',
    aliases: ['南豐廣場', '南丰广场'],
    targetAudience: '【適合學校】香港科技大學\n【適合上班族】交通便利，新界、九龍、港島主要办公区都适合。',
    trafficDesc: '位于坑口地铁站上盖，步行约3-8分钟即可到达地铁站，乘坐11号专线小巴(B1出口) 10分钟直达科技大学，乘坐地铁30分钟到达港岛核心区域。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '南丰广场位于坑口培成路8号，邻近港铁坑口站，由周氏建筑师事务所设计、南丰集团发展及兴建，于1999年落成。屋苑分为5座，提供1,614个住宅单位，设有购物商场、会所及停车场。小区内部直通坑口地铁站和大型商场连理街。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑实行24小时安保管理。設施包含室内泳池、多用途运动场、桌球室、健身中心、桑拿浴室、宴会厅、缓跑径、户外烧烤场及网球场。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '四房两厕(含阳台及储藏间)', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'baker-circle': {
    id: 'baker-circle',
    title: '紅磡 曦匯',
    searchKeyword: '曦匯',
    aliases: ['曦匯', '曦汇'],
    targetAudience: '九龙核心区高校学生首选！必嘉坊曦汇坐拥红磡-何文田黄金地段，超适合：香港理工大学、香港都会大学、香港城市大学、香港浸会大学&恒生大学。省时省力，跨校区上课也无压力！',
    trafficDesc: '「双地铁交汇|红磡站+何文田站」步行5-8分钟即达！地铁网络：屯马线、东铁线、观塘线。小区门口多条线路覆盖全港，A21机场巴士直达香港机场。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '【红磡新地标|智能社区+都会生活圈】黄金地段：红磡核心区，毗邻黄埔天地、置富都会等大型商场，下楼即享日韩超市、药妆店。智能社区：全屋智能家居系统、人脸识别门禁。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '会所设施：天际泳池、24小时健身房、瑜伽室、共享办公区、儿童游乐场。公共空间：空中花园、BBQ露台。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '独卫阳台大单间', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'mei-fung-gardens': {
    id: 'mei-fung-gardens',
    title: '太和 美豐花園',
    searchKeyword: '美豐花園',
    aliases: ['美豐花園', '美丰花园'],
    targetAudience: '香港中文大学，香港教育大学，香港恒生大学，香港城市大学，香港浸会大学；适合东铁沿线上班族，交通便利，新界、九龙主要办公区都适合。',
    trafficDesc: '太和地铁站，非常邻近，步行约5-8分钟即可到达地铁站，只需乘坐港铁二站10分钟便可到达大学站，只需乘港铁六个站十几分钟便可到达九龙塘站，到红磡站亦只需20多分钟。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '美丰花园位于太和翠乐街11号。发展商为恒基兆业。入伙日期由07/1992开始。美丰花园共有2座，提供288个单位。实用面积由293呎至296呎。交通便利，有平台花园。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [
      { name: 'A房間', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] },
      { name: 'B房間 / C房間', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }
    ]
  },
  'mei-ling-cabin': {
    id: 'mei-ling-cabin',
    title: '太和 美菱居',
    searchKeyword: '美菱居',
    aliases: ['美菱居'],
    targetAudience: '香港中文大学，香港教育大学，香港恒生大学；适合东铁沿线上班族，交通便利，新界、九龙主要办公区都适合。',
    trafficDesc: '距离太和地铁站仅几分钟路程，只需20分钟左右可达中大和教大，只需20多分钟便可到达九龙，只需不到15分钟到口岸。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '位于美新路5号，大埔区比较新的楼，有阳台，交通便利，会所齐全，周边生活配套齐全。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '四房一厕-B/C/D', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'serenity-park': {
    id: 'serenity-park',
    title: '太和 太湖花園',
    searchKeyword: '太湖花園',
    aliases: ['太湖花園', '太湖花园'],
    targetAudience: '适合大学：香港中文大学、香港城市大学，香港浸会大学，香港教育大学，香港恒生大学，香港理工大学，香港都会大学；适合东铁沿线上班族。',
    trafficDesc: '太和地铁站，非常邻近，步行约3-8分钟即可到达地铁站，只需乘坐港铁二站10分钟便可到达大学站，只需乘港铁六个站十几分钟便可到达九龙塘站。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '太湖花园位于太和大埔头路18号。共有2期，15座，提供2,476个单位。实用面积由355呎至1,236呎。交通便利，会所设施齐全，周边生活配套齐全。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [
      { name: '三房一厕-A/B/C', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] },
      { name: '四房一厕-A/B/C/D', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }
    ]
  },
  'greenery-plaza': {
    id: 'greenery-plaza',
    title: '太和 翠怡花園',
    searchKeyword: '翠怡花園',
    aliases: ['翠怡花園', '翠怡花园'],
    targetAudience: '香港中文大学、香港城市大学，香港浸会大学，香港教育大学，香港恒生大学，香港理工大学，香港都会大学；适合东铁沿线上班族。',
    trafficDesc: '太和地铁站，非常邻近，步行约2-5分钟即可到达地铁站，只需乘坐港铁二站10分钟便可到达大学站。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '翠怡花园位于太和翠怡街3号。共有3座，提供496个单位。实用面积由286呎至480呎。小学校网为84。中学校网为大埔区。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '三方一厕-A/B/C房間', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'tai-po-centre': {
    id: 'tai-po-centre',
    title: '大埔 大埔中心',
    searchKeyword: '大埔中心',
    aliases: ['大埔中心'],
    targetAudience: '香港中文大学，香港教育大学，香港恒生大学；适合东铁沿线上班族，交通便利，新界、九龙主要办公区都适合。',
    trafficDesc: '临近大埔区最主要交通枢纽，大埔区公交总站，且距离太和地铁站仅几分钟路程，只需十几分钟可达中大和教大。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '位於大埔市中心安邦路9号。6期22座，提供4080个单位。著名住宅，交通便利，会所齐全，周边生活配套齐全。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '三方一厕-A/B/C房間', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  },
  'uptown-plaza': {
    id: 'uptown-plaza',
    title: '大埔 新達廣場',
    searchKeyword: '新達廣場',
    aliases: ['新達廣場', '新达广场'],
    targetAudience: '香港中文大学，香港教育大学，香港恒生大学，香港城市大学，香港浸会大学',
    trafficDesc: '位于大埔墟地铁站上盖，地铁0距离，只需一站到达大学站，几站到达九龙塘站，交通路线也多。',
    trafficMapUrl: DUMMY_MAP, 
    estateIntro: '屋苑连接新达广场，提供衣食住行所需，商场汇聚超过70间商铺及食肆。附近亦有运头角游乐场、大埔圆岗休憩处及广福球场供公众使用。',
    estateImages: [DUMMY_ESTATE],
    facilitiesText: '屋苑配有多用途运动场、健身中心等。',
    roomAmenitiesUrl: DUMMY_FACILITY, highlightsUrl: DUMMY_FACILITY, publicAreaImages: [DUMMY_ROOM],
    roomTypes: [{ name: '單人房 A/B/C/D', floorPlanUrl: DUMMY_FLOORPLAN, roomImages: [DUMMY_ROOM] }]
  }
};

// ==========================================
// 3. 拉取大系統房源 (★ 支援多關鍵字搜尋)
// ==========================================
async function getRelatedRooms(searchKeywordStr: string) {
  let rooms: any[] = [];
  try {
    if (!db) return [];
    const propSnap = await getDocs(collection(db, 'properties'));
    const propMap: Record<string, string> = {};
    propSnap.docs.forEach(doc => { propMap[doc.id] = doc.data().name; });

    const roomSnap = await getDocs(collection(db, 'rooms'));
    const mediaSnap = await getDocs(collection(db, 'media_library'));
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
      const compSnap = await getDocs(collection(db, 'competitor_listings'));
      competitorRooms = compSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, name: data.name || data.title, baseRent: data.price || 0, status: data.status || 'Available', webStatus: data.webStatus || 'published',
          propertyName: data.district || data.estateName, estateName: data.estateName || '', primaryImage: data.imageUrl || null,
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

    // 隨機混雜排序
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
  const [data, setData] = useState<{ estate: EncyclopediaData, rooms: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [bookingRoom, setBookingRoom] = useState<any>(null);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadReq, setLeadReq] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const resolvedParams = await Promise.resolve(params);
        const rawId = decodeURIComponent(resolvedParams.estateId);
        
        const defaultMock = mockDatabase[rawId] || Object.values(mockDatabase).find(m => m.aliases.some(alias => rawId.includes(alias)));
        const searchAliases = defaultMock ? defaultMock.aliases : [];
        const searchName = defaultMock ? defaultMock.title : rawId;
        
        let estateData: EncyclopediaData | null = null;

        const guidesSnap = await getDocs(collection(db, 'area_guides'));
        let matchedDoc: any = null;
        
        guidesSnap.forEach(doc => {
          const d = doc.data();
          if (
            doc.id === rawId || 
            d.id === rawId || 
            d.name === rawId || 
            d.name === searchName || 
            searchAliases.some(alias => d.name?.includes(alias)) ||
            (d.aliases && d.aliases.some((alias: string) => rawId.includes(alias)))
          ) {
             matchedDoc = { id: doc.id, ...d };
          }
        });

        if (matchedDoc) {
             estateData = {
               id: matchedDoc.id,
               title: matchedDoc.name || '',
               searchKeyword: matchedDoc.searchKeyword || '',
               aliases: matchedDoc.aliases || [],
               targetAudience: matchedDoc.targetAudience || '',
               trafficDesc: matchedDoc.trafficDesc || '',
               trafficMapUrl: matchedDoc.trafficMapUrl || '',
               estateIntro: matchedDoc.estateIntro || matchedDoc.desc || '',
               estateImages: matchedDoc.estateImages || (matchedDoc.imageUrl ? [matchedDoc.imageUrl] : []),
               facilitiesText: matchedDoc.facilitiesText || '',
               facilities: matchedDoc.facilities || [],
               roomAmenitiesUrl: matchedDoc.roomAmenitiesUrl || '',
               roomAmenitiesImages: matchedDoc.roomAmenitiesImages || (matchedDoc.roomAmenitiesUrl ? [matchedDoc.roomAmenitiesUrl] : []),
               roomAmenities: matchedDoc.roomAmenities || [],
               highlightsUrl: matchedDoc.highlightsUrl || '',
               highlights: matchedDoc.highlights || [],
               publicAreaImages: matchedDoc.publicAreaImages || [],
               roomTypes: matchedDoc.roomTypes || [] 
             };
        } else {
           estateData = defaultMock || null;
        }
        
        if (!estateData) {
           notFound();
           return;
        }

        const roomData = await getRelatedRooms(estateData.searchKeyword);
        
        const processedRooms = roomData.map(room => {
           const floorLevel = getFloorLevel(room.id);
           let rawEstateName = room.estateName || room.propertyName || '優質屋苑';
           rawEstateName = rawEstateName.replace(/[A-Za-z0-9\-\s]+$/, '').trim();
           return {
             ...room,
             floorLevel,
             displayTitle: `${rawEstateName} | ${floorLevel}精選單位`,
             displayPrice: getPriceRange(room.baseRent)
           };
        });

        setData({ estate: estateData, rooms: processedRooms });
      } catch (error) {
        console.error("載入百科失敗:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params]);

  const handleLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    
    setSubmittingLead(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
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
      setBookingRoom(null);
      setLeadName(''); 
      setLeadPhone(''); 
      setLeadReq('');
    } catch (error) {
      console.error("寫入 CRM 失敗:", error);
      alert('發送失敗，請稍後再試。');
    } finally {
      setSubmittingLead(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-slate-50">
        <Loader2 className="animate-spin text-orange-500" size={40}/>
      </div>
    );
  }

  if (!data) return null;
  const { estate, rooms: relatedRooms } = data;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 selection:bg-orange-200 pb-24 font-sans">
      
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/95 p-4 md:p-10 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out" 
          onClick={() => setLightboxImage(null)}
        >
          <button className="absolute top-6 right-6 text-white hover:text-orange-400 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-50">
            <X size={28} />
          </button>
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
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight drop-shadow-lg mb-4">
              {estate.title}
            </h1>
            <p className="text-slate-200 font-medium leading-relaxed whitespace-pre-wrap text-sm md:text-base drop-shadow-md">
              {estate.targetAudience}
            </p>
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
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 關於本小區
            </h2>
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
              <h2 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-3">
                 <div className="w-2 h-8 bg-orange-500 rounded-full"/> 交通與通勤
              </h2>
              <p className="text-slate-700 leading-relaxed font-medium text-base mb-6 whitespace-pre-wrap">{estate.trafficDesc}</p>
              {estate.trafficMapUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200/50 shadow-sm h-[300px] cursor-zoom-in" onClick={() => setLightboxImage(estate.trafficMapUrl)}>
                  <SafeImage src={estate.trafficMapUrl} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
              )}
            </section>
          )}

          <section id="facilities" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
               <div className="w-2 h-8 bg-orange-500 rounded-full"/> 屋苑設施與亮點
            </h2>
            
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

            {estate.roomAmenities && estate.roomAmenities.length > 0 && (
              <div className="mb-8">
                <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2"><BedDouble className="text-orange-500" size={18}/> 房間標準配置</h3>
                <div className="flex flex-wrap gap-2">
                  {estate.roomAmenities.map((a: string, i: number) => (
                    <span key={i} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm border border-emerald-100/50">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {(estate.roomAmenitiesImages?.length ? estate.roomAmenitiesImages.length > 0 : estate.roomAmenitiesUrl) && (
              <div className="mb-8">
                <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4 custom-scrollbar">
                  {(estate.roomAmenitiesImages && estate.roomAmenitiesImages.length > 0 ? estate.roomAmenitiesImages : [estate.roomAmenitiesUrl]).map((img, i) => (
                    img && (
                      <div key={i} className="shrink-0 w-72 md:w-80 h-48 snap-center cursor-zoom-in" onClick={() => setLightboxImage(img)}>
                        <SafeImage src={img} className="w-full h-full rounded-2xl object-cover hover:opacity-90 transition-opacity" />
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {(estate.highlights?.length ? estate.highlights.length > 0 : estate.highlightsUrl) && (
              <div className="mb-8">
                 <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2"><Star className="text-orange-500" size={18}/> 佳寓服務亮點</h3>
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

          {/* ★ 新增：公共區域展示 (獨立區塊，在戶型介紹正上方) */}
          {estate.publicAreaImages && estate.publicAreaImages.length > 0 && (
            <section id="public-areas" className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white/80 scroll-mt-32">
              <div className="flex items-center gap-3 mb-6">
                <Users size={28} className="text-blue-800" />
                <h2 className="text-2xl font-black text-blue-800">公共區域展示</h2>
              </div>
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
              <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3">
                 <div className="w-2 h-8 bg-orange-500 rounded-full"/> 戶型介紹與圖則
              </h2>
              
              <div className="space-y-12">
                {estate.roomTypes.map((rt, idx) => (
                  <div key={idx} className="border-b border-slate-200/60 pb-10 last:border-0 last:pb-0">
                    <h3 className="text-lg font-black text-white bg-slate-900 px-5 py-2.5 rounded-2xl w-max mb-6 shadow-md shadow-slate-900/20">
                      {rt.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

      {/* 相關盤源區塊 */}
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

              const finalImage = room.primaryImage 
                ? getProxiedUrl(room.primaryImage) 
                : (room.isCompetitor ? getEstateCover(room.propertyName || room.estateName) : null);

              const CardContent = (
                <>
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
                    <div className="mt-auto pt-4 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-black text-slate-500">
                       <span className={`flex items-center gap-1 px-2 py-1 rounded-md ${isSoldOut ? 'bg-slate-100 text-slate-400' : 'bg-cyan-50 text-cyan-700'}`}>
                         <BedDouble size={14}/> 拎包入住
                       </span>
                       <span className={`px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1 shadow-sm ${isSoldOut ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-orange-500'}`}>
                         {isSoldOut ? '已租出' : <>預約看房 <ArrowRight size={14}/></>}
                       </span>
                    </div>
                  </div>
                </>
              );

              const cardClasses = `group bg-white/70 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border border-white/80 transition-all duration-300 flex flex-col relative cursor-pointer ${isSoldOut ? 'opacity-90' : 'hover:shadow-2xl hover:-translate-y-2'}`;

              return (
                <div key={room.id} onClick={() => { if(!isSoldOut) setBookingRoom(room) }} className={cardClasses}>
                   {CardContent}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 預約表單 Modal */}
      {bookingRoom !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            
            <button onClick={() => setBookingRoom(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
              <X size={24}/>
            </button>
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
