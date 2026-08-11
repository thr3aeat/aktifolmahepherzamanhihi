# 🚀 Eko Yıldız - 7/24 Anti-Detection Discord User Token

Bu proje, Discord hesabınızı (User Token) **Render.com** üzerinde 7/24 kesintisiz online tutar. Ban riskini en aza indirmek için **gelişmiş Anti-Detection (Tespit Engelleme)** teknikleri kullanır.

---

## 🛡️ Ban Riskini Azaltma (Anti-Detection) Teknikleri

1. 🔌 **Yalnızca WebSocket (Gateway) Bağlantısı:**
   - Kod **sıfır (0) REST API isteği** atar (mesaj göndermez, sunucuya katılmaz, DM atmaz).
   - Yalnızca hesabın çevrim içi kalmasını ve zengin durum (Rich Presence) yansıtmasını sağlar.

2. 💻 **Client Headers & Browser Spoofing:**
   - Discord'a bağlantı kurulurken orijinal **Discord Windows 10 Desktop Client** bilgileri (`release_channel: 'stable'`, `os: 'Windows'`) taklit edilir.

3. 🌙 **Gece İnsan Taklidi (Natural Human Simulation):**
   - Hesabın 30 gün boyunca 7/24 aralıksız "Çevrim içi" kalması yapay zeka tespit sistemlerine takılabilir.
   - Kod, **Türkiye saati ile gece 01:00 - 08:00** arasında hesabın durumunu otomatik olarak **"Boşta" (Idle / Sleep)** moduna alır.
   - Gündüz saatlerinde rastgele %10 ihtimalle kısa mola (kahve molası simülasyonu) verir.

4. 📺 **Özel Etkinlik:**
   - Profilinizde **"Eko Yıldız youtube kanalına abone ol!"** mor yayıncı rozeti gösterilir.

---

## 🛠️ CronJob Bağlantı Adresleri
CronJob bağlarken şu adreslerden birini kullanabilirsiniz:

- **Hızlı Ping:** `https://user-token-724.onrender.com/ping` (Cevap: `pong`)
- **Health JSON:** `https://user-token-724.onrender.com/health`
- **Ana Dashboard:** `https://user-token-724.onrender.com/`

---

## 💻 Kurulum
1. `.env` veya Render EnvironmentVariables: **Sadece `TOKEN`**
2. Render Build Command: `npm install`
3. Render Start Command: `npm start`
