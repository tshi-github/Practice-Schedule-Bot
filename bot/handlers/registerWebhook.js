// bot/handlers/registerWebhook.js
// GAS の時間トリガー（runRegister）から POST /register エンドポイントへ呼ばれる処理
// 新しい練習スケジュールを受け取り、各メンバーの個人カレンダーチャンネルに
// ICS ファイルと通知メッセージを自動配信する

const { AttachmentBuilder } = require('discord.js');
const { parseAndGenerate, buildGoogleICS, buildGenericICS } = require('../services/icsBuilder');

async function handleRegisterWebhook(client, schedules) {
  // 受け取ったスケジュールを ICS イベント形式に変換（パースエラーの行はスキップ）
  const events = [];
  for (const { date, time } of schedules) {
    const result = parseAndGenerate(date, time);
    if (result.error) {
      console.warn(`⚠️ スキップ: ${date} ${time} → ${result.error}`);
      continue;
    }
    // 日付を YYYYMMDD、時間を HHMM に正規化して events に追加
    const dParts  = String(date).split(/[\/\-]/);
    const [y, m, d] = dParts.length === 3 ? dParts : [new Date().getFullYear(), ...dParts];
    const dateStr = `${String(parseInt(y)).padStart(4,'0')}${String(parseInt(m)).padStart(2,'0')}${String(parseInt(d)).padStart(2,'0')}`;
    const tParts  = String(time).split(/[-〜~]/);
    const startT  = tParts[0].replace(':', '').trim();
    const endT    = tParts[1].replace(':', '').trim();
    events.push({
      title      : '合奏',
      startDate  : `${dateStr}T${startT}00`,
      endDate    : `${dateStr}T${endT}00`,
      description: '',
      location   : '',
      displayD   : result.displayD,
      displayT   : result.displayT,
      gUrl       : result.gUrl,
    });
  }

  if (events.length === 0) {
    console.log('有効な予定がありませんでした。');
    return;
  }

  // Google Calendar 用・汎用の2種類の ICS を生成
  const googleIcs  = buildGoogleICS(events);
  const genericIcs = buildGenericICS(events);

  // 全メンバーの "calendar-{username}" チャンネルに ICS + 通知を配信
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const personalChannel = guild.channels.cache.find(
        c => c.name === `calendar-${member.user.username}` && c.isTextBased()
      );
      if (!personalChannel) continue;

      const googleFile  = new AttachmentBuilder(Buffer.from(googleIcs,  'utf-8'), { name: `schedule_google_${member.user.id}.ics` });
      const genericFile = new AttachmentBuilder(Buffer.from(genericIcs, 'utf-8'), { name: `schedule_${member.user.id}.ics` });

      const list = events
        .map(ev => `📅 **${ev.displayD}** (${ev.displayT})\n　 🔗 [Android](${ev.gUrl}) / 🍎 iPhone: ファイルを使用`)
        .join('\n');

      await personalChannel.send({
        content:
          `📣 **新しい予定が追加されました（${events.length}件）**\n\n` +
          `${list}\n\n` +
          `📅 Google Calendar 用・📆 汎用 の ICS ファイルを自動生成しました。`,
        files: [googleFile, genericFile],
      });

      console.log(`✅ ICS自動配信: calendar-${member.user.username} (${events.length}件)`);
    }
  }
}

module.exports = { handleRegisterWebhook };