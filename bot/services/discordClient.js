const { Client, GatewayIntentBits, Partials } = require('./discord');
const config = require('../config');

function createClient() {
  return new Client({
    intents: config.intents.map(i => GatewayIntentBits[i]),
    partials: config.partials.map(p => Partials[p])
  });
}

module.exports = { createClient };