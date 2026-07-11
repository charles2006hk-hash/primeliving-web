import { NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: Request) {
  try {
    const { accessCode } = await request.json();
    // 清洗使用者輸入：轉小寫、去除所有空格
    const cleanInput = String(accessCode || '').replace(/\s+/g, '').toLowerCase();

    if (!cleanInput) {
      return NextResponse.json({ error: '請輸入登入碼' }, { status: 400 });
    }

    // 抓取所有履約中與即將入駐的租客
    const activeQuery = query(collection(db, 'tenants'), where('status', 'in', ['Active', 'Pending']));
    const snap = await getDocs(activeQuery);

    // 在伺服器端執行防錯智能比對
    const matchedTenant = snap.docs.find(doc => {
      const data = doc.data();
      
      // ★ 核心防錯：使用 String() 強制轉型，避免數字型別導致字串函數崩潰
      const name = String(data.name || '').replace(/\s+/g, '').toLowerCase();
      const nameLast4 = name.slice(-4);
      
      const fullId = String(data.identityNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const idLast4 = fullId.slice(-4);

      const phone = String(data.phone || '').replace(/\D/g, '');
      const phone8 = phone.slice(-8);
      const phone4 = phone.slice(-4);
      
      const contractId = String(data.contractId || '').replace(/\s+/g, '').toLowerCase();

      // 建立多重容錯合法登入碼池
      const validCodes = [];
      if (name && idLast4) validCodes.push(name + idLast4);             // 呂嫣然4321
      if (nameLast4 && idLast4) validCodes.push(nameLast4 + idLast4);   // (若為英文名適用)
      if (phone8 && idLast4) validCodes.push(phone8 + idLast4);         // 123456784321
      if (name && phone4) validCodes.push(name + phone4);               // 呂嫣然5678 (備用)
      if (contractId) validCodes.push(contractId);                      // 系統編號

      return validCodes.includes(cleanInput);
    });

    if (matchedTenant) {
      return NextResponse.json({ id: matchedTenant.id, ...matchedTenant.data() }, { status: 200 });
    } else {
      return NextResponse.json({ error: '登入碼無效。請確認您的姓名與證件後4碼是否正確。' }, { status: 401 });
    }

  } catch (error: any) {
    console.error("Auth API Error:", error);
    return NextResponse.json({ error: '系統連線發生錯誤，請稍後再試。' }, { status: 500 });
  }
}
