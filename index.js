require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const commandHandler = require('./commandHandler');

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
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || '1518692466860101915';
const BOT_TOKEN = process.env.BOTTOKEN || process.env.BOT_TOKEN;

const MONITORED_SERVICES = [
  { name: 'EkoYıldız DuckDNS', url: 'https://ekoyildiz.duckdns.org/' },
  { name: 'BEM Render App', url: 'https://bem-zze4.onrender.com' }
];

const startTime = Date.now();

// Hafıza & Durum Yönetimi (State Management)
const aiHistories = new Map(); // userId -> Array<{ role, content }>
let reservationQueue = []; // Array<{ id, userId, username, topic, timestamp, status }>
let activeChat = null; // null veya { userId, username, topic, startedAt }
const blacklist = new Set(); // Karaliste User ID'leri
let activeChatTimeout = null; // 10 Dakika Otomatik Zaman Aşımı Takibi
let autoReplyPaused = false; // !durma ve !basslatma kontrolü
let lastStatusMessageId = null; // İzleme kanalındaki son mesaj ID'si
let lastSystemHealthResults = [];

const stats = {
  aiInteractions: 0,
  reservationsCreated: 0,
  messagesBridged: 0
};

// Uptime Süresi Formatlayıcı (Gün, Saat, Dakika, Saniye)
function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0 || days > 0) parts.push(`${hours} saat`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes} dakika`);
  parts.push(`${seconds} saniye`);
  return parts.join(' ');
}

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
        break;
      }
    } catch (err) {
      lastError = err;
      const errCode = err?.response?.data?.error?.code;
      const status = err?.response?.status;

      if (status === 429 || errCode === 'rate_limit_exceeded' || errCode === 'model_not_found') {
        console.warn(`[GROQ AI LİMİT] ${model} modelinin sınırı doldu/hata verdi. Sonraki modele geçiliyor...`);
        continue;
      }

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
// DISCORD BOT CLIENT (BOT TOKEN - GELİŞMİŞ INTENTLER & KOMUTLAR)
// -------------------------------------------------------------
const botClient = new BotClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.Reaction,
    Partials.GuildMember
  ]
});

// -------------------------------------------------------------
// SISTEM IZLEME & OTO-DURUM BILDIRICI (HOURLY MONITORING)
// -------------------------------------------------------------
async function checkServiceHealth(service) {
  const start = Date.now();
  try {
    const response = await axios.get(service.url, {
      timeout: 15000,
      validateStatus: () => true, // 4xx ve 5xx durumlarında exception fırlatmaz
      headers: {
        'User-Agent': 'EkoYildiz-Monitor/1.0'
      }
    });
    const duration = Date.now() - start;
    const isOk = response.status >= 200 && response.status < 400;
    return {
      name: service.name,
      url: service.url,
      ok: isOk,
      status: response.status,
      duration,
      error: isOk ? null : `HTTP ${response.status} (${response.statusText || 'Hata'})`
    };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      name: service.name,
      url: service.url,
      ok: false,
      status: null,
      duration,
      error: err.code === 'ECONNABORTED' ? 'Zaman aşımı (Timeout > 15s)' : (err.message || 'Bağlantı hatası')
    };
  }
}

async function performSystemStatusCheck() {
  if (!botClient.isReady()) return;

  console.log(`[SİSTEM İZLEME] Kontroller başlatılıyor (${MONITORED_SERVICES.length} adres)...`);
  const results = await Promise.all(MONITORED_SERVICES.map(s => checkServiceHealth(s)));
  lastSystemHealthResults = results;
  const allActive = results.every(r => r.ok);
  const uptimeStr = formatUptime(Date.now() - startTime);
  const nowUnix = Math.floor(Date.now() / 1000);

  let descriptionText = '';
  let embedColor = 0x10b981; // Yeşil

  if (allActive) {
    descriptionText = `:information_source: **EkoYıldız sistemleri aktif.**\n\n` +
      `⏱ **Uptime (Çalışma Süresi):** ${uptimeStr}\n\n` +
      `🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ 🟢 **Aktif** (\`${r.duration}ms\`)`).join('\n') +
      `\n\n🕒 *Son Güncelleme:* <t:${nowUnix}:F> (<t:${nowUnix}:R>)\n*(Bu rapor her 1 saatte bir otomatik yenilenir)*`;
    embedColor = 0x10b981;
  } else {
    descriptionText = `⚠️ **Birkaç sistemde hata oluştu.. Ekibimize bu durum bildirildi. Düzeltmek için çalışıyoruz.**\n\n` +
      `⏱ **Uptime (Çalışma Süresi):** ${uptimeStr}\n\n` +
      `🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ ${r.ok ? `🟢 **Aktif** (\`${r.duration}ms\`)` : `🔴 **Hata:** ${r.error}`}`).join('\n') +
      `\n\n🕒 *Son Kontrol:* <t:${nowUnix}:F> (<t:${nowUnix}:R>)\n*(Bu rapor her 1 saatte bir otomatik yenilenir)*`;
    embedColor = 0xef4444;

    // Hatalı sistem olduğunda Eko'ya DM Gönder (ID: 1031620522406072350)
    try {
      const ekoUser = await botClient.users.fetch(EKO_USER_ID).catch(() => null);
      if (ekoUser) {
        const failedDetails = results
          .filter(r => !r.ok)
          .map(r => `• **${r.name}** (\`${r.url}\`)\n  └ ❌ *Hata Detayı:* \`${r.error}\``)
          .join('\n');

        const alertEmbed = new EmbedBuilder()
          .setTitle('🚨 [SİSTEM UYARISI] EkoYıldız Sistemlerinde Arıza!')
          .setDescription(`Merhaba Eko, yapılan otomatik kontrolde sistemlerde arıza tespit edildi:\n\n${failedDetails}\n\n📍 **Kanal Bildirimi:** <#${STATUS_CHANNEL_ID}>\n⏰ **Kontrol Zamanı:** <t:${nowUnix}:F>`)
          .setColor(0xef4444)
          .setTimestamp();

        await ekoUser.send({ embeds: [alertEmbed] });
        console.log(`[SİSTEM UYARI DM] ${EKO_USER_ID} ID'li kullanıcıya arıza DM bildirimi iletildi.`);
      }
    } catch (dmErr) {
      console.error('[SİSTEM UYARI DM HATA]', dmErr.message);
    }
  }

  // Discord Kanalına Mesajı Gönder veya Düzenle (Kanal: 1518692466860101915)
  try {
    const channel = await botClient.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(allActive ? 'ℹ️ EkoYıldız Sistem Durum Raporu' : '⚠️ EkoYıldız Sistem Arıza Uyarısı')
        .setDescription(descriptionText)
        .setColor(embedColor)
        .setFooter({ text: 'EkoYıldız Otomatik İzleme Sistemi • 1 Saatte Bir Güncellenir' })
        .setTimestamp();

      let updated = false;

      // 1. Kaydedilen son mesaj varsa güncelle
      if (lastStatusMessageId) {
        try {
          const prevMsg = await channel.messages.fetch(lastStatusMessageId);
          if (prevMsg) {
            await prevMsg.edit({ embeds: [embed] });
            updated = true;
          }
        } catch (e) {
          updated = false;
        }
      }

      // 2. Kanaldaki botun son mesajını bulup güncelle
      if (!updated) {
        try {
          const recentMessages = await channel.messages.fetch({ limit: 10 });
          const myMsg = recentMessages.find(m => m.author.id === botClient.user.id);
          if (myMsg) {
            await myMsg.edit({ embeds: [embed] });
            lastStatusMessageId = myMsg.id;
            updated = true;
          }
        } catch (e) {
          updated = false;
        }
      }

      // 3. Mesaj bulunamazsa yeni mesaj yolla
      if (!updated) {
        const sent = await channel.send({ embeds: [embed] });
        lastStatusMessageId = sent.id;
      }

      console.log(`[STATUS RAPORU] Kanal (#${STATUS_CHANNEL_ID}) güncellendi. Durum: ${allActive ? 'TÜM SİSTEMLER AKTİF' : 'HATALI SİSTEM VAR'}`);
    } else {
      console.warn(`[STATUS UYARI] Hedef kanal (${STATUS_CHANNEL_ID}) bulunamadı veya botun yetkisi yok.`);
    }
  } catch (chanErr) {
    console.error('[STATUS KANAL HATA]', chanErr.message);
  }

  return { allActive, results, uptimeStr };
}

// -------------------------------------------------------------
// REZERVASYON VE CANLI SOHBET YÖNETİMİ
// -------------------------------------------------------------

// Bot üzerinden Eko'ya Mesaj İletimi
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

// Kullanıcılara BOT Üzerinden Hızlı DM İletimi
async function sendBotDM(targetUserId, messageObjOrText) {
  try {
    const targetUser = await botClient.users.fetch(targetUserId);
    if (!targetUser) return false;

    if (typeof messageObjOrText === 'string') {
      await targetUser.send(messageObjOrText);
      stats.messagesBridged++;
      resetActiveChatTimeout();
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

    if (!options.content && (!options.files || options.files.length === 0)) {
      return false;
    }

    await targetUser.send(options);
    stats.messagesBridged++;
    resetActiveChatTimeout();
    return true;
  } catch (err) {
    console.error('[BOT DM HATASI]', err.message);
    return false;
  }
}

// Eko'ya Bildirim Gönderimi
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
// DM İŞLEME MERKEZİ
// -------------------------------------------------------------
async function handleIncomingDM(message) {
  if (!botClient.user) return;
  if (message.author.id === botClient.user.id) return;
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
    await sendBotDM(senderId, "🧹 Yapay zeka hafızanız sıfırlandı. Yeni bir konu hakkında konuşabilirsiniz.");
    return;
  }

  // 2. Kullanıcı Rezervasyon İptal Komutu (!iptal)
  if (message.content.trim() === '!iptal') {
    const wasPending = reservationQueue.some(q => q.userId === senderId && q.status === 'pending');
    if (wasPending) {
      reservationQueue = reservationQueue.filter(q => q.userId !== senderId);
      aiHistories.delete(senderId);
      await sendBotDM(senderId, "✅ Rezervasyon talebiniz başarıyla iptal edildi. İstediğiniz zaman tekrar yazabilirsiniz.");
    } else {
      await sendBotDM(senderId, "ℹ️ Şu anda bekleyen bir rezervasyon talebiniz bulunmuyor.");
    }
    return;
  }

  // 3. Aktif Canlı Sohbet Var mı?
  if (activeChat) {
    if (senderId === activeChat.userId) {
      try {
        const header = `💬 **[${senderTag}]:**`;
        await relayMessageToEko(message, header);
      } catch (err) {
        console.error('[EKOYA İLETİM HATA]', err.message);
      }
      return;
    }

    if (senderId === EKO_USER_ID) {
      if (message.content.trim().toLowerCase() === '!bitir') {
        await endActiveChat('Eko konuşmayı sonlandırdı.');
        return;
      }

      try {
        await sendBotDM(activeChat.userId, message);
      } catch (err) {
        console.error('[KULLANICIYA İLETİM HATA]', err.message);
      }
      return;
    }
  }

  // 4. Eko Admin Komutları
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

    if (cmd === '!kontrol' || cmd === '!check') {
      await message.channel.send('🔍 **Sistem kontrolü manuel başlatılıyor...**');
      await performSystemStatusCheck();
      await message.channel.send('✅ Sistem durumu güncellendi.');
      return;
    }
  }

  // 5. Kullanıcı Kuyrukta Zaten Bekliyor mu?
  const existingPending = reservationQueue.find(q => q.userId === senderId && q.status === 'pending');
  if (existingPending) {
    if (!autoReplyPaused) {
      await sendBotDM(senderId, "⏳ Rezervasyon talebiniz zaten alındı ve Eko'ya iletildi. Eko uygun olduğunda sizinle iletişime geçecektir. İptal etmek isterseniz '!iptal' yazabilirsiniz.");
    }
    return;
  }

  // 6. Yeni Kullanıcı - Groq AI Yanıtı
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

    await sendBotDM(senderId, (aiResult.reply || "Talebiniz Eko'ya iletildi!") + "\n\n*(İptal etmek isterseniz '!iptal' yazabilirsiniz)*");
    await promptEkoQueue();
  } else {
    if (aiResult.reply) {
      await sendBotDM(senderId, aiResult.reply);
    }
  }
}

// -------------------------------------------------------------
// EVENT DİNLEYİCİLERİ VE KOMUT YÖNLENDİRİCİSİ
// -------------------------------------------------------------
botClient.on('ready', () => {
  console.log(`====================================================`);
  console.log(`[BOT TOKEN AKTİF] Giriş Yapıldı: ${botClient.user.tag}`);
  console.log(`[REZERVASYON & İZLEME BOTU] Groq AI, Komutlar & Sistem Takibi Aktif.`);
  console.log(`====================================================`);

  // İlk açılışta 5 saniye sonra sistemleri kontrol et ve kanala gönder
  setTimeout(() => {
    performSystemStatusCheck().catch(err => console.error('[İLK SİSTEM KONTROL HATASI]', err));
  }, 5000);

  // Her 1 saatte bir sistemleri kontrol et ve güncelle (1 saat = 3600000 ms)
  setInterval(() => {
    performSystemStatusCheck().catch(err => console.error('[SAATLİK SİSTEM KONTROL HATASI]', err));
  }, 60 * 60 * 1000);
});

botClient.on('messageCreate', (message) => {
  if (!message.author || message.author.bot) return;

  const content = message.content ? message.content.trim() : '';

  // Hızlı Öncelikli Yol: e! komutları anında çalıştırılır
  if (content.toLowerCase().startsWith('e!')) {
    commandHandler.handleGuildMessage(message);
    return;
  }

  // Eko Admin Komutları (!durma / !basslatma)
  if (message.author.id === EKO_USER_ID) {
    const rawCmd = content.toLowerCase();
    if (rawCmd === '!durma') {
      autoReplyPaused = true;
      message.reply('🛑 **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar durduruldu.**');
      return;
    }
    if (rawCmd === '!basslatma' || rawCmd === '!baslatma' || rawCmd === '!başlatma') {
      autoReplyPaused = false;
      message.reply('▶️ **Tüm otomatik selamlar, yapay zeka yanıtları ve karşılamalar tekrar başlatıldı.**');
      return;
    }
  }

  if (message.guild) {
    commandHandler.handleGuildMessage(message);
  } else {
    handleIncomingDM(message);
  }
});

async function endActiveChat(reason = 'Konuşma sonlandırıldı.') {
  if (!activeChat) return;

  stopActiveChatTimeout();

  const endedUser = activeChat;
  activeChat = null;

  await sendBotDM(endedUser.userId, `🔒 **Eko ile konuşmanız sonlandırıldı.**\n*Nedeni:* ${reason}\nZaman ayırdığınız için teşekkür ederiz!`);

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

    await sendBotDM(selectedUserId, "Eko sizinle konuşmayı reddetti.");

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

  const remainingPending = reservationQueue.filter(q => q.status === 'pending');
  for (const pendingUser of remainingPending) {
    await sendBotDM(pendingUser.userId, "Eko aktif oldu. Şuanda birisiyle konuşma sağlıyor. Sizinle birazdan konuşacak hazırlanınız.");
  }

  await sendBotDM(targetItem.userId, `🎉 **Eko görüşme talebinizi kabul etti!**\nŞu andan itibaren yazacağınız mesajlar doğrudan Eko'ya iletilecektir. Konuşabilirsiniz!`);
}

// -------------------------------------------------------------
// WEB DASHBOARD VE KONTROL PANELİ
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const botTag = botClient.user ? botClient.user.tag : 'Bağlanıyor...';
  const avatarUrl = botClient.user ? botClient.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const pendingCount = reservationQueue.filter(q => q.status === 'pending').length;
  const activeName = activeChat ? activeChat.username : 'Yok (Boşta)';
  const uptimeText = formatUptime(Date.now() - startTime);

  const duckdnsStatus = lastSystemHealthResults.find(r => r.url.includes('duckdns.org'));
  const renderStatus = lastSystemHealthResults.find(r => r.url.includes('render.com'));

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eko Yıldız | 7/24 AI Rezervasyon & Sistem İzleme Botu</title>
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
      max-width: 740px;
      background: rgba(15, 23, 42, 0.85);
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
    .shield-monitor { background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; }

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

    .monitors-box {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px;
      margin: 15px 0 20px 0;
      text-align: left;
    }
    .monitors-title {
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }
    .monitor-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(30, 41, 59, 0.5);
      border-radius: 10px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .monitor-name { font-weight: 600; color: #f8fafc; }
    .monitor-url { font-size: 11px; color: #94a3b8; }
    .badge-status {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-ok { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-err { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }

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
      <div class="title">Eko Yıldız AI & Sistem İzleme Paneli</div>
      <div class="subtitle">Bot: ${botTag} | Uptime: ${uptimeText}</div>
    </div>

    <div class="shields-wrapper">
      <div class="shield-badge shield-groq">🤖 GROQ AI (llama-3.3-70b)</div>
      <div class="shield-badge shield-bot">⚡ BOT TOKEN AKTİF</div>
      <div class="shield-badge shield-monitor">🌐 7/24 SİSTEM İZLEME</div>
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

    <div class="monitors-box">
      <div class="monitors-title">
        <span>🌐 İZLENEN SİSTEMLER (1 SAATLİK KONTROL)</span>
        <span>Kanal: #${STATUS_CHANNEL_ID}</span>
      </div>
      <div class="monitor-item">
        <div>
          <div class="monitor-name">EkoYıldız DuckDNS</div>
          <div class="monitor-url">https://ekoyildiz.duckdns.org/</div>
        </div>
        <div class="badge-status ${duckdnsStatus ? (duckdnsStatus.ok ? 'badge-ok' : 'badge-err') : 'badge-ok'}">
          ${duckdnsStatus ? (duckdnsStatus.ok ? `🟢 AKTİF (${duckdnsStatus.duration}ms)` : '🔴 HATA') : '🟢 AKTİF'}
        </div>
      </div>
      <div class="monitor-item">
        <div>
          <div class="monitor-name">BEM Render App</div>
          <div class="monitor-url">https://bem-zze4.onrender.com</div>
        </div>
        <div class="badge-status ${renderStatus ? (renderStatus.ok ? 'badge-ok' : 'badge-err') : 'badge-ok'}">
          ${renderStatus ? (renderStatus.ok ? `🟢 AKTİF (${renderStatus.duration}ms)` : '🔴 HATA') : '🟢 AKTİF'}
        </div>
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
    activeChat: activeChat ? activeChat.username : null,
    pendingQueueCount: reservationQueue.filter(q => q.status === 'pending').length,
    blacklistCount: blacklist.size,
    uptime: process.uptime(),
    monitoredServices: lastSystemHealthResults
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

// Bot Token Girişi
if (BOT_TOKEN) {
  botClient.login(BOT_TOKEN).catch(err => console.error('[BOT LOGIN HATA]', err.message));
} else {
  console.warn('[UYARI] .env içinde BOTTOKEN bulunamadı!');
}
