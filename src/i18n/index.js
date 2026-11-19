// Program language (ไทย / English / 中文).
// The UI is written in Thai; this module swaps visible text and tooltips to the chosen language
// and keeps doing it for anything the app adds later. User content (subtitles, source text,
// glossary and QA tables) is never touched.
import { DICT, PATTERNS } from './dict.js';

export const LANGS = { th: 'ไทย', en: 'English', zh: '中文' };
const KEY = 'hfsub1:lang';
const COL = { en: 0, zh: 1 };
const ATTRS = ['title', 'placeholder', 'aria-label'];
const SKIP = '#list, #cap, #ov, #ta, #taBack, #edSrc, #qaT, #gPrev, #xPrev, #aiRes, #aiPromptBox, #aiPaste, #aiRules, #pairT, #edIss, script, style, textarea, [data-no-i18n]';

const origText = new WeakMap();
let lang = 'th';
try { lang = localStorage.getItem(KEY) || 'th'; } catch (e) {}
if (!LANGS[lang]) lang = 'th';

function translate(src) {
  if (lang === 'th') return src;
  const key = src.trim();
  if (!key) return src;
  const hit = DICT[key];
  let out = hit ? hit[COL[lang]] : null;
  if (out == null) {
    for (const p of PATTERNS) { if (p[0].test(key)) { out = key.replace(p[0], p[1 + COL[lang]]); break; } }
  }
  if (out == null) return src;
  const lead = src.match(/^\s*/)[0], tail = src.match(/\s*$/)[0];
  return lead + out + tail;
}

export function t(src) { return translate(src); }

const skipped = el => !!(el && el.closest && el.closest(SKIP));

function doText(node) {
  const el = node.parentElement;
  if (!el || skipped(el)) return;
  const cur = node.nodeValue;
  const rec = origText.get(node);
  // anything other than what we last wrote (or its Thai source) means the app rewrote it → new source
  const src = rec && (cur === rec.out || cur === rec.src) ? rec.src : cur;
  const next = translate(src);
  origText.set(node, { src, out: next });
  if (next !== cur) node.nodeValue = next;
}

function doAttrs(el) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const store = 'data-i18n-' + a, last = store + '-out';
    const cur = el.getAttribute(a);
    const prev = el.getAttribute(store);
    const src = prev != null && (cur === el.getAttribute(last) || cur === prev) ? prev : cur;
    const next = translate(src);
    el.setAttribute(store, src);
    el.setAttribute(last, next);
    if (next !== cur) el.setAttribute(a, next);
  }
}

function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeType === 1 && n.matches(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let n = tw.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = tw.nextNode(); }
}

let busy = false;
const mo = new MutationObserver(muts => {
  if (busy || lang === 'th') return;
  busy = true;
  try {
    for (const m of muts) {
      if (skipped(m.target.nodeType === 1 ? m.target : m.target.parentElement)) continue;
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'attributes') doAttrs(m.target);
      else if (m.type === 'characterData') doText(m.target);
    }
  } finally { mo.takeRecords(); busy = false; }
});

export function setLang(next) {
  if (!LANGS[next]) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch (e) {}
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
  busy = true;
  try { walk(document.body); } finally { mo.takeRecords(); busy = false; }
  const sel = document.getElementById('langSel');
  if (sel && sel.value !== next) sel.value = next;
}

export function getLang() { return lang; }

export function initI18n() {
  const sel = document.getElementById('langSel');
  if (sel) {
    sel.value = lang;
    sel.addEventListener('change', () => setLang(sel.value));
  }
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  setLang(lang);
}
