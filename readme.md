# 🚀 Eko Yıldız - Discord User Token 7/24 Aktif Tutma Projesi

Bu proje, Discord hesabınızı (User Token) **Render.com** üzerinde 7/24 kesintisiz online tutar, hesabınızda **"Eko Yıldız youtube kanalına abone ol!"** mor yayın (Streaming) etkinliğini gösterir ve şık bir web dashboard sunar.

---

## 🌟 Öne Çıkan Gelişmiş Özellikler
- 📺 **Özel Etkinlik:** Profilinizde **"Eko Yıldız youtube kanalına abone ol!"** mor yayın rozeti gözükür.
- 🎨 **Şok Edici Web Dashboard:** Web sitenize girildiğinde cam efektli (Glassmorphic), canlı Uptime ve profil detayları gösteren ultra modern arayüz.
- ⏰ **CronJob Desteği:** CronJob servisleriniz için özel hazırlanmış hafif `/ping` ve `/health` endpoint'leri.
- 🛡️ **Anti-Crash Koruması:** `uncaughtException` ve `unhandledRejection` ile sunucunuz asla kapanmaz.
- ⚡ **Self-Ping Mekanizması:** Render Free Tier uykusunu otomatik engeller.

---

## 🛠️ CronJob Bağlantı Adresleri (Cron-Job.org / UptimeRobot)
CronJob bağlarken şu adreslerden birini kullanabilirsiniz (Örnek: 5 dakikada bir istek):

- **Ping Endpoint (Hızlı):** `https://user-token-724.onrender.com/ping` (Dönen cevap: `pong`)
- **Health JSON Endpoint:** `https://user-token-724.onrender.com/health`
- **Ana Dashboard:** `https://user-token-724.onrender.com/`

---

## 💻 Kurulum ve Render Kullanımı
1. Projede `.env` veya Render Environment Variables kısmına **sadece `TOKEN`** yazın.
2. Render Build Command: `npm install`
3. Render Start Command: `npm start`
