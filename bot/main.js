// bot/main.js
// Discord Bot のエントリーポイント
// クライアントの生成・コマンドハンドラの登録・ログインを行う

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
const PREFIX = '!'; // コマンドプレフィックス

// Bot が起動して準備完了したときのイベント
client.once(Events.ClientReady, async () => {
  // 全メンバーのカレンダーチャンネルをバックグラウンドで作成
  console.log(`logged in : ${client.user.tag}`);
  setupCalendarChannels(client).catch(err => {
    console.error('setupCalendarChannels失敗:', err);
  });
});

// ボタン・リアクションのイベントリスナーを登録
registerCalendarInteraction(client);
registerReactionHandler(client);

// メッセージ受信時のコマンドルーティング
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