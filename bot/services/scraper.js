// bot/services/scraper.js
require('dotenv').config();

const puppeteer = require('puppeteer');

const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateWithDay(dateStr) {
  const date = new Date(dateStr);
  const day  = dayNames[date.getDay()];
  return `${dateStr}(${day})`;
}

async function waitForInitialTable(frame, timeout = 20000) {
  await frame.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('tr'));
      return rows.some(row => {
        const cell = row.querySelector('td.kyuko-shi-shisetsunm');
        return cell && cell.textContent.trim().length > 0;
      });
    },
    { timeout }
  );
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

async function checkSingleDate(frame, date, checkTime, retries = 3) {
  const formattedDate = formatDateWithDay(date);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await frame.waitForSelector('#displayDateStr', { timeout: 15000 });

      // ★ ボタンを押す前にスナップショット
      const prevDate = await frame.evaluate(() => {
        const input = document.querySelector('#displayDateStr');
        return input ? input.value : '';
      });

      await frame.evaluate((val) => {
        const input = document.querySelector('#displayDateStr');
        input.value = val;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, formattedDate);

      await new Promise(resolve => setTimeout(resolve, 300));

      await frame.waitForSelector('input[type="submit"][value="表示"]', { timeout: 15000 });
      await frame.click('input[type="submit"][value="表示"]');

      // ★ 日付が変わる場合と同じ日付の場合で待ち方を切り替え
      if (prevDate !== formattedDate) {
        await frame.waitForFunction(
          (target) => {
            const input = document.querySelector('#displayDateStr');
            if (!input || input.value !== target) return false;
            const rows = Array.from(document.querySelectorAll('tr'));
            return rows.some(row => {
              const cell = row.querySelector('td.kyuko-shi-shisetsunm');
              return cell && cell.textContent.trim().length > 0;
            });
          },
          { timeout: 15000 },
          formattedDate
        );
      } else {
        await frame.waitForFunction(
          () => document.querySelectorAll('tr').length < 5,
          { timeout: 5000 }
        ).catch(() => {});

        await frame.waitForFunction(
          () => {
            const rows = Array.from(document.querySelectorAll('tr'));
            return rows.some(row => {
              const cell = row.querySelector('td.kyuko-shi-shisetsunm');
              return cell && cell.textContent.trim().length > 0;
            });
          },
          { timeout: 15000 }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const result = await frame.evaluate(analyzeAvailability, checkTime);

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
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return lastError ?? { error: '不明なエラー' };
}

async function checkAvailabilityList(requests, onResult) {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-extensions', '--disable-background-networking',
      '--disable-default-apps', '--no-first-run', '--no-zygote',
      '--single-process', '--memory-pressure-off',
    ],
    headless: true,
    timeout:  30000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    await page.goto(
      'https://csweb.u-aizu.ac.jp/campusweb/campussquare.do?_flowId=KHW0001310-flow',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );

    const getTargetFrame = () =>
      page.frames().find(f => f.url().includes('campussquare.do')) ??
      page.mainFrame();

    let targetFrame = getTargetFrame();
    await waitForInitialTable(targetFrame, 20000);

    for (const { date, checkTime, originalLine } of requests) {
      targetFrame = getTargetFrame();
      const result = await checkSingleDate(targetFrame, date, checkTime);
      await onResult(originalLine, date, checkTime, result);
    }

  } finally {
    await browser.close();
  }
}

module.exports = { checkAvailabilityList };