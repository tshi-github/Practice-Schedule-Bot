// bot/handlers/reactionHandler.js
// リアクション追加イベントの処理（旧 events/reactionAdd.js）

const { Events } = require('discord.js');
const { postAttendanceToGAS } = require('../services/gasClient');

async function handleReactionAdd(reaction, user) {
  console.log('🔔 リアクション検知:', reaction.emoji.name, user.tag);

  try {
    if (reaction.partial) {
      console.log('⚠️ reaction is partial, fetching...');
      await reaction.fetch();
    }
    if (user.partial) {
      console.log('⚠️ user is partial, fetching...');
      await user.fetch();
    }
  } catch (e) {
    console.error('❌ fetch失敗:', e);
    return;
  }

  if (user.bot) return;
  if (!reaction.message.author?.bot) return;
  if (reaction.emoji.name !== '⭕') return;

  console.log(`${user.tag} (${user.id})`);

  const lines     = reaction.message.content.split('\n');
  const firstLine = lines[0];
  const eventInfo = lines.slice(1).join('\n');

  const [datePart, timePart] = firstLine.split(' ');
  const year = new Date().getFullYear();
  const [month, day] = datePart.split('/').map(Number);

  try {
    const result = await postAttendanceToGAS({
      userTag  : user.tag,
      userId   : user.id,
      eventInfo,
      eventDay : `${year}/${month}/${day}`,
      eventTime: timePart,
    });
    console.log('📨 GASレスポンス:', result);
  } catch (e) {
    console.error('❌ GAS送信失敗:', e);
  }
}

function registerReactionHandler(client) {
  client.on(Events.MessageReactionAdd, handleReactionAdd);
}

module.exports = { registerReactionHandler };