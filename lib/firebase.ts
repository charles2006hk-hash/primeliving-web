// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
// ★ 新增引入 initializeFirestore 來設定穿牆隧道
import { getFirestore, initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 如果 Config 沒讀到，這裡會噴錯，幫我們提早發現問題
if (!firebaseConfig.projectId) {
  console.error("❌ Firebase Project ID is missing. Check your .env.local file!");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db;

// ★ 核心穿牆黑科技：判斷是否在瀏覽器環境
if (typeof window !== "undefined") {
  // 在前端 (手機/瀏覽器) 時，強制改變資料庫連線位址，走我們剛才建好的 next.config.ts 隧道
  db = initializeFirestore(app, {
    host: `${window.location.host}/firestore-proxy`, // 指向您的 Vercel 隧道
    ssl: true,
    experimentalForceLongPolling: true, // ★ 內地穿牆必須強制使用 Long Polling (防 WebSocket 被阻斷)
  });
} else {
  // 在伺服器端渲染 (Server-side) 時，維持正常直連 Google
  db = getFirestore(app);
}

export { db };
