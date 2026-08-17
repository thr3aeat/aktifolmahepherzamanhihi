const { EmbedBuilder } = require('discord.js');
const monitorService = require('../services/monitorService');

module.exports = [
  {
    name: 'sistemler',
    aliases: ['durum', 'status', 'uptime'],
    category: 'Sistem',
    description: 'EkoYıldız sistemlerinin (DuckDNS ve Render) aktiflik ve uptime durumunu gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const loadingMsg = await message.reply('🔍 **EkoYıldız sistemleri kontrol ediliyor...**');
      const { allActive, results, uptimeStr } = await monitorService.performSystemCheck(context.client);

      const description = allActive
        ? `:information_source: **EkoYıldız sistemleri aktif.**\n\n⏱ **Bot Uptime:** ${uptimeStr}\n\n🌐 **Sistem Durumları:**\n` +
          results.map(r => `• ${r.url} ➔ 🟢 **Aktif** (\`${r.duration}ms\`)`).join('\n')
        : `⚠️ **Birkaç sistemde hata oluştu.. Ekibimize bu durum bildirildi. Düzeltmek için çalışıyoruz.**\n\n⏱ **Bot Uptime:** ${uptimeStr}\n\n🌐 **Sistem Durumları:**\n` +
          results.map(r => `• ${r.url} ➔ ${r.ok ? `🟢 **Aktif** (\`${r.duration}ms\`)` : `🔴 **Hata / Çevrimdışı**`}`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(allActive ? 'ℹ️ EkoYıldız Sistem Durumu' : '⚠️ Sistem Uyarısı')
        .setColor(allActive ? 0x10b981 : 0xef4444)
        .setDescription(description)
        .setFooter({ text: 'EkoYıldız Sistem Takipçisi • Modüler Sistem' })
        .setTimestamp();

      await loadingMsg.edit({ content: '', embeds: [embed] });
    }
  },
  {
    name: 'ping',
    category: 'Sistem',
    description: 'Botun gecikme süresini (ping) gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const sent = await message.reply('🏓 Pong ölçülüyor...');
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const wsPing = context.client.ws.ping;

      const embed = new EmbedBuilder()
        .setTitle('🏓 Gecikme Süreleri (Ping)')
        .addFields(
          { name: '📡 Bot Gecikmesi (Latency)', value: `\`${latency}ms\``, inline: true },
          { name: '🌐 Discord WebSocket', value: `\`${wsPing}ms\``, inline: true }
        )
        .setColor(0x3b82f6)
        .setTimestamp();

      await sent.edit({ content: '', embeds: [embed] });
    }
  },
  {
    name: 'botbilgi',
    aliases: ['botinfo', 'istatistik'],
    category: 'Sistem',
    description: 'Botun çalışma süresi, RAM kullanımı ve sistem bilgilerini gösterir.',
    userPermissions: [],
    botPermissions: [],
    async execute(message, args, context) {
      const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
      const totalMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
      const uptimeStr = monitorService.getUptimeString();

      const embed = new EmbedBuilder()
        .setTitle('🤖 EkoYıldız Bot Sistem Bilgileri')
        .setThumbnail(context.client.user.displayAvatarURL())
        .addFields(
          { name: '⏱ Uptime (Çalışma Süresi)', value: `\`${uptimeStr}\``, inline: false },
          { name: '💾 Heap RAM', value: `\`${memUsage} MB\``, inline: true },
          { name: '🖥 Toplam RSS RAM', value: `\`${totalMem} MB\``, inline: true },
          { name: '⚙️ Node.js Sürümü', value: `\`${process.version}\``, inline: true },
          { name: '🏰 Sunucu Sayısı', value: `\`${context.client.guilds.cache.size}\``, inline: true },
          { name: '👥 Toplam Kullanıcı', value: `\`${context.client.users.cache.size}\``, inline: true }
        )
        .setColor(0x8b5cf6)
        .setFooter({ text: 'EkoYıldız 7/24 Kesintisiz Bot Motoru' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  }
];
