const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType
} = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const aiService = require('./aiService');

let reservationQueue = []; // Array<{ id, userId, username, topic, timestamp, status }>
let activeChat = null; // null veya { userId, username, topic, startedAt }
const blacklist = new Set(); // Karaliste User ID'leri
let activeChatTimeout = null;
let autoReplyPaused = false;

const stats = {
  aiInteractions: 0,
  reservationsCreated: 0,
  messagesBridged: 0
};

// -------------------------------------------------------------
// ZAMAN AŞIMI (TIMEOUT) YÖNETİMİ
// -------------------------------------------------------------
function resetActiveChatTimeout(client) {
  if (activeChatTimeout) clearTimeout(activeChatTimeout);

  activeChatTimeout = setTimeout(async () => {
    if (activeChat) {
      logger.info('ZAMAN AŞIMI', `${activeChat.username} ile canlı sohbet 10 dakika inaktiflik nedeniyle kapatıldı.`);
      await endActiveChat(client, '10 dakika boyunca işlem yapılmadığı için sohbet otomatik sonlandırıldı.');
    }
  }, config.CHAT_TIMEOUT_MS);
}

function stopActiveChatTimeout() {
  if (activeChatTimeout) {
    clearTimeout(activeChatTimeout);
    activeChatTimeout = null;
  }
}

// -------------------------------------------------------------
// MESAJ İLETİM YARDIMCILARI
// -------------------------------------------------------------
async function relayMessageToEko(client, msg, headerPrefix = '') {
  try {
    const ekoUser = await client.users.fetch(config.EKO_USER_ID);
    if (!ekoUser) return;

    const options = { content: '' };
    let text = msg.content || '';

    if (headerPrefix) {
      options.content = `${headerPrefix}\n${text}`;
    } else {
      options.content = text;
    }

    if (msg.attachments && msg.attachments.size > 0) {
      options.files = msg.attachments.map(att => att.url);
    }

    if (msg.reference && msg.reference.messageId) {
      try {
        const refMsg = await msg.channel.messages.fetch(msg.reference.messageId);
        if (refMsg) {
          options.content = `> 💬 **[Yanıtlanan Mesaj - ${refMsg.author.username}]:** ${refMsg.content || '(Medya/Dosya)'}\n` + options.content;
        }
      } catch (e) { }
    }

    if (!options.content && (!options.files || options.files.length === 0)) return;

    await ekoUser.send(options);
    stats.messagesBridged++;
    resetActiveChatTimeout(client);
  } catch (err) {
    logger.error('EKO İLETİM', 'Mesaj Eko\'ya iletilirken hata:', err);
  }
}

async function sendBotDM(client, targetUserId, messageObjOrText) {
  try {
    const targetUser = await client.users.fetch(targetUserId);
    if (!targetUser) return false;

    if (typeof messageObjOrText === 'string') {
      await targetUser.send(messageObjOrText);
      stats.messagesBridged++;
      resetActiveChatTimeout(client);
      return true;
    }

    const msg = messageObjOrText;
    const options = { content: msg.content || '' };

    if (msg.attachments && msg.attachments.size > 0) {
      options.files = msg.attachments.map(att => att.url);
    }

    if (msg.reference && msg.reference.messageId) {
      try {
        const refMsg = await msg.channel.messages.fetch(msg.reference.messageId);
        if (refMsg) {
          options.content = `> 💬 **[Yanıtlanan Mesaj]:** ${refMsg.content || '(Medya/Dosya)'}\n` + options.content;
        }
      } catch (e) { }
    }

    if (!options.content && (!options.files || options.files.length === 0)) return false;

    await targetUser.send(options);
    stats.messagesBridged++;
    resetActiveChatTimeout(client);
    return true;
  } catch (err) {
    logger.error('KULLANICI DM', `DM gönderilirken hata (${targetUserId}):`, err);
    return false;
  }
}

async function promptEkoQueue(client) {
  try {
    const ekoUser = await client.users.fetch(config.EKO_USER_ID);
    if (!ekoUser) return;

    if (activeChat) {
      logger.info('KUYRUK', `Eko şu an ${activeChat.username} ile görüşüyor. Bekleyen sayısı: ${reservationQueue.length}`);
      return;
    }

    const pending = reservationQueue.filter(q => q.status === 'pending');
    if (pending.length === 0) return;

    if (pending.length === 1) {
      const item = pending[0];
      const embed = new EmbedBuilder()
        .setTitle('📅 Yeni Rezervasyon Talebi!')
        .setDescription(`Merhaba Eko!\n\n👤 **Kullanıcı:** ${item.username} (\`${item.userId}\`)\n📌 **Görüşme Konusu:** ${item.topic}\n⏰ **Talep Zamanı:** <t:${Math.floor(item.timestamp / 1000)}:R>`)
        .setColor(0x8b5cf6)
        .setFooter({ text: 'EkoYıldız Rezervasyon Botu' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_${item.userId}`).setLabel('✅ Evet (Kabul Et)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_${item.userId}`).setLabel('❌ Hayır (Reddet)').setStyle(ButtonStyle.Danger)
      );

      await ekoUser.send({ embeds: [embed], components: [row] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('📋 Birden Fazla Rezervasyon Talebi Var!')
        .setDescription(`Merhaba Eko! Sırasıyla **${pending.length} kişi** sizinle konuşmak istiyor:\n\n` +
          pending.map((p, idx) => `**${idx + 1}.** ${p.username} - *${p.topic.substring(0, 40)}*`).join('\n') +
          `\n\nHangi kullanıcı ile **ilk önce** konuşmak istersiniz?`)
        .setColor(0x3b82f6);

      const selectOptions = pending.slice(0, 25).map(p =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${p.username}`.substring(0, 25))
          .setDescription(`${p.topic}`.substring(0, 50))
          .setValue(`select_user_${p.userId}`)
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('eko_select_reservation')
        .setPlaceholder('Konuşmak istediğiniz kişiyi seçin...')
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      await ekoUser.send({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    logger.error('PROMPT EKO', 'Kuyruk bildiriminde hata:', err);
  }
}

// -------------------------------------------------------------
// CANLI SOHBET BAŞLATMA VE BİTİRME
// -------------------------------------------------------------
async function startChatWithUser(client, interaction, targetUserId) {
  const targetItem = reservationQueue.find(q => q.userId === targetUserId && q.status === 'pending');

  if (!targetItem) {
    await interaction.reply({ content: '⚠️ Bu rezervasyon talebi bulunamadı veya iptal edildi.', ephemeral: true });
    return;
  }

  activeChat = {
    userId: targetItem.userId,
    username: targetItem.username,
    topic: targetItem.topic,
    startedAt: Date.now()
  };

  reservationQueue = reservationQueue.filter(q => q.userId !== targetUserId);
  resetActiveChatTimeout(client);

  const endRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`end_chat_${targetItem.userId}`).setLabel('🔴 Konuşmayı Bitir').setStyle(ButtonStyle.Danger)
  );

  const activeEmbed = new EmbedBuilder()
    .setTitle('🟢 Canlı Sohbet Başlatıldı!')
    .setDescription(`👤 **Görüşülen Kullanıcı:** ${targetItem.username} (\`${targetItem.userId}\`)\n📌 **Konu:** ${targetItem.topic}\n⏱ **Zaman Aşımı:** 10 Dakika inaktiflikte otomatik kapanır.\n\n*Artık bu kanala yazacağınız her mesaj doğrudan kullanıcıya iletilecektir.*`)
    .setColor(0x10b981);

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.update({
      content: `✅ **${targetItem.username}** ile konuşma kabul edildi!`,
      embeds: [activeEmbed],
      components: [endRow]
    });
  }

  const remainingPending = reservationQueue.filter(q => q.status === 'pending');
  for (const pendingUser of remainingPending) {
    await sendBotDM(client, pendingUser.userId, "Eko aktif oldu. Şuanda birisiyle konuşma sağlıyor. Sizinle birazdan konuşacak hazırlanınız.");
  }

  await sendBotDM(client, targetItem.userId, `🎉 **Eko görüşme talebinizi kabul etti!**\nŞu andan itibaren yazacağınız mesajlar doğrudan Eko'ya iletilecektir. Konuşabilirsiniz!`);
}

async function endActiveChat(client, reason = 'Konuşma sonlandırıldı.') {
  if (!activeChat) return;

  stopActiveChatTimeout();
  const endedUser = activeChat;
  activeChat = null;

  await sendBotDM(client, endedUser.userId, `🔒 **Eko ile konuşmanız sonlandırıldı.**\n*Nedeni:* ${reason}\nZaman ayırdığınız için teşekkür ederiz!`);

  try {
    const ekoUser = await client.users.fetch(config.EKO_USER_ID);
    if (ekoUser) {
      await ekoUser.send(`🔴 **${endedUser.username}** ile olan canlı sohbet sonlandırıldı. (${reason})`);
    }
  } catch (e) { }

  const pending = reservationQueue.filter(q => q.status === 'pending');
  if (pending.length > 0) {
    try {
      const ekoUser = await client.users.fetch(config.EKO_USER_ID);
      await ekoUser.send(`ℹ️ Konuşma bitti. Sıradaki bekleyen kişi sayısı: **${pending.length}**.`);
      await promptEkoQueue(client);
    } catch (e) { }
  }
}

// -------------------------------------------------------------
// DM İŞLEYİCİSİ (INCOMING DM)
// -------------------------------------------------------------
async function handleIncomingDM(client, message) {
  if (!client.user || message.author.id === client.user.id || message.author.bot) return;

  const isDM = message.channel.type === 'DM' || message.channel.type === ChannelType.DM || !message.guild;
  if (!isDM) return;

  const senderId = message.author.id;
  const senderTag = message.author.tag || message.author.username;

  // 0. Karaliste
  if (blacklist.has(senderId)) return;

  // 1. Sıfırlama
  if (message.content.trim() === '!sıfırla' || message.content.trim() === '!temizle') {
    aiService.clearUserHistory(senderId);
    await sendBotDM(client, senderId, "🧹 Yapay zeka hafızanız sıfırlandı. Yeni bir konu hakkında konuşabilirsiniz.");
    return;
  }

  // 2. İptal
  if (message.content.trim() === '!iptal') {
    const wasPending = reservationQueue.some(q => q.userId === senderId && q.status === 'pending');
    if (wasPending) {
      reservationQueue = reservationQueue.filter(q => q.userId !== senderId);
      aiService.clearUserHistory(senderId);
      await sendBotDM(client, senderId, "✅ Rezervasyon talebiniz başarıyla iptal edildi. İstediğiniz zaman tekrar yazabilirsiniz.");
    } else {
      await sendBotDM(client, senderId, "ℹ️ Şu anda bekleyen bir rezervasyon talebiniz bulunmuyor.");
    }
    return;
  }

  // 3. Canlı Sohbet Köprüsü
  if (activeChat) {
    if (senderId === activeChat.userId) {
      await relayMessageToEko(client, message, `💬 **[${senderTag}]:**`);
      return;
    }

    if (senderId === config.EKO_USER_ID) {
      if (message.content.trim().toLowerCase() === '!bitir') {
        await endActiveChat(client, 'Eko konuşmayı sonlandırdı.');
        return;
      }
      await sendBotDM(client, activeChat.userId, message);
      return;
    }
  }

  // 4. Eko Yönetici Komutları
  if (senderId === config.EKO_USER_ID) {
    const cmd = message.content.trim().toLowerCase();

    if (cmd === '!durma') {
      autoReplyPaused = true;
      await message.channel.send('🛑 **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar durduruldu.**');
      return;
    }

    if (cmd === '!basslatma' || cmd === '!baslatma' || cmd === '!başlatma') {
      autoReplyPaused = false;
      await message.channel.send('▶️ **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar tekrar başlatıldı.**');
      return;
    }

    if (cmd.startsWith('!ban ')) {
      const targetId = message.content.trim().split(' ')[1]?.trim();
      if (targetId) {
        blacklist.add(targetId);
        await message.channel.send(`🚫 \`${targetId}\` ID'li kullanıcı karalisteye alındı.`);
      }
      return;
    }

    if (cmd.startsWith('!unban ')) {
      const targetId = message.content.trim().split(' ')[1]?.trim();
      if (targetId) {
        blacklist.delete(targetId);
        await message.channel.send(`✅ \`${targetId}\` ID'li kullanıcının engeli kaldırıldı.`);
      }
      return;
    }

    if (cmd === '!temizlekuyruk') {
      reservationQueue = [];
      await message.channel.send('🧹 Bekleyen tüm rezervasyon kuyruğu temizlendi.');
      return;
    }

    if (cmd === '!istatistik') {
      const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);

      const text = `📊 **EkoYıldız Sistem İstatistikleri**\n` +
        `⏱ **Uptime:** ${hours}s ${mins}d\n` +
        `💾 **RAM:** ${memUsage} MB\n` +
        `🛑 **Oto Selam / AI Durumu:** ${autoReplyPaused ? 'DURDURULDU (!durma)' : 'AKTİF (!basslatma)'}\n` +
        `📋 **Kuyruk:** ${reservationQueue.filter(q => q.status === 'pending').length} kişi\n` +
        `🟢 **Aktif Sohbet:** ${activeChat ? activeChat.username : 'Yok'}\n` +
        `🤖 **AI Etkileşimi:** ${stats.aiInteractions}\n` +
        `💬 **İletilen Mesaj:** ${stats.messagesBridged}\n` +
        `🚫 **Karaliste:** ${blacklist.size} kişi`;

      await message.channel.send(text);
      return;
    }

    if (cmd === '!kuyruk') {
      const pending = reservationQueue.filter(q => q.status === 'pending');
      await message.channel.send(`📋 Bekleyen rezervasyon sayısı: **${pending.length}**`);
      if (pending.length > 0) {
        await promptEkoQueue(client);
      }
      return;
    }
  }

  // 5. Kuyrukta Bekleyen Kullanıcı
  const existingPending = reservationQueue.find(q => q.userId === senderId && q.status === 'pending');
  if (existingPending) {
    if (!autoReplyPaused) {
      await sendBotDM(client, senderId, "⏳ Rezervasyon talebiniz zaten alındı ve Eko'ya iletildi. Eko uygun olduğunda sizinle iletişime geçecektir. İptal etmek isterseniz '!iptal' yazabilirsiniz.");
    }
    return;
  }

  // 6. Groq AI Karşılama ve Rezervasyon
  if (autoReplyPaused) return;

  const aiResult = await aiService.queryGroqAI(senderId, senderTag, message.content);

  if (aiResult.reservationTopic) {
    const newReservation = {
      id: `res_${Date.now()}`,
      userId: senderId,
      username: senderTag,
      topic: aiResult.reservationTopic,
      timestamp: Date.now(),
      status: 'pending'
    };

    reservationQueue.push(newReservation);
    stats.reservationsCreated++;

    logger.success('REZERVASYON', `Yeni rezervasyon: ${senderTag} -> ${aiResult.reservationTopic}`);
    await sendBotDM(client, senderId, (aiResult.reply || "Talebiniz Eko'ya iletildi!") + "\n\n*(İptal etmek isterseniz '!iptal' yazabilirsiniz)*");
    await promptEkoQueue(client);
  } else if (aiResult.reply) {
    await sendBotDM(client, senderId, aiResult.reply);
  }
}

// -------------------------------------------------------------
// BUTON VE SELECT MENU ETKİLEŞİMLERİ (INTERACTION)
// -------------------------------------------------------------
async function handleInteraction(client, interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const customId = interaction.customId;

  if (customId.startsWith('cancel_res_')) {
    const targetUserId = customId.replace('cancel_res_', '');
    if (interaction.user.id !== targetUserId) {
      await interaction.reply({ content: '❌ Sadece kendi rezervasyonunuzu iptal edebilirsiniz.', ephemeral: true });
      return;
    }
    reservationQueue = reservationQueue.filter(q => q.userId !== targetUserId);
    aiService.clearUserHistory(targetUserId);
    await interaction.update({ content: '✅ Rezervasyon iptal edildi.', components: [], embeds: [] });
    return;
  }

  if (customId.startsWith('ack_wait_')) {
    await interaction.reply({ content: '👍 Eko görüşmesini bitirince sıranız gelecektir.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== config.EKO_USER_ID) {
    await interaction.reply({ content: '❌ Bu işlemi gerçekleştirme yetkiniz yok.', ephemeral: true });
    return;
  }

  if (customId.startsWith('end_chat_')) {
    await interaction.reply({ content: '🔴 Canlı sohbet sonlandırılıyor...', ephemeral: true });
    await endActiveChat(client, 'Eko butona basarak konuşmayı sonlandırdı.');
    return;
  }

  if (customId.startsWith('accept_')) {
    const selectedUserId = customId.replace('accept_', '');
    await startChatWithUser(client, interaction, selectedUserId);
    return;
  }

  if (customId.startsWith('reject_')) {
    const selectedUserId = customId.replace('reject_', '');
    reservationQueue = reservationQueue.filter(q => q.userId !== selectedUserId);
    await interaction.update({ content: `❌ Rezervasyon reddedildi (\`${selectedUserId}\`).`, embeds: [], components: [] });
    await sendBotDM(client, selectedUserId, "Eko sizinle konuşmayı reddetti.");
    await promptEkoQueue(client);
    return;
  }

  if (customId === 'eko_select_reservation') {
    const selectedUserId = interaction.values[0].replace('select_user_', '');
    await startChatWithUser(client, interaction, selectedUserId);
    return;
  }
}

module.exports = {
  handleIncomingDM,
  handleInteraction,
  getQueue: () => reservationQueue,
  getActiveChat: () => activeChat,
  getBlacklist: () => blacklist,
  getStats: () => stats,
  isAutoReplyPaused: () => autoReplyPaused
};
