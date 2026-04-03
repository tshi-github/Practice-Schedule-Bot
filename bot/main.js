const { Client, GatewayIntentBits, Events } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

const TOKEN = process.env.TOKEN;
const PREFIX = '!';

client.once(Events.ClientReady, (c) => {
  console.log(`logged in : ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'event') {
    // !event MM/DD HH:MM-HH:MM イベント内容
    const date = args.shift();   // "MM/DD"
    const time = args.shift();   // "HH:MM-HH:MM"
    const content = args.join(' ');

    const sent = await message.channel.send(`${date} ${time}\n${content}`);
    await sent.react('⭕');
    await sent.react('❌');
    await sent.react('🔺');

    const year = new Date().getFullYear();
    const [month, day] = date.split('/').map(Number);
    const [start, end] = time.split('-');

    const startDt = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${start}:00`);
    const endDt   = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${end}:00`);

    console.log('開始時間:', startDt.toISOString());
    console.log('終了時間:', endDt.toISOString());
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const GAS_URL = "https://script.google.com/macros/s/AKfycbw9F0hp1QhDbCBXTP97yDP1syAeRybYu6WLLro3oT4dBxtUZ1Rc-aoD0NiCH9-PoBkI7g/exec";

  if(reaction.emoji.name === '⭕'){
    console.log(`${user.tag} (${user.id})`)

    await fetch(GAS_URL,{
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userTag: user.tag,
        userId: user.id,
        emoji: reaction.emoji.name,
      }),
    });
  }
});

client.login(TOKEN);