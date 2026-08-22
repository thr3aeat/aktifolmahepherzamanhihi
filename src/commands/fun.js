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

const dailyFacts = [
  { title: '🇹🇷 Türk Tarihi', fact: '1071 Malazgirt Meydan Muharebesi ile Anadolu’nun kapıları Türklere açılmıştır.' },
  { title: '💡 Bilim & Teknoloji', fact: 'İnternet ilk olarak 1969 yılında ARPANET adıyla iki bilgisayar arasındaki veri transferiyle kurulmuştur.' },
  { title: '📜 Tarihten Alıntı', fact: 'Mustafa Kemal Atatürk: "Hayatta en hakiki mürşit ilimdir, fendir."' },
  { title: '🌌 Uzay & Evren', fact: 'Işık hızı saniyede yaklaşık 300.000 kilometredir ve Güneş ışığı Dünya’ya 8 dakika 20 saniyede ulaşır.' },
  { title: '🧠 İlginç Bilgi', fact: 'İnsan beyni yaklaşık 86 milyar nöron içerir ve ortalama 20 watt elektrik enerjisiyle çalışır.' }
];

module.exports = [
  {
    name: '1vs1',
    category: 'Eğlence',
    description: 'Stratejik, kritik vuruşlu ve kalkanlı 1v1 Düello oyunu.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const opponent = message.mentions.members.first();
      if (!opponent || opponent.id === message.author.id || opponent.user.bot) {
        return message.reply('⚠️ Lütfen düello yapmak için geçerli bir kullanıcı etiketleyin!');
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_duel_${message.author.id}`).setLabel('⚔️ Düelloyu Kabul Et').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_duel_${message.author.id}`).setLabel('🏳️ Reddet').setStyle(ButtonStyle.Danger)
      );

      const msg = await message.channel.send({
        content: `⚔️ ${opponent}, ${message.author} seni stratejik 1v1 düelloya davet ediyor!`,
        components: [row]
      });

      const collector = msg.createMessageComponentCollector({ time: 30000 });

      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: '❌ Bu davet sizin için değil.', ephemeral: true });

        if (i.customId.startsWith('reject_duel_')) {
          await i.update({ content: `🏳️ ${opponent.user.tag} düelloyu reddetti.`, components: [] });
          collector.stop();
          return;
        }

        let p1 = { id: message.author.id, name: message.author.username, hp: 100, mana: 50, shield: false };
        let p2 = { id: opponent.id, name: opponent.user.username, hp: 100, mana: 50, shield: false };
        let turnId = p1.id;

        const getBattleEmbed = (lastAction = 'Savaş Başladı!') => new EmbedBuilder()
          .setTitle('⚔️ STRATEJİK 1v1 DÜELLO SAVAŞI')
          .setColor(0xd97706)
          .setDescription(`📜 **Son Hamle:** ${lastAction}\n\n❤️ **${p1.name}:** ${p1.hp} HP | 💧 Mana: ${p1.mana}/50 ${p1.shield ? '🛡️ [Kalkan Aktif]' : ''}\n❤️ **${p2.name}:** ${p2.hp} HP | 💧 Mana: ${p2.mana}/50 ${p2.shield ? '🛡️ [Kalkan Aktif]' : ''}\n\n🎯 **Sıra:** <@${turnId}>`);

        const getActionRow = () => new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('duel_attack').setLabel('💥 Saldır').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('duel_special').setLabel('⚡ Özel Saldırı (30 Mana)').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('duel_shield').setLabel('🛡️ Kalkan Yap').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('duel_heal').setLabel('🧪 İyileş (+15 Mana)').setStyle(ButtonStyle.Primary)
        );

        await i.update({ content: '⚔️ **Düello Başladı!**', embeds: [getBattleEmbed()], components: [getActionRow()] });

        const battleCollector = msg.createMessageComponentCollector({ time: 90000 });

        battleCollector.on('collect', async bi => {
          if (bi.user.id !== turnId) return bi.reply({ content: '❌ Sıra sende değil!', ephemeral: true });

          let attacker = (turnId === p1.id) ? p1 : p2;
          let defender = (turnId === p1.id) ? p2 : p1;
          let actionLog = '';

          if (bi.customId === 'duel_attack') {
            let dmg = Math.floor(Math.random() * 20) + 10;
            const isCrit = Math.random() < 0.15;
            if (isCrit) dmg *= 2;

            if (defender.shield) {
              dmg = Math.floor(dmg / 2);
              defender.shield = false;
              actionLog = `💥 **${attacker.name}** saldırdı! Kalkan hasarı yarıya indirdi (**${dmg} Hasar**)!`;
            } else {
              actionLog = isCrit
                ? `⚡ **KRİTİK VURUŞ!** **${attacker.name}** muazzam vurdu (**${dmg} Hasar**)!`
                : `💥 **${attacker.name}** saldırdı (**${dmg} Hasar**)!`;
            }
            defender.hp = Math.max(0, defender.hp - dmg);
            attacker.mana = Math.min(50, attacker.mana + 5);

          } else if (bi.customId === 'duel_special') {
            if (attacker.mana < 30) {
              return bi.reply({ content: '❌ Yeterli manan yok! (En az 30 Mana gerekli)', ephemeral: true });
            }
            attacker.mana -= 30;
            let dmg = Math.floor(Math.random() * 25) + 25;
            if (defender.shield) {
              dmg = Math.floor(dmg / 2);
              defender.shield = false;
            }
            defender.hp = Math.max(0, defender.hp - dmg);
            actionLog = `⚡ **ÖZEL SALDIRI!** **${attacker.name}** yoldan çıkaran bir büyü yaptı (**${dmg} Hasar**)!`;

          } else if (bi.customId === 'duel_shield') {
            attacker.shield = true;
            actionLog = `🛡️ **${attacker.name}** savunma kalkanını kaldırdı! Gelecek hasar yarıya düşecek.`;

          } else if (bi.customId === 'duel_heal') {
            const heal = Math.floor(Math.random() * 15) + 10;
            attacker.hp = Math.min(100, attacker.hp + heal);
            attacker.mana = Math.min(50, attacker.mana + 15);
            actionLog = `🧪 **${attacker.name}** iksir içti (**+${heal} HP** ve **+15 Mana** kazandı)!`;
          }

          if (p1.hp <= 0 || p2.hp <= 0) {
            const winner = p1.hp > 0 ? message.author : opponent.user;
            await bi.update({
              content: `🏆 **DÜELLO BİTTİ!** Kazanan: **${winner.tag}** 🎉`,
              embeds: [],
              components: []
            });
            battleCollector.stop();
            return;
          }

          turnId = (turnId === p1.id) ? p2.id : p1.id;
          await bi.update({ embeds: [getBattleEmbed(actionLog)], components: [getActionRow()] });
        });

        battleCollector.on('end', (collected, reason) => {
          if (reason !== 'user') {
            msg.edit({ content: '⏱️ **Düello süresi doldu!**', components: [] }).catch(() => { });
          }
        });
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          msg.edit({ content: '⏱️ **Davet zaman aşımına uğradı.**', components: [] }).catch(() => { });
        }
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

      collector.on('end', (collected, reason) => {
        if (lives > 0 && renderWord().includes('\\_')) {
          msg.edit(`⏱️ **Süre doldu!** Doğru kelime: **${word}** idi.`).catch(() => { });
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

      let webhook = null;
      try {
        webhook = await message.channel.createWebhook({
          name: target.displayName,
          avatar: target.user.displayAvatarURL()
        });

        await webhook.send(fakeText);
      } catch (e) {
        return message.channel.send(`💬 **[Sahte Mesaj - ${target.displayName}]:** ${fakeText}`);
      } finally {
        if (webhook) {
          await webhook.delete().catch(() => { });
        }
      }
    }
  },
  {
    name: 'fast',
    category: 'Eğlence',
    description: 'Belirlenen sürede verilen cümleyi en hızlı şekilde yazmaya çalışırsınız.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const words = ['süper hızlı bot', 'discord türkiye sunucusu', 'ekoyıldız harika', 'yazılım geliştirme'];
      const targetWord = words[Math.floor(Math.random() * words.length)];
      const startTime = Date.now();

      await message.reply(`⚡ **Hızlı Yazma Yarışı!**\nAşağıdaki cümleyi ilk yazan kazanır (15 saniye):\n\n👉 **\`${targetWord}\`**`);

      const filter = m => m.content === targetWord;
      const collector = message.channel.createMessageCollector({ filter, time: 15000 });

      collector.on('collect', m => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        const wpm = Math.round((targetWord.split(' ').length / (elapsedSec / 60)));

        m.reply(`🎉 **Tebrikler ${m.author}!** Cümleyi **${elapsedSec} saniyede** yazarak kazandın! ⚡ *(Yazma Hızı: ~${wpm} WPM)*`);
        collector.stop();
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          message.channel.send('⏱️ **Kimse zamanında doğru cümleyi yazamadı!**');
        }
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
    description: 'Rastgele kaç cm olduğunu ölçer ve istatistik verir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const target = message.mentions.users.first() || message.author;

      if (target.bot) {
        return message.reply('🤖 **Ben bir robotum ama siber antenim tam 100 cm!** 📡⚡\n*Pil seviyesi %100, aşırı ısınma koruması devrede!* 🔞');
      }

      const calculateCm = () => Math.floor(Math.random() * 38) + 1;
      const calculateHardness = () => Math.floor(Math.random() * 50) + 51;

      const getStamina = (cm) => {
        if (cm <= 7) return '⚡ 3 Saniye (Erken Final & Nefes Darlığı!)';
        if (cm <= 14) return '⏱️ 15 Dakika (Standart Anadolu Performansı)';
        if (cm <= 22) return '🔥 45 Dakika + Uzatmalar (Çarşaf Yakan!)';
        if (cm <= 30) return '🚀 3 Gün 3 Gece (Efsane Maraton)';
        return '🐉 Şampiyonlar Ligi (Yatak Kırıcı & Deprem Etkisi!)';
      };

      const getTitleAndColor = (cm) => {
        if (cm <= 5) return {
          title: '🔬 Mikroskopik & Fındık Kadar',
          comment: 'Cımbız ve büyüteç olmadan tespit edilemiyor! Rüzgarda uçmasın dikkat et 🤏',
          alert: '⚠️ AFAD ve Arama Kurtarma ekipleri mercekle bölgede!',
          color: 0xef4444
        };
        if (cm <= 11) return {
          title: '🐣 Mütevazı Anadolu Kaplanı',
          comment: 'Niyet çok iyi ama ekipman fındık kadar. Kalbin temiz, önemli olan işlevi! 😌',
          alert: '✅ İdare eder, üzmez ama çok da heyecanlandırmaz.',
          color: 0xf59e0b
        };
        if (cm <= 17) return {
          title: '📏 Altın Milli Ortalama',
          comment: 'Tam bir fiyat/performans ürünü! Utandırmaz, yormaz, çarşafı tatlı tatlı sallar. 🔥',
          alert: '👍 Türkiye standartlarının gurur tablosu.',
          color: 0x10b981
        };
        if (cm <= 24) return {
          title: '🦍 Devasa Yatak Kırıcı',
          comment: 'Ateşli ve tehlikeli! Karşı taraf görünce hafiften tırsıyor ve geri adım atıyor... 💥',
          alert: '🚨 DİKKAT: Çevredeki mobilyalara ve duvara zarar verebilir!',
          color: 0x3b82f6
        };
        if (cm <= 31) return {
          title: '🐍 Çılgın Anakonda',
          comment: 'Doğal afet bölgesi! Komşular sarsıntıdan polise haber verdi, yatak garantisi bitti! 🔞',
          alert: '🔞 18+ Çevredekiler derhal sığınaklara kaçsın!',
          color: 0x8b5cf6
        };
        return {
          title: '🚀 Gökdelen Canavarı / Ruhsatlı Silah',
          comment: 'Polis çevirmede durdurdu, jandarma ruhsat istedi! Yörüngeye fırlatılacak boyutta! 🌌⚡',
          alert: '⚡ EFSANEVİ BOYUT: Kitle imha silahı sayılır!',
          color: 0xec4899
        };
      };

      const makeBar = (cm) => {
        const total = 10;
        const filled = Math.min(total, Math.max(1, Math.round((cm / 40) * total)));
        return '8' + '='.repeat(filled * 2) + 'D 💦';
      };

      const getCondomSize = (cm) => {
        if (cm <= 5) return 'XXS (Parmak Kılıfı Tipi 🤏)';
        if (cm <= 12) return 'S / M (Şirin Standart Beden 📦)';
        if (cm <= 20) return 'L / XL (Mega Beden 🔥)';
        if (cm <= 30) return 'XXXL (Çöp Poşeti / Çuval Tipi 🗑️)';
        return 'Çadır Brandası & Battaniye 🏕️';
      };

      const getSprayDistance = (cm) => {
        if (cm <= 5) return '💧 10 cm (Hafif Sızıntı)';
        if (cm <= 12) return '🎯 1.5 Metre (Hedefi Tam Vuran)';
        if (cm <= 20) return '🧯 10 Metre (Tazyikli İtfaiye Hortumu)';
        if (cm <= 30) return '🌊 50 Metre (Baraj Kapağı Açıldı!)';
        return '🚀 Yörüngeye Kadar (Ay\'ı Vurdu! 🌕)';
      };

      const fantasyPositions = [
        '🚁 Helikopter Vuruşu (%98 Uyum)',
        '🧗‍♂️ Tavandan Sallanmalı Kamikaze (%85 Uyum)',
        '🛌 Klasik Anadolu Misyoneri (%100 Uyum)',
        '🐉 Alevli Ejderha Vuruşu (%90 Uyum)',
        '🏎️ Turbo Geri Vites (%92 Uyum)',
        '🤼 Wrestling Tipi Kilitlenme (%88 Uyum)'
      ];

      const getRandomPosition = () => fantasyPositions[Math.floor(Math.random() * fantasyPositions.length)];

      const createEmbed = (user, cm, bonus = 0) => {
        const info = getTitleAndColor(cm);
        const bar = makeBar(cm);
        const hardness = calculateHardness();
        const stamina = getStamina(cm);
        const condom = getCondomSize(cm);
        const spray = getSprayDistance(cm);
        const position = getRandomPosition();

        return new EmbedBuilder()
          .setTitle(`🍆 KAÇ CM & ULTIMATE PERFORMANS TESTİ - ${user.username}`)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setColor(info.color)
          .addFields(
            { name: '📐 Malafat Boyu', value: `**${cm} cm** ${bonus > 0 ? `*(+${bonus} cm Mavi Hap Effect! 💊)*` : ''}`, inline: true },
            { name: '💎 Sertlik Seviyesi', value: `**%${hardness}** (Çelik Gibi)`, inline: true },
            { name: '⏱️ Dayanıklılık', value: `**${stamina}**`, inline: true },
            { name: '🛡️ Uyumlu Beden', value: `**${condom}**`, inline: true },
            { name: '💦 Tazyik & Menzil', value: `**${spray}**`, inline: true },
            { name: '🍑 Önerilen Fantezi', value: `**${position}**`, inline: true },
            { name: '🏆 Ünvan', value: `**${info.title}**` },
            { name: '💬 Detaylı Yorum', value: info.comment },
            { name: '📢 Durum Raporu', value: info.alert },
            { name: '📊 Görsel Ölçüm', value: `\`${bar}\`` }
          )
          .setFooter({ text: 'EkoYıldız 🔥', iconURL: message.client.user.displayAvatarURL() })
          .setTimestamp();
      };

      let currentCm = calculateCm();
      let hasUsedViagra = false;
      let isOldSystem = false;

      const getNewSystemRow = () => {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`reroll_cm_${message.author.id}`)
            .setLabel('🎲 Yeniden Ölç')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`viagra_cm_${message.author.id}`)
            .setLabel('💊 Mavi Hap (+cm)')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`fantasy_cm_${message.author.id}`)
            .setLabel('🍑 Fantezi Çarkı')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`old_system_cm_${message.author.id}`)
            .setLabel('📜 Eski Sisteme Geç (Sade Metin)')
            .setStyle(ButtonStyle.Secondary)
        );

        if (message.mentions.users.first() && message.mentions.users.first().id !== message.author.id) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`compare_cm_${message.author.id}`)
              .setLabel('⚔️ Düello / Karşılaştır')
              .setStyle(ButtonStyle.Success)
          );
        }
        return row;
      };

      const getOldSystemRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`new_system_cm_${message.author.id}`)
          .setLabel('✨ Yeni Sisteme Geçiş Yap (Zengin Embed)')
          .setStyle(ButtonStyle.Success)
      );

      const embed = createEmbed(target, currentCm);
      const replyMsg = await message.reply({ embeds: [embed], components: [getNewSystemRow()] });
      const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: '❌ Bu butonları sadece komutu kullanan kişi tıklayabilir!', ephemeral: true });
        }

        if (interaction.customId.startsWith('old_system_cm_')) {
          isOldSystem = true;
          await interaction.update({
            content: `📏 **${target.username}** kullanıcısının malafatı tam olarak **${currentCm} cm**! ¯\\_(ツ)_/¯`,
            embeds: [],
            components: [getOldSystemRow()]
          });
        } else if (interaction.customId.startsWith('new_system_cm_')) {
          isOldSystem = false;
          const currentEmbed = createEmbed(target, currentCm);
          await interaction.update({
            content: ' ',
            embeds: [currentEmbed],
            components: [getNewSystemRow()]
          });
        } else if (interaction.customId.startsWith('reroll_cm_')) {
          currentCm = calculateCm();
          hasUsedViagra = false;
          if (isOldSystem) {
            await interaction.update({
              content: `📏 **${target.username}** kullanıcısının malafatı tam olarak **${currentCm} cm**! ¯\\_(ツ)_/¯`,
              embeds: [],
              components: [getOldSystemRow()]
            });
          } else {
            const newEmbed = createEmbed(target, currentCm);
            await interaction.update({ content: ' ', embeds: [newEmbed], components: [getNewSystemRow()] });
          }
        } else if (interaction.customId.startsWith('viagra_cm_')) {
          if (hasUsedViagra) {
            return interaction.reply({ content: '⚠️ **Zaten takviye aldın! Aşırı doz kalp krizine yol açabilir! 💊💀**', ephemeral: true });
          }
          hasUsedViagra = true;
          const bonus = Math.floor(Math.random() * 5) + 3;
          currentCm += bonus;
          if (isOldSystem) {
            await interaction.update({
              content: `📏 **${target.username}** kullanıcısının malafatı Mavi Hap takviyesiyle tam olarak **${currentCm} cm** oldu! 💊🚀 ¯\\_(ツ)_/¯`,
              embeds: [],
              components: [getOldSystemRow()]
            });
          } else {
            const boostedEmbed = createEmbed(target, currentCm, bonus);
            await interaction.update({ content: ' ', embeds: [boostedEmbed], components: [getNewSystemRow()] });
          }
          await interaction.followUp({ content: `💊 **Mavi Hap Etkisini Gösterdi!** Malafat **+${bonus} cm** daha uzadı! 🚀🔥`, ephemeral: true });
        } else if (interaction.customId.startsWith('fantasy_cm_')) {
          const newPos = fantasyPositions[Math.floor(Math.random() * fantasyPositions.length)];
          const fantasyEmbed = new EmbedBuilder()
            .setTitle(`🍑 FANTEZİ ÇARKI - ${target.username}`)
            .setColor(0xec4899)
            .setDescription(`🔥 **Rastgele Fantezi Kartı Çekildi!**\n\n👉 **Bugünün Önerilen Pozisyonu:**\n**${newPos}**\n\n*Partneriniz hazırsa hemen deneyebilirsiniz!* 😉🔞`);
          await interaction.reply({ embeds: [fantasyEmbed], ephemeral: true });
        } else if (interaction.customId.startsWith('compare_cm_')) {
          const user1Cm = currentCm;
          const user2Cm = calculateCm();
          const p1 = target;
          const p2 = message.author;

          const compEmbed = new EmbedBuilder()
            .setTitle('⚔️ KAÇ CM MALAFAT DÜELLOSU')
            .setColor(0xf59e0b)
            .addFields(
              { name: `👤 ${p1.username}`, value: `**${user1Cm} cm**\n\`${makeBar(user1Cm)}\``, inline: true },
              { name: `⚔️ VS`, value: '⚡', inline: true },
              { name: `👤 ${p2.username}`, value: `**${user2Cm} cm**\n\`${makeBar(user2Cm)}\``, inline: true },
              { name: '🏆 Kapışma Sonucu', value: user1Cm > user2Cm ? `🎉 **${p1.username}** heybetiyle **${p2.username}** kişisini ezip geçti!` : (user2Cm > user1Cm ? `🎉 **${p2.username}** devasa boyutuyla **${p1.username}** kişisini nakavt etti!` : '🤝 **Berabere!** İki malafat da eşit boyda çıktı, dostluk kazandı.') }
            );

          await interaction.reply({ embeds: [compEmbed], ephemeral: false });
        }
      });

      collector.on('end', () => {
        const activeRow = isOldSystem ? getOldSystemRow() : getNewSystemRow();
        const disabledRow = new ActionRowBuilder().addComponents(
          activeRow.components.map(b => ButtonBuilder.from(b).setDisabled(true))
        );
        replyMsg.edit({ components: [disabledRow] }).catch(() => { });
      });
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
    description: '4 Şıklı Butonlu Bilgi Yarışması oyunu.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const questionsList = [
        { q: 'Türkiye’nin başkenti neresidir?', options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'], correctIndex: 1 },
        { q: 'Discord hangi yılda piyasaya sürülmüştür?', options: ['2012', '2015', '2018', '2020'], correctIndex: 1 },
        { q: 'Su kaç derecede kaynar (deniz seviyesinde)?', options: ['80°C', '90°C', '100°C', '120°C'], correctIndex: 2 },
        { q: 'Dünyanın en büyük okyanusu hangisidir?', options: ['Atlanti̇k', 'Hi̇nt', 'Büyük (Pasi̇fi̇k)', 'Arkti̇k'], correctIndex: 2 },
        { q: 'Güneş Sistemindeki en büyük gezegen hangisidir?', options: ['Mars', 'Jüpiter', 'Satürn', 'Neptün'], correctIndex: 1 }
      ];

      const item = questionsList[Math.floor(Math.random() * questionsList.length)];
      const optionLabels = ['A', 'B', 'C', 'D'];

      const row = new ActionRowBuilder().addComponents(
        item.options.map((opt, idx) =>
          new ButtonBuilder()
            .setCustomId(`quiz_opt_${idx}`)
            .setLabel(`${optionLabels[idx]}) ${opt}`)
            .setStyle(ButtonStyle.Primary)
        )
      );

      const embed = new EmbedBuilder()
        .setTitle('🧠 4 ŞIKLI BİLGİ YARIŞMASI')
        .setDescription(`❓ **Soru:** ${item.q}\n\n*Aşağıdaki butonlardan doğru şıkkı seçin (15 saniyeniz var)!*`)
        .setColor(0x3b82f6);

      const quizMsg = await message.reply({ embeds: [embed], components: [row] });
      const collector = quizMsg.createMessageComponentCollector({ time: 15000 });

      collector.on('collect', async i => {
        if (i.user.id !== message.author.id) {
          return i.reply({ content: '❌ Bu soruyu sadece komutu başlatan kişi yanıtlayabilir!', ephemeral: true });
        }

        const selectedIndex = parseInt(i.customId.replace('quiz_opt_', ''));
        const isCorrect = selectedIndex === item.correctIndex;

        const updatedRow = new ActionRowBuilder().addComponents(
          item.options.map((opt, idx) => {
            let style = ButtonStyle.Secondary;
            if (idx === item.correctIndex) style = ButtonStyle.Success;
            else if (idx === selectedIndex && !isCorrect) style = ButtonStyle.Danger;

            return new ButtonBuilder()
              .setCustomId(`quiz_disabled_${idx}`)
              .setLabel(`${optionLabels[idx]}) ${opt}`)
              .setStyle(style)
              .setDisabled(true);
          })
        );

        const resultEmbed = new EmbedBuilder()
          .setTitle(isCorrect ? '🎉 TEBRİKLER! DOĞRU CEVAP!' : '❌ YANLIŞ CEVAP!')
          .setDescription(`❓ **Soru:** ${item.q}\n\nDoğru Şık: **${optionLabels[item.correctIndex]}) ${item.options[item.correctIndex]}**`)
          .setColor(isCorrect ? 0x10b981 : 0xef4444);

        await i.update({ embeds: [resultEmbed], components: [updatedRow] });
        collector.stop();
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          const timeoutRow = new ActionRowBuilder().addComponents(
            item.options.map((opt, idx) =>
              new ButtonBuilder()
                .setCustomId(`quiz_timeout_${idx}`)
                .setLabel(`${optionLabels[idx]}) ${opt}`)
                .setStyle(idx === item.correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(true)
            )
          );

          quizMsg.edit({
            content: '⏱️ **Süre doldu!** Doğru cevap yeşil renkle gösterilmiştir.',
            components: [timeoutRow]
          }).catch(() => { });
        }
      });
    }
  },
  {
    name: 'mayıntarlası',
    aliases: ['minesweeper', 'mayin-tarlasi'],
    category: 'Eğlence',
    description: '5x5 Buton Izgaralı Mayın Tarlası Oyunu.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const mines = new Set();
      while (mines.size < 4) {
        mines.add(Math.floor(Math.random() * 25));
      }

      let revealed = new Set();
      let gameOver = false;
      let score = 0;

      const buildGrid = () => {
        const rows = [];
        for (let r = 0; r < 5; r++) {
          const actionRow = new ActionRowBuilder();
          for (let c = 0; c < 5; c++) {
            const index = r * 5 + c;
            const btn = new ButtonBuilder().setCustomId(`mine_${index}`);

            if (revealed.has(index)) {
              if (mines.has(index)) {
                btn.setLabel('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
              } else {
                btn.setLabel('🟩').setStyle(ButtonStyle.Success).setDisabled(true);
              }
            } else {
              if (gameOver) {
                if (mines.has(index)) btn.setLabel('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
                else btn.setLabel('⬛').setStyle(ButtonStyle.Secondary).setDisabled(true);
              } else {
                btn.setLabel('❓').setStyle(ButtonStyle.Secondary);
              }
            }
            actionRow.addComponents(btn);
          }
          rows.push(actionRow);
        }
        return rows;
      };

      const getEmbed = () => new EmbedBuilder()
        .setTitle('💣 MAYIN TARLASI (MINESWEEPER)')
        .setDescription(`🎮 **Mayınlara basmadan kareleri açın!**\n\n🎯 **Skor:** ${score} Puan\n💣 **Kalan Güvenli Kare:** ${21 - revealed.size}`)
        .setColor(0x3b82f6);

      const msg = await message.reply({ embeds: [getEmbed()], components: buildGrid() });
      const collector = msg.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async i => {
        if (i.user.id !== message.author.id) {
          return i.reply({ content: '❌ Bu oyunu sadece komutu başlatan oynayabilir!', ephemeral: true });
        }

        const index = parseInt(i.customId.replace('mine_', ''));
        if (mines.has(index)) {
          gameOver = true;
          revealed.add(index);
          const loseEmbed = new EmbedBuilder()
            .setTitle('💥 BOOM! MAYINA BASTIN!')
            .setDescription(`💀 **Kaybettin!** Toplanan Skor: **${score} Puan**`)
            .setColor(0xef4444);

          await i.update({ embeds: [loseEmbed], components: buildGrid() });
          collector.stop();
        } else {
          revealed.add(index);
          score += 10;

          if (revealed.size === 21) {
            gameOver = true;
            const winEmbed = new EmbedBuilder()
              .setTitle('🏆 TEBRİKLER! TÜM MAYINLARDAN KAÇTIN!')
              .setDescription(`🎉 **Tüm temiz alanları açtın!** Toplam Skor: **${score} Puan**`)
              .setColor(0x10b981);

            await i.update({ embeds: [winEmbed], components: buildGrid() });
            collector.stop();
          } else {
            await i.update({ embeds: [getEmbed()], components: buildGrid() });
          }
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && !gameOver) {
          gameOver = true;
          msg.edit({ content: '⏱️ **Süre doldu! Oyun sonlandı.**', components: buildGrid() }).catch(() => { });
        }
      });
    }
  },
  {
    name: 'slot',
    category: 'Eğlence',
    description: 'Animasyonlu Slot Makinesi oyunu.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const items = ['🍒', '🍋', '💎', '🔔', '7️⃣'];

      const getRandomItem = () => items[Math.floor(Math.random() * items.length)];

      const spinMsg = await message.reply('🎰 **Slot Makinesi Dönüyor...**\n`[ ❓ | ❓ | ❓ ]`');

      setTimeout(async () => {
        const i1 = getRandomItem();
        await spinMsg.edit(`🎰 **Slot Makinesi Dönüyor...**\n\`[ ${i1} | ❓ | ❓ ]\``).catch(() => { });

        setTimeout(async () => {
          const i2 = getRandomItem();
          await spinMsg.edit(`🎰 **Slot Makinesi Dönüyor...**\n\`[ ${i1} | ${i2} | ❓ ]\``).catch(() => { });

          setTimeout(async () => {
            const i3 = getRandomItem();
            const isWin = (i1 === i2 && i2 === i3);
            const isPair = (i1 === i2 || i2 === i3 || i1 === i3);

            let status = '❌ Şansına küs, kazanamadın!';
            let color = 0xef4444;

            if (isWin) {
              status = '🏆 **BÜYÜK İKRAMİYE! 3\'ü DE EŞLEŞTİ! 🎉**';
              color = 0x10b981;
            } else if (isPair) {
              status = '✨ **İkili Eşleşme! Güzel deneme.**';
              color = 0xf59e0b;
            }

            const embed = new EmbedBuilder()
              .setTitle('🎰 SLOT MAKİNESİ SONUCU')
              .setDescription(`\`[ ${i1} | ${i2} | ${i3} ]\`\n\n${status}`)
              .setColor(color);

            await spinMsg.edit({ content: ' ', embeds: [embed] }).catch(() => { });
          }, 1000);
        }, 1000);
      }, 1000);
    }
  },
  {
    name: 'yazıtura',
    category: 'Eğlence',
    description: 'Yazı-Tura atarsınız.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const msg = await message.reply('🪙 **Para havaya atıldı, dönüyor...**');

      setTimeout(async () => {
        const result = Math.random() < 0.5 ? 'YAZI 🪙' : 'TURA 🪙';
        const embed = new EmbedBuilder()
          .setTitle('🪙 YAZI-TURA SONUCU')
          .setDescription(`Para düştü ve gelen sonuç:\n\n👉 **${result}**`)
          .setColor(0xf59e0b);

        await msg.edit({ content: ' ', embeds: [embed] }).catch(() => { });
      }, 1500);
    }
  },
  {
    name: 'gününbilgisi',
    aliases: ['tarih', 'bilgi'],
    category: 'Eğlence',
    description: 'Rastgele tarihi, bilimsel veya kültürel bir bilgi/alıntı gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message) {
      const item = dailyFacts[Math.floor(Math.random() * dailyFacts.length)];
      const embed = new EmbedBuilder()
        .setTitle(item.title)
        .setDescription(`📌 ${item.fact}`)
        .setColor(0x3b82f6)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
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
