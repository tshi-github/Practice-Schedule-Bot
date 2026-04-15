// bot/services/scraper.js
require('dotenv').config();

const puppeteer = require('puppeteer');

// 曜日配列（Date.getDay()用）
const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 日付文字列に曜日を付ける
 * 例: 2026/04/09 → 2026/04/09(木)
 */
function formatDateWithDay(dateStr) {
  const date = new Date(dateStr);
  const day  = dayNames[date.getDay()];
  return `${dateStr}(${day})`;
}

/**
 * テーブル（F1会議室行）が現れるまで待つ
 * waitForNavigation はフレーム内だけ更新される場合タイムアウトするため、
 * DOMの変化で待機する
 */
async function waitForTableReady(frame, timeout = 15000) {
  // 既存テーブルが消えるのを最大2秒待つ（消えない場合は無視）

  const prevDate = await frame.evaluate(() => {
    const input = document.querySelector('#displayDateStr');
    return input ? input.value : '';
  }).catch(() => '');

  // 表示が更新されるまで待つ（入力値の変化 or テーブル再描画）
  await frame.waitForFunction(
    (prev) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      // F1会議室行が存在して、かつ日付入力欄の値が変わっていれば更新済み
      const hasFacility = rows.some(row => {
        const cell = row.querySelector('td.kyuko-shi-shisetsunm');
        return cell && cell.textContent.trim().length > 0;
      });
      const input = document.querySelector('#displayDateStr');
      const currentDate = input ? input.value : '';
      return hasFacility && currentDate !== prev;
    },
    { timeout },
    prevDate
  );
}

/**
 * 空き状況をDOMから解析する（evaluate内で実行）
 * ※ この関数はブラウザのコンテキストで実行されるため、
 *   外部スコープの変数は参照できない
 */
function analyzeAvailability(checkTime) {
  const BASE_HOUR   = 6;
  const TOTAL_SLOTS = (21 - BASE_HOUR) * 6;

  function timeToIndex(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return (h - BASE_HOUR) * 6 + Math.floor(m / 10);
  }

  function indexToTime(idx) {
    const totalMin = BASE_HOUR * 60 + idx * 10;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const DISPLAY_START = timeToIndex('09:00');
  const startIdx      = timeToIndex(checkTime.start);
  const endIdx        = timeToIndex(checkTime.end);

  const rows      = Array.from(document.querySelectorAll('tr'));
  const targetRow = rows.find(row => {
    const cell = row.querySelector('td.kyuko-shi-shisetsunm');
    return cell && cell.textContent.trim() === 'F1会議室';
  });

  if (!targetRow) return { error: 'F1会議室の行が見つかりません' };

  const occupied = new Array(TOTAL_SLOTS).fill(false);
  let colIndex = 0;

  for (const cell of Array.from(targetRow.querySelectorAll('td'))) {
    if (cell.classList.contains('kyuko-shi-shisetsunm')) continue;
    if (colIndex >= TOTAL_SLOTS) break;

    const colspan = parseInt(cell.getAttribute('colspan') || '1');

    if (cell.classList.contains('kyuko-shi-jugyo')) {
      for (let i = colIndex; i < colIndex + colspan && i < TOTAL_SLOTS; i++) {
        occupied[i] = true;
      }
    }
    colIndex += colspan;
  }

  const isOccupied = occupied.slice(startIdx, endIdx).some(v => v);
  if (!isOccupied) return { status: 'Open' };

  // 空き時間帯を抽出
  const freeSlots = [];
  let freeStart   = null;

  for (let i = 0; i <= TOTAL_SLOTS; i++) {
    if (i < TOTAL_SLOTS && !occupied[i] && freeStart === null) {
      freeStart = i;
    } else if ((i === TOTAL_SLOTS || occupied[i]) && freeStart !== null) {
      freeSlots.push(`${indexToTime(freeStart)}~${indexToTime(i)}`);
      freeStart = null;
    }
  }

  const filteredSlots = freeSlots.filter(slot =>
    timeToIndex(slot.split('~')[0]) >= DISPLAY_START
  );

  const freeAfterStart = filteredSlots.filter(slot =>
    timeToIndex(slot.split('~')[1]) > startIdx
  );

  if (freeAfterStart.length === 0) {
    return {
      status:      'Occupied',
      allOccupied: true,
      message:     `${checkTime.start}〜21:00 は空きがありません`,
    };
  }

  return {
    status:      'Occupied',
    allOccupied: false,
    freeSlots:   filteredSlots,
  };
}

/**
 * 1件のリクエストをリトライ付きで処理する
 */
async function checkSingleDate(frame, date, checkTime, retries = 3) {
  const formattedDate = formatDateWithDay(date);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 日付入力フィールドが現れるまで待機
      await frame.waitForSelector('#displayDateStr', { timeout: 15000 });

      // 日付をセット
      await frame.evaluate((val) => {
        const input = document.querySelector('#displayDateStr');
        input.value = val;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, formattedDate);

      // 表示ボタンを押す前に少し待つ（イベント伝播を確実に）
      await new Promise(resolve => setTimeout(resolve, 500));

      // 表示ボタンを押す
      await frame.waitForSelector(
        'input[type="submit"][value="表示"]',
        { timeout: 15000 }
      );
      await frame.click('input[type="submit"][value="表示"]');

      // テーブルが更新されるまで待つ（コンテキスト破壊対策）
      await waitForTableReady(frame, 15000);

      // 追加の安定待機
      await new Promise(resolve => setTimeout(resolve, 500));

      // DOM解析
      const result = await frame.evaluate(analyzeAvailability, checkTime);

      // F1会議室が見つからなかった場合はリトライ
      if (result.error && attempt < retries) {
        console.warn(`[attempt ${attempt}] ${date}: ${result.error} → リトライします`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        lastError = result;
        continue;
      }

      return result;

    } catch (err) {
      console.warn(`[attempt ${attempt}] ${date}: ${err.message}`);
      lastError = { error: err.message };

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  return lastError ?? { error: '不明なエラー' };
}

/**
 * 複数リクエストの空き状況をチェック
 * @param {Array<{date: string, checkTime: {start: string, end: string}, originalLine: string}>} requests
 * @param {Function} onResult - コールバック(originalLine, date, checkTime, result)
 */
async function checkAvailabilityList(requests, onResult) {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-first-run',
      '--no-zygote',
      '--single-process',       // Renderの制限環境向け
      '--memory-pressure-off',
    ],
    headless: true,
    timeout:  30000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // リソース節約：画像・フォント・メディア・CSSをブロック
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // ページ初回ロード
    await page.goto(
      'https://csweb.u-aizu.ac.jp/campusweb/campussquare.do?_flowId=KHW0001310-flow',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );

    // フレーム取得（campussquare.doを含むフレームを優先）
    const getTargetFrame = () =>
      page.frames().find(f => f.url().includes('campussquare.do')) ??
      page.mainFrame();

    let targetFrame = getTargetFrame();

    // 初期テーブル読み込み待機
    await waitForTableReady(targetFrame, 20000);

    for (const { date, checkTime, originalLine } of requests) {
      // フレームを毎回再取得（ナビゲーション後に参照が変わる場合がある）
      targetFrame = getTargetFrame();

      const result = await checkSingleDate(targetFrame, date, checkTime);
      await onResult(originalLine, date, checkTime, result);
    }

  } finally {
    await browser.close();
  }
}

module.exports = { checkAvailabilityList };