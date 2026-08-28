import { NextResponse } from 'next/server';
// ⚠️ 修正：直接對應你原版 firebaseAdmin.ts 導出的 adminDb 變數
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { accessCode } = await request.json();
    // 清洗使用者輸入：轉小寫、去除所有空格
    const cleanInput = String(accessCode || '').replace(/\s+/g, '').toLowerCase();

    if (!cleanInput) {
      return NextResponse.json({ error: '請輸入登入碼' }, { status: 400 });
    }

    // ★ 使用 adminDb 撈取全量租客進行動態比對 (擁有 Firebase Admin 最高權限)
    const tenantsRef = adminDb.collection('tenants');
    const snap = await tenantsRef.get();

    // 在伺服器端執行防錯智能比對
    const matchedTenant = snap.docs.find(doc => {
      const data = doc.data();
      
      const name = String(data.name || '').replace(/\s+/g, '').toLowerCase();
      const nameLast4 = name.slice(-4);
      
      // 支援多種證件欄位
      const fullId = String(data.identityNumber || data.idCard || data.passport || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const idLast4 = fullId.slice(-4);

      const phone = String(data.phone || '').replace(/\D/g, '');
      const phone8 = phone.slice(-8);
      const phone4 = phone.slice(-4);
      
      const contractId = String(data.contractId || '').replace(/\s+/g, '').toLowerCase();

      // 建立多重容錯合法登入碼池
      const validCodes = [];
      if (name && idLast4) validCodes.push(name + idLast4);             
      if (nameLast4 && idLast4) validCodes.push(nameLast4 + idLast4);   
      if (phone8 && idLast4) validCodes.push(phone8 + idLast4);         
      if (name && phone4) validCodes.push(name + phone4);               
      if (contractId) validCodes.push(contractId);                      

      return validCodes.includes(cleanInput);
    });

    if (matchedTenant) {
      const data = matchedTenant.data();
      
      // ★ 防護升級：資料脫敏 (Data Sanitization)，避免 PII 外洩
      const safePayload = {
        id: matchedTenant.id,
        name: data.name,
        propertyAddress: data.propertyAddress,
        roomName: data.roomName,
        phone: data.phone,
        leaseStart: data.leaseStart,
        leaseEnd: data.leaseEnd,
        monthlyRent: data.monthlyRent,
        deposit: data.deposit,
        amountDue: data.amountDue,
        hasUnpaidBills: data.hasUnpaidBills,
        status: data.status,
      };

      return NextResponse.json(safePayload, { status: 200 });
    } else {
      return NextResponse.json({ error: '登入碼無效。請確認您的姓名與密碼是否正確。' }, { status: 401 });
    }

  } catch (error: any) {
    console.error("Auth API Error:", error);
    return NextResponse.json({ error: '系統連線發生錯誤，請稍後再試。' }, { status: 500 });
  }
}
