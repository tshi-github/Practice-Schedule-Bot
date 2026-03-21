import { Client, GatewayIntentBits } from "discord.js";
import express from "express";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Discord Botログイン
console.log("TOKEN:", process.env.DISCORD_TOKEN ? "OK" : "NG");

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});
