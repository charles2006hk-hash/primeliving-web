import { NextResponse } from 'next/server';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 1. 🛡️ 伺服器端絕對防線：驗證邀請碼 (前端完全看不到這個密碼)
    const inviteCode = body.inviteCode?.trim().toUpperCase();
    if (inviteCode !== 'PRIME2026') {
      return NextResponse.json({ 
        success: false, 
        error: '邀請碼無效或已過期，請聯繫 Prime Living 官方。' 
      }, { status: 403 });
    }

    // 2. 🧹 資料清洗：拔除敏感欄位，提取安全資料
    const { inviteCode: _, partnerName, partnerContact, propertyName, region, address, expectedRent, roomCount, description, images } = body;

    // 3. 💾 寫入 Firestore
    // 注意：因為我們使用的是 Client SDK，所以您剛剛在 Firebase Console 設定的 Rules (allow create...) 依然會在此生效並保護資料庫
    const docRef = await addDoc(collection(db, 'properties'), {
      name: propertyName,
      region: region,
      address: address,
      expectedRent: Number(expectedRent) || 0,
      plannedRooms: Number(roomCount) || 0,
      description: description || '',
      images: images || [],
      
      // 合作方資訊
      partnerInfo: {
        name: partnerName,
        contact: partnerContact
      },
      
      // ★ 強制後端覆寫：絕對不允許前端竄改這些狀態
      sourceType: 'partner',
      approvalStatus: 'pending',
      status: '準備狀態',
      webStatus: 'draft',
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: docRef.id });

  } catch (error: any) {
    console.error('Partner Submit API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || '伺服器發生異常，請稍後再試。' 
    }, { status: 500 });
  }
}
