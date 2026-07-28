import * as admin from 'firebase-admin';

// 確保在 Serverless 環境下不會重複初始化
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel 環境變數的換行符號處理防呆機制
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export const adminDb = admin.firestore();
