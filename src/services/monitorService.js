const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '../../status_state.json');

let lastStatusMessageId = null;
let lastResults = [];
let monitorTimer = null;
const startTime = Date.now();

// Kayıtlı mesaj ID'sini yükle
try {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (data && data.messageId) {
      lastStatusMessageId = data.messageId;
      logger.info('MONİTOR', `Önceki durum mesaj ID yüklendi: ${lastStatusMessageId}`);
    }
  }
} catch (e) {
  logger.warn('MONİTOR', 'Durum kayıt dosyası okunamadı:', e.message);
}

function saveStatusMessageId(id) {
  lastStatusMessageId = id;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ messageId: id, updatedAt: Date.now() }, null, 2), 'utf8');
  } catch (e) {
    logger.warn('MONİTOR', 'Durum mesaj ID kaydedilemedi:', e.message);
  }
}

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

async function checkServiceHealth(service) {
  const start = Date.now();
  try {
    const response = await axios.get(service.url, {
      timeout: 15000,
      validateStatus: () => true, // 4xx ve 5xx durumlarında exception fırlatmaz
      headers: {
        'User-Agent': 'EkoYildiz-Monitor/2.0'
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
      error: err.code === 'ECONNABORTED' ? 'Zaman aşımı (> 15s)' : (err.message || 'Bağlantı hatası')
    };
  }
}

async function performSystemCheck(client) {
  if (!client || !client.isReady()) {
    logger.warn('MONİTOR', 'Client hazır olmadığı için sistem kontrolü atlandı.');
    return { allActive: false, results: [], uptimeStr: '0 saniye' };
  }

  logger.info('MONİTOR', `Sistem kontrolü başlatılıyor (${config.MONITORED_SERVICES.length} servis)...`);
  const results = await Promise.all(config.MONITORED_SERVICES.map(s => checkServiceHealth(s)));
  lastResults = results;

  const allActive = results.every(r => r.ok);
  const uptimeStr = formatUptime(Date.now() - startTime);
  const nowUnix = Math.floor(Date.now() / 1000);

  let statusContent = '';
  let embedColor = 0x10b981;

  if (allActive) {
    statusContent = `:information_source: **EkoYıldız sistemleri aktif.**\n` +
      `Kaç saattir ve gündür? **${uptimeStr}**\n\n` +
      `🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ 🟢 **Aktif** (\`${r.duration}ms\`)`).join('\n') +
      `\n\n🕒 *Son Güncelleme:* <t:${nowUnix}:F> (<t:${nowUnix}:R>)\n*(Bu mesaj her 1 saatte bir otomatik düzenlenir)*`;
    embedColor = 0x10b981;
  } else {
    statusContent = `⚠️ **Birkaç sistemde hata oluştu.. Ekibimize bu durum bildirildi. Düzeltmek için çalışıyoruz.**\n\n` +
      `⏱ **Uptime:** **${uptimeStr}**\n\n` +
      `🌐 **Sistem Durumları:**\n` +
      results.map(r => `• ${r.url} ➔ ${r.ok ? `🟢 **Aktif** (\`${r.duration}ms\`)` : `🔴 **Hata:** \`${r.error}\``}`).join('\n') +
      `\n\n🕒 *Son Kontrol:* <t:${nowUnix}:F> (<t:${nowUnix}:R>)\n*(Bu mesaj her 1 saatte bir otomatik düzenlenir)*`;
    embedColor = 0xef4444;

    // Hata durumunda Eko'ya (1031620522406072350) DM gönder
    try {
      const ekoUser = await client.users.fetch(config.EKO_USER_ID).catch(() => null);
      if (ekoUser) {
        const failedDetails = results
          .filter(r => !r.ok)
          .map(r => `• **${r.name}** (\`${r.url}\`)\n  └ ❌ *Hata:* \`${r.error}\``)
          .join('\n');

        const alertEmbed = new EmbedBuilder()
          .setTitle('🚨 [SİSTEM UYARISI] EkoYıldız Sistemlerinde Arıza!')
          .setDescription(`Merhaba Eko, yapılan otomatik kontrolde sistemlerde arıza tespit edildi:\n\n${failedDetails}\n\n📍 **Kanal:** <#${config.STATUS_CHANNEL_ID}>\n⏰ **Zaman:** <t:${nowUnix}:F>`)
          .setColor(0xef4444)
          .setTimestamp();

        await ekoUser.send({ embeds: [alertEmbed] });
        logger.info('MONİTOR', `Arıza DM bildirimi ${config.EKO_USER_ID} kullanıcısına gönderildi.`);
      }
    } catch (dmErr) {
      logger.error('MONİTOR DM', 'DM bildirim gönderiminde hata:', dmErr);
    }
  }

  // Bildirim Kanalında TEK MESAJ YÖNETİMİ (1518692466860101915)
  try {
    const channel = await client.channels.fetch(config.STATUS_CHANNEL_ID).catch(() => null);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(allActive ? 'ℹ️ EkoYıldız Sistem Durum Raporu' : '⚠️ EkoYıldız Sistem Arıza Uyarısı')
        .setDescription(statusContent)
        .setColor(embedColor)
        .setFooter({ text: 'EkoYıldız Otomatik İzleme Sistemi • Her Saat Düzenlenir' })
        .setTimestamp();

      let targetMessage = null;

      // 1. Kaydedilmiş mesaj ID'si ile fetch etmeyi dene
      if (lastStatusMessageId) {
        try {
          targetMessage = await channel.messages.fetch(lastStatusMessageId);
        } catch (e) {
          targetMessage = null;
        }
      }

      // 2. Bulunamadıysa kanaldaki son 50 mesajı tara ve botun son mesajını yakala
      if (!targetMessage) {
        try {
          const recent = await channel.messages.fetch({ limit: 50 });
          const botMessages = recent.filter(m => m.author.id === client.user.id);
          if (botMessages.size > 0) {
            targetMessage = botMessages.first();
            // Kanaldaki botun eski mükerrer mesajlarını temizle (Kanalı temiz ve tek mesajlı tutmak için)
            const oldDuplicates = botMessages.filter(m => m.id !== targetMessage.id);
            for (const [_, dup] of oldDuplicates) {
              await dup.delete().catch(() => {});
            }
          }
        } catch (e) {
          targetMessage = null;
        }
      }

      // 3. Mesaj varsa DÜZENLE, yoksa YENİ AT ve ID'yi kaydet
      if (targetMessage) {
        await targetMessage.edit({ content: '', embeds: [embed] });
        saveStatusMessageId(targetMessage.id);
        logger.success('MONİTOR', `Kanal (#${config.STATUS_CHANNEL_ID}) durum mesajı (${targetMessage.id}) başarıyla DÜZENLENDİ.`);
      } else {
        const sent = await channel.send({ embeds: [embed] });
        saveStatusMessageId(sent.id);
        logger.success('MONİTOR', `Kanal (#${config.STATUS_CHANNEL_ID}) için TEK durum mesajı (${sent.id}) OLUŞTURULDU.`);
      }
    } else {
      logger.warn('MONİTOR', `Hedef durum kanalı (${config.STATUS_CHANNEL_ID}) bulunamadı veya bota yazma yetkisi yok.`);
    }
  } catch (chanErr) {
    logger.error('MONİTOR KANAL', 'Kanal mesajı güncellenirken hata:', chanErr);
  }

  return { allActive, results, uptimeStr };
}

function startMonitoring(client) {
  if (monitorTimer) clearInterval(monitorTimer);

  // Bot açıldıktan 4 saniye sonra tek durum mesajını oluştur veya güncelle
  setTimeout(() => {
    performSystemCheck(client).catch(err => logger.error('MONİTOR İLK', 'İlk kontrolde hata:', err));
  }, 4000);

  // Her 1 saatte bir (3600000 ms) AYNI MESAJI DÜZENLE
  monitorTimer = setInterval(() => {
    performSystemCheck(client).catch(err => logger.error('MONİTOR PERİYODİK', 'Periyodik kontrolde hata:', err));
  }, config.MONITOR_INTERVAL_MS);

  logger.success('MONİTOR', `1 saatlik otomatik durum mesajı düzenleme servisi aktif.`);
}

module.exports = {
  startMonitoring,
  performSystemCheck,
  getHealthResults: () => lastResults,
  getUptimeString: () => formatUptime(Date.now() - startTime),
  getStartTime: () => startTime
};
