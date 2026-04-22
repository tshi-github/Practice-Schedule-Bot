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

    const icsText = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Practice Schedule Bot//JS//JA',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DTSTART:${fStart}`,
      `DTEND:${fEnd}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const fileName    = `${dateStr.slice(4, 8)}_予定.ics`;
    const fileBuffer  = Buffer.from(icsText, 'utf-8');
    const discordFile = new AttachmentBuilder(fileBuffer, { name: fileName });

    return { error: null, gUrl, discordFile, fileName, displayD, displayT };
  } catch (e) {
    return { error: `解析失敗: ${e.message}` };
  }
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`generate_ics_${member.user.id}`)
          .setLabel('📅 icsファイルを生成')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        content: `${member.user} のカレンダーチャンネルへようこそ！\nボタンを押すとicsファイルが生成されます。`,
        components: [row],
      });

      console.log(`✅ チャンネル作成: calendar-${member.user.username}`);
    }
  }
}

// ============================================================
//  ボタンが押されたときの処理
// ============================================================

function registerCalendarInteraction(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('generate_ics_')) return;

    const userId = interaction.customId.replace('generate_ics_', '');

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: '⚠️ このボタンはあなた専用ではありません。',
        ephemeral: true,
      });
      return;
    }

    // TODO: 実際の日程データを使ってics生成する場合はここを拡張
    const dummyIcsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR`;

    await interaction.reply({
      content: `✅ icsファイルを生成しました（ダミー）\n\`\`\`\n${dummyIcsContent}\n\`\`\``,
      ephemeral: true,
    });

    console.log(`ics生成: ${interaction.user.tag} (${interaction.user.id})`);
  });
}

module.exports = {
  parseAndGenerate,
  handleRegisterWebhook,
  setupCalendarChannels,
  registerCalendarInteraction,
};