// bot/commands/event.js
// !event コマンドの処理
// 「月/日 開始-終了 イベント名」形式の入力を受け取り、
// Discordにメッセージを投稿して ⭕❌🔺 のリアクション投票を付ける

async function handleEventCommand(message) {
  const PREFIX = '!';
  const command = 'event';

  // コマンド名とプレフィックスを除いた本文を取得
  const fullText = message.content.slice(PREFIX.length + command.length).trim();
  const lines = fullText.split('\n');

  if (!fullText) {
    await message.channel.send(
      '⚠️ 入力が空です。以下の形式で入力してください：\n' +
      '```\n!event 10/1 19:00-21:00 イベント名\n10/2 17:00-21:00 イベント名\n```'
    );
    return;
  }

  for (const line of lines) {
    // スペース区切りで分割し、先頭から日付・時間・イベント名を取り出す
    const parts = line.trim().split(/\s+/);
    const date    = parts.shift();
    const time    = parts.shift();
    const content = parts.join(' ');

    const dateOk = date && /^\d{1,2}\/\d{1,2}$/.test(date);
    const timeOk = time && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(time);

    if (!dateOk || !timeOk) {
      await message.channel.send(
        `⚠️ \`${line}\` の形式が正しくありません。\n` +
        '以下の形式で入力してください：\n' +
        '```\n!event 月/日 開始時刻-終了時刻 イベント名\n例: !event 10/1 19:00-21:00 メガロバニア\n```'
      );
      continue;
    }

    // イベントを投稿し、3種類のリアクションを付ける（⭕=参加 / ❌=不参加 / 🔺=未定）
    const sent = await message.channel.send(`${date} ${time}\n${content}`);
    await sent.react('⭕');
    await sent.react('❌');
    await sent.react('🔺');

    // 開始・終了の Date オブジェクトを生成（ログ用途）
    const year        = new Date().getFullYear();
    const [month, day] = date.split('/').map(Number);
    const [start, end] = time.split('-');

    const startDt = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${start}:00`);
    const endDt   = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${end}:00`);

    console.log('開始時間:', startDt.toISOString());
    console.log('終了時間:', endDt.toISOString());
  }
}

module.exports = { handleEventCommand };