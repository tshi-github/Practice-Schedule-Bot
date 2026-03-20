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

// Webサーバーを作成（スリープ防止用）
const app = express();
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});
