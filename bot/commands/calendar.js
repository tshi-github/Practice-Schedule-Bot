const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} = require('discord.js');

// !calendar コマンドの処理
async function handleCalendarCommand(message) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('generate_ics')
      .setLabel('📅 icsファイルを生成')
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({
    content: 'ボタンを押すとカレンダーのicsファイルが生成されます',
    components: [row],
  });
}

// ボタンが押されたときの処理
function registerCalendarInteraction(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'generate_ics') {
      const dummyIcsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR`;

      await interaction.reply({
        content: `✅ icsファイルを生成しました（ダミー）\n\`\`\`\n${dummyIcsContent}\n\`\`\``,
        ephemeral: true,
      });

      console.log(`ics生成: ${interaction.user.tag} (${interaction.user.id})`);
    }
  });
}

module.exports = { handleCalendarCommand, registerCalendarInteraction };