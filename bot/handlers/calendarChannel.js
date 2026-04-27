// bot/handlers/calendarChannel.js
// カレンダーチャンネルの作成・ボタン操作の処理

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');

const { fetchEventsFromGAS } = require('../services/gasClient');
const { buildGoogleICS, buildGenericICS } = require('../services/icsBuilder');

async function setupCalendarChannels(client) {
  for (const guild of client.guilds.cache.values()) {

    let members;
    for(let attempt = 1; attempt <= 5; attempt++) {
        try{
            members = await guild.members.fetch();
            break;
        } catch (err) {
            const wait = (err.data?.retry_after ?? attempt * 5) * 1000;
            console.warn(`⚠️ members.fetch() レートリミット (試行${attempt}/5)、${wait}ms 待機...`);
            await new Promise(r => setTimeout(r, wait));
            if(attempt === 5) throw err;
        }
    }

    for (const member of members.values()) {
        if (member.user.bot) continue;
        try {
            await ensureCalendarChannel(guild, member, client.user.id);
        } catch (err) {
            console.error(`❌ チャンネル作成失敗 (${member.user.username}):`, err.message);
        }
        
        await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function ensureCalendarChannel(guild, member, botUserId) {
  const existing = guild.channels.cache.find(
    c => c.name === `calendar-${member.user.username}`
  );
  if (existing) {
    console.log(`スキップ: calendar-${member.user.username} はすでに存在します`);
    return existing;
  }

  const channel = await guild.channels.create({
    name: `calendar-${member.user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: member.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
        deny: [PermissionsBitField.Flags.SendMessages],
      },
      {
        id: botUserId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
    ],
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ics_google_${member.user.id}`)
      .setLabel('📅 Google Calendar 用')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ics_generic_${member.user.id}`)
      .setLabel('📆 その他カレンダー用')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content:
      `${member.user} のカレンダーチャンネルへようこそ！\n` +
      `ボタンを押すと ICS ファイルが生成されます。\n\n` +
      `📅 **Google Calendar 用** → Android・PC の Google Calendar に最適\n` +
      `📆 **その他カレンダー用** → iPhone (Apple Calendar)・Outlook 等に最適`,
    components: [row],
  });

  console.log(`✅ チャンネル作成: calendar-${member.user.username}`);
  return channel;
}

function registerCalendarInteraction(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isGoogle  = interaction.customId.startsWith('ics_google_');
    const isGeneric = interaction.customId.startsWith('ics_generic_');
    if (!isGoogle && !isGeneric) return;

    const userId = interaction.customId.replace(/^ics_(google|generic)_/, '');

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: '⚠️ このボタンはあなた専用ではありません。', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const events = await fetchEventsFromGAS(userId);

      let icsText, fileName, description;

      if (isGoogle) {
        icsText     = buildGoogleICS(events);
        fileName    = `schedule_google_${userId}.ics`;
        description =
          '📅 **Google Calendar 用 ICS ファイル**\n' +
          'ファイルを開くか、Google Calendar の「他のカレンダー > URL で追加」からインポートしてください。\n' +
          '✅ リマインダー（30分前）付きです。';
      } else {
        icsText     = buildGenericICS(events);
        fileName    = `schedule_${userId}.ics`;
        description =
          '📆 **汎用 ICS ファイル（Apple Calendar / Outlook / Thunderbird 等）**\n' +
          'ファイルをダウンロードして、カレンダーアプリにドラッグ＆ドロップするかダブルクリックでインポートしてください。';
      }

      const discordFile = new AttachmentBuilder(Buffer.from(icsText, 'utf-8'), { name: fileName });

      await interaction.editReply({
        content: `${description}\n\n📋 取得した予定: **${events.length}件**`,
        files  : [discordFile],
      });

      console.log(`ICS生成 [${isGoogle ? 'Google' : '汎用'}]: ${interaction.user.tag} (${userId}) - ${events.length}件`);

    } catch (err) {
      console.error('ICS生成エラー:', err);
      await interaction.editReply({ content: `❌ ICS ファイルの生成に失敗しました。\n\`${err.message}\`` });
    }
  });
}

module.exports = { setupCalendarChannels, ensureCalendarChannel, registerCalendarInteraction };