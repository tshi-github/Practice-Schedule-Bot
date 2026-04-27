// bot/server.js

require('dotenv').config();
process.on('unhandledRejection', (reason) => { console.error('UnhandledRejection:', reason); });
process.on('uncaughtException',  (err)    => { console.error('UncaughtException:', err); });

const express = require('express');
const app  = express();
const PORT = process.env.PORT || 4000;

const REGISTER_SECRET = process.env.REGISTER_SECRET;

app.use(express.json());

app.get('/', (req, res) => res.send('OK'));

app.post('/register', async (req, res) => {
  if (REGISTER_SECRET && req.headers['x-register-secret'] !== REGISTER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { schedules } = req.body;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ error: 'schedules が空です' });
  }

  const client = app.get('discordClient');
  if (!client?.isReady()) {
    return res.status(503).json({ error: 'Discord BOTがまだ準備できていません' });
  }

  try {
    const { handleRegisterWebhook } = require('./handlers/registerWebhook');
    await handleRegisterWebhook(client, schedules);
    res.json({ ok: true, count: schedules.length });
  } catch (err) {
    console.error('/register エラー:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/calendar/:userId.ics', async (req, res) => {
  const { userId } = req.params;
  try {
    const events  = await fetchEventsFromGAS(userId);
    const icsText = buildGoogleICS(events);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="schedule_${userId}.ics"`);
    res.send(icsText);
  } catch (err) {
    res.status(500).send('ERROR:' + err.message);
  }
});


app.listen(PORT, () => console.log(`Server running on ${PORT}`));

console.log('TOKEN:', process.env.TOKEN ? '設定済み' : '❌ undefined');
console.log('REGISTER_SECRET:', REGISTER_SECRET ? '設定済み' : '⚠️ 未設定（認証スキップ）');

module.exports.__app = app;

try {
  require('./main');
} catch (err) {
  console.error('main.js の読み込みに失敗:', err);
}