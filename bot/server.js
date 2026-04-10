require("dotenv").config();
process.on('unhandledRejection', (reason, promise) => {
  console.error('UnhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});
const express = require('express');
const app = express();

const PORT = process.env.PORT || 4000;

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

// Bot起動
console.log('TOKEN:', process.env.TOKEN ? '設定済み' : '❌ undefined');
try {
  require("./main");
} catch (err) {
  console.error('main.js の読み込みに失敗:', err);
}