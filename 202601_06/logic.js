// ============================================================
// 純粋ロジック（Firebase非依存）
// このファイルは外部接続を一切しないため、必ず読み込めます。
// ============================================================

/**
 * ココフォリアHTMLログを解析。main/HO問わずチャンネルを自動検出。
 */
export function analyzeLog(htmlContent) {
  const parser = new DOMParser();
  const docx = parser.parseFromString(htmlContent, "text/html");
  const paragraphs = docx.querySelectorAll("p");

  const speakers = {};
  const channelSet = new Set();

  paragraphs.forEach((p) => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;

    const channelText = spans[0].textContent.trim();
    const speaker = spans[1].textContent.trim();
    const rollText = spans[2].textContent.trim();

    const chMatch = channelText.match(/\[([^\]]+)\]/);
    const channel = chMatch ? `[${chMatch[1]}]` : channelText;

    // 1D100ロールか判定（6版・7版どちらの書式にも対応）
    // 6版: (1D100<=80) ＞ 22 ＞ 成功
    // 7版: (1D100<=70) ボーナス・ペナルティダイス[0] ＞ 83 ＞ 83 ＞ 失敗
    // 7版(B/Pあり): ... ＞ 25, 85 ＞ 85 ＞ 失敗   ←最後の「＞数字＞結果」の数字が最終出目
    if (!/\(1[dD]100[^)]*\)/.test(rollText)) return;

    let rollValue = null;
    // 「＞ 数字 ＞ 結果語」の並び（最終出目）を優先して取る
    const finalMatch = rollText.match(/[＞>]\s*(\d+)\s*[＞>]\s*[^＞>\d]/);
    if (finalMatch) {
      rollValue = parseInt(finalMatch[1], 10);
    } else {
      // 結果語なしの素振りロール（例: 1D100 ＞ 63）は最後の「＞ 数字」を取る
      const all = [...rollText.matchAll(/[＞>]\s*(\d+)/g)];
      if (all.length === 0) return;
      rollValue = parseInt(all[all.length - 1][1], 10);
    }
    if (rollValue === null || isNaN(rollValue)) return;

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

    if (!speakers[speaker]) {
      speakers[speaker] = {
        pcName: speaker, channels: new Set(),
        totalRolls: 0, fumble96_99: 0, fumble100: 0, san96_99: 0, san100: 0
      };
    }
    const s = speakers[speaker];
    s.channels.add(channel);
    s.totalRolls++;

    const isSanCheck =
      /正気度|SAN|san|San/.test(rollText) && !/RESB|対抗/.test(rollText);

    if (rollValue >= 96 && rollValue <= 99) {
      if (isSanCheck) s.san96_99++; else s.fumble96_99++;
    } else if (rollValue === 100) {
      if (isSanCheck) s.san100++; else s.fumble100++;
    }
  });

  Object.values(speakers).forEach((s) => { s.channels = Array.from(s.channels); });
  return { channels: Array.from(channelSet), speakers };
}

/** 悪い出目率 = (F96-99 + SAN96-99 + (F100+SAN100)*2) / 総ロール * 100 */
export function calcBadRate(stats) {
  if (!stats.totalRolls) return 0;
  const bad = stats.fumble96_99 + stats.san96_99 + (stats.fumble100 + stats.san100) * 2;
  return (bad / stats.totalRolls) * 100;
}

/** 手入力1行をパース */
export function parseManualLine(line) {
  const plMatch = line.match(/PL[:：]([^\s]+)/);
  const rollsMatch = line.match(/総ロール数[:：](\d+)/);
  if (!rollsMatch) throw new Error("「総ロール数」は必須です");

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
    plName: plMatch ? plMatch[1] : "",
    pcNames: pcMatch ? pcMatch[1].split(",").map(s=>s.trim()).filter(Boolean) : [],
    totalRolls, fumble96_99, fumble100, san96_99: 0, san100: 0
  };
}
