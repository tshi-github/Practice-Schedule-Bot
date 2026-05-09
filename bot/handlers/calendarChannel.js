// bot/handlers/calendarChannel.js

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
const RENDER_URL = process.env.RENDER_URL || '';

const CATEGORY_NAME = '📅個人カレンダー';

function toChannelName(username) {
  return 'calendar-' + username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function setupCalendarChannels(client) {
  for (const guild of client.guilds.cache.values()) {

    let members;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        members = await guild.members.fetch();
        break;
      } catch (err) {
        const wait = (err.data?.retry_after ?? attempt * 5) * 1000;
        console.warn(`⚠️ members.fetch() レートリミット (試行${attempt}/5)、${wait}ms 待機...`);
        await new Promise(r => setTimeout(r, wait));
        if (attempt === 5) throw err;
      }
    }

    await guild.channels.fetch();

    const category = await ensureCategory(guild);

    for (const member of members.values()) {
      if (member.user.bot) continue;
      try {
        await ensureCalendarChannel(guild, member, client.user.id, category);
      } catch (err) {
        console.error(`❌ チャンネル作成失敗 (${member.user.username}):`, err.message);
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function ensureCategory(guild) {
  const existing = guild.channels.cache.find(
    c => c.name === CATEGORY_NAME && c.type === ChannelType.GuildCategory
  );
  if (existing) {
    console.log(`スキップ: カテゴリー「${CATEGORY_NAME}」はすでに存在します`);
    return existing;
  }

  const category = await guild.channels.create({
    name: CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
    ],
  });

  console.log(`✅ カテゴリー作成: ${CATEGORY_NAME}`);
  return category;
}

async function ensureCalendarChannel(guild, member, botUserId, category) {
  const channelName = toChannelName(member.user.username);

  const existing = guild.channels.cache.find(
    c => c.name === channelName && c.type === ChannelType.GuildText
  );
  if (existing) {
    console.log(`スキップ: ${channelName} はすでに存在します`);
    return existing;
  }

  const channel = await guild.channels.create({
    name  : channelName,
    type  : ChannelType.GuildText,
    parent: category?.id ?? null,
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

  const icsUrl    = `${RENDER_URL}/calendar/${member.user.id}.ics`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📅 購読URLを取得')
      .setStyle(ButtonStyle.Link)
      .setURL(icsUrl),
  );

  await channel.send({
    content:
      `${member.user} のカレンダーチャンネルへようこそ！\n\n` +
      `__**📌 カレンダーの自動更新設定（一度だけ行ってください）**__\n\n` +

      `**📅 Google Calendar（Android・PC）**\n` +
      `1. 上のボタンで開いたページのURLをコピー\n` +
      `2. Google Calendar の「他のカレンダー」横の **+** →「URLで追加」→ 貼り付け\n` +

      `**🍎 Apple Calendar（iPhone・Mac）**\n` +
      `1. 上のボタンで開いたページのURLをコピー\n` +
      `2.「カレンダーを追加」→「カレンダーの登録...」→ 貼り付け`,
    components: [row],
  });

  console.log(`✅ チャンネル作成: ${channelName}`);
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
      await interaction.reply({
        content: '⚠️ このボタンはあなた専用ではありません。',
        ephemeral: true,
      });
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
          'Google Calendar にインポートしてください。\n' +
          '✅ リマインダー（30分前）付きです。';
      } else {
        icsText     = buildGenericICS(events);
        fileName    = `schedule_${userId}.ics`;
        description =
          '📆 **汎用 ICS ファイル（Apple / Outlook 等）**\n' +
          'ダウンロードしてインポートしてください。';
      }

      const discordFile = new AttachmentBuilder(Buffer.from(icsText, 'utf-8'), { name: fileName });

      await interaction.editReply({
        content: `${description}\n\n📋 取得した予定: **${events.length}件**`,
        files  : [discordFile],
      });

    } catch (err) {
      console.error('ICS生成エラー:', err);
      await interaction.editReply({
        content: `❌ ICS ファイルの生成に失敗しました。\n\`${err.message}\``,
      });
    }
  });
}

module.exports = { setupCalendarChannels, ensureCalendarChannel, registerCalendarInteraction };