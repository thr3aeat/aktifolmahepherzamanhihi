const { EmbedBuilder } = require('discord.js');

module.exports = [
  {
    name: 'günlükpuan',
    aliases: ['daily'],
    category: 'Kullanıcı',
    description: 'Günlük olarak puan ödülünüzü alırsınız.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const lastDaily = context.dailyData.get(message.author.id) || 0;
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (now - lastDaily < cooldown) {
        const remainingSec = Math.ceil((cooldown - (now - lastDaily)) / 1000);
        const hours = Math.floor(remainingSec / 3600);
        const mins = Math.floor((remainingSec % 3600) / 60);
        return message.reply(`⏳ Günlük puanınızı zaten aldınız. Kalan süre: **${hours} saat ${mins} dakika**.`);
      }

      context.dailyData.set(message.author.id, now);
      const reward = Math.floor(Math.random() * 400) + 100;
      return message.reply(`🎁 Tebrikler! Günlük **${reward} puan** kazandınız!`);
    }
  },
  {
    name: 'afk',
    category: 'Kullanıcı',
    description: 'Bahsedildiğinizde yanıt verilmesi için bir AFK durum ayarlar.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const reason = args.join(' ') || 'Sebep belirtilmedi';
      context.afkData.set(message.author.id, { reason, timestamp: Date.now() });

      return message.reply(`💤 AFK Moduna geçtiniz! Sebep: **${reason}**. Mesaj yazdığınızda AFK modunuz otomatik kalkacaktır.`);
    }
  },
  {
    name: 'rank',
    aliases: ['seviye'],
    category: 'Kullanıcı',
    description: 'Etiketlediğiniz kişinin seviyesini gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const target = message.mentions.users.first() || message.author;
      const key = `${message.guild.id}_${target.id}`;
      const data = context.levelData.get(key) || { xp: 0, level: 1, messages: 0 };

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
  },
  {
    name: 'leaderboard',
    aliases: ['seviyesıralaması'],
    category: 'Kullanıcı',
    description: 'Sunucudaki seviye sıralamasını gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const guildEntries = [];
      for (const [key, val] of context.levelData.entries()) {
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
  },
  {
    name: 'top',
    category: 'Kullanıcı',
    description: 'Sunucudaki mesaj ve seviye sıralamasını gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const lb = context.commands.get('leaderboard');
      if (lb) return lb.execute(message, args, context);
    }
  },
  {
    name: 'avatar',
    category: 'Kullanıcı',
    description: 'Etiketlediğiniz kişinin avatarını gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const user = message.mentions.users.first() || message.author;
      const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 1024 });

      const embed = new EmbedBuilder()
        .setTitle(`🖼 ${user.username} Avatarı`)
        .setImage(avatarUrl)
        .setColor(0x3b82f6);

      return message.reply({ embeds: [embed] });
    }
  },
  {
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
  },
  {
    name: 'hesapla',
    category: 'Kullanıcı',
    description: 'Bot belirtilen matematiksel işlemi yapar.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args) {
      const expr = args.join('');
      if (!expr || !/^[0-9+\-*/().\s]+$/.test(expr)) {
        return message.reply('⚠️ Lütfen geçerli bir matematiksel işlem girin (Örn: `e!hesapla 25 * 4 + 10`).');
      }

      try {
        const result = Function(`'use strict'; return (${expr})`)();
        return message.reply(`🧮 **İşlem:** \`${expr}\`\n**Sonuç:** \`${result}\``);
      } catch (e) {
        return message.reply('❌ Matematiksel işlem hesaplanamadı.');
      }
    }
  },
  {
    name: 'kullanıcıbilgi',
    aliases: ['userinfo'],
    category: 'Kullanıcı',
    description: 'Etiketlediğiniz kullanıcının hesap bilgilerini gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
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
  },
  {
    name: 'kurucukim',
    category: 'Kullanıcı',
    description: 'Sunucunun kurucusunu söyler.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const owner = await message.guild.fetchOwner();
      return message.reply(`👑 Sunucu Kurucusu: **${owner.user.tag}** (\`${owner.id}\`)`);
    }
  },
  {
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
  },
  {
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
  },
  {
    name: 'yardım',
    aliases: ['help'],
    category: 'Kullanıcı',
    description: 'Tüm komutları listeler.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const uniqueCommands = new Map();
      for (const [_, cmd] of context.commands) {
        if (!uniqueCommands.has(cmd.name)) {
          uniqueCommands.set(cmd.name, cmd);
        }
      }

      const categories = {};
      for (const [_, cmd] of uniqueCommands) {
        const cat = cmd.category || 'Genel';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
      }

      const embed = new EmbedBuilder()
        .setTitle('📚 EKOYILDIZ BOT KOMUT MENÜSÜ')
        .setDescription('Örnek Kullanım: `e!yardım` veya `e!sistemler`\nHer komutun yetkileri kendine özeldir:')
        .setColor(0x8b5cf6);

      for (const [catName, cmdList] of Object.entries(categories)) {
        let chunk = '';
        let part = 1;

        for (const c of cmdList) {
          const reqPerms = c.userPermissions && c.userPermissions.length > 0 ? ` *(${c.userPermissions.join(', ')})*` : '';
          const line = `• \`e!${c.name}\`: ${c.description}${reqPerms}\n`;

          if (chunk.length + line.length > 950) {
            embed.addFields({ name: `📌 ${catName} Komutları (Bölüm ${part})`, value: chunk });
            chunk = line;
            part++;
          } else {
            chunk += line;
          }
        }

        if (chunk.length > 0) {
          const fieldTitle = part > 1 ? `📌 ${catName} Komutları (Bölüm ${part})` : `📌 ${catName} Komutları`;
          embed.addFields({ name: fieldTitle, value: chunk });
        }
      }

      return message.reply({ embeds: [embed] });
    }
  }
];
