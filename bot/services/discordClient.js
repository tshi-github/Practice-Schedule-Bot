// bot/services/discordClient.js
// Discord クライアントのファクトリ関数
// config.js で定義したインテント・パーシャル設定を使って Client インスタンスを生成する

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config');

function createClient() {
  return new Client({
    intents : config.intents.map(i => GatewayIntentBits[i]),  // 文字列 → IntentBits
    partials: config.partials.map(p => Partials[p]),          // 文字列 → Partials
  });
}

module.exports = { createClient };