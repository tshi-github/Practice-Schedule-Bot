const { Events } = require('./services/discord');
const { createClient } = require('./services/discordClient');
const { handleEventCommand } = require('./commands/event');
const { handleCalendarCommand, registerCalendarInteraction } = require('./commands/calendar');
const { registerReactionAdd } = require('./events/reactionAdd');

const client = createClient();
const TOKEN = process.env.TOKEN;
const PREFIX = '!';

client.once(Events.ClientReady, () => {
  console.log(`logged in : ${client.user.tag}`);
});

// イベント登録
registerCalendarInteraction(client);
registerReactionAdd(client, Events);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'event') await handleEventCommand(message);
  if (command === 'calendar') await handleCalendarCommand(message);
});

client.login(TOKEN);