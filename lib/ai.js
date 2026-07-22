// Unified AI provider layer. Any OpenAI-compatible chat/completions endpoint
// works out of the box. Choose one via AI_PROVIDER env var:
//   grok   -> xAI Grok        (needs credits at https://console.x.ai)
//   groq   -> Groq Cloud      (FREE tier, https://console.groq.com)
//   hf     -> Hugging Face    (free-ish, rate-limited)
//   openai -> OpenAI          (pay-per-use)

const PROVIDER = () => (process.env.AI_PROVIDER || 'grok').toLowerCase();

function providerConfig() {
  const p = PROVIDER();
  if (p === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      name: 'groq',
      envHint: 'GROQ_API_KEY',
    };
  }
  if (p === 'hf') {
    return {
      url: 'https://router.huggingface.co/v1/chat/completions',
      key: process.env.HF_API_KEY,
      model: process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct',
      name: 'huggingface',
      envHint: 'HF_API_KEY',
    };
  }
  if (p === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      name: 'openai',
      envHint: 'OPENAI_API_KEY',
    };
  }
  // default: grok (xAI)
  return {
    url: 'https://api.x.ai/v1/chat/completions',
    key: process.env.GROK_API_KEY,
    model: process.env.GROK_MODEL || 'grok-2-latest',
    name: 'grok',
    envHint: 'GROK_API_KEY',
  };
}

export async function chatComplete(prompt, { temperature = 0.4, maxTokens = 900 } = {}) {
  const cfg = providerConfig();
  if (!cfg.key) throw new Error(`Missing API key for ${cfg.name}. Set ${cfg.envHint} in .env.local.`);

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'You are a concise assistant that returns strictly valid JSON when asked.' },
      { role: 'user', content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${cfg.name} error ${res.status}: ${t.slice(0, 400)}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content || '';
  return text;
}

export function parseJsonLoose(text) {
  const cleaned = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  const fa = cleaned.indexOf('[');
  const la = cleaned.lastIndexOf(']');
  if (fa >= 0 && la > fa) {
    try { return JSON.parse(cleaned.slice(fa, la + 1)); } catch {}
  }
  throw new Error('Model did not return valid JSON');
}
