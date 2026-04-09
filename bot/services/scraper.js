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
 * 複数リクエストの空き状況をチェック
 * @param {Array<{date: string, checkTime: {start: string, end: string}, originalLine: string}>} requests
 * @param {Function} onResult - コールバック(originalLine, date, checkTime, result)
 */
async function checkAvailabilityList(requests, onResult) {
  const browser = await puppeteer.launch({
    args:[
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // Renderのメモリ制限対策
      '--disable-gpu',
    ],
    executablePath: await chromium.executablePath(),
    headless:       chromium.headless,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // 会津大学 施設利用状況ページ（ログイン不要）
    await page.goto(
      'https://csweb.u-aizu.ac.jp/campusweb/campussquare.do?_flowId=KHW0001310-flow',
      { waitUntil: 'networkidle2', timeout: 10000 }
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // フレーム取得
    const targetFrame =
      page.frames().find(f => f.url().includes('campussquare.do')) ??
      page.mainFrame();

    for (const { date, checkTime, originalLine } of requests) {
      try {
        const formattedDate = formatDateWithDay(date);

        await targetFrame.waitForSelector('#displayDateStr', { timeout: 10000 });

        // 日付をセット
        await targetFrame.evaluate((val) => {
          const input = document.querySelector('#displayDateStr');
          input.value = val;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, formattedDate);

        // 表示ボタンを押す
        await targetFrame.waitForSelector(
          'input[type="submit"][value="表示"]',
          { timeout: 10000 }
        );
        await targetFrame.click('input[type="submit"][value="表示"]');

        await new Promise(resolve => setTimeout(resolve, 1500));

        // 空き状況を解析
        const result = await targetFrame.evaluate((checkTime) => {
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
        }, checkTime);

        await onResult(originalLine, date, checkTime, result);

      } catch (err) {
        await onResult(originalLine, date, checkTime, { error: err.message });
      }
    }
  } finally {
    await browser.close();
  }
}

module.exports = { checkAvailabilityList };