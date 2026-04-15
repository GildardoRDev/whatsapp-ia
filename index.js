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

  // CORRECCIÓN PARA MÉXICO: Meta envía 521, pero para responder espera solo 52
  // Si no se limpia, sale el error ( #131030 ) Recipient phone number not in allowed list
  const cleanFrom = from.startsWith('521') ? from.replace('521', '52') : from;

  try {
    const aiRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        // El nombre correcto es claude-3-haiku-20240307
        // Pero asegúrate de que no tenga espacios extras
        model: 'claude-3-haiku-20240307', 
        max_tokens: 500,
        system: SYSTEM_PROMPT || 'Eres un asistente amigable. Responde en español y de forma breve.',
        messages: [{ role: 'user', content: text }]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const reply = aiRes.data.content[0].text;

    // Enviar respuesta a WhatsApp
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: cleanFrom, // <--- Usamos el número corregido aquí
        text: { body: reply }
      },
      {
        headers: { 
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    // Esto imprimirá el error detallado en los logs de Railway
    console.error('Error:', err.response?.data || err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor corriendo');
});
