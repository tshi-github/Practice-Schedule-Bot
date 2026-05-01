// bot/handlers/reactionHandler.js

const { Events } = require('discord.js');
const { postAttendanceToGAS, deleteAttendanceFromGAS } = require('../services/gasClient');

async function handleReactionAdd(reaction, user) {
  console.log('🔔 リアクション検知:', reaction.emoji.name, user.tag);

  try {
    if (reaction.partial) await reaction.fetch();
    if (user.partial)     await user.fetch();
  } catch (e) {
    console.error('❌ fetch失敗:', e);
    return;
  }

  if (user.bot) return;
  if (!reaction.message.author?.bot) return;
  if (reaction.emoji.name !== '⭕' && reaction.emoji.name !== '❌') return;

  const lines     = reaction.message.content.split('\n');
  const firstLine = lines[0];
  const eventInfo = lines.slice(1).join('\n');

  const [datePart, timePart] = firstLine.split(' ');
  const year                 = new Date().getFullYear();
  const [month, day]         = datePart.split('/').map(Number);
  const eventDay             = `${year}/${month}/${day}`;

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