require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Express Server
const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// -------------------------------------------------------------
// 1. DISCORD SELFBOT CLIENT - (ANTI-DETECTION HEADER & GATEWAY CONFIG)
// -------------------------------------------------------------
// Sadece WebSocket (Gateway) bağlantısı kullanılır. REST API isteği GÖNDERİLMEZ.
// Discord Masaüstü Windows istemcisi taklidi yapılır.
const client = new Client({
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

// Anti-Detection İnsan Taklidi Değişkenleri
let currentMode = 'ONLINE'; // 'ONLINE' | 'IDLE_SLEEP' | 'MICRO_BREAK'
let lastStatusChange = new Date();

// Gece Saatlerinde Sleep/Idle Simülasyonu (01:00 - 08:00 arası Türkiye Saati / UTC+3)
function getSimulatedHumanStatus() {
  const date = new Date();
  // UTC+3 Türkiye Saat Dilimine Göre Saat
  const trtHour = (date.getUTCHours() + 3) % 24;

  // Gece 01:00 ile 08:00 arası (İnsan Uyku Taklidi) -> Idle (Boşta) veya DND
  if (trtHour >= 1 && trtHour < 8) {
    currentMode = 'IDLE_SLEEP (Gece İnsan Uykusu Taklidi)';
    return {
      status: 'idle', // Gece boşta görünür
      activityName: 'Eko Yıldız youtube kanalına abone ol!',
      activityType: 'STREAMING'
    };
  }

  // Gündüz Saatleri (Rastgele %10 şansla 15dk kahve molası / idle)
  const isMicroBreak = Math.random() < 0.10;
  if (isMicroBreak) {
    currentMode = 'MICRO_BREAK (Mola Simülasyonu)';
    return {
      status: 'idle',
      activityName: 'Eko Yıldız youtube kanalına abone ol!',
      activityType: 'STREAMING'
    };
  }

  currentMode = 'ONLINE (Çevrim içi İnsan Taklidi)';
  return {
    status: 'online',
    activityName: 'Eko Yıldız youtube kanalına abone ol!',
    activityType: 'STREAMING'
  };
}

function updatePresenceHumanSimulated() {
  if (!client.user) return;
  try {
    const sim = getSimulatedHumanStatus();
    client.user.setPresence({
      status: sim.status,
      activities: [{
        name: sim.activityName,
        type: sim.activityType,
        url: 'https://www.twitch.tv/discord' // Mor Yayın Rozeti
      }]
    });
    lastStatusChange = new Date();
    console.log(`[ANTI-BAN PRESENCE] Mod: ${currentMode} | Durum: ${sim.status} | Etkinlik: "${sim.activityName}"`);
  } catch (err) {
    console.error(`[PRESENCE HATA]`, err.message);
  }
}

// -------------------------------------------------------------
// 2. ŞOK EDİCİ GÖRSEL DASHBOARD (GET /)
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
  <title>Eko Yıldız | 7/24 Anti-Detection User Token</title>
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
      max-width: 680px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 40px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(124, 58, 237, 0.25);
      text-align: center;
      animation: fadeIn 0.8s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .profile-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 20px;
    }
    .avatar-wrapper {
      position: relative;
      width: 96px;
      height: 96px;
      margin-bottom: 12px;
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
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background-color: #10b981;
      border: 3px solid #0f172a;
      box-shadow: 0 0 12px #10b981;
      animation: statusGlow 2s infinite;
    }
    @keyframes statusGlow {
      0%, 100% { box-shadow: 0 0 8px #10b981; }
      50% { box-shadow: 0 0 20px #10b981; }
    }

    .username {
      font-size: 26px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .user-tag {
      font-size: 13px;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 14px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* Anti-Detection Shield Badge */
    .anti-ban-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 18px;
      border-radius: 30px;
      margin: 15px 0 20px 0;
    }

    /* Banner */
    .banner {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(219, 39, 119, 0.2));
      border: 1px solid rgba(236, 72, 153, 0.3);
      border-radius: 18px;
      padding: 16px 20px;
      margin-bottom: 22px;
    }
    .banner-title {
      font-size: 11px;
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

    /* YouTube CTA Button */
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
      margin-bottom: 22px;
    }
    .yt-btn:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 15px 35px rgba(255, 0, 0, 0.6);
    }

    /* Anti-Detection Security Checklist Cards */
    .security-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 20px;
      text-align: left;
    }
    .sec-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .sec-title {
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 3px;
    }
    .sec-desc {
      font-size: 11px;
      color: #94a3b8;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px;
      text-align: center;
    }
    .stat-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .stat-value {
      font-size: 14px;
      font-weight: 700;
      color: #a855f7;
    }

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
      <div class="user-tag">⚡ 7/24 Aktif User Token</div>
    </div>

    <div class="anti-ban-badge">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.681-.056-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clip-rule="evenodd"/>
      </svg>
      ANTI-DETECTION SYSTEM ACTIVE (BAN RISK MINIMIZED)
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

    <!-- Anti-Detection Security Cards -->
    <div class="security-grid">
      <div class="sec-card">
        <div class="sec-title">🔌 Sadece Gateway WS</div>
        <div class="sec-desc">Sadece Socket açık tutulur. 0 REST API spam isteği.</div>
      </div>
      <div class="sec-card">
        <div class="sec-title">🌙 Gece İnsan Taklidi</div>
        <div class="sec-desc">Gece saatlerinde Boşta (Idle) moda otomatik geçer.</div>
      </div>
      <div class="sec-card">
        <div class="sec-title">💻 Windows Client Spoof</div>
        <div class="sec-desc">Orijinal Discord Windows masaüstü header'ları kullanılır.</div>
      </div>
      <div class="sec-card">
        <div class="sec-title">☕ Rastgele Mola Simülatörü</div>
        <div class="sec-desc">Gündüz saatlerinde insan gibi arada mola simüle edilir.</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Sistem Durumu</div>
        <div class="stat-value" style="color: #10b981;">${status}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">İnsan Taklit Modu</div>
        <div class="stat-value" style="font-size: 11px; color: #34d399;">${currentMode}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Uptime</div>
        <div class="stat-value" id="uptimeCounter">0s</div>
      </div>
    </div>

    <div class="footer-note">
      <span class="pulse-dot"></span> Render & External CronJob Uyumlu (/ping & /health)
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
// 3. CRONJOB VE UPTIME HIZLI HEALTH PING ENDPOINTLERİ
// -------------------------------------------------------------
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    user: client.user ? client.user.tag : 'connecting',
    humanMode: currentMode,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.status(200).json({
    botStatus: client.user ? 'online' : 'offline',
    humanSimulationMode: currentMode,
    botTag: client.user ? client.user.tag : null,
    presenceActivity: 'Eko Yıldız youtube kanalına abone ol!',
    antiDetection: {
      onlyWebSocketGateway: true,
      restApiSpamRequests: 0,
      clientSpoof: 'Discord Desktop Windows 10',
      humanSleepSimulator: 'ACTIVE (01:00 - 08:00 TRT Idle Sleep)'
    },
    uptimeSeconds: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP SUNUCU] Anti-Detection Dashboard & CronJob Portu ${PORT} üzerinde aktif!`);
});

// -------------------------------------------------------------
// 4. RENDER UYKU ENGELLEYİCİ SELF-PING MEKANİZMASI
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
// 5. DISCORD SELFBOT GİRİŞ VE İNSAN TAKLİDİ DÖNGÜSÜ
// -------------------------------------------------------------
const token = process.env.TOKEN || process.env.USER_TOKEN;

if (!token) {
  console.error('[HATA] .env dosyasında veya Render Environment panellerinde TOKEN bulunamadı!');
  process.exit(1);
}

client.on('ready', async () => {
  console.log(`====================================================`);
  console.log(`[BAŞARILI] Hesaba Giriş Yapıldı: ${client.user.tag}`);
  console.log(`[ANTI-DETECTION] Windows 10 Discord Desktop Client Taklidi Aktif.`);
  console.log(`[ANTI-DETECTION] 0 REST API İsteği (Sadece Gateway Socket).`);
  console.log(`[ANTI-DETECTION] Gece İnsan Uykusu Simülatörü Aktif.`);
  console.log(`====================================================`);

  updatePresenceHumanSimulated();

  // Her 15 dakikada bir insan taklidi durumunu kontrol et ve güncelle
  setInterval(updatePresenceHumanSimulated, 15 * 60 * 1000);
});

client.on('disconnect', () => {
  console.warn('[UYARI] Discord bağlantısı koptu, yeniden bağlanılıyor...');
});

client.on('error', (err) => {
  console.error('[CLIENT HATA]', err.message);
});

// -------------------------------------------------------------
// 6. ÇÖKMELERİ ENGELLEYEN SİSTEM KORUYUCULARI
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
