const {
  Client: BotClient,
  GatewayIntentBits,
  Partials
} = require('discord.js');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const { setupAutoRecovery } = require('./src/utils/autoRecovery');
const { startServer } = require('./src/services/serverService');
const { startMonitoring } = require('./src/services/monitorService');
const chatService = require('./src/services/chatService');
const commandHandler = require('./src/commands');

// -------------------------------------------------------------
// 1. DISCORD CLIENT BAŞLATMA & INTENTLER
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
// 2. 7/24 OTO-KURTARMA & ÇÖKME KORUYUCUSU
// -------------------------------------------------------------
setupAutoRecovery(botClient, config.BOT_TOKEN);

// -------------------------------------------------------------
// 3. EVENT LISTENERLAR
// -------------------------------------------------------------
botClient.on('ready', () => {
  logger.success('BOT GİRİŞİ', `Discord Bot Aktif: ${botClient.user.tag}`);
  logger.info('MODÜLLER', 'Groq AI, Rezervasyon Sistemi ve Komutlar Hazır.');

  // 1 Saatlik Sistem İzleme Servisini Başlat
  startMonitoring(botClient);
});

botClient.on('messageCreate', async (message) => {
  try {
    if (!message.author || message.author.bot) return;

    const content = message.content ? message.content.trim() : '';

    // Hızlı Yol: e! veya E! ile başlayan sunucu komutları
    if (content.toLowerCase().startsWith('e!')) {
      await commandHandler.handleGuildMessage(message, botClient);
      return;
    }

    // Eko Admin Hızlı Durdurma / Başlatma
    if (message.author.id === config.EKO_USER_ID) {
      const rawCmd = content.toLowerCase();
      if (rawCmd === '!durma') {
        message.reply('🛑 **Tüm otomatik selamlar ve yapay zeka karşılamaları durduruldu.**');
        return;
      }
      if (rawCmd === '!basslatma' || rawCmd === '!baslatma' || rawCmd === '!başlatma') {
        message.reply('▶️ **Tüm otomatik karşılama ve rezervasyon sistemi tekrar başlatıldı.**');
        return;
      }
    }

    // Sunucu İçi Mesajlar (Seviye / AFK kontrolleri vb.)
    if (message.guild) {
      await commandHandler.handleGuildMessage(message, botClient);
    } else {
      // Özel Mesajlar (DM Rezervasyon & Canlı Sohbet Köprüsü)
      await chatService.handleIncomingDM(botClient, message);
    }
  } catch (err) {
    logger.error('MESSAGE CREATE HATASI', 'Mesaj işlenirken hata oluştu:', err);
  }
});

botClient.on('interactionCreate', async (interaction) => {
  try {
    await chatService.handleInteraction(botClient, interaction);
  } catch (err) {
    logger.error('INTERACTION HATASI', 'Etkileşim işlenirken hata oluştu:', err);
  }
});

// -------------------------------------------------------------
// 4. HTTP SERVER & DASHBOARD BAŞLATMA
// -------------------------------------------------------------
startServer(botClient);

// -------------------------------------------------------------
// 5. BOT TOKEN GİRİŞİ
// -------------------------------------------------------------
if (config.BOT_TOKEN) {
  botClient.login(config.BOT_TOKEN).catch(err => {
    logger.error('LOGIN HATASI', 'Bot giriş yapamadı (Token hatalı veya internet yok):', err);
  });
} else {
  logger.warn('YAPILANDIRMA', '.env dosyasında BOTTOKEN bulunamadı!');
}

module.exports = {
  botClient
};
