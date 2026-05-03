import { setGlobalDispatcher, Agent } from 'undici';

setGlobalDispatcher(new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connect: { timeout: 30_000 }
}));

export function activeModel() {
  return process.env.MODEL || '(unset)';
}

export async function callModel(messages, { onThought } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is required (set in .env)');
  const model = process.env.MODEL;
  if (!model) throw new Error('MODEL is required (set in .env, e.g. anthropic/claude-haiku-4.5)');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;
  let printedThought = '';
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { done = true; break; }
      let obj;
      try { obj = JSON.parse(data); } catch { continue; }
      if (obj.usage) usage = obj.usage;
      const delta = obj.choices?.[0]?.delta?.content;
      if (!delta) continue;
      content += delta;
      if (onThought) {
        const next = extractThought(content);
        if (next && next.length > printedThought.length && next.startsWith(printedThought)) {
          onThought(next.slice(printedThought.length));
          printedThought = next;
        }
      }
    }
  }
  return { content, usage };
}

function extractThought(buffer) {
  const m = buffer.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return null;
  let raw = m[1];
  // strip trailing single backslash (incomplete escape)
  let trailing = 0;
  for (let i = raw.length - 1; i >= 0 && raw[i] === '\\'; i--) trailing++;
  if (trailing % 2 === 1) raw = raw.slice(0, -1);
  try {
    return JSON.parse('"' + raw + '"');
  } catch {
    return null;
  }
}

const pricingCache = new Map();

export async function getPricing(modelId) {
  if (pricingCache.has(modelId)) return pricingCache.get(modelId);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data.data?.find((x) => x.id === modelId);
    if (!m?.pricing) return null;
    const pricing = {
      prompt: parseFloat(m.pricing.prompt) || 0,
      completion: parseFloat(m.pricing.completion) || 0
    };
    pricingCache.set(modelId, pricing);
    return pricing;
  } catch {
    return null;
  }
}

export function computeCost(usage, pricing) {
  if (!usage || !pricing) return null;
  return (usage.prompt_tokens || 0) * pricing.prompt
       + (usage.completion_tokens || 0) * pricing.completion;
}
