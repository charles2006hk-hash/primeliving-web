import { NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: Request) {
  try {
    const { accessCode } = await request.json();
    const cleanInput = accessCode.replace(/\s+/g, '').toLowerCase();

    if (!cleanInput) {
      return NextResponse.json({ error: '請輸入登入碼' }, { status: 400 });
    }

    // 在伺服器端抓取資料，避免資料暴露給瀏覽器
    const activeQuery = query(collection(db, 'tenants'), where('status', 'in', ['Active', 'Pending']));
    const snap = await getDocs(activeQuery);

    // 智能多重匹配邏輯
    const matchedTenant = snap.docs.find(doc => {
      const data = doc.data();
      const name = (data.name || '').replace(/\s+/g, '').toLowerCase();
      const nameLast4 = name.slice(-4);
      const idLast4 = (data.identityNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-4);
      const phone = (data.phone || '').replace(/\D/g, '');
      const phone8 = phone.slice(-8);
      const phone4 = phone.slice(-4);
      const contractId = (data.contractId || '').replace(/\s+/g, '').toLowerCase();

      const validCodes = [];
      if (name && idLast4) validCodes.push(name + idLast4);
      if (nameLast4 && idLast4) validCodes.push(nameLast4 + idLast4);
      if (phone8 && idLast4) validCodes.push(phone8 + idLast4);
      if (name && phone4) validCodes.push(name + phone4);
      if (contractId) validCodes.push(contractId);

      return validCodes.includes(cleanInput);
    });

    if (matchedTenant) {
      // 只回傳匹配成功的單一租客資料
      return NextResponse.json({ id: matchedTenant.id, ...matchedTenant.data() }, { status: 200 });
    } else {
      return NextResponse.json({ error: '登入碼無效。請確認您的姓名與證件後4碼是否正確。' }, { status: 401 });
    }

  } catch (error: any) {
    console.error("Auth API Error:", error);
    return NextResponse.json({ error: '系統連線發生錯誤，請稍後再試。' }, { status: 500 });
  }
}
