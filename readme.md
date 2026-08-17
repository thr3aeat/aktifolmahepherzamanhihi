# 🚀 Eko Yıldız - 7/24 Discord Bot, AI Rezervasyon & Sistem İzleme (Uptime)

Bu proje, Discord botu olarak çalışarak kullanıcıları Groq Yapay Zekası ile karşılar, randevu/rezervasyon yönetimi sağlar ve **EkoYıldız sistemlerini (DuckDNS & Render)** 7/24 saatlik periyotlarla izleyip Discord kanalına ve DM ile yöneticiye durum raporu sunar.

---

## 🌟 Temel Özellikler

1. 🤖 **Resmi Discord Bot Token (discord.js v14):**
   - Selfbot/User Token kaldırılmıştır. Sadece resmi Bot Token ile güvenli ve yasal bir şekilde çalışır.
   - `GuildMessages`, `MessageContent`, `DirectMessages` intentleri ile tüm `e!` komutları ve özel mesajlar anında işlenir.

2. 🌐 **Otomatik Sistem & Uptime Monitörü (Her 1 Saatte Bir):**
   - İzlenen Adresler:
     - `https://ekoyildiz.duckdns.org/`
     - `https://bem-zze4.onrender.com`
   - Bildirim Kanalı: `<#1518692466860101915>`
   - **Tüm sistemler aktifken:**
     `:information_source: **EkoYıldız sistemleri aktif.**` mesajı ve bot/sistem uptime süreleri yayınlanır.
   - **Herhangi bir sistem kapalıyken:**
     `⚠️ **Birkaç sistemde hata oluştu.. Ekibimize bu durum bildirildi. Düzeltmek için çalışıyoruz.**` mesajı kanala yazılır ve anında **Eko'ya (1031620522406072350)** detaylı arıza DM bildirimi gönderilir.

3. 💬 **Groq AI (Llama 3.3 70B) & Rezervasyon Köprüsü:**
   - Botun DM'sine yazan kullanıcıları karşılar, görüşme konusunu öğrenir ve Eko'ya butonlu rezervasyon talebi açar.
   - Eko kabul ettiğinde iki taraf arasında canlı köprü kurulur.

4. 🛡️ **Anti-DDoS Express Dashboard:**
   - Web arayüzü ve Render self-ping mekanizması ile 7/24 ayakta kalır.

---

## ⚙️ Ortam Değişkenleri (.env)

```env
# Discord Bot Token
BOTTOKEN=OT...

# Groq API Key
GROQTOKEN=gsk_...

# Yönetici ID & Bildirim Kanalı
EKO_USER_ID=1031620522406072350
STATUS_CHANNEL_ID=1518692466860101915
PORT=3000
```
