// bot/commands/booking.js
// !booking コマンドの処理
// 入力された日時でF1会議室の空き状況をスクレイピングして確認し、結果をDiscordに送信する

const { checkAvailabilityList } = require('../services/scraper');

/**
 * !booking コマンドのメインハンドラ
 * 1行または複数行の「日付 開始-終了」形式を受け取り、各行を順にチェックする
 * @param {import('discord.js').Message} message - Discordのメッセージオブジェクト
 */
async function handleBookingCommand(message) {
  const PREFIX = '!';
  const command = 'booking';

  // コマンド名とプレフィックスを除いた本文を取得
  const fullText = message.content.slice(PREFIX.length + command.length).trim();

  // 入力が空のとき使い方を案内して終了
  if (!fullText) {
    await message.channel.send(
      '⚠️ 入力が空です。以下の形式で入力してください：\n' +
      '```\n!booking 2026/4/1 10:00-12:00\n```\n' +
      '複数行まとめて送ることもできます：\n' +
      '```\n!booking 2026/4/1 10:00-12:00\n2026/4/2 13:00-15:00\n```'
    );
    return;
  }

  // 入力を行ごとに分割して解析
  const lines = fullText.split('\n');
  const requests = [];      // 正しくパースできた行
  const invalidLines = [];  // パースに失敗した行

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // 空行はスキップ

    const parsed = parseBookingLine(trimmed);
    if (parsed) {
      requests.push({ ...parsed, originalLine: trimmed });
    } else {
      invalidLines.push(trimmed); // 書式エラーの行を記録
    }
  }

  // 書式エラーがあれば先にまとめて通知
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
  // 300ms ごとにドット数を増やして進捗感を演出
  const animationInterval = setInterval(() => {
    progressIndex = (progressIndex + 1) % progressBars.length;
    replyMessage.edit(`🔍 ${requests.length}件チェックします ${progressBars[progressIndex]}`);
  }, 300);

  try {
    // 各リクエストをスクレイピングでチェックし、結果をコールバックでDiscordに送信
    await checkAvailabilityList(requests, async (originalLine, date, checkTime, result) => {
      const label = `**${date} ${checkTime.start}-${checkTime.end}**`;
      let text;

      if (result.error) {
        text = `${label}\n❌ エラー: ${result.error}`;
      } else if (result.status === 'Open') {
        // 指定時間帯がすべて空いている場合
        text = `${label}\n✅ Open`;
      } else if (result.allOccupied) {
        // 指定時間帯にまったく空きがない場合
        text = `${label}\n🔴 ${result.message}`;
      } else {
        // 一部予約済みだが空き時間がある場合
        const slots = result.freeSlots.join(', ');
        text = `${label}\n🔴 予約済み\n空き時間: ${slots}`;
      }

      await message.channel.send(text);
    });
  } catch (err) {
    // 致命的エラーはDiscordにスタックトレースごと送信して握りつぶさない
    await message.channel.send(`❌ スクレイピングエラー:\n\`\`\`${err.message}\n${err.stack}\`\`\``);
  } finally {
    // 成否に関わらずアニメーションを停止し、完了メッセージに更新
    clearInterval(animationInterval);
    await replyMessage.edit(`✅ ${requests.length}件のチェックが完了しました`);
  }
}

/**
 * 1行分の booking 入力を解析して日付・時間オブジェクトを返す
 * 書式: "YYYY/M/D HH:MM-HH:MM"
 */
function parseBookingLine(line) {
  const match = line.trim().match(
    /^(\d{4}\/\d{1,2}\/\d{1,2})\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/
  );
  if (!match) return null;

  const [, date, start, end] = match;
  // 月・日を2桁にゼロパディングして統一フォーマットに変換
  const [y, m, d] = date.split('/');
  const normalizedDate = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

  return { date: normalizedDate, checkTime: { start, end } };
}

module.exports = { handleBookingCommand };