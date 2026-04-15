const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  WA_TOKEN,
  PHONE_ID,
  ANTHROPIC_KEY,
  SYSTEM_PROMPT
} = process.env;

// Meta verifica tu webhook
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Mensajes entrantes
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde rápido a Meta

  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== 'text') return;

  const from = msg.from;
  const text = msg.text.body;

  try {
    const aiRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT || 'Eres un asistente amigable. Responde en español y de forma breve.',
        messages: [{ role: 'user', content: text }]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const reply = aiRes.data.content[0].text;

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: from,
        text: { body: reply }
      },
      {
        headers: { Authorization: `Bearer ${WA_TOKEN}` }
      }
    );
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor corriendo');
});
