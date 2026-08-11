require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Express HTTP Sunucusu (Render 7/24 Web Service kontrolü için)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send({
    status: 'online',
    message: 'User Token 7/24 Aktif Tutma Servisi Çalışıyor 🚀',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Web sunucusu ${PORT} portunda başlatıldı.`);
});

// Self-Ping Mekanizması (Render Free Tier uykusunu engeller)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await axios.get(RENDER_URL);
      console.log(`[PING] Render servisi aktif tutuldu: ${RENDER_URL}`);
    } catch (err) {
      console.error(`[PING HATA] ${err.message}`);
    }
  }, 4 * 60 * 1000); // 4 dakikada bir ping atar
}

// .env içerisinden SADECE TOKEN alınıyor
const token = process.env.TOKEN || process.env.USER_TOKEN;

if (!token) {
  console.error('[HATA] env içerisinde TOKEN bulunamadı!');
  console.error('Lütfen .env dosyanıza "TOKEN=..." ekleyin veya Render Environment Variables kısmına TOKEN ekleyin.');
  process.exit(1);
}

// Discord Selfbot Client
const client = new Client({ checkUpdate: false });

client.on('ready', async () => {
  console.log(`========================================`);
  console.log(`[BAŞARILI] Hesaba Giriş Yapıldı: ${client.user.tag}`);
  console.log(`[BİLGİ] 7/24 Aktif tutma sistemi devreye girdi.`);
  console.log(`========================================`);

  try {
    client.user.setPresence({
      status: 'online',
      activities: [{
        name: '7/24 Aktif',
        type: 'PLAYING'
      }]
    });
    console.log(`[DURUM] Durum: online | Etkinlik: 7/24 Aktif`);
  } catch (err) {
    console.error(`[DURUM HATA] Presence ayarlanırken hata:`, err.message);
  }
});

client.on('disconnect', () => {
  console.warn('[UYARI] Bağlantı koptu, yeniden bağlanılıyor...');
});

client.on('error', (err) => {
  console.error('[CLIENT HATA]', err.message);
});

client.login(token).catch((err) => {
  console.error('[GİRİŞ HATASI] Token geçersiz veya Discord engeline takıldı:', err.message);
});
