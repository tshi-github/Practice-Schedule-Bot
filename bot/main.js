// discord.js の必要なクラスを読み込み
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

// Botクライアントの生成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,              // サーバー情報取得
    GatewayIntentBits.GuildMessages,       // メッセージ取得
    GatewayIntentBits.MessageContent,      // メッセージ内容取得（重要）
    GatewayIntentBits.GuildMessageReactions,// リアクション検知
    GatewayIntentBits.GuildMembers,        // メンバー情報取得
  ],
  // Partial対応（キャッシュされていないデータも扱えるようにする）
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User
  ],
});

// 環境変数からトークン取得
const TOKEN = process.env.TOKEN;

// コマンドのプレフィックス
const PREFIX = '!';

// Bot起動時の処理
client.once(Events.ClientReady, (c) => {
  console.log(`logged in : ${c.user.tag}`);
});

// メッセージ受信時の処理
client.on(Events.MessageCreate, async (message) => {
  
  // Botのメッセージは無視
  if (message.author.bot) return;

  // プレフィックスがついていない場合は無視
  if (!message.content.startsWith(PREFIX)) return;

  // コマンドと引数を分割
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // event コマンドの処理
  if (command === 'event') {

    // メッセージ全体(2行目以降も含む)を取得
    const fullText = message.content.slice(PREFIX.length + command.length).trim();
    const lines = fullText.split('\n');

    // 入力が空の場合
    if(!fullText){
      await message.channel.send(
        '⚠️ 入力が空です。以下の形式で入力してください：\n' +
        '```\n!event 10/1 19:00-21:00 イベント名\n10/2 17:00-21:00 イベント名\n```'
      );
      return;
    }

    for(const line of lines){

      // 引数から日付・時間・内容を取得
      const parts = line.trim().split(/\s+/);
      const date = parts.shift();
      const time = parts.shift();
      const content = parts.join(' ');

      // 日付フォーマットチェック（例: 10/1）
      const dateOk = date && /^\d{1,2}\/\d{1,2}$/.test(date);

      // 時間フォーマットチェック（例: 19:00-21:00）
      const timeOk = time && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(time);

      if (!dateOk || !timeOk) {
        await message.channel.send(
          `⚠️ \`${line}\` の形式が正しくありません。\n` +
          '以下の形式で入力してください：\n' +
          '```\n!event 月/日 開始時刻-終了時刻 イベント名\n例: !event 10/1 19:00-21:00 メガロバニア\n```'
        );
        continue; // エラーの行はスキップして次の行へ
      }

      // メッセージ送信
      const sent = await message.channel.send(`${date} ${time}\n${content}`);
      
      // リアクション追加（参加・不参加・未定）
      await sent.react('⭕');
      await sent.react('❌');
      await sent.react('🔺');

      // 現在の年を取得
      const year = new Date().getFullYear();

      // 日付を分解
      const [month, day] = date.split('/').map(Number);

      // 時間を分解
      const [start, end] = time.split('-');

      // 開始・終了日時をDate型に変換
      const startDt = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${start}:00`
      );

      const endDt = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${end}:00`
      );

      // デバッグ出力
      console.log('開始時間:', startDt.toISOString());
      console.log('終了時間:', endDt.toISOString());

    }

  }
});

// リアクション追加時の処理
client.on(Events.MessageReactionAdd, async (reaction, user) => {

  // リアクション検知ログ
  console.log('🔔 リアクション検知:', reaction.emoji.name, user.tag);

  try {
    // Partialデータの場合は取得し直す
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

  // 再チェック（安全対策）
  if (reaction.partial) await reaction.fetch();
  if (user.partial) await user.fetch();

  // Botのリアクションは無視
  if (user.bot) return;

  // Google Apps ScriptのURL
  //const GAS_URL = "https://script.google.com/macros/s/AKfycbwNqxG-lognlGJQUP2dI0_7R37CUH8nQw874hj0HcuJmm-q9n3lSFAWBk9uQlDLker3/exec";
  
  // デバック(tshi360)用のURL
  const GAS_URL = "https://script.google.com/macros/s/AKfycby46Ezne0akxq4ZIi9N76AxJCbLXtm2qJYUTIvEv2PlWSQ8JA6g1Q2vuTuD5Ul7dF31CQ/exec";

  // ⭕（参加）の場合
  if (reaction.emoji.name === '⭕') {

    // ユーザー情報ログ
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
      // GASへPOST送信
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userTag: user.tag,
          userId: user.id,
          eventInfo,
          eventDay,
          eventTime

        }),
      });

      // レスポンス取得
      const text = await res.text();

      // レスポンスログ
      console.log('📨 GASレスポンス:', res.status, text);

    } catch (e) {
      console.error('❌ GAS送信失敗:', e);
    }
  } 
});

// Botログイン
client.login(TOKEN);