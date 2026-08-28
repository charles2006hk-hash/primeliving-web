import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    // 使用 Admin SDK 平行撈取 documents (單據) 與 inquiries (互動/報修)
    const [docsSnap, inqSnap] = await Promise.all([
      adminDb.collection('documents').where('formData.tenantId', '==', tenantId).get(),
      adminDb.collection('inquiries').where('tenantId', '==', tenantId).get()
    ]);

    const documents = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // 過濾掉內部備註，只回傳租客可見的訊息
    const inquiries = inqSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((log: any) => log.type !== 'internal_note');

    return NextResponse.json({ documents, inquiries }, { status: 200 });
  } catch (error) {
    console.error("Fetch Tenant Data Error:", error);
    return NextResponse.json({ error: '獲取資料失敗' }, { status: 500 });
  }
}
