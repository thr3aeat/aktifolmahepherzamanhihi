const { PermissionsBitField } = require('discord.js');
const logger = require('../utils/logger');

const moderationCommands = require('./moderation');
const funCommands = require('./fun');
const generalCommands = require('./general');
const systemCommands = require('./system');

// In-Memory Data Stores
const afkData = new Map(); // userId -> { reason, timestamp }
const levelData = new Map(); // guildId_userId -> { xp, level, messages }
const dailyData = new Map(); // userId -> timestamp
const warnData = new Map(); // guildId_userId -> Array<{ reason, moderatorId, timestamp }>
const disabledCommands = new Map(); // guildId_channelId -> Set<commandName>

const commands = new Map();

const PERM_NAMES_TR = {
  BanMembers: 'Üyeleri Yasakla',
  KickMembers: 'Üyeleri At',
  ManageChannels: 'Kanalları Yönet',
  ManageRoles: 'Rolleri Yönet',
  ManageMessages: 'Mesajları Yönet',
  ManageNicknames: 'Kullanıcı Adlarını Yönet',
  ManageGuildExpressions: 'Emojileri ve Çıkartmaları Yönet',
  ModerateMembers: 'Üyelere Zamanaşımı Uygula (Sustur)',
  Administrator: 'Yönetici',
  MuteMembers: 'Üyeleri Sustur',
  DeafenMembers: 'Üyeleri Sağırlaştır',
  MoveMembers: 'Üyeleri Taşı',
  ManageGuild: 'Sunucuyu Yönet'
};

function normalizeCmd(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

function registerCommand(cmd) {
  const primaryKey = cmd.name.toLowerCase();
  const normKey = normalizeCmd(cmd.name);

  commands.set(primaryKey, cmd);
  if (normKey) commands.set(normKey, cmd);

  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commands.set(alias.toLowerCase(), cmd);
      const normAlias = normalizeCmd(alias);
      if (normAlias) commands.set(normAlias, cmd);
    }
  }
}

// Tüm modülleri yükle
function loadAllCommands() {
  const allModules = [
    ...moderationCommands,
    ...funCommands,
    ...generalCommands,
    ...systemCommands
  ];

  for (const cmd of allModules) {
    registerCommand(cmd);
  }

  logger.success('KOMUTLAR', `Toplam ${commands.size} komut kaydı (takma adlar dahil) başarıyla yüklendi.`);
}

loadAllCommands();

function checkPermissions(message, userPerms = [], botPerms = []) {
  if (!message.guild) return { pass: true };

  // Kullanıcı Yetki Kontrolü
  for (const perm of userPerms) {
    if (!message.member.permissions.has(PermissionsBitField.Flags[perm])) {
      const trName = PERM_NAMES_TR[perm] || perm;
      return {
        pass: false,
        error: `❌ Bu komutu kullanmak için **${trName}** yetkisine sahip olmalısınız.`
      };
    }
  }

  // Bot Yetki Kontrolü
  const botMember = message.guild.members.me;
  if (botMember) {
    for (const perm of botPerms) {
      if (!botMember.permissions.has(PermissionsBitField.Flags[perm])) {
        const trName = PERM_NAMES_TR[perm] || perm;
        return {
          pass: false,
          error: `❌ Komutun çalışabilmesi için botun **${trName}** yetkisine ihtiyacı var.`
        };
      }
    }
  }

  return { pass: true };
}

async function handleGuildMessage(message, client) {
  if (!message.author || message.author.bot) return;

  // 1. AFK Kontrolü (Mesaj Yazan Kişi AFK ise kaldır)
  if (afkData.has(message.author.id)) {
    afkData.delete(message.author.id);
    message.reply(`👋 Hoş geldin **${message.author.username}**! AFK modundan çıkış yaptın.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  // 2. Etiketlenen Kişi AFK mı?
  if (message.mentions && message.mentions.users && message.mentions.users.size > 0) {
    message.mentions.users.forEach(u => {
      if (afkData.has(u.id)) {
        const data = afkData.get(u.id);
        message.reply(`💤 **${u.username}** şu an AFK! Sebep: *${data.reason}* (<t:${Math.floor(data.timestamp / 1000)}:R>)`);
      }
    });
  }

  // 3. Seviye / XP Kazanma Mantığı (Sadece Sunucu İçi)
  if (message.guild) {
    const levelKey = `${message.guild.id}_${message.author.id}`;
    const userLevel = levelData.get(levelKey) || { xp: 0, level: 1, messages: 0 };
    userLevel.messages++;
    userLevel.xp += Math.floor(Math.random() * 10) + 5;

    const nextLevelXp = userLevel.level * 100;
    if (userLevel.xp >= nextLevelXp) {
      userLevel.level++;
    }
    levelData.set(levelKey, userLevel);
  }

  // 4. Komut Ön Eki Kontrolü (`e!` veya `E!`)
  const content = message.content.trim();
  if (!content.toLowerCase().startsWith('e!')) return;

  const afterPrefix = content.slice(2).trim();
  if (!afterPrefix) return;

  const args = afterPrefix.split(/ +/);
  const rawCmd = args.shift();
  if (!rawCmd) return;

  const commandName = rawCmd.toLowerCase();
  const normCmdName = normalizeCmd(rawCmd);

  const command = commands.get(commandName) || commands.get(normCmdName);
  if (!command) return;

  // 5. Engellenmiş Komut Kontrolü (Sadece Sunucu İçi)
  if (message.guild) {
    const disableKey = `${message.guild.id}_${message.channel.id}`;
    if (disabledCommands.has(disableKey) && disabledCommands.get(disableKey).has(command.name)) {
      return message.reply('❌ Bu komut bu kanalda yetkililer tarafından engellenmiştir.');
    }
  }

  // 6. Özel Yetki Kontrolü
  const permCheck = checkPermissions(message, command.userPermissions, command.botPermissions);
  if (!permCheck.pass) {
    return message.reply(permCheck.error);
  }

  // 7. Komutu Çalıştır
  const context = {
    client: client || message.client,
    commands,
    afkData,
    levelData,
    dailyData,
    warnData,
    disabledCommands
  };

  try {
    await command.execute(message, args, context);
  } catch (err) {
    logger.error('KOMUT HATASI', `e!${commandName} komutunda hata:`, err);
    message.reply('❌ Komut çalıştırılırken bir hata oluştu. Hata otomatik kaydedildi.');
  }
}

module.exports = {
  handleGuildMessage,
  commands,
  afkData,
  levelData,
  dailyData,
  warnData,
  disabledCommands
};
