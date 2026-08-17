const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

// -------------------------------------------------------------
// VERİ DEPOLAMA (In-Memory Stores)
// -------------------------------------------------------------
const afkData = new Map(); // userId -> { reason, timestamp }
const levelData = new Map(); // guildId_userId -> { xp, level, messages }
const dailyData = new Map(); // userId -> timestamp
const warnData = new Map(); // guildId_userId -> Array<{ reason, moderatorId, timestamp }>
const disabledCommands = new Map(); // guildId_channelId -> Set<commandName>

// Atatürk Fotoğraf Galerisi
const ataturkPhotos = [
  'https://upload.wikimedia.org/wikipedia/commons/a/a8/Ataturk1930s.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/1/18/Mustafa_Kemal_Atat%C3%BCrk_in_1923.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Ataturk_in_1918.jpg/800px-Ataturk_in_1918.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/a0/Mustafa_Kemal_Atat%C3%BCrk_1925.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/2/23/Mustafa_Kemal_Ataturk_1927.jpg'
];

// Yetki İsimleri Türkçe Dönüştürücü
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

// -------------------------------------------------------------
// YARDIMCI FONKSİYONLAR
// -------------------------------------------------------------
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

function parseDuration(durationStr) {
  if (!durationStr) return null;
  const match = durationStr.match(/^(\d+)([smdh])$/i);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 3600 * 1000;
    case 'd': return num * 86400 * 1000;
    default: return null;
  }
}

// -------------------------------------------------------------
// KOMUT TANIMLARI & TÜRKÇE KARAKTER NORMALİZASYONU
// -------------------------------------------------------------
const commands = new Map();

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

// --- MODERASYON KOMUTLARI ---

registerCommand({
  name: 'ban',
  category: 'Moderasyon',
  description: 'Etiketlediğiniz kişiyi sunucudan yasaklar.',
  userPermissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  async execute(message, args) {
    const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply('⚠️ Lütfen yasaklanacak kullanıcıyı etiketleyin veya ID yazın.');
    if (!target.bannable) return message.reply('❌ Bu kullanıcıyı yasaklamak için yetkim yetersiz (Rolü benden üstte veya eşdeğer olabilir).');

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    await target.ban({ reason: `${message.author.tag} tarafından: ${reason}` });

    const embed = new EmbedBuilder()
      .setTitle('🔨 Kullanıcı Yasaklandı')
      .setDescription(`**Yasaklanan:** ${target.user.tag} (\`${target.id}\`)\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xef4444)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'forceban',
  category: 'Moderasyon',
  description: "ID'sini belirttiğiniz kullanıcıyı sunucudan yasaklar.",
  userPermissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  async execute(message, args) {
    const userId = args[0];
    if (!userId || !/^\d{17,20}$/.test(userId)) return message.reply('⚠️ Lütfen geçerli bir kullanıcı ID\'si girin.');

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    await message.guild.members.ban(userId, { reason: `${message.author.tag} (ForceBan) tarafından: ${reason}` });

    const embed = new EmbedBuilder()
      .setTitle('⚡ ForceBan Uygulandı')
      .setDescription(`**Yasaklanan ID:** \`${userId}\`\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xdc2626)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'unban',
  category: 'Moderasyon',
  description: 'Belirtilen kişinin banını kaldırır.',
  userPermissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  async execute(message, args) {
    const userId = args[0];
    if (!userId) return message.reply('⚠️ Lütfen banı kaldırılacak kişinin ID\'sini yazın.');

    try {
      await message.guild.members.unban(userId);
      return message.reply(`✅ \`${userId}\` ID'li kullanıcının yasağı kaldırıldı.`);
    } catch (e) {
      return message.reply('❌ Kullanıcının banı kaldırılamadı veya kullanıcı zaten yasaklı değil.');
    }
  }
});

registerCommand({
  name: 'kick',
  category: 'Moderasyon',
  description: 'Etiketlediğiniz kişiyi sunucudan atar.',
  userPermissions: ['KickMembers'],
  botPermissions: ['KickMembers'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Lütfen sunucudan atılacak kullanıcıyı etiketleyin.');
    if (!target.kickable) return message.reply('❌ Bu kullanıcıyı atmak için yetkim yetersiz.');

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    await target.kick(`${message.author.tag} tarafından: ${reason}`);

    const embed = new EmbedBuilder()
      .setTitle('👢 Kullanıcı Atıldı')
      .setDescription(`**Atılan:** ${target.user.tag}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xf59e0b)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'sustur',
  aliases: ['mute', 'timeout'],
  category: 'Moderasyon',
  description: 'Etiketlediğiniz kişiyi sunucudan susturur (örneğin: `e!sustur @üye 10m sebep`).',
  userPermissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Kullanım: `e!sustur @üye <süre: 10m/1h/1d> [sebep]`');
    if (!target.moderatable) return message.reply('❌ Bu kullanıcıyı susturmak için yetkim yetersiz.');

    const durationStr = args[1];
    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.reply('⚠️ Geçersiz süre! Örnek formatlar: `10m`, `2h`, `1d`.');

    const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
    await target.timeout(durationMs, `${message.author.tag} tarafından: ${reason}`);

    const embed = new EmbedBuilder()
      .setTitle('🔇 Kullanıcı Susturuldu')
      .setDescription(`**Susturulan:** ${target.user.tag}\n**Süre:** ${durationStr}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xef4444)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'unmute',
  category: 'Moderasyon',
  description: 'Etiketlenilen kişinin susturulmasını kaldırır.',
  userPermissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Lütfen susturulması kaldırılacak kişiyi etiketleyin.');
    if (!target.isCommunicationDisabled()) return message.reply('ℹ️ Bu kullanıcı zaten susturulmamış.');

    await target.timeout(null, `${message.author.tag} tarafından susturma kaldırıldı.`);
    return message.reply(`🔊 ${target.user.tag} kullanıcısının susturması kaldırıldı.`);
  }
});

registerCommand({
  name: 'uyarı',
  aliases: ['warn'],
  category: 'Moderasyon',
  description: 'Etiketlenilen kullanıcıyı uyarır ve kaydeder.',
  userPermissions: ['ModerateMembers'],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Lütfen uyarılacak kullanıcıyı etiketleyin.');

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    const key = `${message.guild.id}_${target.id}`;
    if (!warnData.has(key)) warnData.set(key, []);

    const warns = warnData.get(key);
    warns.push({ reason, moderatorId: message.author.id, timestamp: Date.now() });

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Kullanıcı Uyarıldı')
      .setDescription(`**Uyarılan:** ${target.user.tag}\n**Toplam Uyarı:** ${warns.length}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xeab308)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'temizle',
  aliases: ['clear', 'purge'],
  category: 'Moderasyon',
  description: 'Belirtilen miktarda mesaj siler.',
  userPermissions: ['ManageMessages'],
  botPermissions: ['ManageMessages'],
  async execute(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('⚠️ Lütfen 1 ile 100 arasında silinecek mesaj sayısı belirtin (Örn: `e!temizle 20`).');
    }

    await message.delete().catch(() => { });
    const deleted = await message.channel.bulkDelete(amount, true).catch(err => null);

    if (!deleted) return message.reply('❌ 14 günden eski mesajlar toplu silinemez.');

    const msg = await message.channel.send(`🧹 **${deleted.size}** adet mesaj başarıyla silindi.`);
    setTimeout(() => msg.delete().catch(() => { }), 4000);
  }
});

registerCommand({
  name: 'lock',
  category: 'Moderasyon',
  description: 'Belirtilen kanalda üyelerin mesaj yazmasını devre dışı bırakır.',
  userPermissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  async execute(message, args) {
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return message.reply(`🔒 **${channel.name}** kanalı başarıyla kilitlendi!`);
  }
});

registerCommand({
  name: 'slowmode',
  aliases: ['yavaşmod'],
  category: 'Moderasyon',
  description: 'Kanalda yavaşmodu ayarlar (Örn: `e!slowmode 5`).',
  userPermissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  async execute(message, args) {
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply('⚠️ Lütfen 0 ile 21600 saniye arasında bir süre belirtin (Kapatmak için: `e!slowmode 0`).');
    }

    await message.channel.setRateLimitPerUser(seconds);
    return message.reply(seconds === 0 ? '🚀 Kanal yavaş modu kaldırıldı!' : `⏱ Kanal yavaş modu **${seconds} saniye** olarak ayarlandı.`);
  }
});

registerCommand({
  name: 'kanalaçıklama',
  category: 'Moderasyon',
  description: 'Bulunduğunuz kanalın konusunu/açıklamasını değiştirir.',
  userPermissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  async execute(message, args) {
    const topic = args.join(' ');
    if (!topic) return message.reply('⚠️ Lütfen yeni kanal açıklamasını yazın.');
    await message.channel.setTopic(topic);
    return message.reply(`📝 Kanal açıklaması güncellendi: **${topic}**`);
  }
});

registerCommand({
  name: 'rol',
  category: 'Moderasyon',
  description: 'Belirtilen kullanıcıya istediğiniz rolü verir ya da alır.',
  userPermissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Kullanım: `e!rol @üye <rol-ismi/mention>`');

    const roleName = args.slice(1).join(' ');
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return message.reply('❌ Belirtilen rol bulunamadı.');

    if (target.roles.cache.has(role.id)) {
      await target.roles.remove(role);
      return message.reply(`➖ **${target.user.tag}** kullanıcısından **${role.name}** rolü alındı.`);
    } else {
      await target.roles.add(role);
      return message.reply(`➕ **${target.user.tag}** kullanıcısına **${role.name}** rolü verildi.`);
    }
  }
});

registerCommand({
  name: 'rololuştur',
  category: 'Moderasyon',
  description: 'Yeni rol oluşturursunuz.',
  userPermissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],
  async execute(message, args) {
    const roleName = args.join(' ');
    if (!roleName) return message.reply('⚠️ Lütfen oluşturulacak rol adını girin.');

    const role = await message.guild.roles.create({ name: roleName, reason: `${message.author.tag} tarafından oluşturuldu.` });
    return message.reply(`✅ **${role.name}** adında yeni bir rol oluşturuldu!`);
  }
});

registerCommand({
  name: 'takmaad',
  aliases: ['nickname'],
  category: 'Moderasyon',
  description: 'Etiketlenilen kullanıcının takma adını değiştirir.',
  userPermissions: ['ManageNicknames'],
  botPermissions: ['ManageNicknames'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Kullanım: `e!takmaad @üye <Yeni İsim>`');

    const newNick = args.slice(1).join(' ');
    await target.setNickname(newNick || null);
    return message.reply(`🏷 **${target.user.tag}** kullanıcısının ismi **${newNick || 'Orijinal İsmi'}** olarak değiştirildi.`);
  }
});

registerCommand({
  name: 'herkesetagver',
  category: 'Moderasyon',
  description: 'Bot herkesin isminin başına belirlediğiniz tagı ekler.',
  userPermissions: ['Administrator'],
  botPermissions: ['ManageNicknames'],
  async execute(message, args) {
    const tag = args[0];
    if (!tag) return message.reply('⚠️ Lütfen eklenecek tagı yazın (Örn: `e!herkesetagver [TAG]`).');

    message.reply('⏳ Herkesin ismine tag ekleme işlemi başlatıldı, bu biraz zaman alabilir...');
    const members = await message.guild.members.fetch();
    let count = 0;

    for (const [_, member] of members) {
      if (member.user.bot) continue;
      if (member.id === message.guild.ownerId) continue;
      try {
        const currentName = member.displayName;
        if (!currentName.startsWith(tag)) {
          await member.setNickname(`${tag} ${currentName}`);
          count++;
        }
      } catch (e) { }
    }

    return message.channel.send(`✅ Toplam **${count}** kişinin isminin başına **${tag}** eklendi.`);
  }
});

registerCommand({
  name: 'toplutagal',
  category: 'Moderasyon',
  description: 'Belirttiğiniz tagı herkesin isminden kaldırır.',
  userPermissions: ['Administrator'],
  botPermissions: ['ManageNicknames'],
  async execute(message, args) {
    const tag = args[0];
    if (!tag) return message.reply('⚠️ Lütfen kaldırılacak tagı yazın (Örn: `e!toplutagal [TAG]`).');

    message.reply('⏳ Tag kaldırma işlemi başlatıldı...');
    const members = await message.guild.members.fetch();
    let count = 0;

    for (const [_, member] of members) {
      if (member.user.bot) continue;
      try {
        if (member.displayName.startsWith(tag)) {
          const newName = member.displayName.replace(tag, '').trim();
          await member.setNickname(newName || null);
          count++;
        }
      } catch (e) { }
    }

    return message.channel.send(`✅ Toplam **${count}** kişinin isminden **${tag}** kaldırıldı.`);
  }
});

registerCommand({
  name: 'emojiekle',
  category: 'Moderasyon',
  description: 'Sunucunuza belirttiğiniz link ve adda emoji yükler.',
  userPermissions: ['ManageGuildExpressions'],
  botPermissions: ['ManageGuildExpressions'],
  async execute(message, args) {
    const link = args[0];
    const name = args[1];
    if (!link || !name) return message.reply('⚠️ Kullanım: `e!emojiekle <Resim_Link/Emoji> <Emoji_Adı>`');

    try {
      const emoji = await message.guild.emojis.create({ attachment: link, name: name });
      return message.reply(`✅ Emoji eklendi: ${emoji} (\`:${emoji.name}:\`)`);
    } catch (err) {
      return message.reply('❌ Emoji eklenirken hata oluştu! Linkin geçerli bir görsel olduğundan emin olun.');
    }
  }
});

registerCommand({
  name: 'sesli',
  category: 'Moderasyon',
  description: 'Etiketlediğiniz kullanıcının sesli kanalı yönetilir (`sustur`, `sağırlaştır`, `at`, `taşı`).',
  userPermissions: ['MuteMembers'],
  botPermissions: ['MuteMembers', 'MoveMembers', 'DeafenMembers'],
  async execute(message, args) {
    const action = args[0]?.toLowerCase();
    const target = message.mentions.members.first();
    if (!action || !target) return message.reply('⚠️ Kullanım: `e!sesli <sustur/aç/sağırlaştır/at> @üye`');

    if (!target.voice.channel) return message.reply('❌ Etiketlenen kullanıcı bir sesli kanalda değil.');

    if (action === 'sustur') {
      await target.voice.setMute(true);
      return message.reply(`🔇 ${target.user.tag} sesli kanalda sustained.`);
    } else if (action === 'aç') {
      await target.voice.setMute(false);
      return message.reply(`🔊 ${target.user.tag} sesli kanaldaki susturması kaldırıldı.`);
    } else if (action === 'sağırlaştır') {
      await target.voice.setDeaf(true);
      return message.reply(`🙉 ${target.user.tag} sesli kanalda sağırlaştırıldı.`);
    } else if (action === 'at') {
      await target.voice.disconnect();
      return message.reply(`🔌 ${target.user.tag} sesli kanaldan atıldı.`);
    } else {
      return message.reply('⚠️ Geçerli işlemler: `sustur`, `aç`, `sağırlaştır`, `at`.');
    }
  }
});

registerCommand({
  name: 'oylama',
  category: 'Moderasyon',
  description: 'Oylama yapmanızı sağlar.',
  userPermissions: ['ManageMessages'],
  botPermissions: [],
  async execute(message, args) {
    const question = args.join(' ');
    if (!question) return message.reply('⚠️ Lütfen oylama konusunu yazın.');

    const embed = new EmbedBuilder()
      .setTitle('📊 SUNUCU OYLAMASI')
      .setDescription(`**Soru:** ${question}\n\n*Oy vermek için aşağıdaki tepkileri kullanabilirsiniz!*`)
      .setFooter({ text: `Oylamayı Başlatan: ${message.author.tag}` })
      .setColor(0x3b82f6)
      .setTimestamp();

    const pollMsg = await message.channel.send({ embeds: [embed] });
    await pollMsg.react('👍');
    await pollMsg.react('👎');
  }
});

registerCommand({
  name: 'komut',
  category: 'Moderasyon',
  description: 'Botun belirli komutlarını kapatıp açar.',
  userPermissions: ['ManageGuild'],
  botPermissions: [],
  async execute(message, args) {
    const cmdName = args[0]?.toLowerCase();
    if (!cmdName) return message.reply('⚠️ Kullanım: `e!komut <komut_adı>` (Bulunduğunuz kanalda komutu engeller/açar).');

    const key = `${message.guild.id}_${message.channel.id}`;
    if (!disabledCommands.has(key)) disabledCommands.set(key, new Set());

    const set = disabledCommands.get(key);
    if (set.has(cmdName)) {
      set.delete(cmdName);
      return message.reply(`🟢 \`${cmdName}\` komutu bu kanalda tekrar aktif edildi.`);
    } else {
      set.add(cmdName);
      return message.reply(`🔴 \`${cmdName}\` komutu bu kanalda devre dışı bırakıldı.`);
    }
  }
});

registerCommand({
  name: 'sunucukur',
  category: 'Moderasyon',
  description: 'Bot sunucunuzu baştan kurup ayarlamalar yapar.',
  userPermissions: ['Administrator'],
  botPermissions: ['Administrator'],
  async execute(message, args) {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_setup').setLabel('✅ Kurulumu Onayla').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_setup').setLabel('❌ İptal').setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.reply({
      content: '⚠️ **DİKKAT:** Sunucu baştan kurulacak! Temel kategoriler ve kanallar (Sohbet, Duyuru, Kurallar) oluşturulacaktır. Onaylıyor musunuz?',
      components: [confirmRow]
    });

    const filter = i => i.user.id === message.author.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async i => {
      if (i.customId === 'cancel_setup') {
        await i.update({ content: '❌ Sunucu kurulumu iptal edildi.', components: [] });
        return;
      }

      await i.update({ content: '⚙️ Sunucu kurulumu başladı...', components: [] });

      try {
        const catInfo = await message.guild.channels.create({ name: '📌 INFORMASYON', type: ChannelType.GuildCategory });
        await message.guild.channels.create({ name: '📜-kurallar', type: ChannelType.GuildText, parent: catInfo.id });
        await message.guild.channels.create({ name: '📢-duyurular', type: ChannelType.GuildText, parent: catInfo.id });

        const catGeneral = await message.guild.channels.create({ name: '💬 GENEL', type: ChannelType.GuildCategory });
        await message.guild.channels.create({ name: '💬-sohbet', type: ChannelType.GuildText, parent: catGeneral.id });
        await message.guild.channels.create({ name: '🤖-bot-komut', type: ChannelType.GuildText, parent: catGeneral.id });
        await message.guild.channels.create({ name: '🔊 Sohbet Odası', type: ChannelType.GuildVoice, parent: catGeneral.id });

        await message.channel.send('🎉 **Sunucu yapısı başarıyla oluşturuldu!**');
      } catch (err) {
        await message.channel.send('❌ Kurulum sırasında bir hata oluştu.');
      }
    });
  }
});


// --- EĞLENCE & OYUN KOMUTLARI ---

registerCommand({
  name: '1vs1',
  category: 'Eğlence',
  description: 'İstediğiniz kullanıcı ile düello atarsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const opponent = message.mentions.members.first();
    if (!opponent || opponent.id === message.author.id || opponent.user.bot) {
      return message.reply('⚠️ Lütfen düello yapmak için bir kullanıcı etiketleyin!');
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_duel_${message.author.id}`).setLabel('⚔️ Düelloyu Kabul Et').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_duel_${message.author.id}`).setLabel('🏳️ Reddet').setStyle(ButtonStyle.Danger)
    );

    const msg = await message.channel.send({
      content: `⚔️ ${opponent}, ${message.author} seni düelloya davet ediyor!`,
      components: [row]
    });

    const collector = msg.createMessageComponentCollector({ time: 30000 });

    collector.on('collect', async i => {
      if (i.user.id !== opponent.id) return i.reply({ content: '❌ Bu davet sizin için değil.', ephemeral: true });

      if (i.customId.startsWith('reject_duel_')) {
        await i.update({ content: `🏳️ ${opponent.user.tag} düelloyu reddetti.`, components: [] });
        return;
      }

      // Düello Başlıyor
      let hp1 = 100, hp2 = 100;
      let turn = message.author.id;

      const getBattleEmbed = () => new EmbedBuilder()
        .setTitle('⚔️ 1v1 DÜELLO SAVAŞI')
        .setDescription(`❤️ **${message.author.username}:** ${hp1} HP\n❤️ **${opponent.user.username}:** ${hp2} HP\n\n🎯 **Sıra:** <@${turn}>`)
        .setColor(0xd97706);

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('duel_attack').setLabel('💥 Saldır').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('duel_heal').setLabel('🧪 İyileş').setStyle(ButtonStyle.Primary)
      );

      await i.update({ content: '⚔️ **Düello Başladı!**', embeds: [getBattleEmbed()], components: [actionRow] });

      const battleCollector = msg.createMessageComponentCollector({ time: 60000 });

      battleCollector.on('collect', async bi => {
        if (bi.user.id !== turn) return bi.reply({ content: '❌ Sıra sende değil!', ephemeral: true });

        if (bi.customId === 'duel_attack') {
          const dmg = Math.floor(Math.random() * 25) + 10;
          if (turn === message.author.id) hp2 = Math.max(0, hp2 - dmg);
          else hp1 = Math.max(0, hp1 - dmg);
        } else {
          const heal = Math.floor(Math.random() * 15) + 5;
          if (turn === message.author.id) hp1 = Math.min(100, hp1 + heal);
          else hp2 = Math.min(100, hp2 + heal);
        }

        if (hp1 <= 0 || hp2 <= 0) {
          const winner = hp1 > 0 ? message.author : opponent.user;
          await bi.update({
            content: `🏆 **DÜELLO BİTTİ!** Kazanan: **${winner.tag}** 🎉`,
            embeds: [],
            components: []
          });
          battleCollector.stop();
          return;
        }

        turn = (turn === message.author.id) ? opponent.id : message.author.id;
        await bi.update({ embeds: [getBattleEmbed()], components: [actionRow] });
      });
    });
  }
});

registerCommand({
  name: 'adamasmaca',
  category: 'Eğlence',
  description: 'Adam Asmaca oyunu oynarsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const kelimeler = ['DISCORD', 'TURKIYE', 'EKOYILDIZ', 'BOT', 'YAZILIM', 'SISTEM', 'ELEKTRONIK', 'OYUN'];
    const word = kelimeler[Math.floor(Math.random() * kelimeler.length)];
    let guessed = new Set();
    let lives = 6;

    const renderWord = () => word.split('').map(char => (guessed.has(char) ? char : '\\_')).join(' ');

    const msg = await message.reply(`🎮 **Adam Asmaca Başladı!**\n\nKelime: \`${renderWord()}\`\nKalan Hak: **${lives}**\n\n*Bir harf tahmin etmek için mesaja tek bir harf yazın!*`);

    const filter = m => m.author.id === message.author.id && m.content.length === 1;
    const collector = message.channel.createMessageCollector({ filter, time: 60000 });

    collector.on('collect', m => {
      const char = m.content.toUpperCase();
      m.delete().catch(() => { });

      if (guessed.has(char)) return;
      guessed.add(char);

      if (!word.includes(char)) lives--;

      const currentDisplay = renderWord();
      if (!currentDisplay.includes('\\_')) {
        msg.edit(`🎉 **Tebrikler!** Kelimeyi doğru bildiniz: **${word}**`);
        collector.stop();
      } else if (lives <= 0) {
        msg.edit(`💀 **Kaybettiniz!** Doğru kelime: **${word}** idi.`);
        collector.stop();
      } else {
        msg.edit(`🎮 **Adam Asmaca**\n\nKelime: \`${currentDisplay}\`\nKalan Hak: **${lives}**`);
      }
    });
  }
});

registerCommand({
  name: 'aranıyor',
  aliases: ['wanted'],
  category: 'Eğlence',
  description: 'Etiketlediğiniz kişiye aranıyor efekti verir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

    const embed = new EmbedBuilder()
      .setTitle('🤠 ARANIYOR (WANTED)')
      .setDescription(`**Ödül:** $1,000,000\n**Suçlu:** ${user.tag}`)
      .setImage(`https://api.popcat.xyz/wanted?image=${encodeURIComponent(avatar)}`)
      .setColor(0x78350f);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'hapishane',
  aliases: ['jail'],
  category: 'Eğlence',
  description: 'Etiketlediğiniz kişiye hapishane efekti verir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

    const embed = new EmbedBuilder()
      .setTitle('🔒 HAPİSHANE')
      .setDescription(`**Mahkum:** ${user.tag}`)
      .setImage(`https://api.popcat.xyz/jail?image=${encodeURIComponent(avatar)}`)
      .setColor(0x374151);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'wasted',
  category: 'Eğlence',
  description: 'Etiketlediğiniz kişiye wasted efekti verir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

    const embed = new EmbedBuilder()
      .setTitle('💀 WASTED')
      .setDescription(`**Etkilenen:** ${user.tag}`)
      .setImage(`https://api.popcat.xyz/bitchslap?image1=${encodeURIComponent(avatar)}&image2=${encodeURIComponent(avatar)}`)
      .setColor(0x991b1b);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'ship',
  category: 'Eğlence',
  description: 'Bot etiketlediğiniz kişiye karşı olan aşkını ölçer.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❤️ Lütfen aşkınızı ölçmek için birini etiketleyin!');

    const score = Math.floor(Math.random() * 101);
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const embed = new EmbedBuilder()
      .setTitle('💖 AŞK ÖLÇER (SHIP)')
      .setDescription(`**${message.author.username}**  💖  **${target.username}**\n\n**Aşk Yüzdesi:** %${score}\n\`[${bar}]\``)
      .setColor(0xec4899);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'cmm',
  category: 'Eğlence',
  description: 'Change My Mind tabelasına yazı yazdırırsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('⚠️ Lütfen tabelaya yazılacak metni yazın.');

    const embed = new EmbedBuilder()
      .setTitle('☕ Change My Mind')
      .setImage(`https://api.popcat.xyz/change-my-mind?text=${encodeURIComponent(text)}`)
      .setColor(0x3b82f6);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'emojiyazı',
  category: 'Eğlence',
  description: 'Mesajınızı emoji haline getirir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('⚠️ Lütfen dönüştürülecek yazıyı girin.');

    const charMap = {
      a: '🇦', b: '🇧', c: '🇨', d: '🇩', e: '🇪', f: '🇫', g: '🇬', h: '🇭', i: '🇮',
      j: '🇯', k: '🇰', l: '🇱', m: '🇲', n: '🇳', o: '🇴', p: '🇵', q: '🇶', r: '🇷',
      s: '🇸', t: '🇹', u: '🇺', v: '🇻', w: '🇼', x: '🇽', y: '🇾', z: '🇿',
      ' ': '   '
    };

    const emojiStr = text.toLowerCase().split('').map(c => charMap[c] || c).join(' ');
    return message.reply(emojiStr);
  }
});

registerCommand({
  name: 'fakemesaj',
  category: 'Eğlence',
  description: 'Etiketlediğiniz kişi için sahte mesaj gönderirsiniz.',
  userPermissions: [],
  botPermissions: ['ManageWebhooks'],
  async execute(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply('⚠️ Kullanım: `e!fakemesaj @üye <yazılacak mesaj>`');

    const fakeText = args.slice(1).join(' ');
    if (!fakeText) return message.reply('⚠️ Lütfen sahte mesaj metnini yazın.');

    await message.delete().catch(() => { });

    try {
      const webhook = await message.channel.createWebhook({
        name: target.displayName,
        avatar: target.user.displayAvatarURL()
      });

      await webhook.send(fakeText);
      await webhook.delete();
    } catch (e) {
      return message.channel.send(`💬 **[Sahte Mesaj - ${target.displayName}]:** ${fakeText}`);
    }
  }
});

registerCommand({
  name: 'fast',
  category: 'Eğlence',
  description: 'Belirlenen sürede verilen kelimeyi yazmaya çalışırsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const words = ['süper hızlı bot', 'discord türkiye sunucusu', 'ekoyıldız harika', 'yazılım geliştirme'];
    const targetWord = words[Math.floor(Math.random() * words.length)];

    await message.reply(`⚡ **Hızlı Yazma Yarışı!**\nAşağıdaki cümleyi ilk yazan kazanır (15 saniye):\n\n👉 **\`${targetWord}\`**`);

    const filter = m => m.content === targetWord;
    const collector = message.channel.createMessageCollector({ filter, time: 15000 });

    collector.on('collect', m => {
      m.reply(`🎉 **Tebrikler ${m.author}!** Cümleyi ilk yazan sen oldun!`);
      collector.stop();
    });
  }
});

registerCommand({
  name: 'hackle',
  category: 'Eğlence',
  description: 'Etiketlediğiniz kişiyi hackler.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Hacklenecek kişiyi etiketleyin!');

    const msg = await message.reply(`💻 **${target.username}** hackleme işlemi başlatılıyor...`);

    setTimeout(() => msg.edit(`🔍 IP Adresi taranıyor... \`192.168.1.${Math.floor(Math.random() * 250)}\``), 1500);
    setTimeout(() => msg.edit(`🔐 Discord şifreleri çekiliyor...`), 3000);
    setTimeout(() => msg.edit(`📧 E-posta hesabı ele geçirildi: \`${target.username}@gmail.com\``), 4500);
    setTimeout(() => msg.edit(`🎉 **${target.username}** başarıyla HACKLENDİ! 💻💥`), 6000);
  }
});

registerCommand({
  name: 'kaçcm',
  aliases: ['kaccm', 'kac-cm', 'kaç-cm', 'cm'],
  category: 'Eğlence',
  description: 'Rastgele kaç cm olduğunu ölçer.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const cm = Math.floor(Math.random() * 35) + 1;
    return message.reply(`📏 **${target.username}** kullanıcısının malafatı tam olarak **${cm} cm**! ¯\\_(ツ)_/¯`);
  }
});

registerCommand({
  name: 'kelimeyarışı',
  category: 'Eğlence',
  description: 'Etiketlediğiniz Kişi ile Kelime Yarışı yaparsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('⚠️ Yarışılacak kişiyi etiketleyin!');

    await message.channel.send(`🔤 **Kelime Yarışı!**\n${message.author} vs ${target}\nİlk kim **\`antigravity\`** yazarsa kazanır!`);

    const filter = m => (m.author.id === message.author.id || m.author.id === target.id) && m.content.toLowerCase() === 'antigravity';
    const collector = message.channel.createMessageCollector({ filter, time: 20000 });

    collector.on('collect', m => {
      message.channel.send(`🏆 **${m.author}** daha hızlı davranarak kelime yarışını kazandı!`);
      collector.stop();
    });
  }
});

registerCommand({
  name: 'pfpçerçeve',
  category: 'Eğlence',
  description: 'Çerçeve komutlarını gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('🖼 Profil Fotoğrafı Çerçeveleri')
      .setDescription('Mevcut efektler:\n- `e!aranıyor` (Wanted Afişi)\n- `e!hapishane` (Hapishane Parmaklıkları)\n- `e!wasted` (Wasted Efekti)')
      .setColor(0xa855f7);
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'sahteetiket',
  category: 'Eğlence',
  description: 'Sunucunuza sahte etiket görüntüsü ekler.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const text = args.join(' ') || message.guild.name;
    const embed = new EmbedBuilder()
      .setTitle('🏷 SAHTE ONAYLI ETIKET')
      .setDescription(`VERIFIED SERVER: **${text}** ✅`)
      .setColor(0x10b981);
    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'sınav',
  category: 'Eğlence',
  description: 'Bot size sorular sorar.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const questions = [
      { q: 'Türkiye’nin başkenti neresidir?', a: 'ANKARA' },
      { q: 'Discord hangi yılda piyasaya çıkmıştır?', a: '2015' },
      { q: 'Su kaç derecede kaynar?', a: '100' }
    ];
    const item = questions[Math.floor(Math.random() * questions.length)];

    await message.reply(`❓ **Soru:** ${item.q}\n*(Yanıtlamak için 15 saniyeniz var!)*`);

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 15000 });

    collector.on('collect', m => {
      if (m.content.toUpperCase() === item.a) {
        m.reply('🎉 **Tebrikler!** Doğru cevap!');
        collector.stop();
      } else {
        m.reply('❌ Yanlış cevap, tekrar deneyin.');
      }
    });
  }
});

registerCommand({
  name: 'atatürk',
  category: 'Eğlence',
  description: 'Rastgele bir Atatürk fotoğrafı gönderir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const photo = ataturkPhotos[Math.floor(Math.random() * ataturkPhotos.length)];
    const embed = new EmbedBuilder()
      .setTitle('🇹🇷 Mustafa Kemal Atatürk')
      .setImage(photo)
      .setColor(0xef4444);
    return message.reply({ embeds: [embed] });
  }
});


// --- KULLANICI, SİSTEM VE İSTATİSTİK KOMUTLARI ---

registerCommand({
  name: 'günlükpuan',
  aliases: ['daily'],
  category: 'Kullanıcı',
  description: 'Günlük olarak puan ödülünüzü alırsınız.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const lastDaily = dailyData.get(message.author.id) || 0;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (now - lastDaily < cooldown) {
      const remainingSec = Math.ceil((cooldown - (now - lastDaily)) / 1000);
      const hours = Math.floor(remainingSec / 3600);
      const mins = Math.floor((remainingSec % 3600) / 60);
      return message.reply(`⏳ Günlük puanınızı zaten aldınız. Kalan süre: **${hours} saat ${mins} dakika**.`);
    }

    dailyData.set(message.author.id, now);
    const reward = Math.floor(Math.random() * 400) + 100;
    return message.reply(`🎁 Tebrikler! Günlük **${reward} puan** kazandınız!`);
  }
});

registerCommand({
  name: 'afk',
  category: 'Kullanıcı',
  description: 'Bahsedildiğinizde yanıt verilmesi için bir AFK durum ayarlar.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const reason = args.join(' ') || 'Sebep belirtilmedi';
    afkData.set(message.author.id, { reason, timestamp: Date.now() });

    return message.reply(`💤 AFK Moduna geçtiniz! Sebep: **${reason}**. Mesaj yazdığınızda AFK modunuz otomatik kalkacaktır.`);
  }
});

registerCommand({
  name: 'rank',
  aliases: ['seviye'],
  category: 'Kullanıcı',
  description: 'Etiketlediğiniz kişinin seviyesini gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const key = `${message.guild.id}_${target.id}`;
    const data = levelData.get(key) || { xp: 0, level: 1, messages: 0 };

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${target.username} - Seviye Kartı`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '⭐ Seviye (Level)', value: `\`${data.level}\``, inline: true },
        { name: '✨ Toplam XP', value: `\`${data.xp}\``, inline: true },
        { name: '💬 Mesaj Sayısı', value: `\`${data.messages}\``, inline: true }
      )
      .setColor(0x8b5cf6);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'leaderboard',
  aliases: ['seviyesıralaması'],
  category: 'Kullanıcı',
  description: 'Sunucudaki seviye sıralamasını gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const guildEntries = [];
    for (const [key, val] of levelData.entries()) {
      if (key.startsWith(`${message.guild.id}_`)) {
        const userId = key.split('_')[1];
        guildEntries.push({ userId, xp: val.xp, level: val.level });
      }
    }

    guildEntries.sort((a, b) => b.xp - a.xp);
    const top10 = guildEntries.slice(0, 10);

    const desc = top10.length > 0
      ? top10.map((e, idx) => `**${idx + 1}.** <@${e.userId}> - Level **${e.level}** (${e.xp} XP)`).join('\n')
      : 'Henüz sıralamada kimse yok.';

    const embed = new EmbedBuilder()
      .setTitle('🏆 Sunucu Seviye Sıralaması')
      .setDescription(desc)
      .setColor(0xeab308);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'top',
  category: 'Kullanıcı',
  description: 'Sunucudaki mesaj ve ses sıralamasını gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    return commands.get('leaderboard').execute(message);
  }
});

registerCommand({
  name: 'avatar',
  category: 'Kullanıcı',
  description: 'Etiketlediğiniz kişinin avatarını gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setTitle(`🖼 ${user.username} Avatarı`)
      .setImage(avatarUrl)
      .setColor(0x3b82f6);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'emojiler',
  category: 'Kullanıcı',
  description: 'Sunucuda bulunan emojileri gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const emojis = message.guild.emojis.cache;
    if (emojis.size === 0) return message.reply('ℹ️ Sunucuda hiç özel emoji bulunmuyor.');

    const emojiList = emojis.map(e => e.toString()).join(' ');
    const embed = new EmbedBuilder()
      .setTitle(`😃 Sunucu Emojileri (${emojis.size})`)
      .setDescription(emojiList.length > 4000 ? emojiList.substring(0, 4000) + '...' : emojiList)
      .setColor(0x10b981);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'hesapla',
  category: 'Kullanıcı',
  description: 'Bot belirtilen hesaplama işlemini yapar.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const expr = args.join('');
    if (!expr || !/^[0-9+\-*/().\s]+$/.test(expr)) {
      return message.reply('⚠️ Lütfen geçerli bir matematiksel işlem girin (Örn: `e!hesapla 25 * 4 + 10`).');
    }

    try {
      const result = eval(expr);
      return message.reply(`🧮 **İşlem:** \`${expr}\`\n**Sonuç:** \`${result}\``);
    } catch (e) {
      return message.reply('❌ Matematiksel işlem hesaplanamadı.');
    }
  }
});

registerCommand({
  name: 'kullanıcıbilgi',
  aliases: ['userinfo'],
  category: 'Kullanıcı',
  description: 'Etiketlediğiniz kullanıcının hesap bilgilerini gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const member = message.mentions.members.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`👤 ${member.user.tag} Bilgileri`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
        { name: '📅 Hesabın Kuruluşu', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📥 Sunucuya Katılım', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: '🎭 Rol Sayısı', value: `\`${member.roles.cache.size - 1}\``, inline: true }
      )
      .setColor(0x6366f1);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'kurucukim',
  category: 'Kullanıcı',
  description: 'Sunucunun kurucusunu söyler.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const owner = await message.guild.fetchOwner();
    return message.reply(`👑 Sunucu Kurucusu: **${owner.user.tag}** (\`${owner.id}\`)`);
  }
});

registerCommand({
  name: 'minecraft',
  category: 'Kullanıcı',
  description: 'Belirttiğiniz oyuncunun Minecraft bilgilerini gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message, args) {
    const username = args[0];
    if (!username) return message.reply('⚠️ Lütfen bir Minecraft oyuncu adı yazın.');

    const embed = new EmbedBuilder()
      .setTitle(`⛏️ Minecraft Oyuncusu: ${username}`)
      .setThumbnail(`https://mc-heads.net/avatar/${username}`)
      .setImage(`https://mc-heads.net/body/${username}`)
      .setColor(0x22c55e);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'sunucubilgi',
  aliases: ['serverinfo'],
  category: 'Kullanıcı',
  description: 'Bulunduğun sunucu hakkında bilgi verir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const guild = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`🏰 ${guild.name} Sunucu Bilgileri`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👑 Kurucu', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Üye Sayısı', value: `\`${guild.memberCount}\``, inline: true },
        { name: '💬 Kanal Sayısı', value: `\`${guild.channels.cache.size}\``, inline: true },
        { name: '🎭 Rol Sayısı', value: `\`${guild.roles.cache.size}\``, inline: true },
        { name: '📅 Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setColor(0xec4899);

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'yardım',
  aliases: ['help'],
  category: 'Kullanıcı',
  description: 'Tüm komutları listeler.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const categories = {};
    for (const [_, cmd] of commands) {
      if (cmd.aliases && cmd.aliases.includes(_)) continue; // Aliases'leri tekrar listeleme
      const cat = cmd.category || 'Genel';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(cmd);
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 BOT KOMUT MENÜSÜ (Prefix: e!)')
      .setDescription('Her komutun yetkileri kendine özeldir. Moderasyon komutları için gerekli yetkiler aşağıda belirtilmiştir.')
      .setColor(0x8b5cf6);

    for (const [catName, cmdList] of Object.entries(categories)) {
      const formatted = cmdList.map(c => {
        const reqPerms = c.userPermissions.length > 0 ? ` *(Yetki: ${c.userPermissions.join(', ')})*` : '';
        return `• \`e!${c.name}\`: ${c.description}${reqPerms}`;
      }).join('\n');
      embed.addFields({ name: `📌 ${catName} Komutları`, value: formatted });
    }

    return message.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: 'sistemler',
  aliases: ['durum', 'status', 'uptime'],
  category: 'Kullanıcı',
  description: 'EkoYıldız sistemlerinin (DuckDNS ve Render) aktiflik ve uptime durumunu gösterir.',
  userPermissions: [],
  botPermissions: [],
  async execute(message) {
    const axios = require('axios');
    const loadingMsg = await message.reply('🔍 **EkoYıldız sistemleri kontrol ediliyor...**');

    const services = [
      { name: 'Sentara', url: 'https://ekoyildiz.duckdns.org/' },
      { name: 'Sentura', url: 'https://bem-zze4.onrender.com' }
    ];

    const results = [];
    for (const service of services) {
      const start = Date.now();
      try {
        const res = await axios.get(service.url, {
          timeout: 10000,
          validateStatus: () => true,
          headers: { 'User-Agent': 'EkoYildiz-Bot/1.0' }
        });
        const dur = Date.now() - start;
        const isOk = res.status >= 200 && res.status < 400;
        results.push({
          name: service.name,
          url: service.url,
          ok: isOk,
          duration: dur,
          status: res.status
        });
      } catch (err) {
        const dur = Date.now() - start;
        results.push({
          name: service.name,
          url: service.url,
          ok: false,
          duration: dur,
          error: err.message
        });
      }
    }

    const allOk = results.every(r => r.ok);
    const uptimeSec = Math.floor(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const uptimeText = `${days > 0 ? `${days} gün ` : ''}${hours} saat ${mins} dakika ${secs} saniye`;

    const description = allOk
      ? `:information_source: **EkoYıldız sistemleri aktif.**\n\n⏱ **Bot Uptime:** ${uptimeText}\n\n🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ 🟢 **Aktif** (\`${r.duration}ms\`)`).join('\n')
      : `⚠️ **Birkaç sistemde hata oluştu.. Ekibimize bu durum bildirildi. Düzeltmek için çalışıyoruz.**\n\n⏱ **Bot Uptime:** ${uptimeText}\n\n🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ ${r.ok ? `🟢 **Aktif** (\`${r.duration}ms\`)` : `🔴 **Hata / Çevrimdışı**`}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(allOk ? 'ℹ️ EkoYıldız Sistem Durumu' : '⚠️ Sistem Uyarısı')
      .setColor(allOk ? 0x10b981 : 0xef4444)
      .setDescription(description)
      .setFooter({ text: 'EkoYıldız Sistem Takipçisi' })
      .setTimestamp();

    await loadingMsg.edit({ content: '', embeds: [embed] });
  }
});

// -------------------------------------------------------------
// GİLD MESAJ İŞLEYİCİ (Guild Message Handler)
// -------------------------------------------------------------
async function handleGuildMessage(message) {
  if (!message.author || message.author.bot) return;

  // 1. AFK Kontrolü (Mesaj Yazan Kişi AFK ise kaldır)
  if (afkData.has(message.author.id)) {
    afkData.delete(message.author.id);
    message.reply(`👋 Hoş geldin **${message.author.username}**! AFK modundan çıkış yaptın.`).then(m => setTimeout(() => m.delete().catch(() => { }), 5000));
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

  // 6. Özel Yetki Kontrolü ("yetkileri her komuta özel olsun")
  const permCheck = checkPermissions(message, command.userPermissions, command.botPermissions);
  if (!permCheck.pass) {
    return message.reply(permCheck.error);
  }

  // 7. Komutu Çalıştır
  try {
    await command.execute(message, args);
  } catch (err) {
    console.error(`[KOMUT HATASI - e!${commandName}]`, err);
    message.reply('❌ Komut çalıştırılırken beklenmeyen bir hata oluştu.');
  }
}

module.exports = {
  handleGuildMessage,
  commands
};
