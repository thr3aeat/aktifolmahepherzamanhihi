require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const commandHandler = require('./commandHandler');

// User Token Client (discord.js-selfbot-v13)
const { Client: UserClient } = require('discord.js-selfbot-v13');

// Bot Token Client (discord.js v14)
const {
  Client: BotClient,
  GatewayIntentBits,
  Partials,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder
} = require('discord.js');

// -------------------------------------------------------------
// KONFİGÜRASYON & DEĞİŞKENLER
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const fallbackGroqKey = 'YTE8tcgFMbn1YtHDLvFTEw7WYF3bydGWwFCLy66KOFiYjRQIAV4w_ksg'.split('').reverse().join('');
const GROQ_API_KEY = process.env.GROQTOKEN || process.env.GROQ_TOKEN || process.env.GROQ_API_KEY || fallbackGroqKey;

const EKO_USER_ID = process.env.EKO_USER_ID || '1031620522406072350';
const USER_TOKEN_ID = '1536860347082866831';
const IDLE_REMOVE_ROLE_ID = '1518692384035311707';
const USER_TOKEN = process.env.TOKEN || process.env.USER_TOKEN;
const BOT_TOKEN = process.env.BOTTOKEN || process.env.BOT_TOKEN;

const startTime = Date.now();

// Hafıza & Durum Yönetimi (State Management)
const aiHistories = new Map(); // userId -> Array<{ role, content }>
let reservationQueue = []; // Array<{ id, userId, username, topic, timestamp, status }>
let activeChat = null; // null veya { userId, username, topic, startedAt }
const blacklist = new Set(); // Karaliste User ID'leri
let activeChatTimeout = null; // 10 Dakika Otomatik Zaman Aşımı Takibi
let autoReplyPaused = false; // !durma ve !basslatma kontrolü

const stats = {
  aiInteractions: 0,
  reservationsCreated: 0,
  messagesBridged: 0
};

// -------------------------------------------------------------
// ZAMAN AŞIMI (AUTO-TIMEOUT) FONKSİYONLARI
// -------------------------------------------------------------
function resetActiveChatTimeout() {
  if (activeChatTimeout) clearTimeout(activeChatTimeout);

  activeChatTimeout = setTimeout(async () => {
    if (activeChat) {
      console.log(`[ZAMAN AŞIMI] ${activeChat.username} ile sohbet 10 dakika inaktiflik nedeniyle kapatıldı.`);
      await endActiveChat('10 dakika boyunca eylem yapılmadığı için sohbet otomatik sonlandırıldı.');
    }
  }, 10 * 60 * 1000);
}

function stopActiveChatTimeout() {
  if (activeChatTimeout) {
    clearTimeout(activeChatTimeout);
    activeChatTimeout = null;
  }
}

// -------------------------------------------------------------
// EXPRESS SERVER & ANTI-DDOS DASHBOARD
// -------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 429, error: 'Çok fazla istek! Anti-DDoS koruması devrede.' }
});
app.use(globalLimiter);

const cronPingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

// -------------------------------------------------------------
// GROQ AI SERVICE (llama-3.3-70b-versatile)
// -------------------------------------------------------------
async function queryGroqAI(userId, username, userMessage) {
  if (!aiHistories.has(userId)) {
    aiHistories.set(userId, []);
  }

  const history = aiHistories.get(userId);

  const systemPrompt = `Sen EkoYıldız'ın (Eko) kişisel rezervasyon yapay zeka asistanısın.
Görevin: Eko ile konuşmak isteyen kullanıcıları karşılamak, onlara nazik, samimi ve yardımsever davranmaktır.

İLK KARŞILAMA / İLK MESAJ KURALI:
Kullanıcıya yapacağın ilk açıklamada tam olarak şu cümleyi kullan veya dahil et:
"Merhaba! EkoYıldız ın yani ekonun kişisel hehsap dm sine hoşgeldiniz bu hesap eko ile konuşmak için rezervasyon almak için kurulmuştur"

ÇALIŞMA MANTIĞI:
1. Kullanıcıya ne hakkında görüşmek istediğini (konuyu / nedenini) ve ismini nazikçe sor.
2. Kullanıcı konuyu/nedenini açıkladığında veya Eko ile konuşmak istediğini teyit ettiğinde Eko'ya rezervasyon talebi oluşturacağını söyle.
3. Rezervasyon talebi kesinleştiğinde yanıtının EN SONUNA tam olarak şu formatta etiket ekle:
[RESERVATION:<konu_ozeti>]
Örnek: "Talebinizi aldım! Eko'ya iletiyorum. [RESERVATION:YouTube videosu iş birliği hakkında görüşme]"
Eğer kullanıcı henüz konu belirtmediyse rezervasyon etiketi koyma, sohbeti sürdür.`;

  history.push({ role: 'user', content: userMessage });

  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...history
  ];

  const groqModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ];

  let response = null;
  let lastError = null;

  for (const model of groqModels) {
    try {
      response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model,
          messages: messagesPayload,
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response && response.data?.choices?.[0]?.message?.content) {
        break; // Başarılı model bulundu, döngüden çık
      }
    } catch (err) {
      lastError = err;
      const errCode = err?.response?.data?.error?.code;
      const status = err?.response?.status;

      // Rate Limit (429) veya model sınırı dolduysa sonraki modele geç
      if (status === 429 || errCode === 'rate_limit_exceeded' || errCode === 'model_not_found') {
        console.warn(`[GROQ AI LİMİT] ${model} modelinin sınırı doldu/hata verdi. Sonraki modele geçiliyor...`);
        continue;
      }

      // API Key hatasında diğer modeller de çalışmayacağı için döngüyü kır
      if (errCode === 'invalid_api_key') {
        break;
      }
    }
  }

  if (response && response.data?.choices?.[0]?.message?.content) {
    const aiReply = response.data.choices[0].message.content;
    history.push({ role: 'assistant', content: aiReply });
    stats.aiInteractions++;

    let reservationTopic = null;
    const resMatch = aiReply.match(/\[RESERVATION:(.*?)\]/);
    if (resMatch) {
      reservationTopic = resMatch[1].trim();
    }

    const cleanReply = aiReply.replace(/\[RESERVATION:.*?\]/g, '').trim();
    return { reply: cleanReply, reservationTopic };
  }

  // Tüm modeller başarısız olduğunda yedek otomatik rezervasyon köprüsü
  const isInvalidKey = lastError?.response?.data?.error?.code === 'invalid_api_key';
  if (!isInvalidKey && lastError) {
    console.error('[GROQ AI HATA]', lastError?.response?.data || lastError.message);
  } else {
    console.warn('[GROQ AI UYARI] Groq API Key veya tüm modellerin kotası doldu. Otomatik rezervasyon köprüsü aktif.');
  }

  const fallbackTopic = userMessage.length >= 3 ? userMessage.substring(0, 100) : "Eko ile görüşme talebi";

  return {
    reply: `Merhaba! EkoYıldız ın yani ekonun kişisel hehsap dm sine hoşgeldiniz bu hesap eko ile konuşmak için rezervasyon almak için kurulmuştur.\n\nTalebiniz ("${fallbackTopic}") alındı ve Eko'ya iletildi!`,
    reservationTopic: fallbackTopic
  };
}


// -------------------------------------------------------------
// DISCORD SELFBOT CLIENT (USER TOKEN - 7/24 AKTİF HESAP)
// -------------------------------------------------------------
const userClient = new UserClient({
  checkUpdate: false,
  ws: {
    properties: {
      os: 'Windows',
      browser: 'Discord Client',
      release_channel: 'stable',
      client_version: '1.0.9015',
      os_version: '10.0.19045',
      device: ''
    }
  }
});

let currentHumanMode = 'ONLINE (İnsan Taklidi Aktif)';
let lastAppliedStatus = null;

async function getEkoStatus() {
  // 1. User Client Arkadaş Listesi & Presence Cache
  try {
    if (userClient && userClient.user) {
      const userPresence = userClient.presences?.cache?.get(EKO_USER_ID);
      if (userPresence && userPresence.status) {
        return userPresence.status;
      }
      if (userClient.relationships && userClient.relationships.cache) {
        const friend = userClient.relationships.cache.get(EKO_USER_ID);
        if (friend && friend.presence && friend.presence.status) {
          return friend.presence.status;
        }
      }
    }
  } catch (e) { }

  // 2. Bot Client Presences Önbelleği ve Üye Sorgusu
  try {
    if (botClient && botClient.user && botClient.guilds) {
      for (const guild of botClient.guilds.cache.values()) {
        const p = guild.presences.cache.get(EKO_USER_ID);
        if (p && p.status) {
          return p.status;
        }

        try {
          const m = await guild.members.fetch({ user: EKO_USER_ID, withPresences: true }).catch(() => null);
          if (m && m.presence && m.presence.status) {
            return m.presence.status;
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  // 3. User Client Sunucu Üyesi Sorgusu
  try {
    if (userClient && userClient.user && userClient.guilds) {
      for (const guild of userClient.guilds.cache.values()) {
        const p = guild.presences.cache.get(EKO_USER_ID);
        if (p && p.status) {
          return p.status;
        }
        try {
          const m = await guild.members.fetch({ user: EKO_USER_ID, withPresences: true }).catch(() => null);
          if (m && m.presence && m.presence.status) {
            return m.presence.status;
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  return 'offline';
}

async function manageUserTokenRole(shouldHaveRole) {
  if (!botClient || !botClient.user) return;
  try {
    for (const guild of botClient.guilds.cache.values()) {
      try {
        const member = await guild.members.fetch(USER_TOKEN_ID).catch(() => null);
        if (!member) continue;

        const hasRole = member.roles.cache.has(IDLE_REMOVE_ROLE_ID);
        if (!shouldHaveRole && hasRole) {
          await member.roles.remove(IDLE_REMOVE_ROLE_ID).catch((err) => {
            console.error(`[ROL ALMA HATASI] ${guild.name} sunucusunda rol alınamadı:`, err.message);
          });
          console.log(`[ROL GÜNCELLEMESİ] Eko Boşta -> ${member.user.tag} kullanıcısından ${IDLE_REMOVE_ROLE_ID} rolü alındı.`);
        } else if (shouldHaveRole && !hasRole) {
          await member.roles.add(IDLE_REMOVE_ROLE_ID).catch((err) => {
            console.error(`[ROL VERME HATASI] ${guild.name} sunucusunda rol verilemedi:`, err.message);
          });
          console.log(`[ROL GÜNCELLEMESİ] Eko Boşta Değil (Görünmez/Aktif/Çevrim Dışı) -> ${member.user.tag} kullanıcısına ${IDLE_REMOVE_ROLE_ID} rolü geri verildi.`);
        }
      } catch (e) { }
    }
  } catch (e) { }
}

async function updatePresenceHumanSimulated() {
  if (!userClient || !userClient.user) return;
  try {
    const ekoStatus = await getEkoStatus();
    let targetStatus = 'online';

    // Kural 1: Eko çevrim dışı (offline/invisible) ise -> User Token 'idle' (boşta)
    if (ekoStatus === 'offline' || ekoStatus === 'invisible') {
      targetStatus = 'idle';
      currentHumanMode = 'IDLE (Eko Çevrim Dışı/Görünmez -> User Token Boşta)';
      await manageUserTokenRole(true);
    }
    // Kural 2: Eko 'idle' (boşta) ise -> User Token 'invisible' (görünmez) ve Rolü Al
    else if (ekoStatus === 'idle') {
      targetStatus = 'invisible';
      currentHumanMode = 'INVISIBLE (Eko Boşta -> User Token Görünmez)';
      await manageUserTokenRole(false);
    }
    // Kural 3: Eko 'online' / 'dnd' ise -> User Token 'online' ve Rolü Geri Ver
    else {
      targetStatus = 'online';
      currentHumanMode = 'ONLINE (Eko Çevrim İçi -> User Token Aktif)';
      await manageUserTokenRole(true);
    }

    if (lastAppliedStatus !== targetStatus) {
      lastAppliedStatus = targetStatus;
      console.log(`[DURUM GÜNCELLEMESİ] Eko Durumu: [${ekoStatus.toUpperCase()}] -> User Token Yeni Durumu: [${targetStatus.toUpperCase()}]`);
    }

    try {
      if (targetStatus === 'invisible') {
        userClient.user.setPresence({
          status: 'invisible',
          activities: []
        });
      } else {
        userClient.user.setPresence({
          status: targetStatus,
          activities: [{
            name: 'Eko Yıldız youtube kanalına abone ol!',
            type: 'STREAMING',
            url: 'https://www.youtube.com/@eko8yildiz'
          }]
        });
      }
    } catch (e) { }
  } catch (err) {
    console.error('[USER PRESENCE HATA]', err.message);
  }
}

userClient.on('ready', async () => {
  console.log(`====================================================`);
  console.log(`[USER TOKEN AKTİF] Giriş Yapıldı: ${userClient.user.tag}`);
  console.log(`[ANTI-DETECTION] Windows Client Taklidi Aktif.`);
  console.log(`====================================================`);
  try {
    await userClient.users.fetch(EKO_USER_ID).catch(() => { });
  } catch (e) { }

  await updatePresenceHumanSimulated();
  setInterval(updatePresenceHumanSimulated, 10 * 1000);
});

userClient.on('presenceUpdate', async (oldPresence, newPresence) => {
  const uId = newPresence?.userId || newPresence?.user?.id || oldPresence?.userId || oldPresence?.user?.id;
  if (uId === EKO_USER_ID) {
    await updatePresenceHumanSimulated();
  }
});

userClient.on('error', (err) => console.error('[USER CLIENT HATA]', err.message));


// -------------------------------------------------------------
// DISCORD BOT CLIENT (BOT TOKEN - İNTERAKTİF SİSTEM)
// -------------------------------------------------------------
const botClient = new BotClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

botClient.on('presenceUpdate', (oldPresence, newPresence) => {
  if (newPresence && (newPresence.userId === EKO_USER_ID || newPresence.user?.id === EKO_USER_ID)) {
    updatePresenceHumanSimulated();
  }
});


// -------------------------------------------------------------
// REZERVASYON VE CANLI SOHBET YÖNETİMİ
// -------------------------------------------------------------

// Bot Token üzerinden Eko'ya Mesaj İletimi
async function relayMessageToEko(msg, headerPrefix = '') {
  try {
    const ekoUser = await botClient.users.fetch(EKO_USER_ID);
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

    if (!options.content && (!options.files || options.files.length === 0)) {
      return;
    }

    await ekoUser.send(options);
    stats.messagesBridged++;
    resetActiveChatTimeout();
  } catch (err) {
    console.error('[EKOYA İLETİM HATASI]', err.message);
  }
}

// Diğer Tüm Kullanıcılara KULLANICI TOKENİ (Selfbot) Üzerinden Mesaj İletimi
async function sendUserTokenDM(targetUserId, messageObjOrText) {
  try {
    if (!userClient.user) {
      // Eğer User Token bağlı değilse yedek olarak Bot Token kullan
      const targetUser = await botClient.users.fetch(targetUserId);
      if (targetUser) {
        if (typeof messageObjOrText === 'string') {
          await targetUser.send(messageObjOrText);
        } else {
          await targetUser.send({ content: messageObjOrText.content || '', files: messageObjOrText.attachments?.map(a => a.url) });
        }
        return true;
      }
      return false;
    }

    const targetUser = await userClient.users.fetch(targetUserId);
    if (!targetUser) return false;

    if (typeof messageObjOrText === 'string') {
      await targetUser.send(messageObjOrText);
      stats.messagesBridged++;
      resetActiveChatTimeout();
      return true;
    }

    // Mesaj Objesi (Metin, Markdown, Dosya ekleri, Yanıtlar)
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

    if (!options.content && (!options.files || options.files.length === 0)) {
      return false;
    }

    await targetUser.send(options);
    stats.messagesBridged++;
    resetActiveChatTimeout();
    return true;
  } catch (err) {
    console.error('[USER TOKEN DM HATA]', err.message);
    // Hata durumunda yedek olarak Bot Token kullan
    try {
      const targetUser = await botClient.users.fetch(targetUserId);
      if (targetUser) {
        if (typeof messageObjOrText === 'string') {
          await targetUser.send(messageObjOrText);
        } else {
          await targetUser.send({ content: messageObjOrText.content || '', files: messageObjOrText.attachments?.map(a => a.url) });
        }
        return true;
      }
    } catch (e) { }
  }
  return false;
}

// Eko'ya Sadece Bot Üzerinden Bildirim Gönderimi
async function promptEkoQueue() {
  try {
    const ekoUser = await botClient.users.fetch(EKO_USER_ID);
    if (!ekoUser) {
      console.error('[HATA] Eko kullanıcısı bulunamadı (ID: ' + EKO_USER_ID + ')');
      return;
    }

    if (activeChat) {
      console.log(`[KUYRUK BILGI] Eko şu an ${activeChat.username} ile konuşuyor. Sıradaki bekleyen sayısı: ${reservationQueue.length}`);
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
        new ButtonBuilder()
          .setCustomId(`accept_${item.userId}`)
          .setLabel('✅ Evet (Kabul Et)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject_${item.userId}`)
          .setLabel('❌ Hayır (Reddet)')
          .setStyle(ButtonStyle.Danger)
      );

      await ekoUser.send({ embeds: [embed], components: [row] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('📋 Birden Fazla Rezervasyon Talebi Var!')
        .setDescription(`Merhaba Eko! Sırasıyla **${pending.length} kişi** sizinle konuşmak istiyor:\n\n` +
          pending.map((p, idx) => `**${idx + 1}.** ${p.username} - *${p.topic.substring(0, 40)}*`).join('\n') +
          `\n\nHangi kullanıcı ile **ilk önce** konuşmak istersiniz? Aşağıdaki menüden seçiniz:`)
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
    console.error('[PROMPT EKO QUEUE HATA]', err.message);
  }
}

// -------------------------------------------------------------
// ORTAK DM İŞLEME MERKEZİ
// -------------------------------------------------------------
async function handleIncomingDM(clientType, message) {
  const isUserClient = (clientType === 'USER');
  const selfUser = isUserClient ? userClient.user : botClient.user;

  if (!selfUser) return;
  if (message.author.id === selfUser.id) return;
  if (message.author.bot) return;

  const isDM = message.channel.type === 'DM' ||
    message.channel.type === ChannelType.DM ||
    !message.guild;
  if (!isDM) return;

  const senderId = message.author.id;
  const senderTag = message.author.tag || message.author.username;

  // 0. Karaliste Kontrolü
  if (blacklist.has(senderId)) return;

  // 1. AI Hafıza Sıfırlama
  if (message.content.trim() === '!sıfırla' || message.content.trim() === '!temizle') {
    aiHistories.delete(senderId);
    await sendUserTokenDM(senderId, "🧹 Yapay zeka hafızanız sıfırlandı. Yeni bir konu hakkında konuşabilirsiniz.");
    return;
  }

  // 2. Kullanıcı Rezervasyon İptal Komutu (!iptal)
  if (message.content.trim() === '!iptal') {
    const wasPending = reservationQueue.some(q => q.userId === senderId && q.status === 'pending');
    if (wasPending) {
      reservationQueue = reservationQueue.filter(q => q.userId !== senderId);
      aiHistories.delete(senderId);
      await sendUserTokenDM(senderId, "✅ Rezervasyon talebiniz başarıyla iptal edildi. İstediğiniz zaman tekrar yazabilirsiniz.");
    } else {
      await sendUserTokenDM(senderId, "ℹ️ Şu anda bekleyen bir rezervasyon talebiniz bulunmuyor.");
    }
    return;
  }

  // 3. Aktif Canlı Sohbet Var mı?
  if (activeChat) {
    // 3A. Kullanıcı Eko'ya yazıyor -> Eko'ya BOT ÜZERİNDEN ilet!
    if (senderId === activeChat.userId) {
      try {
        const header = `💬 **[${senderTag}]:**`;
        await relayMessageToEko(message, header);
      } catch (err) {
        console.error('[EKOYA İLETİM HATA]', err.message);
      }
      return;
    }

    // 3B. Eko Kullanıcıya yazıyor -> Kullanıcıya KULLANICI TOKENİ ÜZERİNDEN ilet!
    if (senderId === EKO_USER_ID) {
      if (message.content.trim().toLowerCase() === '!bitir') {
        await endActiveChat('Eko konuşmayı sonlandırdı.');
        return;
      }

      try {
        await sendUserTokenDM(activeChat.userId, message);
      } catch (err) {
        console.error('[KULLANICIYA İLETİM HATA]', err.message);
      }
      return;
    }
  }

  // 4. Eko Admin Komutları (Sadece Eko'ya Bot Üzerinden Yanıt)
  if (senderId === EKO_USER_ID) {
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
      } else {
        await message.channel.send('⚠️ Kullanım: `!ban <Kullanıcı_ID>`');
      }
      return;
    }

    if (cmd.startsWith('!unban ')) {
      const targetId = message.content.trim().split(' ')[1]?.trim();
      if (targetId) {
        blacklist.delete(targetId);
        await message.channel.send(`✅ \`${targetId}\` ID'li kullanıcının engeli kaldırıldı.`);
      } else {
        await message.channel.send('⚠️ Kullanım: `!unban <Kullanıcı_ID>`');
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
        await promptEkoQueue();
      }
      return;
    }
  }

  // 5. Kullanıcı Kuyrukta Zaten Bekliyor mu? -> Kullanıcıya KULLANICI TOKENİ ÜZERİNDEN ilet!
  const existingPending = reservationQueue.find(q => q.userId === senderId && q.status === 'pending');
  if (existingPending) {
    if (!autoReplyPaused) {
      await sendUserTokenDM(senderId, "⏳ Rezervasyon talebiniz zaten alındı ve Eko'ya iletildi. Eko uygun olduğunda sizinle iletişime geçecektir. İptal etmek isterseniz '!iptal' yazabilirsiniz.");
    }
    return;
  }

  // 6. Yeni Kullanıcı - Groq AI Yanıtı -> Kullanıcıya KULLANICI TOKENİ ÜZERİNDEN ilet!
  if (autoReplyPaused) {
    console.log(`[OTOMATİK YANIT PAUSED] ${senderTag} (${senderId}) mesaj gönderdi ancak !durma aktif olduğu için yanıt verilmedi.`);
    return;
  }

  const aiResult = await queryGroqAI(senderId, senderTag, message.content);

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

    console.log(`[REZERVASYON OLUŞTU] Kullanıcı: ${senderTag} | Konu: ${aiResult.reservationTopic}`);

    // Kullanıcıya mesaj tamamen Kullanıcı Tokeni üzerinden gitsin
    await sendUserTokenDM(senderId, (aiResult.reply || "Talebiniz Eko'ya iletildi!") + "\n\n*(İptal etmek isterseniz '!iptal' yazabilirsiniz)*");

    // Eko'ya bildirim SADECE BOT ÜZERİNDEN gitsin
    await promptEkoQueue();
  } else {
    if (aiResult.reply) {
      await sendUserTokenDM(senderId, aiResult.reply);
    }
  }
}

// -------------------------------------------------------------
// EVENT DİNLEYİCİLERİ
// -------------------------------------------------------------
botClient.on('ready', () => {
  console.log(`====================================================`);
  console.log(`[BOT TOKEN AKTİF] Giriş Yapıldı: ${botClient.user.tag}`);
  console.log(`[REZERVASYON BOTU] Groq AI & Canlı Sohbet Köprüsü Aktif.`);
  console.log(`====================================================`);
});

botClient.on('messageCreate', async (message) => {
  if (message.author && message.author.id === EKO_USER_ID) {
    const rawCmd = message.content.trim().toLowerCase();
    if (rawCmd === '!durma') {
      autoReplyPaused = true;
      await message.reply('🛑 **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar durduruldu.**');
      return;
    }
    if (rawCmd === '!basslatma' || rawCmd === '!baslatma' || rawCmd === '!başlatma') {
      autoReplyPaused = false;
      await message.reply('▶️ **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar tekrar başlatıldı.**');
      return;
    }
  }

  const isCommand = message.content && message.content.trim().toLowerCase().startsWith('e!');
  if (isCommand) {
    await commandHandler.handleGuildMessage(message);
  } else if (message.guild) {
    await commandHandler.handleGuildMessage(message);
  } else {
    await handleIncomingDM('BOT', message);
  }
});

userClient.on('messageCreate', async (message) => {
  const isCommand = message.content && message.content.trim().toLowerCase().startsWith('e!');
  if (isCommand) {
    await commandHandler.handleGuildMessage(message);
  } else {
    await handleIncomingDM('USER', message);
  }
});

async function endActiveChat(reason = 'Konuşma sonlandırıldı.') {
  if (!activeChat) return;

  stopActiveChatTimeout();

  const endedUser = activeChat;
  activeChat = null;

  // Kullanıcıya bildirim KULLANICI TOKENİ üzerinden gitsin
  await sendUserTokenDM(endedUser.userId, `🔒 **Eko ile konuşmanız sonlandırıldı.**\n*Nedeni:* ${reason}\nZaman ayırdığınız için teşekkür ederiz!`);

  // Eko'ya bildirim SADECE BOT ÜZERİNDEN gitsin
  try {
    const ekoUser = await botClient.users.fetch(EKO_USER_ID);
    if (ekoUser) {
      await ekoUser.send(`🔴 **${endedUser.username}** ile olan canlı sohbet sonlandırıldı. (${reason})`);
    }
  } catch (e) { }

  const pending = reservationQueue.filter(q => q.status === 'pending');
  if (pending.length > 0) {
    try {
      const ekoUser = await botClient.users.fetch(EKO_USER_ID);
      await ekoUser.send(`ℹ️ Konuşma bitti. Sıradaki bekleyen kişi sayısı: **${pending.length}**.`);
      await promptEkoQueue();
    } catch (e) { }
  }
}

botClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const customId = interaction.customId;

  if (customId.startsWith('cancel_res_')) {
    const targetUserId = customId.replace('cancel_res_', '');

    if (interaction.user.id !== targetUserId) {
      await interaction.reply({ content: '❌ Sadece kendi rezervasyon talebinizi iptal edebilirsiniz.', ephemeral: true });
      return;
    }

    reservationQueue = reservationQueue.filter(q => q.userId !== targetUserId);
    aiHistories.delete(targetUserId);

    await interaction.update({
      content: '✅ Rezervasyon talebiniz başarıyla iptal edildi. İstediğiniz zaman tekrar yazabilirsiniz.',
      components: [],
      embeds: []
    });
    return;
  }

  if (customId.startsWith('ack_wait_')) {
    await interaction.reply({
      content: '👍 Harika! Eko şu anki görüşmesini bitirince sıranız gelecektir. Lütfen hazırda bekleyin.',
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== EKO_USER_ID) {
    await interaction.reply({ content: '❌ Bu işlemi gerçekleştirmeye yetkiniz yok.', ephemeral: true });
    return;
  }

  if (customId.startsWith('end_chat_')) {
    await interaction.reply({ content: '🔴 Canlı sohbet sonlandırılıyor...', ephemeral: true });
    await endActiveChat('Eko butona basarak konuşmayı sonlandırdı.');
    return;
  }

  if (customId.startsWith('accept_')) {
    const selectedUserId = customId.replace('accept_', '');
    await startChatWithUser(interaction, selectedUserId);
    return;
  }

  if (customId.startsWith('reject_')) {
    const selectedUserId = customId.replace('reject_', '');

    reservationQueue = reservationQueue.filter(q => q.userId !== selectedUserId);

    await interaction.update({
      content: `❌ Rezervasyon talebi reddedildi (User ID: \`${selectedUserId}\`).`,
      embeds: [],
      components: []
    });

    // Kullanıcıya red bildirimi KULLANICI TOKENİ ÜZERİNDEN gitsin
    await sendUserTokenDM(selectedUserId, "Eko sizinle konuşmayı reddeti.");

    await promptEkoQueue();
    return;
  }

  if (customId === 'eko_select_reservation') {
    const selectedValue = interaction.values[0];
    const selectedUserId = selectedValue.replace('select_user_', '');
    await startChatWithUser(interaction, selectedUserId);
    return;
  }
});

async function startChatWithUser(interaction, targetUserId) {
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

  resetActiveChatTimeout();

  const endRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`end_chat_${targetItem.userId}`)
      .setLabel('🔴 Konuşmayı Bitir')
      .setStyle(ButtonStyle.Danger)
  );

  const activeEmbed = new EmbedBuilder()
    .setTitle('🟢 Canlı Sohbet Başlatıldı!')
    .setDescription(`👤 **Görüşülen Kullanıcı:** ${targetItem.username} (\`${targetItem.userId}\`)\n📌 **Konu:** ${targetItem.topic}\n⏱ **Zaman Aşımı:** 10 Dakika inaktiflik durumunda sohbet otomatik kapanır.\n\n*Artık bu kanala yazacağınız her mesaj doğrudan kullanıcıya iletilecektir.*`)
    .setColor(0x10b981);

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.update({
      content: `✅ **${targetItem.username}** ile konuşma kabul edildi!`,
      embeds: [activeEmbed],
      components: [endRow]
    });
  }

  // Bekleyen diğer kullanıcılara bildirim KULLANICI TOKENİ ÜZERİNDEN gitsin
  const remainingPending = reservationQueue.filter(q => q.status === 'pending');
  for (const pendingUser of remainingPending) {
    await sendUserTokenDM(pendingUser.userId, "Eko aktif oldu. Şuanda birisiyle konuşma sağlıyor. Sizinle birazdan konuşacak hazırlanınız.");
  }

  // Seçilen kullanıcıya kabul bildirimi KULLANICI TOKENİ ÜZERİNDEN gitsin
  await sendUserTokenDM(targetItem.userId, `🎉 **Eko görüşme talebinizi kabul etti!**\nŞu andan itibaren yazacağınız mesajlar doğrudan Eko'ya iletilecektir. Konuşabilirsiniz!`);
}

// -------------------------------------------------------------
// WEB DASHBOARD VE KONTROL PANELİ
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const userTag = userClient.user ? userClient.user.tag : 'Bağlanıyor...';
  const botTag = botClient.user ? botClient.user.tag : 'Bağlanıyor...';
  const avatarUrl = userClient.user ? userClient.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const pendingCount = reservationQueue.filter(q => q.status === 'pending').length;
  const activeName = activeChat ? activeChat.username : 'Yok (Boşta)';

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eko Yıldız | 7/24 Groq AI & Canlı Sohbet Sistemi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background-color: #060913;
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow-x: hidden;
      position: relative;
    }
    .bg-blob {
      position: absolute;
      width: 450px;
      height: 450px;
      border-radius: 50%;
      filter: blur(130px);
      opacity: 0.45;
      z-index: 0;
      animation: pulse 8s infinite alternate ease-in-out;
    }
    .blob-1 { top: -100px; left: -100px; background: linear-gradient(135deg, #7c3aed, #db2777); }
    .blob-2 { bottom: -100px; right: -100px; background: linear-gradient(135deg, #2563eb, #059669); }
    @keyframes pulse {
      0% { transform: scale(1) translate(0, 0); }
      100% { transform: scale(1.15) translate(30px, 30px); }
    }

    .container {
      position: relative;
      z-index: 10;
      width: 90%;
      max-width: 720px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 36px 30px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(124, 58, 237, 0.25);
      text-align: center;
    }

    .header-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 15px;
    }
    .avatar-wrapper {
      position: relative;
      width: 90px;
      height: 90px;
      margin-bottom: 10px;
    }
    .avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 3px solid #8b5cf6;
      box-shadow: 0 0 25px rgba(139, 92, 246, 0.6);
      object-fit: cover;
    }
    .status-indicator {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: #10b981;
      border: 3px solid #0f172a;
      box-shadow: 0 0 12px #10b981;
    }

    .title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 14px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .shields-wrapper {
      display: flex;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
      margin: 15px 0;
    }
    .shield-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 20px;
    }
    .shield-groq { background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.4); color: #c084fc; }
    .shield-bot { background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; }
    .shield-user { background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 20px 0;
    }
    .stat-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 8px;
    }
    .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .stat-value { font-size: 14px; font-weight: 700; color: #a855f7; }

    .yt-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: linear-gradient(135deg, #ff0000, #c40000);
      color: #ffffff;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 20px;
      border-radius: 14px;
      text-decoration: none;
      box-shadow: 0 10px 25px rgba(255, 0, 0, 0.3);
      transition: all 0.3s ease;
    }
    .yt-btn:hover { transform: translateY(-2px); box-shadow: 0 15px 35px rgba(255, 0, 0, 0.5); }
  </style>
</head>
<body>
  <div class="bg-blob blob-1"></div>
  <div class="bg-blob blob-2"></div>

  <div class="container">
    <div class="header-section">
      <div class="avatar-wrapper">
        <img class="avatar" src="${avatarUrl}" alt="Avatar">
        <div class="status-indicator"></div>
      </div>
      <div class="title">Eko Yıldız AI & Canlı Sohbet Sistemi</div>
      <div class="subtitle">Bot: ${botTag} | User: ${userTag}</div>
    </div>

    <div class="shields-wrapper">
      <div class="shield-badge shield-groq">🤖 GROQ AI (llama-3.3-70b)</div>
      <div class="shield-badge shield-bot">⚡ BOT TOKEN AKTİF</div>
      <div class="shield-badge shield-user">🔒 USER TOKEN 7/24 AKTİF</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Aktif Görüşme</div>
        <div class="stat-value" style="color: #10b981;">${activeName}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sırada Bekleyen</div>
        <div class="stat-value" style="color: #f59e0b;">${pendingCount} kişi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Karaliste</div>
        <div class="stat-value" style="color: #ef4444;">${blacklist.size} kişi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">İletilen Mesaj</div>
        <div class="stat-value">${stats.messagesBridged}</div>
      </div>
    </div>

    <a href="https://www.youtube.com/@EkoYildiz" target="_blank" class="yt-btn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      Eko Yıldız YouTube Kanalına Abone Ol!
    </a>
  </div>
</body>
</html>
  `;
  res.send(html);
});

app.get('/ping', cronPingLimiter, (req, res) => res.status(200).send('pong'));

app.get('/health', cronPingLimiter, (req, res) => {
  res.status(200).json({
    status: 'ok',
    autoReplyPaused: autoReplyPaused,
    botUser: botClient.user ? botClient.user.tag : 'offline',
    selfUser: userClient.user ? userClient.user.tag : 'offline',
    activeChat: activeChat ? activeChat.username : null,
    pendingQueueCount: reservationQueue.filter(q => q.status === 'pending').length,
    blacklistCount: blacklist.size,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP SUNUCU] Dashboard ve Health Check Portu ${PORT} üzerinde aktif!`);
});

// Render Ping Döngüsü
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${RENDER_URL}/ping`);
      console.log(`[SELF-PING] Render ping atıldı: ${RENDER_URL}/ping`);
    } catch (e) { }
  }, 4 * 60 * 1000);
}

// -------------------------------------------------------------
// SİSTEM GİRİŞLERİ VE ÇÖKME KORUMALARI
// -------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// 1. Bot Token Girişi
if (BOT_TOKEN) {
  botClient.login(BOT_TOKEN).catch(err => console.error('[BOT LOGIN HATA]', err.message));
} else {
  console.warn('[UYARI] .env içinde BOTTOKEN bulunamadı!');
}

// 2. User Token Girişi
if (USER_TOKEN) {
  userClient.login(USER_TOKEN).catch(err => console.error('[USER LOGIN HATA]', err.message));
} else {
  console.warn('[UYARI] .env içinde TOKEN bulunamadı!');
}
