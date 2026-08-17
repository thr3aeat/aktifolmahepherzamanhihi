const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

let lastStatusMessageId = null;
let lastResults = [];
let monitorTimer = null;
const startTime = Date.now();

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
      error: err.code === 'ECONNABORTED' ? 'Zaman aşımı (Timeout > 15s)' : (err.message || 'Bağlantı hatası')
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

  // Bildirim Kanalına (1518692466860101915) Gönder / Güncelle
  try {
    const channel = await client.channels.fetch(config.STATUS_CHANNEL_ID).catch(() => null);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(allActive ? 'ℹ️ EkoYıldız Sistem Durum Raporu' : '⚠️ EkoYıldız Sistem Arıza Uyarısı')
        .setDescription(descriptionText)
        .setColor(embedColor)
        .setFooter({ text: 'EkoYıldız Otomatik İzleme Sistemi • 1 Saatte Bir Güncellenir' })
        .setTimestamp();

      let updated = false;

      // 1. Önceki kaydedilmiş mesajı güncelle
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
          const myMsg = recentMessages.find(m => m.author.id === client.user.id);
          if (myMsg) {
            await myMsg.edit({ embeds: [embed] });
            lastStatusMessageId = myMsg.id;
            updated = true;
          }
        } catch (e) {
          updated = false;
        }
      }

      // 3. Bulunamazsa yeni mesaj yolla
      if (!updated) {
        const sent = await channel.send({ embeds: [embed] });
        lastStatusMessageId = sent.id;
      }

      logger.success('MONİTOR', `Durum kanalı (#${config.STATUS_CHANNEL_ID}) başarıyla güncellendi.`);
    } else {
      logger.warn('MONİTOR', `Hedef durum kanalı (${config.STATUS_CHANNEL_ID}) bulunamadı.`);
    }
  } catch (chanErr) {
    logger.error('MONİTOR KANAL', 'Kanal mesajı güncellenirken hata:', chanErr);
  }

  return { allActive, results, uptimeStr };
}

function startMonitoring(client) {
  if (monitorTimer) clearInterval(monitorTimer);

  // Bot açıldıktan 5 saniye sonra ilk kontrolü yap
  setTimeout(() => {
    performSystemCheck(client).catch(err => logger.error('MONİTOR İLK', 'İlk kontrolde hata:', err));
  }, 5000);

  // Her 1 saatte bir periyodik kontrol
  monitorTimer = setInterval(() => {
    performSystemCheck(client).catch(err => logger.error('MONİTOR PERİYODİK', 'Periyodik kontrolde hata:', err));
  }, config.MONITOR_INTERVAL_MS);

  logger.success('MONİTOR', `1 saatlik otomatik sistem izleme servisi aktif edildi.`);
}

module.exports = {
  startMonitoring,
  performSystemCheck,
  getHealthResults: () => lastResults,
  getUptimeString: () => formatUptime(Date.now() - startTime),
  getStartTime: () => startTime
};
