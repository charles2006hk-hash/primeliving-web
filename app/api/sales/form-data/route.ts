import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    // 1. 並行獲取所有銷售表單需連動的 CRM 數據 (Server端執行，毫秒級返回)
    const [settingsSnap, propsSnap, roomsSnap] = await Promise.all([
      adminDb.collection('settings').doc('general').get(),
      adminDb.collection('properties').get(),
      adminDb.collection('rooms').get()
    ]);

    // 2. 解析銷售與員工名單
    let staffList: string[] = ['公司行政 (Office)'];
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      if (data?.shareholders) {
        if (Array.isArray(data.shareholders)) {
          staffList = [...data.shareholders, '公司行政 (Office)'];
        } else if (typeof data.shareholders === 'string') {
          staffList = [...data.shareholders.split(',').map((s: string) => s.trim()).filter(Boolean), '公司行政 (Office)'];
        }
      }
    }

    // 3. 過濾假盤源：自動排除名稱包含 test / 測試 / 停用 的物業
    const properties = propsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; status?: string }))
      .filter(p => {
        const name = (p.name || '').toLowerCase();
        return !name.includes('test') && !name.includes('測試') && p.status !== '停用';
      });

    // 4. 解析單元單位狀態
    const rooms = roomsSnap.docs.map(d => ({
      id: d.id,
      propertyId: d.data().propertyId || '',
      name: d.data().name || '',
      status: d.data().status || 'Occupied',
      baseRent: d.data().baseRent || 0
    }));

    return NextResponse.json({
      success: true,
      data: {
        staffList: Array.from(new Set(staffList)),
        properties,
        rooms
      }
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('[Sales Form-Data BFF Error]:', error);
    return NextResponse.json(
      { success: false, error: '無法自大系統讀取盤源初始化資料' },
      { status: 500, headers: corsHeaders }
    );
  }
}
