// bot/services/scraper.js
// 会津大学の施設予約システム（CampusSquare）をスクレイピングして
// F1会議室の空き状況を確認する（Puppeteer 使用）
//
// analyzeAvailability  - DOM を解析して空き・予約済みを判定（page.evaluate 内で実行）
//   スロット管理: 6:00〜21:00 を10分単位（90スロット）で管理
//   colspan 属性から予約済み範囲を特定する
//
// checkSingleDate      - 1日分の日付をフォームに入力して DOM を解析
// checkAvailabilityList - 複数日程を順番にチェックし、結果をコールバックに渡す

require('dotenv').config();
const puppeteer = require('puppeteer');

const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateWithDay(dateStr) {
  const date = new Date(dateStr);
  const day  = dayNames[date.getDay()];
  return `${dateStr}(${day})`;
}

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

async function checkSingleDate(page, date, checkTime) {
  const formattedDate = formatDateWithDay(date);
  console.log('▶ 日付チェック:', formattedDate);

  const getFrame = () =>
    page.frames().find(f => f.url().includes('campussquare')) || page.mainFrame();

  let frame = getFrame();

  await frame.waitForSelector('#displayDateStr', { timeout: 15000 });

  await frame.evaluate((val) => {
    const input = document.querySelector('#displayDateStr');
    input.value = val;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, formattedDate);

  await new Promise(r => setTimeout(r, 300));

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
      .catch(() => {}),
    frame.click('input[type="submit"][value="表示"]'),
  ]);

  await new Promise(r => setTimeout(r, 500));

  frame = getFrame();

  await frame.waitForSelector('tr', { timeout: 15000 });

  return await frame.evaluate(analyzeAvailability, checkTime);
}

async function checkAvailabilityList(requests, onResult) {

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/render/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const page = await browser.newPage();

  try {
    console.log('① ページアクセス開始');

    await page.goto(
      'https://csweb.u-aizu.ac.jp/campusweb/campussquare.do?_flowId=KHW0001310-flow',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );

    console.log('② ページ読み込み完了');
    page.frames().forEach(f => console.log('frame:', f.url()));

    const getFrame = () =>
      page.frames().find(f => f.url().includes('campussquare')) || page.mainFrame();

    await getFrame().waitForSelector('tr', { timeout: 20000 });
    console.log('④ テーブル検出OK');

    for (const { date, checkTime, originalLine } of requests) {
      console.log('⑤ 処理開始:', date, checkTime);
      const result = await checkSingleDate(page, date, checkTime);
      await onResult(originalLine, date, checkTime, result);
    }

  } catch (err) {
    console.error('❌ 致命的エラー:', err.message);
    console.error(err.stack);
    throw err; // ★ 必ず再throwして呼び出し元に伝える
  }
}

module.exports = { checkAvailabilityList };