// AI connections: Claude, Gemini and ChatGPT with the user's own keys, plus Claude through claude.ai when the
// page runs there. Keys stay on this computer only.
const KEY_STORE = 'hfsub1:aikeys';
const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const PROVIDERS = {
  gemini: {
    name: 'Gemini (Google)',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHelp: 'ล็อกอินด้วยบัญชี Google → กด Create API key → คัดลอกมาวาง',
    note: 'มีโควตาใช้ฟรี แต่แบบฟรี Google อาจนำข้อความที่ส่งไปใช้พัฒนา AI และให้คนอ่านได้ งานลูกค้าที่เป็นความลับควรผูกบัตร (เปิด Billing ใน Google AI Studio) ก่อน พอเปิด Billing แล้วข้อมูลจะไม่ถูกนำไปใช้ แม้ใช้ในโควตาฟรี',
    free: true,
  },
  anthropic: {
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHelp: 'ล็อกอิน Anthropic Console → Create Key → คัดลอกมาวาง',
    note: 'คิดเงินตามที่ใช้ ต้องเติมเครดิตก่อน ข้อความที่ส่งผ่านกุญแจไม่ถูกนำไปฝึก AI',
  },
  openai: {
    name: 'ChatGPT (OpenAI)',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHelp: 'ล็อกอิน OpenAI Platform → Create new secret key → คัดลอกมาวาง',
    note: 'คิดเงินตามที่ใช้ ต้องเติมเครดิตก่อน ข้อความที่ส่งผ่านกุญแจไม่ถูกนำไปฝึก AI',
  }
};

export function getKeys() { try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}'); } catch (e) { return {}; } }
export function setKey(p, k) { const all = getKeys(); if (k) all[p] = k.trim(); else delete all[p]; try { localStorage.setItem(KEY_STORE, JSON.stringify(all)); } catch (e) {} }

let hostP = null;
export function hostClaude() {
  if (!hostP) hostP = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return hostP;
}

async function http(url, opts) {
  if (desktop) { const { fetch: tf } = await import('@tauri-apps/plugin-http'); return tf(url, opts); }
  return fetch(url, opts);
}
async function jsonOrThrow(r) {
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) {
    const msg = (j && (j.error && (j.error.message || j.error.type) || j.message)) || txt.slice(0, 200) || r.statusText;
    const err = new Error(`${r.status}: ${msg}`); err.status = r.status; throw err;
  }
  return j;
}

const AH = key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' });

export async function listModels(p) {
  const key = getKeys()[p];
  if (!key) throw new Error('ยังไม่ได้ใส่กุญแจ');
  let ids = [];
  if (p === 'anthropic') {
    const j = await jsonOrThrow(await http('https://api.anthropic.com/v1/models?limit=100', { headers: AH(key) }));
    ids = (j.data || []).map(m => ({ id: m.id, name: m.display_name || m.id, at: m.created_at || '' }));
  } else if (p === 'gemini') {
    const j = await jsonOrThrow(await http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key), {}));
    ids = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embed|aqa|image|tts|audio|live|vision/i.test(m.name))
      .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, at: '' }));
  } else if (p === 'openai') {
    const j = await jsonOrThrow(await http('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } }));
    ids = (j.data || []).filter(m => /^(gpt|o\d|chatgpt)/i.test(m.id) && !/audio|realtime|transcribe|tts|image|search|embedding|instruct|mini-tts/i.test(m.id))
      .map(m => ({ id: m.id, name: m.id, at: m.created ? String(m.created) : '' }));
  }
  return rankModels(p, ids);
}

// newest generation first, then the strongest size; the first three are marked as recommended
const BARE = id => id.toLowerCase().replace(/^(models\/)?(claude|gemini|gpt|chatgpt)[-_]?/, '');
const TIER = id => /(^|[-_.])(lite|nano|mini|haiku|small|tiny)(?![a-z])/.test(BARE(id)) ? 2 : /(^|[-_.])(flash|sonnet|turbo)(?![a-z])/.test(BARE(id)) ? 1 : 0;
const VER = id => { const m = id.replace(/^(claude|gemini|gpt|chatgpt)[-_]?/i, '').match(/(\d+(?:[.-]\d{1,2}(?!\d))?)/); return m ? parseFloat(m[1].replace('-', '.')) : 0; };
const ODD = id => /preview|exp|latest|-\d{4}-?\d{2}-?\d{2}|\d{8}/i.test(id) ? 1 : 0;
function rankModels(p, list) {
  const seen = new Set();
  list = list.filter(m => !seen.has(m.id) && seen.add(m.id));
  return list.sort((a, b) => Math.floor(VER(b.id)) - Math.floor(VER(a.id)) || TIER(a.id) - TIER(b.id) || VER(b.id) - VER(a.id) || ODD(a.id) - ODD(b.id) || String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id))
    .map((m, i) => Object.assign(m, { top: i < 3 }));
}
const MODELS = 'hfsub1:aimodels', SEL = 'hfsub1:aisel';
export function cachedModels(p) { try { return (JSON.parse(localStorage.getItem(MODELS) || '{}')[p]) || []; } catch (e) { return []; } }
export function cacheModels(p, list) { try { const all = JSON.parse(localStorage.getItem(MODELS) || '{}'); all[p] = list; localStorage.setItem(MODELS, JSON.stringify(all)); } catch (e) {} }
export function getSel() { try { return JSON.parse(localStorage.getItem(SEL) || '{}'); } catch (e) { return {}; } }
export function setSel(o) { try { localStorage.setItem(SEL, JSON.stringify(Object.assign(getSel(), o))); } catch (e) {} }
export const HOST_MODELS = [{ id: 'complex', name: 'ละเอียดที่สุด', top: true }, { id: 'default', name: 'มาตรฐาน', top: true }, { id: 'quick', name: 'เร็ว', top: false }];

// PDF pages as PNG images, for AI routes that read pictures but not PDFs
export async function pdfToImages(blob, maxPages = 12, onPage) {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out = [], n = Math.min(doc.numPages, maxPages);
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    try { const tc = await page.getTextContent(); text += tc.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('') + '\n\n'; } catch (e) {}
    if (i <= n) {
      const vp = page.getViewport({ scale: 1.6 });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      out.push(await new Promise(r => cv.toBlob(r, 'image/png')));
      if (onPage) onPage(i, n);
    }
  }
  return { images: out, text: text.trim(), pages: doc.numPages };
}

const b64 = async blob => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};

// files: [{ name, mime, blob }] — PDFs and images go to the model as they are, so tables inside pictures are read too
export async function chat({ provider, model, system, prompt, files = [], json = true, signal, maxTokens = 16000, history = [] }) {
  history = (history || []).filter(m => m && m.content);
  if (provider === 'host') {
    const s = await hostClaude();
    if (!s) throw new Error('ใช้ Claude ผ่าน claude.ai ได้เฉพาะตอนเปิดหน้านี้ใน claude.ai');
    const full = history.length ? history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })).concat([{ role: 'user', content: (system ? system + '\n\n' : '') + prompt }]) : (system ? system + '\n\n' : '') + prompt;
    const opts = { modelTier: ['quick', 'default', 'complex'].includes(model) ? model : 'default', signal };
    const imgs = [];
    for (const f of files) {
      if (/^image\//.test(f.mime)) imgs.push(f.blob);
      else if (f.mime === 'application/pdf') { const r = await pdfToImages(f.blob, 10); imgs.push(...r.images); }
    }
    if (imgs.length) opts.images = imgs.slice(0, 20);
    if (json) return s.json(full, opts);
    const r = await s(full, opts); return r && r.text != null ? r.text : String(r || '');
  }
  const key = getKeys()[provider];
  if (!key) throw new Error('ยังไม่ได้เชื่อม ' + PROVIDERS[provider].name);
  let text = '';
  if (provider === 'anthropic') {
    const content = [];
    for (const f of files) {
      if (f.mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await b64(f.blob) }, title: f.name });
      else if (/^image\//.test(f.mime)) content.push({ type: 'image', source: { type: 'base64', media_type: f.mime, data: await b64(f.blob) } });
    }
    content.push({ type: 'text', text: prompt });
    const j = await jsonOrThrow(await http('https://api.anthropic.com/v1/messages', { method: 'POST', headers: AH(key), signal,
      body: JSON.stringify({ model, max_tokens: maxTokens, system: system || undefined, messages: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })).concat([{ role: 'user', content }]) }) }));
    text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  } else if (provider === 'gemini') {
    const parts = [];
    for (const f of files) if (f.mime === 'application/pdf' || /^image\//.test(f.mime)) parts.push({ inline_data: { mime_type: f.mime, data: await b64(f.blob) } });
    parts.push({ text: prompt });
    const body = { contents: history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })).concat([{ role: 'user', parts }]), generationConfig: json ? { responseMimeType: 'application/json' } : {} };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const j = await jsonOrThrow(await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify(body) }));
    const cand = (j.candidates || [])[0];
    if (!cand) throw new Error('Gemini ไม่ตอบ: ' + JSON.stringify(j.promptFeedback || j).slice(0, 200));
    text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
  } else if (provider === 'openai') {
    const content = [{ type: 'text', text: prompt }];
    for (const f of files) {
      if (f.mime === 'application/pdf') content.push({ type: 'file', file: { filename: f.name, file_data: `data:application/pdf;base64,${await b64(f.blob)}` } });
      else if (/^image\//.test(f.mime)) content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${await b64(f.blob)}` } });
    }
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of history) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    msgs.push({ role: 'user', content });
    const j = await jsonOrThrow(await http('https://api.openai.com/v1/chat/completions', { method: 'POST', signal,
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: msgs }) }));
    text = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content || '' : '';
  }
  return json ? parseJSON(text) : text;
}

export function parseJSON(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = Math.min(...['[', '{'].map(ch => { const i = t.indexOf(ch); return i < 0 ? Infinity : i; }));
  const close = t[a] === '[' ? ']' : '}';
  const b = t.lastIndexOf(close);
  if (a === Infinity || b < a) { const err = new Error('AI ตอบกลับมาไม่ใช่ JSON'); err.code = 'invalid_json'; throw err; }
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { const err = new Error('AI ตอบกลับมาไม่ใช่ JSON'); err.code = 'invalid_json'; throw err; }
}

// providers usable right now, for the pickers
export async function available() {
  const keys = getKeys(), out = [];
  if (await hostClaude()) out.push('host');
  for (const p of Object.keys(PROVIDERS)) if (keys[p]) out.push(p);
  return out;
}

export async function openLink(url) {
  if (desktop) { try { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url); return; } catch (e) {} }
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
