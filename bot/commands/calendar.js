// bot/commands/calendar.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');

// ============================================================
//  設定
// ============================================================

/** GAS デプロイ URL（環境変数から取得） */
const GAS_URL = process.env.GAS_URL || '';

// ============================================================
//  共通ユーティリティ: 日付・時刻の解析とデータ生成
// ============================================================

function parseAndGenerate(dateRaw, timeRaw) {
  try {
    // --- 日付の整形 ---
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

    // --- 時刻の整形 ---
    const tParts = String(timeRaw).split(/[-〜~]/);
    if (tParts.length !== 2) return { error: '時刻形式エラー (開始-終了)' };

    const startT = tParts[0].replace(':', '').trim();
    const endT   = tParts[1].replace(':', '').trim();

    // --- バリデーション ---
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

    // --- データ生成 ---
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

/**
 * Google Calendar 向け ICS
 *  - VTIMEZONE (Asia/Tokyo) を付与
 *  - DTSTART/DTEND にタイムゾーン指定
 *  - VALARM（30分前リマインダー）を付与
 */
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

/**
 * 汎用 ICS（Apple Calendar / Outlook / Thunderbird 等）
 *  - UTC 日時を使用
 *  - RFC 5545 準拠・最大互換性
 */
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
    // YYYYMMDDTHHmmss (JST) → UTC に変換（JST = UTC+9）
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

/** YYYYMMDDTHHmmss (JST) → YYYYMMDDTHHmmssZ (UTC) */
function localICSToUTC(localStr) {
  // localStr 例: "20251001T190000"
  const y = parseInt(localStr.slice(0,  4));
  const mo= parseInt(localStr.slice(4,  6)) - 1;
  const d = parseInt(localStr.slice(6,  8));
  const h = parseInt(localStr.slice(9,  11));
  const mi= parseInt(localStr.slice(11, 13));
  const s = parseInt(localStr.slice(13, 15));
  const jst = new Date(Date.UTC(y, mo, d, h, mi, s));
  jst.setUTCHours(jst.getUTCHours() - 9); // JST → UTC
  return toUTCICSDate(jst);
}

function toUTCICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// ============================================================
//  GAS からイベント一覧を取得
// ============================================================

async function fetchEventsFromGAS(userId) {
  if (!GAS_URL) throw new Error('GAS_URL が設定されていません (.env に GAS_URL=... を追加してください)');

  const url = `${GAS_URL}?userId=${encodeURIComponent(userId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GAS レスポンスエラー: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error);

  return json.events || [];
}

// ============================================================
//  GASトリガーから受け取った日程をカレンダーチャンネルに送信
//  server.js の POST /register から呼び出す
// ============================================================

async function handleRegisterWebhook(client, schedules) {
  let message     = '✅ **吹部 予定リスト**\n';
  let files       = [];
  let count       = 0;
  let blocksSent  = 0;

  // 全ギルドの全カレンダーチャンネルに送信する内部ヘルパー
  const broadcast = async (content, attachments) => {
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.name.startsWith('calendar-')) continue;
        if (!channel.isTextBased()) continue;
        await channel.send({ content, files: attachments });
      }
    }
  };

  for (const { date, time } of schedules) {
    const result = parseAndGenerate(date, time);

    if (result.error) {
      message += `⚠️ **エラー**: \`${date} ${time}\`\n　└ ${result.error}\n`;
      continue;
    }

    const { gUrl, discordFile, fileName, displayD, displayT } = result;
    files.push(discordFile);
    message += `📅 **${displayD}** (${displayT})\n　 🔗 [Android](${gUrl}) / 🍎 iPhone: \`${fileName}\`\n`;
    count++;

    // 10件ごとに分割送信
    if (count >= 10 || message.length > 1700) {
      await broadcast(message, files);
      message    = '✅ **吹部 予定リスト（続き）**\n';
      files      = [];
      count      = 0;
      blocksSent++;
    }
  }

  if (count > 0) {
    await broadcast(message, files);
  } else if (blocksSent === 0) {
    await broadcast('有効な予定が見つかりませんでした。', []);
  }
}

// ============================================================
//  bot起動時に全メンバーのカレンダーチャンネルを自動作成
// ============================================================

async function setupCalendarChannels(client) {
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const existing = guild.channels.cache.find(
        c => c.name === `calendar-${member.user.username}`
      );
      if (existing) {
        console.log(`スキップ: calendar-${member.user.username} はすでに存在します`);
        continue;
      }

      const channel = await guild.channels.create({
        name: `calendar-${member.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: member.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
            ],
          },
        ],
      });

      // ボタンを2つ並べる
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ics_google_${member.user.id}`)
          .setLabel('📅 Google Calendar 用')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ics_generic_${member.user.id}`)
          .setLabel('📆 その他カレンダー用')
          .setStyle(ButtonStyle.Secondary),
      );

      await channel.send({
        content: `${member.user} のカレンダーチャンネルへようこそ！\nボタンを押すと ICS ファイルが生成されます。\n\n` +
                 `📅 **Google Calendar 用** → Android・PC の Google Calendar に最適\n` +
                 `📆 **その他カレンダー用** → iPhone (Apple Calendar)・Outlook 等に最適`,
        components: [row],
      });

      console.log(`✅ チャンネル作成: calendar-${member.user.username}`);
    }
  }
}

// ============================================================
//  ボタンが押されたときの処理
//  Google用 / 汎用 の2種類のICSをそれぞれ生成して返す
// ============================================================

function registerCalendarInteraction(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isGoogle  = interaction.customId.startsWith('ics_google_');
    const isGeneric = interaction.customId.startsWith('ics_generic_');
    if (!isGoogle && !isGeneric) return;

    const userId = interaction.customId.replace(/^ics_(google|generic)_/, '');

    // 本人チェック
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: '⚠️ このボタンはあなた専用ではありません。',
        ephemeral: true,
      });
      return;
    }

    // 処理中表示
    await interaction.deferReply({ ephemeral: true });

    try {
      // GAS からイベント取得
      const events = await fetchEventsFromGAS(userId);
/* 
      if (events.length === 0) {
        await interaction.editReply({
          content: '📭 現在登録されている予定がありません。',
        });
        return;
      } */

      let icsText, fileName, description;

      if (isGoogle) {
        icsText     = buildGoogleICS(events);
        fileName    = `schedule_google_${userId}.ics`;
        description =
          '📅 **Google Calendar 用 ICS ファイル**\n' +
          'ファイルを開くか、Google Calendar の「他のカレンダー > URL で追加」からインポートしてください。\n' +
          '✅ リマインダー（30分前）付きです。';
      } else {
        icsText     = buildGenericICS(events);
        fileName    = `schedule_${userId}.ics`;
        description =
          '📆 **汎用 ICS ファイル（Apple Calendar / Outlook / Thunderbird 等）**\n' +
          'ファイルをダウンロードして、カレンダーアプリにドラッグ＆ドロップするかダブルクリックでインポートしてください。';
      }

      const fileBuffer  = Buffer.from(icsText, 'utf-8');
      const discordFile = new AttachmentBuilder(fileBuffer, { name: fileName });

      await interaction.editReply({
        content: `${description}\n\n📋 取得した予定: **${events.length}件**`,
        files  : [discordFile],
      });

      console.log(`ICS生成 [${isGoogle ? 'Google' : '汎用'}]: ${interaction.user.tag} (${userId}) - ${events.length}件`);

    } catch (err) {
      console.error('ICS生成エラー:', err);
      await interaction.editReply({
        content: `❌ ICS ファイルの生成に失敗しました。\n\`${err.message}\``,
      });
    }
  });
}

module.exports = {
  parseAndGenerate,
  handleRegisterWebhook,
  setupCalendarChannels,
  registerCalendarInteraction,
  // テスト用にエクスポート
  buildGoogleICS,
  buildGenericICS,
};