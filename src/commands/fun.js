const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const ataturkPhotos = [
  'https://upload.wikimedia.org/wikipedia/commons/a/a8/Ataturk1930s.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/1/18/Mustafa_Kemal_Atat%C3%BCrk_in_1923.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Ataturk_in_1918.jpg/800px-Ataturk_in_1918.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/a0/Mustafa_Kemal_Atat%C3%BCrk_1925.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/2/23/Mustafa_Kemal_Ataturk_1927.jpg'
];

module.exports = [
  {
    name: '1vs1',
    category: 'Eğlence',
    description: 'İstediğiniz kullanıcı ile düello atarsınız.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
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
  },
  {
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

      const msg = await message.reply(`🎮 **Adam Asmaca Başladı!**\n\nKelime: \`${renderWord()}\`\nKalan Hak: **${lives}**\n\n*Harf tahmin etmek için mesaja tek bir harf yazın!*`);

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
          msg.edit(`🎉 **Tebrikler!** Kelimeyi bildiniz: **${word}**`);
          collector.stop();
        } else if (lives <= 0) {
          msg.edit(`💀 **Kaybettiniz!** Doğru kelime: **${word}** idi.`);
          collector.stop();
        } else {
          msg.edit(`🎮 **Adam Asmaca**\n\nKelime: \`${currentDisplay}\`\nKalan Hak: **${lives}**`);
        }
      });
    }
  },
  {
    name: 'aranıyor',
    aliases: ['wanted'],
    category: 'Eğlence',
    description: 'Etiketlediğiniz kişiye aranıyor efekti verir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const user = message.mentions.users.first() || message.author;
      const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

      const embed = new EmbedBuilder()
        .setTitle('🤠 ARANIYOR (WANTED)')
        .setDescription(`**Ödül:** $1,000,000\n**Suçlu:** ${user.tag}`)
        .setImage(`https://api.popcat.xyz/wanted?image=${encodeURIComponent(avatar)}`)
        .setColor(0x78350f);

      return message.reply({ embeds: [embed] });
    }
  },
  {
    name: 'hapishane',
    aliases: ['jail'],
    category: 'Eğlence',
    description: 'Etiketlediğiniz kişiye hapishane efekti verir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const user = message.mentions.users.first() || message.author;
      const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

      const embed = new EmbedBuilder()
        .setTitle('🔒 HAPİSHANE')
        .setDescription(`**Mahkum:** ${user.tag}`)
        .setImage(`https://api.popcat.xyz/jail?image=${encodeURIComponent(avatar)}`)
        .setColor(0x374151);

      return message.reply({ embeds: [embed] });
    }
  },
  {
    name: 'wasted',
    category: 'Eğlence',
    description: 'Etiketlediğiniz kişiye wasted efekti verir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const user = message.mentions.users.first() || message.author;
      const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

      const embed = new EmbedBuilder()
        .setTitle('💀 WASTED')
        .setDescription(`**Etkilenen:** ${user.tag}`)
        .setImage(`https://api.popcat.xyz/bitchslap?image1=${encodeURIComponent(avatar)}&image2=${encodeURIComponent(avatar)}`)
        .setColor(0x991b1b);

      return message.reply({ embeds: [embed] });
    }
  },
  {
    name: 'ship',
    category: 'Eğlence',
    description: 'Bot etiketlediğiniz kişiye karşı olan aşkını ölçer.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    name: 'hackle',
    category: 'Eğlence',
    description: 'Etiketlediğiniz kişiyi hackler.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const target = message.mentions.users.first();
      if (!target) return message.reply('⚠️ Hacklenecek kişiyi etiketleyin!');

      const msg = await message.reply(`💻 **${target.username}** hackleme işlemi başlatılıyor...`);

      setTimeout(() => msg.edit(`🔍 IP Adresi taranıyor... \`192.168.1.${Math.floor(Math.random() * 250)}\``), 1500);
      setTimeout(() => msg.edit(`🔐 Discord şifreleri çekiliyor...`), 3000);
      setTimeout(() => msg.edit(`📧 E-posta hesabı ele geçirildi: \`${target.username}@gmail.com\``), 4500);
      setTimeout(() => msg.edit(`🎉 **${target.username}** başarıyla HACKLENDİ! 💻💥`), 6000);
    }
  },
  {
    name: 'kaçcm',
    aliases: ['kaccm', 'kac-cm', 'kaç-cm', 'cm'],
    category: 'Eğlence',
    description: 'Rastgele kaç cm olduğunu ölçer.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const target = message.mentions.users.first() || message.author;
      const cm = Math.floor(Math.random() * 35) + 1;
      return message.reply(`📏 **${target.username}** kullanıcısının malafatı tam olarak **${cm} cm**! ¯\\_(ツ)_/¯`);
    }
  },
  {
    name: 'kelimeyarışı',
    category: 'Eğlence',
    description: 'Etiketlediğiniz Kişi ile Kelime Yarışı yaparsınız.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  }
];
