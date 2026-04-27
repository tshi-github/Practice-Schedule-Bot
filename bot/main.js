// bot/main.js

const { Events }                     = require('discord.js');
const { createClient }               = require('./services/discordClient');
const { handleEventCommand }         = require('./commands/event');
const { handleBookingCommand }       = require('./commands/booking');
const { handleHelpCommand }          = require('./commands/help');
const { handleSetupCommand }         = require('./commands/setup');
const { setupCalendarChannels,
        registerCalendarInteraction } = require('./handlers/calendarChannel');
const { registerReactionHandler }    = require('./handlers/reactionHandler');

const client = createClient();
const TOKEN  = process.env.TOKEN;
const PREFIX = '!';

client.once(Events.ClientReady, async () => {
  console.log(`logged in : ${client.user.tag}`);

  const app = require('./server').__app;
  if (app) app.set('discordClient', client);

  setupCalendarChannels(client).catch(err => {
    console.error('setupCalendarChannels失敗:', err);
  });
});

registerCalendarInteraction(client);
registerReactionHandler(client);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'event')   await handleEventCommand(message);
  if (command === 'booking') await handleBookingCommand(message);
  if (command === 'help')    await handleHelpCommand(message);
  if (command === 'setup')   await handleSetupCommand(message);
});

console.log('login() 開始');
client.login(TOKEN)
  .then(() => console.log('login() resolved'))
  .catch(err => console.error('login() failed:', err));
console.log('login() 呼び出し完了');