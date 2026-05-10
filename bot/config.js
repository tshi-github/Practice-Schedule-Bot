// bot/config.js
// Discordクライアントの共通設定
// intents: Botが受信するイベントの種類を指定する（必要最小限に絞ることで負荷を下げる）
// partials: キャッシュされていないオブジェクト（リアクション等）も取得できるようにする設定

module.exports = {
  // 必要なゲートウェイインテント
  // Guilds          : サーバー情報の取得
  // GuildMessages   : メッセージの受信
  // MessageContent  : メッセージ本文の読み取り（特権インテント）
  // GuildMessageReactions: リアクションイベントの受信
  // GuildMembers    : メンバー一覧の取得（特権インテント）
  intents: ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMessageReactions', 'GuildMembers'],

  // Partial オブジェクト（キャッシュ外のデータを扱うために必要）
  partials: ['Message', 'Channel', 'Reaction', 'User'],
};