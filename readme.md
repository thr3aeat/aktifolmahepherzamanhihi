# 🚀 Eko Yıldız - 7/24 Anti-DDoS & Anti-Detection Discord User Token

Bu proje, Discord hesabınızı (User Token) **Render.com** üzerinde 7/24 kesintisiz online tutar. Ban ve DDoS saldırı risklerini engellemek için **Anti-Detection** ve **Anti-DDoS Güvenlik Katmanları** ile donatılmıştır.

---

## 🛡️ Anti-DDoS & Güvenlik Özellikleri

1. ⚡ **Express Rate Limiting (IP Sınırlaması):**
   - Her IP için dakikada maksimum 60 istek sınırı konulmuştur. Sunucunuza atılacak bot/DDoS botnet saldırıları anında engelleyip `HTTP 429 Too Many Requests` döndürür.

2. ⛑️ **Helmet HTTP Güvenlik Başlıkları:**
   - XSS (Cross-Site Scripting), MIME Sniffing, Clickjacking ve Header manipülasyonu açıklarına karşı sunucuyu zırhlar.

3. 📦 **Payload Size Cap (Maksimum 10kb Paket Sınırı):**
   - Sunucuya büyük veri paketleri yollayarak bellek doldurma (RAM Exhaustion) DDoS saldırılarını engeller.

4. 🔄 **Reverse Proxy IP Trust:**
   - Render'ın yük dengeleyicisi arkasında gerçek istemci IP'lerini doğru tespit ederek güvenli sınırlama sağlar.

---

## 🔒 Anti-Detection (Ban Engelleme) Özellikleri
- 🔌 **Sadece WebSocket (Gateway):** 0 REST API isteği.
- 💻 **Windows 10 Desktop Client Spoofing:** Discord masaüstü istemci taklidi.
- 🌙 **Gece İnsan Uykusu Taklidi:** Gece 01:00 - 08:00 (TSİ) arası Boşta (Idle) mod.
- 📺 **Mor Yayın Rozeti:** Profilde **"Eko Yıldız youtube kanalına abone ol!"** yayını.

---

## 🛠️ CronJob Bağlantı Adresleri
CronJob servisleriniz için 120 req/min esnek limitli adresler:
- **Ping:** `https://user-token-724.onrender.com/ping`
- **Health JSON:** `https://user-token-724.onrender.com/health`
