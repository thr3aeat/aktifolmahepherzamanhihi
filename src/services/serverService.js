const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const monitorService = require('./monitorService');
const chatService = require('./chatService');

function startServer(client) {
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

  app.get('/', (req, res) => {
    const botTag = client && client.user ? client.user.tag : 'Bağlanıyor...';
    const avatarUrl = client && client.user ? client.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const queue = chatService.getQueue();
    const activeChat = chatService.getActiveChat();
    const blacklist = chatService.getBlacklist();
    const stats = chatService.getStats();
    const healthResults = monitorService.getHealthResults();
    const uptimeStr = monitorService.getUptimeString();

    const duckdns = healthResults.find(r => r.url.includes('duckdns.org'));
    const render = healthResults.find(r => r.url.includes('render.com'));

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
      <div class="subtitle">Bot: ${botTag} | Uptime: ${uptimeStr}</div>
    </div>

    <div class="shields-wrapper">
      <div class="shield-badge shield-groq">🤖 GROQ AI (llama-3.3-70b)</div>
      <div class="shield-badge shield-bot">⚡ MODÜLER BOT AKTİF</div>
      <div class="shield-badge shield-monitor">🌐 7/24 SİSTEM İZLEME</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Aktif Görüşme</div>
        <div class="stat-value" style="color: #10b981;">${activeChat ? activeChat.username : 'Yok'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sırada Bekleyen</div>
        <div class="stat-value" style="color: #f59e0b;">${queue.filter(q => q.status === 'pending').length} kişi</div>
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
        <span>Kanal: #${config.STATUS_CHANNEL_ID}</span>
      </div>
      <div class="monitor-item">
        <div>
          <div class="monitor-name">EkoYıldız DuckDNS</div>
          <div class="monitor-url">https://ekoyildiz.duckdns.org/</div>
        </div>
        <div class="badge-status ${duckdns ? (duckdns.ok ? 'badge-ok' : 'badge-err') : 'badge-ok'}">
          ${duckdns ? (duckdns.ok ? `🟢 AKTİF (${duckdns.duration}ms)` : '🔴 HATA') : '🟢 AKTİF'}
        </div>
      </div>
      <div class="monitor-item">
        <div>
          <div class="monitor-name">BEM Render App</div>
          <div class="monitor-url">https://bem-zze4.onrender.com</div>
        </div>
        <div class="badge-status ${render ? (render.ok ? 'badge-ok' : 'badge-err') : 'badge-ok'}">
          ${render ? (render.ok ? `🟢 AKTİF (${render.duration}ms)` : '🔴 HATA') : '🟢 AKTİF'}
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
      botUser: client && client.user ? client.user.tag : 'offline',
      uptime: process.uptime(),
      uptimeReadable: monitorService.getUptimeString(),
      pendingQueueCount: chatService.getQueue().filter(q => q.status === 'pending').length,
      monitoredServices: monitorService.getHealthResults()
    });
  });

  app.listen(config.PORT, () => {
    logger.success('HTTP SUNUCU', `Dashboard ve Health Check Portu ${config.PORT} üzerinde aktif!`);
  });

  // 24/7 Render Self-Ping Döngüsü
  if (config.RENDER_EXTERNAL_URL) {
    setInterval(async () => {
      try {
        await axios.get(`${config.RENDER_EXTERNAL_URL}/ping`);
        logger.info('SELF-PING', `Render ping gönderildi: ${config.RENDER_EXTERNAL_URL}/ping`);
      } catch (e) { }
    }, 4 * 60 * 1000);
  }
}

module.exports = {
  startServer
};
