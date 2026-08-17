const logger = require('./logger');

let reconnectAttempts = 0;
let isReconnecting = false;

function setupAutoRecovery(client, token) {
  // 1. Process Düzeyinde Hata Yakalama (Çökme Koruması)
  process.on('uncaughtException', (err) => {
    logger.error('ÇÖKME ENGELLEYİCİ', 'Yakalanmamış istisna engellendi, bot çalışmaya devam ediyor:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('PROMISE KORUMASI', 'Yakalanmamış promise reddi engellendi:', reason);
  });

  process.on('warning', (warning) => {
    logger.warn('SİSTEM UYARISI', warning.message || warning);
  });

  // 2. Discord Client Olay Koruyucuları
  if (client) {
    client.on('error', (err) => {
      logger.error('DISCORD CLIENT HATASI', 'Gateway/API hatası oluştu:', err);
      checkAndRecoverConnection(client, token);
    });

    client.on('disconnect', () => {
      logger.warn('DISCORD BAĞLANTI', 'Bot bağlantısı koptu! Otomatik yeniden bağlanma tetikleniyor...');
      checkAndRecoverConnection(client, token);
    });

    client.on('shardError', (error, shardId) => {
      logger.error(`SHARD HATASI [${shardId}]`, 'Shard hatası oluştu:', error);
    });

    client.on('shardDisconnect', (event, shardId) => {
      logger.warn(`SHARD KOPTU [${shardId}]`, 'Shard bağlantısı kesildi, yeniden bağlanılıyor...');
      checkAndRecoverConnection(client, token);
    });

    client.on('shardReconnecting', (shardId) => {
      logger.info(`SHARD YENİDEN BAĞLANIYOR [${shardId}]`, 'Shard ağa bağlanmaya çalışıyor...');
    });
  }

  // 3. 7/24 Sağlık ve Bağlantı Nöbetçisi (Watchdog Timer)
  setInterval(() => {
    try {
      if (!client || !token) return;

      const wsStatus = client.ws?.status;
      // 0 = READY, 1 = CONNECTING, 2 = RECONNECTING, 3 = IDLE, 4 = NEARLY, 5 = DISCONNECTED, 6 = WAITING_FOR_GUILDS, 7 = IDENTIFYING, 8 = RESUMING
      if (wsStatus === 5 || (!client.isReady() && wsStatus !== 1 && wsStatus !== 2 && wsStatus !== 8)) {
        logger.warn('NÖBETÇİ (WATCHDOG)', `Bot bağlantısı pasif görünüyor (WS Durum: ${wsStatus}). Otomatik düzeltme devrede...`);
        checkAndRecoverConnection(client, token);
      }
    } catch (e) {
      logger.error('NÖBETÇİ HATASI', 'Watchdog döngüsünde hata:', e);
    }
  }, 30 * 1000);

  logger.success('OTO-KURTARMA', '7/24 Otomatik Hata Kurtarma ve Bağlantı Nöbetçisi Devreye Alındı.');
}

async function checkAndRecoverConnection(client, token) {
  if (isReconnecting || !token) return;
  isReconnecting = true;
  reconnectAttempts++;

  const delayMs = Math.min(reconnectAttempts * 3000, 30000);
  logger.info('OTO-DÜZELTME', `${delayMs / 1000} saniye içinde yeniden giriş denemesi (#${reconnectAttempts}) yapılacak...`);

  setTimeout(async () => {
    try {
      if (client.isReady()) {
        isReconnecting = false;
        reconnectAttempts = 0;
        return;
      }

      await client.destroy().catch(() => {});
      await client.login(token);
      logger.success('OTO-DÜZELTME', 'Bot başarıyla yeniden bağlandı ve oturum açıldı!');
      reconnectAttempts = 0;
    } catch (err) {
      logger.error('YENİDEN BAĞLANTI HATASI', 'Bot giriş denemesi başarısız oldu, bir sonraki döngüde tekrar denenecek:', err);
    } finally {
      isReconnecting = false;
    }
  }, delayMs);
}

module.exports = {
  setupAutoRecovery,
  checkAndRecoverConnection
};
