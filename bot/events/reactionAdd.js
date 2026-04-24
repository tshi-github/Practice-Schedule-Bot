const GAS_URL = process.env.GAS_URL || '';

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

  if (reaction.emoji.name === '⭕') {
    console.log(`${user.tag} (${user.id})`);

    const messageContent = reaction.message.content;
    const lines = messageContent.split('\n');
    const firstLine = lines[0];
    const eventInfo = lines.slice(1).join('\n');

    const [datePart, timePart] = firstLine.split(' ');
    const year = new Date().getFullYear();
    const [month, day] = datePart.split('/').map(Number);
    const eventDay = `${year}/${month}/${day}`;
    const eventTime = timePart;

    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userTag: user.tag,
          userId: user.id,
          eventInfo,
          eventDay,
          eventTime,
        }),
      });
      const text = await res.text();
      console.log('📨 GASレスポンス:', res.status, text);
    } catch (e) {
      console.error('❌ GAS送信失敗:', e);
    }
  }
}

function registerReactionAdd(client, Events) {
  client.on(Events.MessageReactionAdd, handleReactionAdd);
}

module.exports = { registerReactionAdd };