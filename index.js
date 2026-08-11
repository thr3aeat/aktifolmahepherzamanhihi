require('dotenv').config();
const express = require('express');
const { Client, CustomStatus } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Express Server
const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// Discord Client Instance
const client = new Client({ checkUpdate: false });

// -------------------------------------------------------------
// 1. ŞOK EDİCİ GÖRSEL DASHBOARD (GET /)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const userTag = client.user ? client.user.tag : 'Bağlanıyor...';
  const avatarUrl = client.user ? client.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
  const status = client.user ? 'ONLINE' : 'CONNECTING';

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eko Yıldız | 7/24 Aktif Token Botu</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
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
    /* Dynamic Glowing Background Blobs */
    .bg-blob {
      position: absolute;
      width: 450px;
      height: 450px;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.45;
      z-index: 0;
      animation: pulse 8s infinite alternate ease-in-out;
    }
    .blob-1 {
      top: -100px;
      left: -100px;
      background: linear-gradient(135deg, #7c3aed, #db2777);
    }
    .blob-2 {
      bottom: -100px;
      right: -100px;
      background: linear-gradient(135deg, #2563eb, #059669);
    }
    @keyframes pulse {
      0% { transform: scale(1) translate(0, 0); }
      100% { transform: scale(1.15) translate(30px, 30px); }
    }

    /* Container Glassmorphism */
    .container {
      position: relative;
      z-index: 10;
      width: 90%;
      max-width: 650px;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 40px 30px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(124, 58, 237, 0.25);
      text-align: center;
      animation: fadeIn 0.8s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* User Profile Card */
    .profile-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 25px;
    }
    .avatar-wrapper {
      position: relative;
      width: 100px;
      height: 100px;
      margin-bottom: 15px;
    }
    .avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 3px solid #8b5cf6;
      box-shadow: 0 0 20px rgba(139, 92, 246, 0.6);
      object-fit: cover;
    }
    .status-indicator {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background-color: #10b981;
      border: 3px solid #0f172a;
      box-shadow: 0 0 10px #10b981;
      animation: statusGlow 2s infinite;
    }
    @keyframes statusGlow {
      0%, 100% { box-shadow: 0 0 8px #10b981; }
      50% { box-shadow: 0 0 18px #10b981; }
    }

    .username {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 5px;
    }
    .user-tag {
      font-size: 14px;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* Live Presence Display Banner */
    .banner {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(219, 39, 119, 0.2));
      border: 1px solid rgba(236, 72, 153, 0.3);
      border-radius: 18px;
      padding: 18px 20px;
      margin: 25px 0;
      position: relative;
      overflow: hidden;
    }
    .banner-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #ec4899;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .banner-text {
      font-size: 20px;
      font-weight: 900;
      background: linear-gradient(90deg, #a855f7, #ec4899, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: gradientShift 4s infinite linear;
    }
    @keyframes gradientShift {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }

    /* Youtube CTA Button */
    .yt-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      background: linear-gradient(135deg, #ff0000, #c40000);
      color: #ffffff;
      font-weight: 700;
      font-size: 16px;
      padding: 16px 24px;
      border-radius: 16px;
      text-decoration: none;
      box-shadow: 0 10px 25px rgba(255, 0, 0, 0.4);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      margin-bottom: 25px;
      border: none;
      cursor: pointer;
    }
    .yt-btn:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 15px 35px rgba(255, 0, 0, 0.6);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 14px;
      text-align: center;
    }
    .stat-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .stat-value {
      font-size: 15px;
      font-weight: 700;
      color: #38bdf8;
    }

    /* Footer & CronJob Info */
    .footer-note {
      font-size: 12px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: #10b981;
      border-radius: 50%;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="bg-blob blob-1"></div>
  <div class="bg-blob blob-2"></div>

  <div class="container">
    <div class="profile-section">
      <div class="avatar-wrapper">
        <img class="avatar" src="${avatarUrl}" alt="Avatar">
        <div class="status-indicator"></div>
      </div>
      <div class="username">${userTag}</div>
      <div class="user-tag">⚡ 7/24 Kesintisiz Aktif Token</div>
    </div>

    <div class="banner">
      <div class="banner-title">🎮 DISCORD ZENGİN DURUM (RICH PRESENCE)</div>
      <div class="banner-text">Eko Yıldız youtube kanalına abone ol!</div>
    </div>

    <a href="https://www.youtube.com/@EkoYildiz" target="_blank" class="yt-btn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      Eko Yıldız YouTube Kanalına Abone Ol!
    </a>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Sistem Durumu</div>
        <div class="stat-value" style="color: #10b981;">${status}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Uptime</div>
        <div class="stat-value" id="uptimeCounter">0s</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">CronJob Status</div>
        <div class="stat-value" style="color: #a855f7;">READY</div>
      </div>
    </div>

    <div class="footer-note">
      <span class="pulse-dot"></span> Render & External CronJob Uyumlu Sistem (/ping & /health)
    </div>
  </div>

  <script>
    const startTime = ${startTime};
    function updateUptime() {
      const now = Date.now();
      const diffSec = Math.floor((now - startTime) / 1000);
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      document.getElementById('uptimeCounter').innerText = hours + 'h ' + mins + 'm ' + secs + 's';
    }
    setInterval(updateUptime, 1000);
    updateUptime();
  </script>
</body>
</html>
  `;
  res.send(html);
});

// -------------------------------------------------------------
// 2. CRONJOB VE UPTIME HIZLI HEALTH PING ENDPOINTLERİ
// -------------------------------------------------------------
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    user: client.user ? client.user.tag : 'connecting',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.status(200).json({
    botStatus: client.user ? 'online' : 'offline',
    botTag: client.user ? client.user.tag : null,
    presenceActivity: 'Eko Yıldız youtube kanalına abone ol!',
    uptimeSeconds: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP SUNUCU] Dashboard ve CronJob Portu ${PORT} üzerinde aktif!`);
});

// -------------------------------------------------------------
// 3. RENDER UYKU ENGELLEYİCİ SELF-PING MEKANİZMASI
// -------------------------------------------------------------
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${RENDER_URL}/ping`);
      console.log(`[SELF-PING] Render servisi tetiklendi: ${RENDER_URL}/ping`);
    } catch (err) {
      console.error(`[SELF-PING HATA] ${err.message}`);
    }
  }, 4 * 60 * 1000);
}

// -------------------------------------------------------------
// 4. DISCORD SELFBOT DURUM VE ETKİNLİK AYARLARI
// -------------------------------------------------------------
const token = process.env.TOKEN || process.env.USER_TOKEN;

if (!token) {
  console.error('[HATA] .env dosyasında veya Render Environment panellerinde TOKEN bulunamadı!');
  process.exit(1);
}

function updatePresence() {
  if (!client.user) return;
  try {
    client.user.setPresence({
      status: 'online',
      activities: [{
        name: 'Eko Yıldız youtube kanalına abone ol!',
        type: 'STREAMING',
        url: 'https://www.twitch.tv/discord' // Purple Streaming status icon badge on Discord
      }]
    });
    console.log(`[PRESENCE] Durum güncellendi: "Eko Yıldız youtube kanalına abone ol!"`);
  } catch (err) {
    console.error(`[PRESENCE HATA]`, err.message);
  }
}

client.on('ready', async () => {
  console.log(`====================================================`);
  console.log(`[BAŞARILI] Hesaba Giriş Yapıldı: ${client.user.tag}`);
  console.log(`[ETKİNLİK] "Eko Yıldız youtube kanalına abone ol!" ayarlandı.`);
  console.log(`====================================================`);

  updatePresence();

  // Her 10 dakikada bir durumu yenile (Discord reset atarsa korur)
  setInterval(updatePresence, 10 * 60 * 1000);
});

client.on('disconnect', () => {
  console.warn('[UYARI] Discord bağlantısı koptu, yeniden bağlanılıyor...');
});

client.on('error', (err) => {
  console.error('[CLIENT HATA]', err.message);
});

// -------------------------------------------------------------
// 5. ÇÖKMELERİ ENGELLEYEN SİSTEM KORUYUCULARI
// -------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[SİSTEM HATA - Uncaught Exception]', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SİSTEM HATA - Unhandled Rejection]', reason);
});

// Giriş Yap
client.login(token).catch((err) => {
  console.error('[GİRİŞ HATASI] Token geçersiz veya engellendi:', err.message);
});
