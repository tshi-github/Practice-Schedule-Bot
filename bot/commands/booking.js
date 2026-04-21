// bot/commands/booking.js
const { checkAvailabilityList } = require('../services/scraper');

async function handleBookingCommand(message) {
  const PREFIX = '!';
  const command = 'booking';
  const fullText = message.content.slice(PREFIX.length + command.length).trim();

  if (!fullText) {
    await message.channel.send(
      '⚠️ 入力が空です。以下の形式で入力してください：\n' +
      '```\n!booking 2026/4/1 10:00-12:00\n```\n' +
      '複数行まとめて送ることもできます：\n' +
      '```\n!booking 2026/4/1 10:00-12:00\n2026/4/2 13:00-15:00\n```'
    );
    return;
  }

  const lines = fullText.split('\n');
  const requests = [];
  const invalidLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseBookingLine(trimmed);
    if (parsed) {
      requests.push({ ...parsed, originalLine: trimmed });
    } else {
      invalidLines.push(trimmed);
    }
  }

  if (invalidLines.length > 0) {
    await message.channel.send(
      `⚠️ 以下の行は書式が正しくありません（スキップします）：\n` +
      invalidLines.map(l => `\`${l}\``).join('\n') +
      '\n正しい書式: `2026/4/1 10:00-12:00`'
    );
  }

  if (requests.length === 0) return;

  const replyMessage = await message.reply(`🔍 ${requests.length}件チェックします`);

  const progressBars = ['・', '・・', '・・・', '・・・・', '・・・・・'];
  let progressIndex = 0;
  const animationInterval = setInterval(() => {
    progressIndex = (progressIndex + 1) % progressBars.length;
    replyMessage.edit(`🔍 ${requests.length}件チェックします ${progressBars[progressIndex]}`);
  }, 300);

  // booking.js の try ブロック内
  try {
    await checkAvailabilityList(requests, async (originalLine, date, checkTime, result) => {
      const label = `**${date} ${checkTime.start}-${checkTime.end}**`;
      let text;
      if (result.error) {
        text = `${label}\n❌ エラー: ${result.error}`;
      } else if (result.status === 'Open') {
        text = `${label}\n✅ Open`;
      } else if (result.allOccupied) {
        text = `${label}\n🔴 ${result.message}`;
      } else {
        const slots = result.freeSlots.join(', ');
        text = `${label}\n🔴 予約済み\n空き時間: ${slots}`;
      }
      await message.channel.send(text);
    });
  } catch (err) {
    // ★ エラーをDiscordに送信して握りつぶさない
    await message.channel.send(`❌ スクレイピングエラー:\n\`\`\`${err.message}\n${err.stack}\`\`\``);
  } finally {
    clearInterval(animationInterval);
    await replyMessage.edit(`✅ ${requests.length}件のチェックが完了しました`);
  }
}

function parseBookingLine(line) {
  const match = line.trim().match(
    /^(\d{4}\/\d{1,2}\/\d{1,2})\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/
  );
  if (!match) return null;

  const [, date, start, end] = match;
  const [y, m, d] = date.split('/');
  const normalizedDate = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

  return { date: normalizedDate, checkTime: { start, end } };
}

module.exports = { handleBookingCommand };