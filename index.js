const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  WA_TOKEN,
  PHONE_ID,
  ANTHROPIC_KEY,
  SYSTEM_PROMPT,
  OWNER_PHONE
} = process.env;

// Memoria de conversaciones por cliente
const conversaciones = {};
const MAX_MENSAJES = 20; // Guarda los últimos 20 mensajes por cliente

const TRIGGER_WORDS = [
  'estoy interesado', 'muy interesado', 'me interesa',
  'hablemos', 'llamame', 'llámame', 'quiero contratar',
  'cuánto cuesta', 'cuanto cuesta', 'quiero hablar',
  'por teléfono', 'por telefono', 'me convenciste',
  'lo quiero', 'cómo pago', 'como pago', 'quiero empezar'
];

function detectarInteres(texto) {
  const lower = texto.toLowerCase();
  return TRIGGER_WORDS.some(word => lower.includes(word));
}

async function enviarWhatsApp(para, mensaje) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: para,
      text: { body: mensaje }
    },
    {
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== 'text') return;

  const from = msg.from;
  const text = msg.text.body;
  const cleanFrom = from.startsWith('521') ? from.replace('521', '52') : from;

  // Inicializar historial si es cliente nuevo
  if (!conversaciones[cleanFrom]) {
    conversaciones[cleanFrom] = [];
    console.log(`Nuevo cliente: ${cleanFrom}`);
  }

  // Agregar mensaje del cliente al historial
  conversaciones[cleanFrom].push({
    role: 'user',
    content: text
  });

  // Limitar historial a los últimos MAX_MENSAJES
  if (conversaciones[cleanFrom].length > MAX_MENSAJES) {
    conversaciones[cleanFrom] = conversaciones[cleanFrom].slice(-MAX_MENSAJES);
  }

  try {
    // Llamar a Claude con todo el historial
    const aiRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT || 'Eres un asistente amigable. Responde en español y de forma breve.',
        messages: conversaciones[cleanFrom] // Mandamos TODO el historial
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = aiRes.data.content[0].text;

    // Guardar respuesta de Mateo en el historial
    conversaciones[cleanFrom].push({
      role: 'assistant',
      content: reply
    });

    // Responder al cliente
    await enviarWhatsApp(cleanFrom, reply);

    // Detectar interés alto y alertar
    if (detectarInteres(text) && OWNER_PHONE) {
      const alerta = `🔥 *CLIENTE LISTO PARA CERRAR*\n\n` +
        `📱 Número: +${cleanFrom}\n` +
        `💬 Dijo: "${text}"\n\n` +
        `👆 Escríbele tú ahora para cerrar la venta.`;
      await enviarWhatsApp(OWNER_PHONE, alerta);
    }

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor corriendo');
});
