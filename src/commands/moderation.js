const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

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

module.exports = [
  {
    name: 'ban',
    category: 'Moderasyon',
    description: 'Etiketlediğiniz kişiyi sunucudan yasaklar.',
    userPermissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    async execute(message, args) {
      const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
      if (!target) return message.reply('⚠️ Lütfen yasaklanacak kullanıcıyı etiketleyin veya ID yazın.');
      if (!target.bannable) return message.reply('❌ Bu kullanıcıyı yasaklamak için yetkim yetersiz.');

      const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
      await target.ban({ reason: `${message.author.tag} tarafından: ${reason}` });

      const embed = new EmbedBuilder()
        .setTitle('🔨 Kullanıcı Yasaklandı')
        .setDescription(`**Yasaklanan:** ${target.user.tag} (\`${target.id}\`)\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
        .setColor(0xef4444)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    name: 'sustur',
    aliases: ['mute', 'timeout'],
    category: 'Moderasyon',
    description: 'Etiketlediğiniz kişiyi sunucudan susturur (Örn: `e!sustur @üye 10m sebep`).',
    userPermissions: ['ModerateMembers'],
    botPermissions: ['ModerateMembers'],
    async execute(message, args) {
      const target = message.mentions.members.first();
      if (!target) return message.reply('⚠️ Kullanım: `e!sustur @üye <süre: 10m/1h/1d> [sebep]`');
      if (!target.moderatable) return message.reply('❌ Bu kullanıcıyı susturmak için yetkim yetersiz.');

      const durationStr = args[1];
      const durationMs = parseDuration(durationStr);
      if (!durationMs) return message.reply('⚠️ Geçersiz süre! Örnek: `10m`, `2h`, `1d`.');

      const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
      await target.timeout(durationMs, `${message.author.tag} tarafından: ${reason}`);

      const embed = new EmbedBuilder()
        .setTitle('🔇 Kullanıcı Susturuldu')
        .setDescription(`**Susturulan:** ${target.user.tag}\n**Süre:** ${durationStr}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
        .setColor(0xef4444)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  },
  {
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
  },
  {
    name: 'uyarı',
    aliases: ['warn'],
    category: 'Moderasyon',
    description: 'Etiketlenilen kullanıcıyı uyarır ve kaydeder.',
    userPermissions: ['ModerateMembers'],
    botPermissions: [],
    async execute(message, args, context) {
      const target = message.mentions.members.first();
      if (!target) return message.reply('⚠️ Lütfen uyarılacak kullanıcıyı etiketleyin.');

      const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
      const key = `${message.guild.id}_${target.id}`;
      if (!context.warnData.has(key)) context.warnData.set(key, []);

      const warns = context.warnData.get(key);
      warns.push({ reason, moderatorId: message.author.id, timestamp: Date.now() });

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Kullanıcı Uyarıldı')
        .setDescription(`**Uyarılan:** ${target.user.tag}\n**Toplam Uyarı:** ${warns.length}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`)
        .setColor(0xeab308)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },
  {
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

      await message.delete().catch(() => {});
      const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);

      if (!deleted) return message.reply('❌ 14 günden eski mesajlar toplu silinemez.');

      const msg = await message.channel.send(`🧹 **${deleted.size}** adet mesaj başarıyla silindi.`);
      setTimeout(() => msg.delete().catch(() => {}), 4000);
    }
  },
  {
    name: 'lock',
    category: 'Moderasyon',
    description: 'Belirtilen kanalda üyelerin mesaj yazmasını devre dışı bırakır.',
    userPermissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    async execute(message) {
      const channel = message.mentions.channels.first() || message.channel;
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply(`🔒 **${channel.name}** kanalı başarıyla kilitlendi!`);
    }
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    name: 'herkesetagver',
    category: 'Moderasyon',
    description: 'Bot herkesin isminin başına belirlediğiniz tagı ekler.',
    userPermissions: ['Administrator'],
    botPermissions: ['ManageNicknames'],
    async execute(message, args) {
      const tag = args[0];
      if (!tag) return message.reply('⚠️ Lütfen eklenecek tagı yazın (Örn: `e!herkesetagver [TAG]`).');

      message.reply('⏳ Herkesin ismine tag ekleme işlemi başlatıldı...');
      const members = await message.guild.members.fetch();
      let count = 0;

      for (const [_, member] of members) {
        if (member.user.bot || member.id === message.guild.ownerId) continue;
        try {
          const currentName = member.displayName;
          if (!currentName.startsWith(tag)) {
            await member.setNickname(`${tag} ${currentName}`);
            count++;
          }
        } catch (e) {}
      }

      return message.channel.send(`✅ Toplam **${count}** kişinin isminin başına **${tag}** eklendi.`);
    }
  },
  {
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
  },
  {
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
  },
  {
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
        return message.reply(`🔇 ${target.user.tag} sesli kanalda susturuldu.`);
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
  },
  {
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
  },
  {
    name: 'komut',
    category: 'Moderasyon',
    description: 'Botun belirli komutlarını kapatıp açar.',
    userPermissions: ['ManageGuild'],
    botPermissions: [],
    async execute(message, args, context) {
      const cmdName = args[0]?.toLowerCase();
      if (!cmdName) return message.reply('⚠️ Kullanım: `e!komut <komut_adı>` (Bulunduğunuz kanalda komutu engeller/açar).');

      const key = `${message.guild.id}_${message.channel.id}`;
      if (!context.disabledCommands.has(key)) context.disabledCommands.set(key, new Set());

      const set = context.disabledCommands.get(key);
      if (set.has(cmdName)) {
        set.delete(cmdName);
        return message.reply(`🟢 \`${cmdName}\` komutu bu kanalda tekrar aktif edildi.`);
      } else {
        set.add(cmdName);
        return message.reply(`🔴 \`${cmdName}\` komutu bu kanalda devre dışı bırakıldı.`);
      }
    }
  },
  {
    name: 'sunucukur',
    category: 'Moderasyon',
    description: 'Bot sunucunuzu baştan kurup ayarlamalar yapar.',
    userPermissions: ['Administrator'],
    botPermissions: ['Administrator'],
    async execute(message) {
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
  }
];
