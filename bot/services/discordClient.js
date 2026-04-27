// bot/services/discordClient.js
// Discord クライアントの生成（services/discord.js への依存を削除）

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config');

function createClient() {
  return new Client({
    intents : config.intents.map(i => GatewayIntentBits[i]),
    partials: config.partials.map(p => Partials[p]),
  });
}

module.exports = { createClient };