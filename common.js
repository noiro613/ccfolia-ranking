// ============================================================
// Firebase 接続部
// ============================================================
// Firebaseコンソール → プロジェクトの設定 → マイアプリ → SDK設定 からコピー
const firebaseConfig = {
  apiKey: "AIzaSyD9AE-GxbgtNAEqI5mojhJ9sXE8ow6HeGM",
  authDomain: "ccfolia-dice.firebaseapp.com",
  projectId: "ccfolia-dice",
  storageBucket: "ccfolia-dice.firebasestorage.app",
  messagingSenderId: "167692979565",
  appId: "1:167692979565:web:1c8b3373d037d744641e64"
};

// ホストの合言葉（仲間内のネタバレ防止用の簡易ロック）
const HOST_PASSPHRASE = "20260106dice";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, getDoc,
  setDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 設定が未入力でもUIが止まらないよう、接続は try で保護
let db = null;
let firebaseReady = false;
try {
  if (!firebaseConfig.apiKey.startsWith("ここに")) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseReady = true;
  } else {
    console.warn("[common.js] Firebase未設定。保存機能は無効、UIは動作します。");
  }
} catch (e) {
  console.error("[common.js] Firebase初期化に失敗:", e);
  db = null;
  firebaseReady = false;
}

export {
  db, firebaseReady, HOST_PASSPHRASE,
  collection, addDoc, getDocs, doc, getDoc,
  setDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp
};

export function isHost(input) {
  return input === HOST_PASSPHRASE;
}
