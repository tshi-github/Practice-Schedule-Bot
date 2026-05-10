// bot/handlers/reactionHandler.js
// リアクション追加イベントの処理
// !event コマンドで投稿されたメッセージへの ⭕ / ❌ リアクションを監視し、
// 出欠情報を GAS（Google Apps Script）のスプレッドシートに登録・削除する

const { Events } = require('discord.js');
const { postAttendanceToGAS, deleteAttendanceFromGAS } = require('../services/gasClient');

async function handleReactionAdd(reaction, user) {
  console.log('🔔 リアクション検知:', reaction.emoji.name, user.tag);

  // Partial（キャッシュ外）のオブジェクトは fetch で完全なデータを取得
  try {
    if (reaction.partial) await reaction.fetch();
    if (user.partial)     await user.fetch();
  } catch (e) {
    console.error('❌ fetch失敗:', e);
    return;
  }

  if (user.bot) return;                       // Bot自身のリアクションは無視
  if (!reaction.message.author?.bot) return;  // Bot投稿以外のメッセージは無視
  // ⭕ と ❌ 以外のリアクション（🔺 など）は無視
  if (reaction.emoji.name !== '⭕' && reaction.emoji.name !== '❌') return;

  // メッセージの1行目から日付・時間を、2行目以降からイベント名を取得
  const lines     = reaction.message.content.split('\n');
  const firstLine = lines[0];
  const eventInfo = lines.slice(1).join('\n');

  const [datePart, timePart] = firstLine.split(' ');
  const year                 = new Date().getFullYear();
  const [month, day]         = datePart.split('/').map(Number);
  const eventDay             = `${year}/${month}/${day}`;

  // ⭕ リアクション: 出席を GAS に登録
  // ❌ リアクション: GAS から出席を削除
  if (reaction.emoji.name === '⭕') {
    try {
      const result = await postAttendanceToGAS({
        userTag  : user.tag,
        userId   : user.id,
        eventInfo,
        eventDay,
        eventTime: timePart,
      });
      console.log('📨 GASレスポンス (登録):', result);
    } catch (e) {
      console.error('❌ GAS送信失敗:', e);
    }
    return;
  }

  if (reaction.emoji.name === '❌') {
    try {
      const result = await deleteAttendanceFromGAS({
        userId   : user.id,
        eventDay,
        eventTime: timePart,
      });
      console.log('📨 GASレスポンス (削除):', result);
    } catch (e) {
      console.error('❌ GAS削除失敗:', e);
    }
    return;
  }
}

function registerReactionHandler(client) {
  client.on(Events.MessageReactionAdd, handleReactionAdd);
}

module.exports = { registerReactionHandler };