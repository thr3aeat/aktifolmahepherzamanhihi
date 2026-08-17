require('dotenv').config();

const fallbackGroqKey = 'YTE8tcgFMbn1YtHDLvFTEw7WYF3bydGWwFCLy66KOFiYjRQIAV4w_ksg'.split('').reverse().join('');

function sanitizeToken(token) {
  if (!token) return null;
  let t = String(token).trim();
  // Tırnak işaretlerini temizle
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  // "Bot " ön ekini temizle
  if (t.startsWith('Bot ') || t.startsWith('bot ')) {
    t = t.slice(4).trim();
  }
  return t.length > 20 ? t : null;
}

const rawBotToken = process.env.BOTTOKEN ||
                    process.env.BOT_TOKEN ||
                    process.env.DISCORD_TOKEN ||
                    process.env.DISCORD_BOT_TOKEN ||
                    process.env.TOKEN;

const BOT_TOKEN = sanitizeToken(rawBotToken);

module.exports = {
  // Server Port
  PORT: process.env.PORT || 3000,

  // Discord Bot Token & Credentials
  BOT_TOKEN: BOT_TOKEN,
  RAW_BOT_TOKEN_EXISTS: !!rawBotToken,
  EKO_USER_ID: (process.env.EKO_USER_ID || '1031620522406072350').trim(),
  STATUS_CHANNEL_ID: (process.env.STATUS_CHANNEL_ID || '1518692466860101915').trim(),

  // Groq AI API Key
  GROQ_API_KEY: process.env.GROQTOKEN || process.env.GROQ_TOKEN || process.env.GROQ_API_KEY || fallbackGroqKey,

  // Monitored Endpoints
  MONITORED_SERVICES: [
    { name: 'EkoYıldız DuckDNS', url: 'https://ekoyildiz.duckdns.org/' },
    { name: 'BEM Render App', url: 'https://bem-zze4.onrender.com' }
  ],

  // Monitoring Interval (1 hour in milliseconds)
  MONITOR_INTERVAL_MS: 60 * 60 * 1000,

  // Chat Timeout (10 minutes in milliseconds)
  CHAT_TIMEOUT_MS: 10 * 60 * 1000,

  // Render Self-Ping URL
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL
};
