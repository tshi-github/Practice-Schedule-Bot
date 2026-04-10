const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

// bot起動時に全メンバーのチャンネルを自動作成
async function setupCalendarChannels(client) {
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const existing = guild.channels.cache.find(
        c => c.name === `calendar-${member.user.username}`
      );
      if (existing) {
        console.log(`スキップ: calendar-${member.user.username} はすでに存在します`);
        continue;
      }
      const channel = await guild.channels.create({
        name: `calendar-${member.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: member.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
          {
            id: client.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
        ],
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`generate_ics_${member.user.id}`)
          .setLabel('📅 icsファイルを生成')
          .setStyle(ButtonStyle.Primary)
      );
      await channel.send({
        content: `${member.user} のカレンダーチャンネルへようこそ！\nボタンを押すとicsファイルが生成されます。`,
        components: [row],
      });
      console.log(`✅ チャンネル作成: calendar-${member.user.username}`);
    }
  }
}

// ボタンが押されたときの処理
function registerCalendarInteraction(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('generate_ics_')) return;
    const userId = interaction.customId.replace('generate_ics_', '');
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: '⚠️ このボタンはあなた専用ではありません。', ephemeral: true });
      return;
    }
    const dummyIcsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR`;
    await interaction.reply({
      content: `✅ icsファイルを生成しました（ダミー）\n\`\`\`\n${dummyIcsContent}\n\`\`\``,
      ephemeral: true,
    });
    console.log(`ics生成: ${interaction.user.tag} (${interaction.user.id})`);
  });
}

async function handleCalendarCommand(message) {
  await message.reply('カレンダーチャンネルを確認してください。');
}

// ✅ module.exports はファイル末尾に1つだけ
module.exports = { setupCalendarChannels, registerCalendarInteraction, handleCalendarCommand };