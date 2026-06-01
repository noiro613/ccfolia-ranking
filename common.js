// ============================================================
// 共通設定・ロジック
// ============================================================
//
// ▼▼▼ ここをあなたの Firebase 設定に書き換えてください ▼▼▼
// Firebaseコンソール → プロジェクトの設定 → マイアプリ → SDK設定 からコピー
const firebaseConfig = {
  apiKey: "AIzaSyD9AE-GxbgtNAEqI5mojhJ9sXE8ow6HeGM",
  authDomain: "ccfolia-dice.firebaseapp.com",
  projectId: "ccfolia-dice",
  storageBucket: "ccfolia-dice.firebasestorage.app",
  messagingSenderId: "167692979565",
  appId: "1:167692979565:web:1c8b3373d037d744641e64"
};
// ▲▲▲ ここまで ▲▲▲

// ホストの合言葉（任意の文字列に変更してください）
// ※これは「仲間内のネタバレ防止」用の簡易ロックです。
//   ガチのセキュリティではない点に注意。
const HOST_PASSPHRASE = "20260106dice";

// ============================================================
// Firebase 初期化（CDN版 v10 modular を各HTMLで import して使用）
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, getDoc,
  setDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export {
  collection, addDoc, getDocs, doc, getDoc,
  setDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp
};
export { HOST_PASSPHRASE };

// ============================================================
// ココフォリアログ解析
// ============================================================

/**
 * HTMLログ文字列を解析して、チャンネルごと・話者ごとのロール統計を返す。
 * mainチャンネルでもそれ以外（HO1等）でも対応。
 *
 * @param {string} htmlContent - ログHTMLの中身
 * @returns {Object} { channels: [...], speakers: { 名前: {stats} } }
 */
export function analyzeLog(htmlContent) {
  const parser = new DOMParser();
  const docx = parser.parseFromString(htmlContent, "text/html");
  const paragraphs = docx.querySelectorAll("p");

  // 話者ごとに集計
  const speakers = {};
  const channelSet = new Set();

  paragraphs.forEach((p) => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;

    const channelText = spans[0].textContent.trim(); // 例 "[main]" "[HO1]"
    const speaker = spans[1].textContent.trim();
    const rollText = spans[2].textContent.trim();

    // チャンネル名を抽出
    const chMatch = channelText.match(/\[([^\]]+)\]/);
    const channel = chMatch ? `[${chMatch[1]}]` : channelText;

    // 1D100 ロールを抽出
    const diceMatch = rollText.match(/\(1[dD]100[^)]*\)\s*[＞>]\s*(\d+)/);
    if (!diceMatch) return;

    // システム・NPC・見出しっぽいものを除外
    if (
      speaker === "system" ||
      speaker === "KP" ||
      speaker.startsWith("▼") ||
      speaker.startsWith("▽") ||
      speaker.includes("『") ||
      speaker.includes("【")
    ) {
      return;
    }

    channelSet.add(channel);

    const rollValue = parseInt(diceMatch[1], 10);

    // 話者キーは「チャンネル＋話者」ではなく話者単位で集計
    // （同じPCが複数チャンネルに出ても1人として扱う）
    if (!speakers[speaker]) {
      speakers[speaker] = {
        pcName: speaker,
        channels: new Set(),
        totalRolls: 0,
        fumble96_99: 0,
        fumble100: 0,
        san96_99: 0,
        san100: 0
      };
    }
    const s = speakers[speaker];
    s.channels.add(channel);
    s.totalRolls++;

    const isSanCheck =
      /正気度|SAN|san|San/.test(rollText) && !/RESB|対抗/.test(rollText);

    if (rollValue >= 96 && rollValue <= 99) {
      if (isSanCheck) s.san96_99++;
      else s.fumble96_99++;
    } else if (rollValue === 100) {
      if (isSanCheck) s.san100++;
      else s.fumble100++;
    }
  });

  // channels の Set を配列に
  Object.values(speakers).forEach((s) => {
    s.channels = Array.from(s.channels);
  });

  return {
    channels: Array.from(channelSet),
    speakers: speakers
  };
}

/**
 * 悪い出目率を計算
 * 式: (ファンブル96-99 + SAN96-99 + (100の回数)*2) / 総ロール数 * 100
 */
export function calcBadRate(stats) {
  if (!stats.totalRolls || stats.totalRolls === 0) return 0;
  const bad =
    stats.fumble96_99 +
    stats.san96_99 +
    (stats.fumble100 + stats.san100) * 2;
  return (bad / stats.totalRolls) * 100;
}

/**
 * 手動入力テキスト1行をパース
 * 形式: シナリオ名:XXX PL:XXX PC:XXX 総ロール数:XX回 致命的失敗:XX回(内100ファンXX回)
 */
export function parseManualLine(line) {
  const plMatch = line.match(/PL[:：]([^\s]+)/);
  const rollsMatch = line.match(/総ロール数[:：](\d+)/);
  if (!plMatch || !rollsMatch) {
    throw new Error("PL名と総ロール数は必須です");
  }
  const pcMatch = line.match(/PC[:：]([^総]+?)(?:\s+総|$)/);
  const failMatch = line.match(/致命的失敗[:：](\d+)/);
  const fan100Match = line.match(/100ファン(\d+)/);
  const scenarioMatch = line.match(/シナリオ名[:：]([^\s]+)/);

  const totalRolls = parseInt(rollsMatch[1], 10);
  const totalFails = failMatch ? parseInt(failMatch[1], 10) : 0;
  const fumble100 = fan100Match ? parseInt(fan100Match[1], 10) : 0;
  const fumble96_99 = totalFails - fumble100;

  return {
    scenarioName: scenarioMatch ? scenarioMatch[1] : "",
    plName: plMatch[1],
    pcNames: pcMatch
      ? pcMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    totalRolls,
    fumble96_99,
    fumble100,
    san96_99: 0,
    san100: 0
  };
}

// 簡易ハッシュ（合言葉照合の見た目用。平文比較でも可）
export function isHost(input) {
  return input === HOST_PASSPHRASE;
}
