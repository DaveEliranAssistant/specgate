// Optional free-tier adapters. Keys come only from the environment and are never logged or returned.
// Free tiers are not an SLA: one attempt, short timeout, any failure => the deterministic result stands.
import { SYSTEM_PROMPT } from './payload.mjs';

const plainModel = m => { if (!/^[\w.-]+$/.test(m)) throw new Error('Invalid model name'); return m; };

export const PROVIDERS = Object.freeze({
 groq: {
  env: ['GROQ_API_KEY'],
  model: 'llama-3.1-8b-instant',
  request: (p, env, model) => ({
   url: 'https://api.groq.com/openai/v1/chat/completions',
   headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
   body: { model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(p) }] },
  }),
  text: j => j?.choices?.[0]?.message?.content,
 },
 gemini: {
  env: ['GEMINI_API_KEY'],
  model: 'gemini-2.5-flash',
  request: (p, env, model) => ({
   url: `https://generativelanguage.googleapis.com/v1beta/models/${plainModel(model)}:generateContent`,
   headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
   body: { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(p) }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
  }),
  text: j => j?.candidates?.[0]?.content?.parts?.map(x => x.text ?? '').join(''),
 },
 cloudflare: {
  env: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
  model: '@cf/meta/llama-3.1-8b-instruct',
  request: (p, env, model) => {
   if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-hex account id');
   if (!/^@(cf|hf)\/[\w.-]+\/[\w.-]+$/.test(model)) throw new Error('Workers AI model must look like @cf/vendor/model');
   return {
    url: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body: { temperature: 0, max_tokens: 800, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(p) }] },
   };
  },
  text: j => { const r = j?.result?.response; return typeof r === 'string' ? r : r ? JSON.stringify(r) : undefined; },
 },
});

// Returns { ok, text?, error? }. error strings are fixed vocabulary; response bodies and keys are never echoed.
export async function callProvider(name, payload, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15000, model } = {}) {
 const p = Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : null;
 if (!Object.hasOwn(PROVIDERS, name)) return { ok: false, error: 'unknown-provider' };
 if (!p.env.every(k => typeof env[k] === 'string' && env[k].length)) return { ok: false, error: 'missing-credentials' };
 let req;
 try { req = p.request(payload, env, model ?? env.SPECGATE_TRIAGE_MODEL ?? p.model); } catch { return { ok: false, error: 'invalid-provider-config' }; }
 const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
 try {
  const res = await fetchImpl(req.url, { method: 'POST', redirect: 'error', signal: ctrl.signal, headers: { 'content-type': 'application/json', ...req.headers }, body: JSON.stringify(req.body) });
  if (res.status === 429) return { ok: false, error: 'rate-limited' };
  if (!res.ok) return { ok: false, error: `http-${res.status}` };
  const raw = await res.text();
  if (raw.length > 200000) return { ok: false, error: 'response-too-large' };
  const text = p.text(JSON.parse(raw));
  return typeof text === 'string' ? { ok: true, text } : { ok: false, error: 'unexpected-response-shape' };
 } catch (e) {
  return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'network-or-parse-failure' };
 } finally { clearTimeout(timer); }
}
