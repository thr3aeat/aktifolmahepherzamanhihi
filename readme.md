# 🚀 Discord User Token 7/24 Aktif Tutma Projesi (Render Uyumlu)

Bu proje, Discord hesabınızı (User Token) **Render.com** üzerinde 7/24 kesintisiz online (açık) tutmak için geliştirilmiştir.

---

## 📌 Özellikler
- 🔑 **Tek Değişken:** `.env` dosyasında sadece `TOKEN` olması yeterlidir.
- 🔄 **Otomatik Yeniden Bağlanma (Auto Reconnect):** Sunucu kopmalarında otomatik tekrar bağlanır.
- 🌐 **Express HTTP Sunucusu:** Render.com'un Web Service olarak 7/24 çalıştırması için dahili port açar.
- ⚡ **Self-Ping Mekanizması:** Render'ın ücretsiz planındaki 15 dakikalık uyku modunu engeller.

---

## 🛠️ Render.com Kurulumu

### 1️⃣ Projeyi GitHub'a Yükleyin
Bu projedeki dosyaları kendi GitHub hesabınızda yeni bir repository'e yükleyin.

### 2️⃣ Render.com'da Web Service Oluşturun
1. [Render Dashboard](https://dashboard.render.com/)'a girin.
2. **New +** -> **Web Service** seçin ve GitHub deponuzu bağlayın.
3. Ayarlar:
   - **Name:** `user-token-724`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### 3️⃣ Environment Variable (Çevre Değişkeni) Ekleyin
Render sayfasındaki **Environment** sekmesine sadece şunu ekleyin:

| Key | Value |
| :--- | :--- |
| `TOKEN` | Discord Kullanıcı Tokeniniz |

---

## ⏰ 7/24 Kesintisiz Açık Tutma (UptimeRobot)

Render ücretsiz Web Service'leri istek almazsa 15 dakikada uyur. Tam 7/24 açık tutmak için:

1. [UptimeRobot.com](https://uptimerobot.com/)'a ücretsiz kaydolun.
2. **Add New Monitor** -> **HTTP(s)** seçin.
3. **URL / IP:** Render'ın size verdiği URL'yi yazın (örn: `https://user-token-724.onrender.com`).
4. Monitoring Interval: `5 minutes` olarak ayarlayın.

---

## 💻 Yerel (Local) Kullanım
1. `.env` dosyası oluşturun ve sadece tokeninizi yazın:
```env
TOKEN=sizin_discord_tokeniniz
```
2. Başlatın:
```bash
npm install
npm start
```
