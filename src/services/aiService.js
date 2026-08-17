const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const aiHistories = new Map(); // userId -> Array<{ role, content }>

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

async function queryGroqAI(userId, username, userMessage) {
  if (!aiHistories.has(userId)) {
    aiHistories.set(userId, []);
  }

  const history = aiHistories.get(userId);

  const systemPrompt = `Sen EkoYıldız'ın (Eko) kişisel rezervasyon yapay zeka asistanısın.
Görevin: Eko ile konuşmak isteyen kullanıcıları karşılamak, onlara nazik, samimi ve yardımsever davranmaktır.

İLK KARŞILAMA / İLK MESAJ KURALI:
Kullanıcıya yapacağın ilk açıklamada tam olarak şu cümleyi kullan veya dahil et:
"Merhaba! EkoYıldız ın yani ekonun kişisel hehsap dm sine hoşgeldiniz bu hesap eko ile konuşmak için rezervasyon almak için kurulmuştur"

ÇALIŞMA MANTIĞI:
1. Kullanıcıya ne hakkında görüşmek istediğini (konuyu / nedenini) ve ismini nazikçe sor.
2. Kullanıcı konuyu/nedenini açıkladığında veya Eko ile konuşmak istediğini teyit ettiğinde Eko'ya rezervasyon talebi oluşturacağını söyle.
3. Rezervasyon talebi kesinleştiğinde yanıtının EN SONUNA tam olarak şu formatta etiket ekle:
[RESERVATION:<konu_ozeti>]
Örnek: "Talebinizi aldım! Eko'ya iletiyorum. [RESERVATION:YouTube videosu iş birliği hakkında görüşme]"
Eğer kullanıcı henüz konu belirtmediyse rezervasyon etiketi koyma, sohbeti sürdür.`;

  history.push({ role: 'user', content: userMessage });

  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...history
  ];

  let response = null;
  let lastError = null;

  for (const model of GROQ_MODELS) {
    try {
      response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model,
          messages: messagesPayload,
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${config.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response && response.data?.choices?.[0]?.message?.content) {
        break;
      }
    } catch (err) {
      lastError = err;
      const errCode = err?.response?.data?.error?.code;
      const status = err?.response?.status;

      if (status === 429 || errCode === 'rate_limit_exceeded' || errCode === 'model_not_found') {
        logger.warn('GROQ AI LİMİT', `${model} kotası doldu/hata verdi, sıradaki modele geçiliyor...`);
        continue;
      }

      if (errCode === 'invalid_api_key') {
        break;
      }
    }
  }

  if (response && response.data?.choices?.[0]?.message?.content) {
    const aiReply = response.data.choices[0].message.content;
    history.push({ role: 'assistant', content: aiReply });

    let reservationTopic = null;
    const resMatch = aiReply.match(/\[RESERVATION:(.*?)\]/);
    if (resMatch) {
      reservationTopic = resMatch[1].trim();
    }

    const cleanReply = aiReply.replace(/\[RESERVATION:.*?\]/g, '').trim();
    return { reply: cleanReply, reservationTopic };
  }

  const isInvalidKey = lastError?.response?.data?.error?.code === 'invalid_api_key';
  if (!isInvalidKey && lastError) {
    logger.error('GROQ AI HATA', 'Groq API hatası:', lastError?.response?.data || lastError.message);
  }

  const fallbackTopic = userMessage.length >= 3 ? userMessage.substring(0, 100) : "Eko ile görüşme talebi";

  return {
    reply: `Merhaba! EkoYıldız ın yani ekonun kişisel hehsap dm sine hoşgeldiniz bu hesap eko ile konuşmak için rezervasyon almak için kurulmuştur.\n\nTalebiniz ("${fallbackTopic}") alındı ve Eko'ya iletildi!`,
    reservationTopic: fallbackTopic
  };
}

function clearUserHistory(userId) {
  aiHistories.delete(userId);
}

module.exports = {
  queryGroqAI,
  clearUserHistory
};
