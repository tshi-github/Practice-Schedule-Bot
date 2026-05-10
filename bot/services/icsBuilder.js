// bot/services/icsBuilder.js
// ICS（iCalendar）ファイルの生成と日付・時刻パース（RFC 5545 準拠）
//
// parseAndGenerate  - 日付・時刻文字列を解析 → ICS データ・表示用文字列・Google CalendarリンクURL を生成
// buildGoogleICS    - Google Calendar 用（VTIMEZONE・VALARM 付き、JST ローカル時刻）
// buildGenericICS   - 汎用（Apple Calendar / Outlook 等、UTC 変換済み）
// localICSToUTC     - JST の ICS 時刻文字列 → UTC に変換
// escapeICS         - ICS フィールドの特殊文字をエスケープ（\ ; , 改行）

const { AttachmentBuilder } = require('discord.js');

// ============================================================
//  日付・時刻の解析とデータ生成
// ============================================================

function parseAndGenerate(dateRaw, timeRaw) {
  try {
    const dParts = String(dateRaw).split(/[\/\-]/);
    let y, m, d;
    if (dParts.length === 3) {
      [y, m, d] = dParts;
    } else if (dParts.length === 2) {
      y = new Date().getFullYear();
      [m, d] = dParts;
    } else {
      return { error: '日付形式エラー (YYYY/MM/DD)' };
    }

    const dateStr = `${String(parseInt(y)).padStart(4, '0')}${String(parseInt(m)).padStart(2, '0')}${String(parseInt(d)).padStart(2, '0')}`;

    const tParts = String(timeRaw).split(/[-〜~]/);
    if (tParts.length !== 2) return { error: '時刻形式エラー (開始-終了)' };

    const startT = tParts[0].replace(':', '').trim();
    const endT   = tParts[1].replace(':', '').trim();

    if (!/^\d{8}$/.test(dateStr))           return { error: `日付の変換失敗: ${dateStr}` };
    if (!/^\d{4}$/.test(startT))            return { error: `開始時刻エラー: ${startT}` };
    if (!/^\d{4}$/.test(endT))              return { error: `終了時刻エラー: ${endT}` };

    const year  = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6));
    const day   = parseInt(dateStr.slice(6, 8));

    if (month < 1 || month > 12)            return { error: `月が不正: ${month}月` };
    const lastDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > lastDay)           return { error: `${month}月に${day}日は存在しません` };
    if (parseInt(endT) <= parseInt(startT)) return { error: `時刻が逆転: ${startT}-${endT}` };

    const title    = '合奏';
    const fStart   = `${dateStr}T${startT}00`;
    const fEnd     = `${dateStr}T${endT}00`;
    const displayD = `${month}/${day}`;
    const displayT = `${startT.slice(0, 2)}:${startT.slice(2)} 〜 ${endT.slice(0, 2)}:${endT.slice(2)}`;

    const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${fStart}/${fEnd}` });
    const gUrl   = `https://www.google.com/calendar/render?${params.toString()}`;

    const icsText = buildGenericICS([{ title, startDate: fStart, endDate: fEnd, description: '', location: '' }]);

    const fileName    = `${dateStr.slice(4, 8)}_予定.ics`;
    const fileBuffer  = Buffer.from(icsText, 'utf-8');
    const discordFile = new AttachmentBuilder(fileBuffer, { name: fileName });

    return { error: null, gUrl, discordFile, fileName, displayD, displayT };
  } catch (e) {
    return { error: `解析失敗: ${e.message}` };
  }
}

// ============================================================
//  ICS ファイル生成
// ============================================================

function buildGoogleICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Practice Schedule Bot//JS//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:吹部 練習カレンダー',
    'X-WR-TIMEZONE:Asia/Tokyo',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  events.forEach((ev, idx) => {
    const uid = `${idx}-${Date.now()}@practice-schedule-bot`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toUTCICSDate(new Date())}`,
      `DTSTART;TZID=Asia/Tokyo:${ev.startDate}`,
      `DTEND;TZID=Asia/Tokyo:${ev.endDate || ev.startDate}`,
      `SUMMARY:${escapeICS(ev.title)}`,
      `DESCRIPTION:${escapeICS(ev.description)}`,
      `LOCATION:${escapeICS(ev.location)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(ev.title)}`,
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function buildGenericICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Practice Schedule Bot//JS//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach((ev, idx) => {
    const uid   = `${idx}-${Date.now()}@practice-schedule-bot`;
    const start = localICSToUTC(ev.startDate);
    const end   = localICSToUTC(ev.endDate || ev.startDate);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toUTCICSDate(new Date())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeICS(ev.title)}`,
      `DESCRIPTION:${escapeICS(ev.description)}`,
      `LOCATION:${escapeICS(ev.location)}`,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function localICSToUTC(localStr) {
  const y  = parseInt(localStr.slice(0,  4));
  const mo = parseInt(localStr.slice(4,  6)) - 1;
  const d  = parseInt(localStr.slice(6,  8));
  const h  = parseInt(localStr.slice(9,  11));
  const mi = parseInt(localStr.slice(11, 13));
  const s  = parseInt(localStr.slice(13, 15));
  const jst = new Date(Date.UTC(y, mo, d, h, mi, s));
  jst.setUTCHours(jst.getUTCHours() - 9);
  return toUTCICSDate(jst);
}

function toUTCICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

module.exports = { parseAndGenerate, buildGoogleICS, buildGenericICS };