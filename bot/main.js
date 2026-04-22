const { Events } = require('./services/discord');
const { createClient } = require('./services/discordClient');
const { handleEventCommand } = require('./commands/event');
const { handleBookingCommand } = require('./commands/booking');
const { handleHelpCommand } = require('./commands/help');
const { registerCalendarInteraction, setupCalendarChannels } = require('./commands/calendar');
const { registerReactionAdd } = require('./events/reactionAdd');

const client = createClient();
const TOKEN  = process.env.TOKEN;
const PREFIX = '!';

client.once(Events.ClientReady, async () => {
  console.log(`logged in : ${client.user.tag}`);

  // server.js の /register エンドポイントから参照できるようにセット
  const app = require('./server').__app;
  if (app) app.set('discordClient', client);

  setupCalendarChannels(client).catch(err => {
    console.error('setupCalendarChannels失敗:', err);
  });
});

registerCalendarInteraction(client);
registerReactionAdd(client, Events);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'event')   await handleEventCommand(message);
  if (command === 'booking') await handleBookingCommand(message);
  if (command === 'help')    await handleHelpCommand(message);
});

console.log('login() 開始');
client.login(TOKEN)
  .then(() => console.log('login() resolved'))
  .catch(err => console.error('login() failed:', err));
console.log('login() 呼び出し完了');