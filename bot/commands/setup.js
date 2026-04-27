// bot/commands/setup.js
// !setup コマンド: カレンダーチャンネルを手動で作成する（管理者専用）

const { setupCalendarChannels } = require('../handlers/calendarChannel');

async function handleSetupCommand(message) {
  if (!message.member.permissions.has('Administrator')) {
    await message.reply('⚠️ このコマンドは管理者のみ使用できます。');
    return;
  }

  await message.reply('⏳ カレンダーチャンネルを作成中...');

  try {
    await setupCalendarChannels(message.client);
    await message.reply('✅ カレンダーチャンネルの作成が完了しました。');
  } catch (err) {
    console.error('setupCalendarChannels失敗:', err);
    await message.reply(`❌ エラーが発生しました: ${err.message}`);
  }
}

module.exports = { handleSetupCommand };