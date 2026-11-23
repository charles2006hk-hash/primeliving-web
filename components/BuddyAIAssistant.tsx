'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Send, X, Sparkles, Home, MessageCircle } from 'lucide-react';

export type BuddyExpression = 'default' | 'curious' | 'thinking' | 'celebration' | 'confused';
export type BuddyCostume = 'default' | 'new_year' | 'halloween' | 'christmas';

// 若暫時不轉 WebP，將下方副檔名改為 .jpeg 即可直接使用
const BUDDY_ASSETS: Record<BuddyExpression | Exclude<BuddyCostume, 'default'>, string> = {
  default: '/buddy/buddy-default.webp',
  curious: '/buddy/buddy-curious.webp',
  thinking: '/buddy/buddy-thinking.webp',
  celebration: '/buddy/buddy-celebration.webp',
  confused: '/buddy/buddy-confused.webp',
  new_year: '/buddy/buddy-new-year.webp',
  halloween: '/buddy/buddy-halloween.webp',
  christmas: '/buddy/buddy-christmas.webp',
};

const MOTION_CLASS: Record<BuddyExpression, string> = {
  default: 'animate-buddy-idle',
  curious: 'animate-buddy-curious',
  thinking: 'animate-pulse',
  celebration: 'animate-bounce',
  confused: 'animate-buddy-confused',
};

interface PageContext {
  bubbleText: string;
  quickPrompts: string[];
  compact?: boolean;
}

const getPageContext = (pathname: string): PageContext => {
  if (pathname.startsWith('/properties')) {
    return {
      bubbleText: '挑房有疑問？跟我說預算和學校，幫你篩選 🏠',
      quickPrompts: ['近中大/教大有房嗎？', '預算 $8,000 推薦', '租金包含水電網嗎？'],
    };
  }
  if (pathname.startsWith('/encyclopedia')) {
    return {
      bubbleText: '對這個屋苑的交通或周邊有疑問嗎？問我喔 🚇',
      quickPrompts: ['這裡去大學要多久？', '目前還有空房嗎？', '附近生活機能如何？'],
    };
  }
  if (pathname.startsWith('/guides')) {
    return {
      bubbleText: '看攻略累了嗎？直接問我租房流程最快 ✨',
      quickPrompts: ['簽約需要準備什麼？', '押金怎麼計算？', '如何預約線上看房？'],
    };
  }
  if (pathname.startsWith('/tenant-portal')) {
    return {
      bubbleText: '租客專區小管家在這！查帳單或報修都可以找我 📋',
      quickPrompts: ['如何查看我的帳單？', '怎麼提交維修申請？', '合約續租流程'],
    };
  }
  if (pathname.startsWith('/pay') || pathname.startsWith('/payment-status') || pathname.startsWith('/sales-pay')) {
    return {
      bubbleText: '付款遇到問題嗎？點我協助處理 💳',
      quickPrompts: ['支援哪些付款方式？', '付款後多久更新狀態？', '聯絡人工客服'],
      compact: true,
    };
  }
  return {
    bubbleText: '嗨！我是 Buddy，想找香港哪一區的理想家呢？🧡',
    quickPrompts: ['推薦近大學的房源', '如何預訂拎包入住？', '查詢目前空房'],
  };
};

export default function BuddyAIAssistant() {
  const pathname = usePathname() || '/';
  const pageContext = useMemo(() => getPageContext(pathname), [pathname]);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<BuddyExpression>('default');
  const [costume, setCostume] = useState<BuddyCostume>('default');
  const [showAutoBubble, setShowAutoBubble] = useState(false);
  const [messages, setMessages] = useState<{ sender: 'user' | 'buddy'; text: string }[]>([
    {
      sender: 'buddy',
      text: '哈囉！歡迎來到 Prime Living 佳寓 🧡 我是你的專屬小管家 Buddy，有什麼我可以幫忙的嗎？',
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 監聽路由切換，自動更新提示氣泡與微互動
  useEffect(() => {
    if (isOpen || pageContext.compact) {
      setShowAutoBubble(false);
      return;
    }

    setStatus('curious');
    setShowAutoBubble(true);

    const curiousTimer = setTimeout(() => setStatus('default'), 1600);
    const bubbleTimer = setTimeout(() => setShowAutoBubble(false), 5000);

    return () => {
      clearTimeout(curiousTimer);
      clearTimeout(bubbleTimer);
    };
  }, [pathname, isOpen, pageContext.compact]);

  // 節慶自動換裝 + Firestore 後台覆寫
  useEffect(() => {
    const detectDateCostume = (): BuddyCostume => {
      const now = new Date();
      const m = now.getMonth() + 1;
      const d = now.getDate();
      if (m === 12 && d >= 10 && d <= 28) return 'christmas';
      if (m === 10 && d >= 24 && d <= 31) return 'halloween';
      if ((m === 1 && d >= 18) || (m === 2 && d <= 18)) return 'new_year';
      return 'default';
    };

    setCostume(detectDateCostume());

    if (!db) return;
    const unsub = onSnapshot(
      doc(db, 'settings', 'general'),
      (snap) => {
        if (snap.exists()) {
          const override = snap.data()?.buddyCostumeOverride as BuddyCostume | undefined;
          if (override && ['default', 'new_year', 'halloween', 'christmas'].includes(override)) {
            setCostume(override);
          }
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const currentAvatar =
    status === 'default' && costume !== 'default'
      ? BUDDY_ASSETS[costume]
      : BUDDY_ASSETS[status];

  const sendMessage = async (textToSend: string) => {
    const userText = textToSend.trim();
    if (!userText) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setInput('');
    setStatus('thinking');

    try {
      await new Promise((res) => setTimeout(res, 800));

      let reply = `收到關於「${userText}」的詢問！我們可以根據您目前瀏覽的頁面 (${pathname}) 為您安排最適合的房源或管家協助 🏠`;
      if (/錯|失敗|問題|怪|不能/.test(userText)) {
        setStatus('confused');
        reply = '咦？好像遇到一點狀況，別擔心！請告訴我具體細節，我馬上幫您排查 🔍';
      } else if (/謝|讚|好|成功|完成/.test(userText)) {
        setStatus('celebration');
        reply = '太棒啦！很高興能幫到你 🎉 有需要隨時再點我喔！';
      } else {
        setStatus('default');
      }

      setMessages((prev) => [...prev, { sender: 'buddy', text: reply }]);
    } catch {
      setStatus('confused');
      setMessages((prev) => [
        ...prev,
        { sender: 'buddy', text: '哎呀，連線稍微卡住了，請稍後再試一次喔！' },
      ]);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end font-sans print:hidden pointer-events-none">
      {/* 對話視窗 */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 flex h-[min(480px,72vh)] w-[calc(100vw-2rem)] sm:w-96 flex-col overflow-hidden rounded-3xl border border-orange-200/80 bg-[#FFFDF9]/95 backdrop-blur-xl shadow-2xl shadow-orange-900/15 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header：同樣採用 Muse 圓形白框頭像 */}
          <div className="flex items-center justify-between bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-4 py-3 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0">
                <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-white shadow-sm">
                  <img
                    src={currentAvatar}
                    alt="Buddy"
                    onClick={() => setStatus('curious')}
                    className={`h-full w-full cursor-pointer object-cover object-top scale-110 ${MOTION_CLASS[status]}`}
                  />
                </div>
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-black tracking-wide">Buddy 佳寓小管家</h3>
                  {costume !== 'default' && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm">
                      節慶限定
                    </span>
                  )}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-orange-50">
                  <Home size={11} /> Prime Living AI Assistant
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-xl p-1.5 text-white/90 transition hover:bg-white/20"
              aria-label="關閉視窗"
            >
              <X size={18} />
            </button>
          </div>

          {/* 訊息區 */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-orange-50/40 to-white p-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    m.sender === 'user'
                      ? 'rounded-tr-sm bg-slate-900 text-white'
                      : 'rounded-tl-sm border border-orange-100 bg-white text-slate-700'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 隨頁面動態切換的快捷提問列 */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-orange-100/70 bg-orange-50/30 px-3 py-2 shrink-0">
            {pageContext.quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="shrink-0 rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-bold text-orange-700 transition hover:bg-orange-500 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* 輸入列 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-orange-100 bg-white p-3 shrink-0"
          >
            <input
              type="text"
              value={input}
              onFocus={() => status === 'default' && setStatus('curious')}
              onBlur={() => status === 'curious' && setStatus('default')}
              onChange={(e) => setInput(e.target.value)}
              placeholder="輸入問題，Buddy 馬上幫你..."
              className="flex-1 rounded-2xl border border-orange-200/80 bg-orange-50/40 px-3.5 py-2 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
            />
            <button
              type="submit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 transition hover:brightness-105 active:scale-95"
              aria-label="發送訊息"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* 右下角常駐懸浮觸發按鈕：Muse 圓形純白外框風格 */}
      <div className="pointer-events-auto group relative flex items-center">
        {!isOpen && (
          <div
            className={`pointer-events-none mr-3 hidden sm:flex items-center gap-1.5 whitespace-nowrap rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-slate-700 shadow-lg transition-all duration-300 ${
              showAutoBubble ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 group-hover:opacity-100'
            }`}
          >
            <Sparkles size={13} className="text-orange-500 shrink-0" />
            <span>{pageContext.bubbleText}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            setShowAutoBubble(false);
            setStatus('curious');
            setTimeout(() => setStatus('default'), 1500);
          }}
          aria-label="開啟 Buddy AI 助理"
          className="relative h-16 w-16 sm:h-[74px] sm:w-[74px] transition-all duration-300 hover:-translate-y-1 active:scale-95"
        >
          {/* 外層純白圓框 (免去背關鍵：純白底 + overflow-hidden + 精緻細框) */}
          <div className="h-full w-full overflow-hidden rounded-full border-[3px] border-white bg-white ring-1 ring-slate-200/90 shadow-xl shadow-slate-900/15 transition-all duration-300 group-hover:ring-orange-400">
            <img
              src={currentAvatar}
              alt="Buddy AI"
              className={`h-full w-full object-cover object-top scale-[1.12] transition-transform duration-300 group-hover:scale-[1.2] ${MOTION_CLASS[status]}`}
            />
          </div>

          {/* 右下角 Muse 風格小白圓徽章 */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-50 text-orange-500 shadow-md">
            {costume !== 'default' ? (
              <span className="text-[11px] leading-none">✨</span>
            ) : (
              <MessageCircle size={12} className="fill-orange-500/15" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
