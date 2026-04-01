require("dotenv").config();
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

client.on(Events.MessageReactionAdd, (reaction, user) => {
  if (user.bot) return;

  if (reaction.emoji.name === '⭕') {
    console.log(`${user.tag} (${user.id})`);
  }
});

client.login(TOKEN);