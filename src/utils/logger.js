function getTimestamp() {
  return new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

const logger = {
  info: (tag, msg) => {
    console.log(`[${getTimestamp()}] ℹ️ [${tag}] ${msg}`);
  },
  success: (tag, msg) => {
    console.log(`[${getTimestamp()}] ✅ [${tag}] ${msg}`);
  },
  warn: (tag, msg) => {
    console.warn(`[${getTimestamp()}] ⚠️ [${tag}] ${msg}`);
  },
  error: (tag, msg, err = null) => {
    console.error(`[${getTimestamp()}] ❌ [${tag}] ${msg}`, err ? (err.stack || err.message || err) : '');
  }
};

module.exports = logger;
