import * as AIX from './ai.js';
import * as PDB from './projdb.js';
(() => {
'use strict';
const C = window.SubCore;
const { toMs, fmt, fmtAss, decode, parseSrt, parseAss, buildSrt, encodeFile, lineLen, scriptOf, LANG_LABEL, compileLex, CAT, FIXABLE, PRESETS, DEF_CFG, DEF_LEX,
  analyzeEpisode, fixText, autoBreak, joinLines, glossCompile, makeZip, zipList, zipRead, xlsxBook, guessMap, sheetToEps, xlsxPatch, xlsxNew, colName,
  textRows, glossFromRows, epInfo, baseOf, fnv, p2, swapGender, dropParticles, audioPeaks, pitchTrack, xlsxMulti, presetsFor, cfgForTarget, TGT_NAME, xlsxRows } = C;
const $ = id => document.getElementById(id);
const waveSize = { w: 0, h: 0 };
const video = $('video'), stage = $('stage'), cap = $('cap'), ph = $('ph'), list = $('list'), ta = $('ta'), clock = $('clock');

/* ---------- storage ---------- */
const LS = 'hfsub1:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }
};
const LEXVER = 4;
const AI_RULES = `- แปลให้ครบความหมาย ห้ามแปลขาด ห้ามแปลเกิน ห้ามเติมความหมายที่ต้นฉบับไม่มี ประโยคบอกเล่าห้ามกลายเป็นคำถาม
- ภาษาพูดธรรมชาติ กระชับ ไม่แข็งเหมือนเครื่องแปล คำพูดธรรมชาติที่ถูกอยู่แล้วไม่ต้องแก้
- ใส่หางเสียงเท่าที่จำเป็น ห้ามลงท้ายด้วยหางเสียงเดิมติดกันหลายคิว
- ห้ามใช้ กู มึง และคำหยาบ ใช้ ฉัน/แก ไอ้บ้า บ้าเอ๊ย แทน
- ไม้ยมก ๆ เว้นวรรคหน้าและหลัง
- ห้ามเปลี่ยนชื่อตัวละคร ศัพท์ที่อยู่ใน术语表ต้องใช้ตามนั้นเท่านั้น
- 画面字 เสียงในใจ เสียงโทรศัพท์ ใส่วงเล็บ ( ) เฉพาะเมื่อต้นฉบับมีวงเล็บ ถ้าต้นฉบับไม่มีวงเล็บห้ามเติมเอง
- เรื่องปัจจุบัน: ผู้หญิงใช้ ฉัน (หนู เฉพาะพูดกับพ่อแม่หรือญาติผู้ใหญ่) ผู้ชายใช้ ผม
- ค่าเงิน: ทำตามกฎของงานนี้ (แก้บรรทัดนี้ได้ เช่น ห้ามแปลงค่าเงิน / หยวน×10 = บาท)`;
const AI_RULES_ZH = `- แปลให้ครบความหมาย ห้ามแปลขาด ห้ามแปลเกิน ห้ามเติมความหมายที่ต้นฉบับไม่มี
- ภาษาจีนตัวย่อแบบพูดธรรมชาติ สำนวนซับละครจีน กระชับ
- ห้ามใช้ ，。；、 ในซับ ระหว่างวลีให้เว้นวรรค (？！ และ …… ใช้ตามกฎลูกค้า)
- ชื่อตัวละครและศัพท์ใน术语表ต้องใช้ตามนั้น ชื่อที่ไม่มีในตารางให้ถอดเสียงเป็นจีนให้เหมือนกันทั้งเรื่อง
- 画面字 เสียงในใจ เสียงโทรศัพท์ ใส่วงเล็บ（）เฉพาะเมื่อต้นฉบับมีวงเล็บ
- ตัวเลขใช้เลขอารบิก ค่าเงินทำตามกฎของงานนี้`;
const AI_RULES_EN = `- แปลให้ครบความหมาย ห้ามแปลขาด ห้ามแปลเกิน
- ภาษาอังกฤษพูดธรรมชาติ กระชับแบบซับไตเติ้ล ขึ้นต้นประโยคด้วยตัวพิมพ์ใหญ่ ใช้เครื่องหมายวรรคตอนตามปกติ
- ชื่อตัวละครและศัพท์ใน术语表ต้องใช้ตามนั้น ชื่อที่ไม่มีในตารางให้ถอดเสียงแบบเดียวกันทั้งเรื่อง (ชื่อจีนใช้พินอินไม่มีวรรณยุกต์)
- คำเรียกญาติหรือตำแหน่งแปลเป็นอังกฤษที่เป็นธรรมชาติ
- 画面字 ใส่วงเล็บ [ ] หรือ ( ) ตามกฎลูกค้า เฉพาะเมื่อต้นฉบับมีวงเล็บ`;
const defaultRules = tgt => tgt === 'zh' ? AI_RULES_ZH : tgt === 'en' ? AI_RULES_EN : AI_RULES;

/* ---------- projects: each one keeps its own files, edits, 术语表, criteria, rules and client ---------- */
const PJ = (() => {
  let p = store.get('projects', null);
  if (!p || !Array.isArray(p.list) || !p.list.length) {
    const id = 'p' + Date.now().toString(36);
    p = { cur: id, list: [{ id, name: 'โปรเจกต์แรก', src: 'auto', tgt: 'th', client: '', created: Date.now(), updated: Date.now(), eps: 0 }] };
    try {
      const mv = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith(LS + 'draft3:') || k.startsWith(LS + 'done:'))) mv.push(k); }
      for (const k of mv) { localStorage.setItem(LS + 'p:' + id + ':' + k.slice(LS.length), localStorage.getItem(k)); localStorage.removeItem(k); }
      const g = localStorage.getItem(LS + 'gloss'); if (g) localStorage.setItem(LS + 'p:' + id + ':gloss', g);
      const st = store.get('settings2', null);
      if (st && st.cfg) store.set('p:' + id + ':cfg', st.cfg);
      if (st && st.view && st.view.aiRules) store.set('p:' + id + ':aiRules', st.view.aiRules);
    } catch (e) {}
    store.set('projects', p);
  }
  if (!p.list.some(x => x.id === p.cur)) p.cur = p.list[0].id;
  return p;
})();
const saveProjects = () => store.set('projects', PJ);
const pk = k => 'p:' + S.pid + ':' + k;
const curProj = () => PJ.list.find(x => x.id === S.pid) || PJ.list[0];
const old = store.get('settings', {}) || {};
const saved = store.get('settings2', null) || {};
const VIEW_DEF = { autoNext: true, follow: true, overlay: true, ovColor: true, subPos: 8, rate: 1, left: null, showSrc: true, clickPlay: true, wspan: 8, aiRules: AI_RULES, aiTier: 'default' };
const S = {
  pid: PJ.cur,
  view: Object.assign({}, VIEW_DEF, saved.view || {}),
  cfg: Object.assign({}, DEF_CFG, store.get('p:' + PJ.cur + ':cfg', null) || saved.cfg || {}),
  lexSrc: Object.assign({}, DEF_LEX, saved.lex || {}),
  eps: [], srcs: [], videos: [], books: [], sel: null, cur: -1, playIdx: -1, stopAt: null, lockTime: true, multi: new Set(), anchor: null,
  query: '', regex: false, cs: false, onlyMatch: true, filter: 'all', folder: '', drafts: null, qv: 1,
  gloss: [], glossName: '', audio: new Map(), restoring: false
};
{ const pr = PJ.list.find(x => x.id === PJ.cur); S.cfg.tgt = pr.tgt || 'th'; S.cfg.src = pr.src || 'auto'; }
S.aiRules = store.get('p:' + PJ.cur + ':aiRules', null) || defaultRules(S.cfg.tgt);
if (!saved.view) for (const k of ['autoNext', 'follow', 'overlay', 'subPos', 'rate', 'left']) if (old[k] !== undefined) S.view[k] = old[k];
if (saved.lex && saved.lexVer !== LEXVER) {
  const W = s => String(s || '').split(/[\s,，、]+/).filter(Boolean);
  const P = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const k of Object.keys(DEF_LEX)) {
    if (['period', 'modern', 'spell', 'spellEn', 'spellZh'].includes(k)) {
      const have = new Set(P(S.lexSrc[k]).map(l => l.split(/\s*(?:>|→)\s*/)[0]));
      S.lexSrc[k] = P(S.lexSrc[k]).concat(P(DEF_LEX[k]).filter(l => !have.has(l.split(/\s*(?:>|→)\s*/)[0]))).join('\n');
    } else S.lexSrc[k] = [...new Set(W(S.lexSrc[k]).concat(W(DEF_LEX[k])))].join(' ');
  }
}
S.L = compileLex(S.lexSrc);
const gsaved = store.get('p:' + PJ.cur + ':gloss', null);
if (gsaved && Array.isArray(gsaved.list)) { S.gloss = gsaved.list; S.glossName = gsaved.name || ''; }
S.G = glossCompile(S.gloss);
const saveSettings = () => { store.set('settings2', { view: S.view, lex: S.lexSrc, lexVer: LEXVER }); store.set(pk('cfg'), S.cfg); store.set(pk('aiRules'), S.aiRules); };
const tgtLang = () => S.cfg.tgt || 'th';
const TGT_LABEL = () => TGT_NAME[tgtLang()] || 'ไทย';
const uiSaved = store.get('ui', null);
if (uiSaved === 'day' || uiSaved === 'night') document.documentElement.dataset.ui = uiSaved;
saveSettings();

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const isEdited = c => c.t !== c.oT || c.s !== c.oS || c.e !== c.oE;
const epEdited = ep => !!ep.struct || !!ep.gen || ep.cues.some(isEdited);
const doneKey = ep => pk('done:' + ep.name + ':' + ep.hash);
const isDone = ep => !ep.sample && !!store.get(doneKey(ep), false);
const realEps = () => S.eps.filter(e => !e.sample);
const epVideo = ei => { const ep = S.eps[ei]; return ep && ep.video != null ? S.videos[ep.video] : null; };
const epSrc = ep => (ep && ep.src != null) ? S.srcs[ep.src] : null;
const fmtFor = ep => ep && ep.kind === 'ass' ? fmtAss : fmt;
const Q = c => c._q || { iss: [], marks: [], g: '', cps: null, src: null };
const hasSev = (c, sevs) => Q(c).iss.some(x => sevs.includes(x.sev));
const hasCode = (c, code) => Q(c).iss.some(x => x.code === code);
const curCue = () => S.sel && S.eps[S.sel.e] ? S.eps[S.sel.e].cues[S.sel.c] : null;
const key = (ei, ci) => ei + ':' + ci;
const extOf = n => ((n.match(/\.([^.\/]+)$/) || [])[1] || '').toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rangesHtml(text, ranges) {
  if (!ranges || !ranges.length) return esc(text);
  const pts = new Set([0, text.length]);
  for (const r of ranges) { pts.add(Math.max(0, Math.min(text.length, r.s))); pts.add(Math.max(0, Math.min(text.length, r.e))); }
  const P = [...pts].sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (a === b) continue;
    const piece = text.slice(a, b);
    const cls = [...new Set(ranges.filter(r => r.s <= a && r.e >= b).map(r => r.c))].join(' ');
    out += cls ? `<span class="${cls}">${esc(piece)}</span>` : esc(piece);
  }
  return out;
}
let claudeP = null;
const getSample = () => { if (!claudeP) claudeP = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('sample').catch(() => null) : Promise.resolve(null); return claudeP; };

/* ---------- episodes ---------- */
function makeEp(name, text, o = {}) {
  const info = epInfo(name), ass = /\.(ass|ssa)$/i.test(name);
  const ep = {
    name, num: info.num, group: info.group, base: baseOf(name), kind: ass ? 'ass' : 'srt',
    label: info.num != null ? 'EP' + p2(info.num) : name.replace(/\.[^.]+$/, ''),
    raw: o.raw || null, bom: !!o.bom, enc: o.enc || 'utf-8', eol: text.includes('\r\n') ? '\r\n' : '\n',
    trail: /\n[ \t]*\n\s*$/.test(text.replace(/\r/g, '')), hash: fnv(text), video: null, src: null, sample: !!o.sample, struct: false, dirty: true, qv: 0
  };
  if (ass) { const p = parseAss(text); ep.lines = p.lines; ep.cues = p.cues; ep.dlg = p.dlg; } else ep.cues = parseSrt(text);
  return ep;
}
function makeSrc(name, text) {
  const info = epInfo(name), ass = /\.(ass|ssa)$/i.test(name);
  const cues = ass ? parseAss(text).cues : parseSrt(text);
  return { name, num: info.num, group: info.group, base: baseOf(name), cues, lang: scriptOf(cues.slice(0, 80).map(c => c.t).join(' ')) };
}

/* ---------- sample (shown until real files arrive) ---------- */
const SAMPLE = [
['ตัวอย่าง_EP01.srt', `1
00:00:01,200 --> 00:00:03,100
ประธานกลับมาแล้วค่ะ

2
00:00:03,400 --> 00:00:06,000
(สามปีก่อน) เธอทิ้งฉันไปโดยไม่บอกลาสักคำ

3
00:00:06,300 --> 00:00:08,200
ผมไม่ได้ตั้งใจจะทิ้งคุณนะครับ

4
00:00:08,600 --> 00:00:12,400
ถ้าคุณยังไม่ยอมเซ็นสัญญาภายในวันนี้ บริษัทของเราจะถอนการลงทุนทั้งหมดทันที

5
00:00:12,800 --> 00:00:14,500
เลิกพูดเรื่อง工作ได้แล้วค่ะ
`, `1
00:00:01,200 --> 00:00:03,100
主席回来了

2
00:00:03,400 --> 00:00:06,000
（三年前）
你一声不吭就离开了我

3
00:00:06,300 --> 00:00:08,200
我不是故意要离开你的

4
00:00:08,600 --> 00:00:12,400
如果你今天还不签合同
我们公司会立刻撤回所有投资

5
00:00:12,800 --> 00:00:14,500
别再谈工作了
`],
['ตัวอย่าง_EP02.srt', `1
00:00:00,800 --> 00:00:02,600
เมื่อคืนคุณไปไหนมาคะ

2
00:00:02,900 --> 00:00:05,100
ไปส่งเพื่อนที่โรงพยาบาลครับ

3
00:00:05,500 --> 00:00:08,000
เพื่อนคนไหน
ทำไมฉันไม่เคยได้ยินชื่อ

4
00:00:08,400 --> 00:00:10,000
(ห้องประชุมชั้น 32)

5
00:00:10,300 --> 00:00:12,600
คุณไม่ได้โกหกฉันจริงๆใช่ไหม
`, `1
00:00:00,800 --> 00:00:02,600
昨晚你去哪了？

2
00:00:02,900 --> 00:00:05,100
送朋友去医院了

3
00:00:05,500 --> 00:00:08,000
哪个朋友？
我怎么从没听说过

4
00:00:08,400 --> 00:00:10,000
（32楼会议室）

5
00:00:10,300 --> 00:00:12,600
你真的没骗我？
`]
];
const WELCOME = `<div class="ph-in"><strong>ลากไฟล์ทั้งหมดมาวางตรงไหนก็ได้</strong><span>ไฟล์คำแปล ซับต้นฉบับ วิดีโอ zip rar Excel 对照表 หรือ术语表 ระบบแยกให้เองตามคู่ภาษาของโปรเจกต์ และจับคู่ตามเลขตอน</span><div class="ph-btns"><button class="btn primary" type="button" data-act="dir">เปิดโฟลเดอร์</button><button class="btn" type="button" data-act="files">เลือกไฟล์</button></div><span class="fine">ไฟล์เปิดในเครื่องเธอเท่านั้น ไม่มีการอัปโหลด<br>เล่นได้แน่นอนคือ MP4 (H.264) · รายการด้านขวาตอนนี้เป็นซับตัวอย่าง</span></div>`;
function phFor(ei) {
  const ep = S.eps[ei];
  if (!ep || ep.sample || !realEps().length) return WELCOME;
  return `<div class="ph-in"><strong>${esc(ep.label)} ยังไม่มีวิดีโอ</strong><span class="fine">${esc(ep.name)}</span><span>ลากไฟล์วิดีโอมาวาง หรือกดจับคู่ไฟล์เพื่อเลือกเอง</span><div class="ph-btns"><button class="btn" type="button" data-act="pair">จับคู่ไฟล์</button></div></div>`;
}
const showPh = html => { ph.innerHTML = html; ph.hidden = false; cap.hidden = true; };
const hidePh = () => { ph.hidden = true; renderOverlay(true); };

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg, act, ms) {
  $('toastMsg').textContent = msg;
  const b = $('toastAct');
  if (act) { b.textContent = act.label; b.hidden = false; b.onclick = () => { act.fn(); hideToast(); }; } else b.hidden = true;
  $('toast').classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(hideToast, ms || (act ? 10000 : 4500));
}
const hideToast = () => $('toast').classList.remove('on');

/* ---------- analysis ---------- */
function ensureQA(ei) {
  const ep = S.eps[ei];
  if (!ep || (ep.qv === S.qv && !ep.dirty)) return;
  const src = epSrc(ep), v = epVideo(ei), au = v ? S.audio.get(v.url) : null;
  const res = analyzeEpisode(ep.cues, src ? src.cues : null, S.cfg, S.L, S.G, { ass: ep.kind === 'ass', pitch: au && au.track && !ep.noTime ? au.track : null });
  ep.cues.forEach((c, k) => { c._q = res[k]; });
  ep.qv = S.qv; ep.dirty = false;
}
const ensureAll = () => S.eps.forEach((_, i) => ensureQA(i));
let rqT = 0;
function requalify() { S.qv++; clearTimeout(rqT); rqT = setTimeout(() => { renderList(); renderStats(); loadEditor(); renderOverlay(true); drawWave(); if ($('mQA').classList.contains('open')) renderQA(); }, 120); }
const srcTextOf = (ep, c) => { const s = epSrc(ep), q = Q(c); return s && q.src ? q.src.map(j => s.cues[j].t).join('\n') : ''; };

/* ---------- search ---------- */
function matcher() {
  if (!S.query) return null;
  try { return new RegExp(S.regex ? S.query : S.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (S.cs ? '' : 'i') + 'u'); }
  catch (e) { return 'bad'; }
}
const goodRe = re => (re && re !== 'bad') ? re : null;
const hits = (t, re) => { re.lastIndex = 0; return re.test(t); };
function hitRanges(t, re) {
  const out = []; if (!re) return out;
  re.lastIndex = 0; let m;
  while ((m = re.exec(t))) { if (m[0] === '') { re.lastIndex++; continue; } out.push({ s: m.index, e: m.index + m[0].length, c: 'hit' }); }
  return out;
}
function passFilter(ep, c, re) {
  if (re && S.onlyMatch && !hits(c.t, re) && !hits(srcTextOf(ep, c), re)) return false;
  const f = S.filter;
  if (f === 'issues') return hasSev(c, ['e', 'w']);
  if (f === 'over') return hasCode(c, 'over') || hasCode(c, 'lines');
  if (f === 'edited') return isEdited(c);
  if (f === 'male') return Q(c).g.includes('m');
  if (f === 'female') return Q(c).g.includes('f');
  if (f.startsWith('c:')) return hasCode(c, f.slice(2));
  return true;
}

/* ---------- list rendering ---------- */
const SEVLAB = { e: 'ต้องแก้', w: 'ควรเช็ก', i: 'ข้อสังเกต' };
function chipsHtml(iss) {
  if (!iss.length) return '';
  const show = iss.slice(0, 4).map(x => `<span class="chip ${x.sev}" title="${esc(x.msg)}">${esc(CAT[x.code][1])}</span>`).join('');
  return `<div class="chips">${show}${iss.length > 4 ? `<span class="chip i">+${iss.length - 4}</span>` : ''}</div>`;
}
function rowHtml(ei, ci, re) {
  const ep = S.eps[ei], c = ep.cues[ci], q = Q(c);
  const lines = c.t.split('\n'), cnt = lines.map(l => lineLen(l, S.cfg.mode));
  const sev = q.iss.some(x => x.sev === 'e') ? ' se' : q.iss.some(x => x.sev === 'w') ? ' sw' : '';
  const sel = S.sel && S.sel.e === ei && S.sel.c === ci, play = S.cur === ei && S.playIdx === ci;
  const cls = 'row' + sev + (q.ov ? ' ovl' : '') + (isEdited(c) ? ' edited' : '') + (sel ? ' sel' : '') + (play ? ' play' : '') + (S.multi.has(key(ei, ci)) ? ' msel' : '');
  const txt = c.t ? rangesHtml(c.t, re ? q.marks.concat(hitRanges(c.t, re)) : q.marks) : '<span class="empty">(ว่าง)</span>';
  const st = srcTextOf(ep, c);
  const srcH = st ? rangesHtml(st, re ? hitRanges(st, re) : []) : '';
  const g = q.g === 'm' ? '<span class="g gm" title="มีหางเสียงหรือสรรพนามผู้ชาย">ช</span>' : q.g === 'f' ? '<span class="g gf" title="มีหางเสียงหรือสรรพนามผู้หญิง">ญ</span>' : q.g === 'mf' ? '<span class="g gx" title="มีทั้งชายและหญิง">ช/ญ</span>' : '';
  const dur = (c.em - c.sm) / 1000;
  const durBad = q.iss.some(x => ['cps', 'short', 'zero', 'overlap'].includes(x.code));
  const du = ep.noTime ? 'ไม่มีเวลา' : isFinite(dur) ? `${dur.toFixed(2)}s${q.cps != null ? ' · ' + q.cps.toFixed(0) + 'cps' : ''}` : '';
  const counts = cnt.map(n => n > S.cfg.limit ? `<span class="x">${n}</span>` : n).join('<br>');
  const label = (!ep.struct && c.idx != null && c.idx !== '') ? c.idx : ci + 1;
  return `<div class="${cls}" id="r-${ei}-${ci}" data-e="${ei}" data-c="${ci}"><span class="n">${esc(label)}</span><span class="gcol">${g}</span><span class="tc">${ep.noTime ? 'แถว ' + esc(c.xr) : esc(c.s) + '<br>' + esc(c.e)}<span class="du${durBad ? ' x' : ''}">${du}</span></span><span class="src">${srcH}</span><div class="tx"><div class="txt">${txt}</div>${chipsHtml(q.iss)}</div><span class="ct">${counts}</span></div>`;
}
function headHtml(ei) {
  const ep = S.eps[ei];
  let ed = 0, ov = 0, pr = 0;
  for (const c of ep.cues) { if (isEdited(c)) ed++; if (Q(c).ov) ov++; if (hasSev(c, ['e', 'w'])) pr++; }
  const v = epVideo(ei), s = epSrc(ep);
  const tip = ep.name + (s ? '\n原文: ' + s.name : '') + (v ? '\nวิดีโอ: ' + v.name : '');
  const kind = ep.kind === 'xlsx' ? 'Excel' : ep.kind === 'ass' ? 'ASS' : ep.gen ? 'ไฟล์ใหม่' : 'SRT';
  return `<div class="eph${S.cur === ei ? ' cur' : ''}" id="h-${ei}" data-ep="${ei}" title="${esc(tip)}"><b>${esc(ep.label)}</b><span class="fn">${esc(ep.name)}</span><span class="meta">${kind} · ${ep.cues.length} คิว${pr ? ` · <i class="bad">ปัญหา ${pr}</i>` : ''}${ov ? ` · <i class="bad">เกิน ${ov}</i>` : ''}${ed ? ` · <i class="ed">แก้ ${ed}</i>` : ''}${ep.struct ? ' · <i class="ed">จำนวนคิวเปลี่ยน</i>' : ''}${isDone(ep) ? ' · <i class="done">✓ ตรวจเสร็จ</i>' : ''} · ${s ? '原文 ' + (LANG_LABEL[s.lang] || '') : 'ไม่มี原文'} · ${v ? 'มีวิดีโอ' : 'ไม่มีวิดีโอ'}</span></div>`;
}
const rowCache = new Map();
function renderList() {
  ensureAll();
  const rawRe = matcher(), re = goodRe(rawRe);
  list.classList.toggle('srcon', S.view.showSrc && S.eps.some(e => e.src != null));
  let html = '';
  rowCache.clear();
  S.eps.forEach((ep, ei) => {
    let rows = '', n = 0;
    for (let ci = 0; ci < ep.cues.length; ci++) {
      if (!passFilter(ep, ep.cues[ci], re)) continue;
      const h = rowHtml(ei, ci, re); rowCache.set(`r-${ei}-${ci}`, h); rows += h; n++;
    }
    if (n) html += `<div class="epb" id="b-${ei}" style="contain-intrinsic-size:auto ${n * 52 + 36}px">` + headHtml(ei) + rows + '</div>';
    else if (!re && S.filter === 'all') html += `<div class="epb" id="b-${ei}">` + headHtml(ei) + '<div class="none">ไฟล์นี้ไม่มีคิวซับ</div></div>';
  });
  if (!html) html = `<div class="none">ไม่มีคิวที่ตรงกับตัวกรองนี้</div>`;
  list.innerHTML = html;
  updateFindInfo(rawRe);
  renderCodeFilter();
}
function updateEpRows(ei) {
  const ep = S.eps[ei], re = goodRe(matcher());
  for (let ci = 0; ci < ep.cues.length; ci++) {
    const id = `r-${ei}-${ci}`, el = $(id);
    if (!el) continue;
    const h = rowHtml(ei, ci, re);
    if (rowCache.get(id) !== h) { el.outerHTML = h; rowCache.set(id, h); }
  }
  refreshHead(ei);
}
function updateFindInfo(rawRe) {
  const el = $('findInfo');
  el.classList.toggle('bad', rawRe === 'bad');
  if (!rawRe) { el.textContent = ''; return; }
  if (rawRe === 'bad') { el.textContent = 'รูปแบบ regex ไม่ถูก'; return; }
  let n = 0; const eps = new Set();
  S.eps.forEach((ep, ei) => ep.cues.forEach(c => { rawRe.lastIndex = 0; const m = c.t.match(rawRe); if (m) { n += m.length; eps.add(ei); } }));
  el.textContent = n ? `เจอใน译文 ${n} จุด ใน ${eps.size} ตอน` : 'ไม่เจอใน译文';
}
function refreshHead(ei) { const h = $('h-' + ei); if (h && S.eps[ei]) h.outerHTML = headHtml(ei); }
function setRowClass(ei, ci, cls, on) { const el = $(`r-${ei}-${ci}`); if (el) el.classList.toggle(cls, on); }
function syncMulti() { list.querySelectorAll('.row.msel').forEach(r => r.classList.remove('msel')); for (const k of S.multi) { const [e, c] = k.split(':'); setRowClass(+e, +c, 'msel', true); } }
const topIn = el => { let t = 0, x = el; while (x && x !== list && list.contains(x)) { t += x.offsetTop; x = x.offsetParent; } return t; };
function scrollToEl(el, center) {
  if (!el) return;
  const top = topIn(el), h = el.offsetHeight, st = list.scrollTop, ch = list.clientHeight, head = 34;
  if (center) { list.scrollTop = top - ch / 2 + h / 2; return; }
  if (top < st + head) list.scrollTop = top - head;
  else if (top + h > st + ch) list.scrollTop = top - ch + h;
}
const scrollRow = (ei, ci, center) => scrollToEl($(`r-${ei}-${ci}`), center);
function progressPill() {
  const eps = realEps(); if (!eps.length) return '';
  const d = eps.filter(isDone).length, pct = Math.round(d / eps.length * 100);
  return `<span class="pill prog" title="กด Ctrl+D เพื่อทำเครื่องหมายว่าตอนที่เปิดอยู่ตรวจเสร็จแล้ว"><span class="pbar"><span style="width:${pct}%"></span></span>ตรวจเสร็จ ${d}/${eps.length} ตอน</span>`;
}
function toggleDone() {
  const ep = S.eps[S.cur] || (S.sel && S.eps[S.sel.e]);
  if (!ep || ep.sample) { toast('เปิดตอนที่ต้องการก่อน'); return; }
  const now = !isDone(ep);
  if (now) store.set(doneKey(ep), Date.now()); else store.del(doneKey(ep));
  renderAll();
  const left = realEps().filter(x => !isDone(x)).length;
  toast(now ? `${ep.label} ตรวจเสร็จแล้ว · เหลืออีก ${left} ตอน` : `${ep.label} กลับเป็นยังไม่เสร็จ`);
}
let statsQ = 0;
function renderStats() {
  if (statsQ) return;
  statsQ = requestAnimationFrame(() => {
    statsQ = 0;
    ensureAll();
    let n = 0, o = 0, e = 0, p = 0;
    for (const ep of S.eps) for (const c of ep.cues) { n++; if (Q(c).ov) o++; if (isEdited(c)) e++; if (hasSev(c, ['e', 'w'])) p++; }
    const sample = S.eps.some(x => x.sample);
    $('stats').innerHTML = `<span class="pill">${sample ? 'ตัวอย่าง · ' : ''}${S.eps.length} ตอน · ${n.toLocaleString('en')} คิว</span>${sample ? '' : progressPill()}`;
    const cnt = (f, v, cls) => { const b = document.querySelector(`#filt button[data-f="${f}"]`); if (!b) return; let c = b.querySelector('.cnt'); if (!c) { c = document.createElement('b'); b.appendChild(document.createTextNode(' ')); b.appendChild(c); } c.className = 'cnt' + (v ? ' ' + cls : ''); c.textContent = v.toLocaleString('en'); };
    cnt('issues', p, 'bad'); cnt('over', o, 'bad'); cnt('edited', e, 'ed');
  });
}
function renderJump() {
  const counts = {};
  S.eps.forEach(ep => { counts[ep.label] = (counts[ep.label] || 0) + 1; });
  $('epJump').innerHTML = S.eps.map((ep, i) => `<option value="${i}">${esc(ep.label)}${counts[ep.label] > 1 ? ' · ' + esc(ep.name) : ''}</option>`).join('');
  if (S.sel) $('epJump').value = S.sel.e;
}
function renderCodeFilter() {
  const f = S.filter, el = $('codeFilt');
  if (!f.startsWith('c:')) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="cf">กรอง: ${esc(CAT[f.slice(2)][1])}<button type="button" aria-label="ล้างตัวกรอง" id="cfClear">✕</button></span>`;
  $('cfClear').onclick = () => setFilter('all');
}
function renderAll() { renderList(); renderStats(); renderJump(); loadEditor(); layoutOverlay(); syncCrit(); drawWave(); }

/* ---------- editor ---------- */
function selCues() {
  if (S.multi.size > 1) return [...S.multi].map(k => k.split(':').map(Number)).filter(([e, c]) => S.eps[e] && S.eps[e].cues[c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return S.sel && curCue() ? [[S.sel.e, S.sel.c]] : [];
}
function loadEditor() {
  const c = curCue(), has = !!c;
  ta.disabled = !has;
  ['bPrevL', 'bNextL', 'bPlayL', 'bRevert', 'bBreak', 'bJoin', 'bToM', 'bToF', 'bDropP'].forEach(id => { $(id).disabled = !has; });
  ta.spellcheck = tgtLang() === 'en'; ta.lang = tgtLang();
  if (!has) {
    $('edWhere').textContent = '—'; ta.value = ''; $('inS').value = ''; $('inE').value = ''; $('dur').textContent = '';
    $('edCt').innerHTML = ''; $('edPills').innerHTML = ''; $('edIss').innerHTML = ''; $('edSrc').hidden = true; paintBack(); applyLock(); return;
  }
  const ep = S.eps[S.sel.e];
  ensureQA(S.sel.e);
  const q = Q(c);
  const nSel = S.multi.size > 1 ? S.multi.size : 0;
  $('edWhere').textContent = `${ep.label} · คิว ${S.sel.c + 1}/${ep.cues.length}${ep.kind === 'ass' ? ' · ASS' : ep.kind === 'xlsx' ? ' · Excel แถว ' + c.xr : ''}${nSel ? ` · เลือกไว้ ${nSel} คิว (ปุ่มด้านล่างทำทุกคิวที่เลือก)` : ''}`;
  const vg = q.vg ? ` <span class="tag ${q.vg === 'm' ? 'gm' : 'gf'}">เสียง${q.vg === 'm' ? 'ผู้ชาย' : 'ผู้หญิง'} ~${Math.round(q.f0)} Hz</span>` : '';
  $('edPills').innerHTML = (isEdited(c) ? '<span class="tag ed">แก้แล้ว</span> ' : '') + (q.g === 'm' ? '<span class="tag gm">คำผู้ชาย</span>' : q.g === 'f' ? '<span class="tag gf">คำผู้หญิง</span>' : q.g === 'mf' ? '<span class="tag ed">ชาย+หญิง</span>' : '') + vg;
  const st = srcTextOf(ep, c), s = epSrc(ep);
  $('edSrc').hidden = !s;
  if (s) $('edSrc').innerHTML = `<b>原文 ${esc(LANG_LABEL[s.lang] || '')}</b>${st ? esc(st) : '<span class="empty">ไม่มี原文ที่เวลาตรงกัน</span>'}`;
  $('inS').value = ep.noTime ? '' : c.s; $('inE').value = ep.noTime ? '' : c.e;
  $('dur').textContent = ep.noTime ? 'ไฟล์นี้ไม่มีไทม์โค้ด' : isFinite(c.em - c.sm) ? ((c.em - c.sm) / 1000).toFixed(3) + ' วิ' + (q.cps != null ? ` · ${q.cps.toFixed(1)} cps` : '') : '';
  if (ta.value !== c.t) ta.value = c.t;
  paintBack(); edCounts(); edIssues(); applyLock();
}
function paintBack() {
  const c = curCue(), t = ta.value;
  $('taBack').innerHTML = rangesHtml(t, c && t === c.t ? Q(c).marks : []) + '​';
  $('taBack').scrollTop = ta.scrollTop;
}
ta.addEventListener('scroll', () => { $('taBack').scrollTop = ta.scrollTop; });
function edCounts() { $('edCt').innerHTML = ta.value.split('\n').map(l => { const n = lineLen(l, S.cfg.mode); return `<div class="${n > S.cfg.limit ? 'x' : ''}">${n}</div>`; }).join(''); }
function edIssues() {
  const c = curCue();
  if (!c) { $('edIss').innerHTML = ''; return; }
  const q = Q(c);
  $('edIss').innerHTML = q.iss.map(x => {
    let btn = FIXABLE.has(x.code) && fixText(x.code, c.t, S.cfg, S.L) !== c.t ? `<button type="button" data-fix="${x.code}">แก้</button>` : '';
    if (x.code === 'vgender' && q.vg) btn = `<button type="button" data-swap="${q.vg}">เปลี่ยนเป็น${q.vg === 'm' ? 'ผู้ชาย' : 'ผู้หญิง'}</button>`;
    return `<span class="iss ${x.sev}" title="${SEVLAB[x.sev]}">${esc(x.msg)}${btn}</span>`;
  }).join('');
}
$('edIss').addEventListener('click', e => {
  const b = e.target.closest('[data-fix],[data-swap]'); if (!b || !S.sel) return;
  if (b.dataset.swap) { batchText(c => swapGender(c.t, b.dataset.swap, S.L), 'เปลี่ยนเพศ', [[S.sel.e, S.sel.c]]); return; }
  batchText(c => fixText(b.dataset.fix, c.t, S.cfg, S.L), 'แก้ ' + CAT[b.dataset.fix][1], [[S.sel.e, S.sel.c]]);
});
function applyLock() {
  const c = curCue(), ep = S.sel ? S.eps[S.sel.e] : null;
  const xl = !!(ep && (ep.kind === 'xlsx' || ep.noTime));
  const L = S.lockTime || !c || xl;
  ['inS', 'inE', 'bSetS', 'bSetE'].forEach(id => { $(id).disabled = L; });
  const noStruct = L || !ep;
  ['bSplit', 'bMerge', 'bIns', 'bDel'].forEach(id => { $(id).disabled = noStruct; $(id).title = xl ? 'ไฟล์ Excel แก้ได้เฉพาะข้อความ' : S.lockTime ? 'ปลดล็อกเวลาก่อน' : ''; });
  $('tLock').setAttribute('aria-pressed', String(S.lockTime));
  $('editor').classList.toggle('locked', !!S.lockTime);
  $('tLock').textContent = S.lockTime ? 'ล็อกเวลาอยู่' : 'แก้เวลาได้';
}
ta.addEventListener('input', () => {
  if (!S.sel) return;
  const c = curCue();
  c.t = ta.value.replace(/\r/g, '');
  afterEdit(S.sel.e, S.sel.c);
});
function afterEdit(ei, ci) {
  const ep = S.eps[ei];
  ep.dirty = true;
  ensureQA(ei);
  updateEpRows(ei);
  renderStats();
  if (S.sel && S.sel.e === ei && (ci == null || S.sel.c === ci)) loadEditor();
  renderOverlay(true); drawWave();
  queueDraft(ep);
}
function batchText(fn, label, items) {
  items = items || selCues();
  if (!items.length) return;
  const eps = [...new Set(items.map(([e]) => S.eps[e]))];
  pushHist(eps, label);
  let n = 0;
  for (const [e, ci] of items) { const c = S.eps[e].cues[ci], nt = fn(c); if (nt !== c.t) { c.t = nt; n++; } }
  const eis = [...new Set(items.map(([e]) => e))];
  eis.forEach(ei => { S.eps[ei].dirty = true; ensureQA(ei); updateEpRows(ei); queueDraft(S.eps[ei]); });
  renderStats(); loadEditor(); renderOverlay(true); drawWave();
  if (items.length > 1) toast(`${label}: เปลี่ยน ${n} จาก ${items.length} คิว`, { label: 'เลิกทำ', fn: undo });
  else if (!n) toast('ไม่มีอะไรให้เปลี่ยนในคิวนี้');
}
function setTime(which, val, ci) {
  if (!S.sel) return;
  const ei = S.sel.e, ep = S.eps[ei], c = ep.cues[ci == null ? S.sel.c : ci], F = fmtFor(ep);
  const ms = typeof val === 'number' ? val : toMs(val);
  if (isNaN(ms)) { toast(ep.kind === 'ass' ? 'รูปแบบเวลาไม่ถูก เช่น 0:01:23.45' : 'รูปแบบเวลาไม่ถูก เช่น 00:01:23,450'); loadEditor(); return; }
  const orig = which === 's' ? c.oS : c.oE;
  const v = (orig && ms === toMs(orig)) ? orig : F(ms);
  if (which === 's') { c.s = v; c.sm = toMs(v); } else { c.e = v; c.em = toMs(v); }
  if (c.em <= c.sm) toast('เวลาจบต้องมากกว่าเวลาเริ่ม');
  afterEdit(ei, null); tick();
}
$('inS').addEventListener('change', () => { pushHist([S.eps[S.sel.e]], 'แก้เวลา'); setTime('s', $('inS').value); });
$('inE').addEventListener('change', () => { pushHist([S.eps[S.sel.e]], 'แก้เวลา'); setTime('e', $('inE').value); });
function setFromVideo(which) {
  if (!S.sel || S.cur !== S.sel.e || !epVideo(S.cur)) { toast('เปิดวิดีโอของตอนนี้ก่อน'); return; }
  pushHist([S.eps[S.sel.e]], 'แก้เวลา');
  setTime(which, Math.round(video.currentTime * 1000));
}
$('bSetS').onclick = () => setFromVideo('s');
$('bSetE').onclick = () => setFromVideo('e');
$('tLock').onclick = () => { S.lockTime = !S.lockTime; applyLock(); drawWave(); };
$('bRevert').onclick = () => {
  const c = curCue(); if (!c) return;
  if (c.oT == null) { toast('คิวที่เพิ่มใหม่ใช้ปุ่มเลิกทำแทน'); return; }
  pushHist([S.eps[S.sel.e]], 'คืนค่าเดิม');
  c.t = c.oT; c.s = c.oS; c.e = c.oE; c.sm = toMs(c.s); c.em = toMs(c.e);
  afterEdit(S.sel.e, S.sel.c);
};
$('bBreak').onclick = () => batchText(c => autoBreak(c.t, S.cfg, S.L), 'ตัดบรรทัด');
$('bJoin').onclick = () => batchText(c => c.t.includes('\n') ? joinLines(c.t.split('\n')) : c.t, 'รวมบรรทัด');
$('bToM').onclick = () => batchText(c => swapGender(c.t, 'm', S.L), 'เปลี่ยนเป็นผู้ชาย');
$('bToF').onclick = () => batchText(c => swapGender(c.t, 'f', S.L), 'เปลี่ยนเป็นผู้หญิง');
$('bDropP').onclick = () => batchText(c => dropParticles(c.t, S.L), 'ตัดหางเสียง');

/* ---------- undo & cue structure ---------- */
const HIST = [];
const REDO = [];
const snap = (eps, label) => ({ label, items: eps.map(ep => ({ ep, cues: ep.cues.map(c => Object.assign({}, c, { _q: undefined })), struct: !!ep.struct })) });
function pushHist(eps, label) {
  HIST.push(snap(eps, label));
  if (HIST.length > 60) HIST.shift();
  REDO.length = 0;
  $('bUndo').disabled = false;
}
function redo() {
  const h = REDO.pop();
  if (!h) { toast('ไม่มีอะไรให้ทำซ้ำ'); return; }
  HIST.push(snap(h.items.map(it => it.ep), h.label));
  $('bUndo').disabled = false;
  for (const it of h.items) { it.ep.cues = it.cues; it.ep.struct = it.struct; it.ep.dirty = true; queueDraft(it.ep); }
  S.playIdx = -1; S.multi.clear();
  if (S.sel) { const ep = S.eps[S.sel.e]; if (!ep || !ep.cues.length) S.sel = null; else S.sel.c = Math.min(S.sel.c, ep.cues.length - 1); }
  renderList(); renderStats(); loadEditor(); renderOverlay(true); drawWave();
  toast('ทำซ้ำ: ' + h.label);
}
function undo() {
  const h = HIST.pop();
  $('bUndo').disabled = !HIST.length;
  if (!h) { toast('ไม่มีอะไรให้เลิกทำ'); return; }
  REDO.push(snap(h.items.map(it => it.ep), h.label));
  for (const it of h.items) { it.ep.cues = it.cues; it.ep.struct = it.struct; it.ep.dirty = true; queueDraft(it.ep); }
  S.playIdx = -1; S.multi.clear();
  if (S.sel) { const ep = S.eps[S.sel.e]; if (!ep || !ep.cues.length) S.sel = null; else S.sel.c = Math.min(S.sel.c, ep.cues.length - 1); }
  renderList(); renderStats(); loadEditor(); renderOverlay(true); drawWave();
  toast('เลิกทำ: ' + h.label);
}
$('bUndo').onclick = undo;
function mkCue(ep, sm, em, t, parent) {
  const F = fmtFor(ep);
  const c = { idx: null, s: F(sm), sep: ' --> ', e: F(em), tail: '', t, oS: null, oE: null, oT: null, sm, em };
  if (ep.kind === 'ass' && parent) Object.assign(c, { ass: true, line: null, tplLine: parent.line != null ? parent.line : parent.tplLine, head: parent.head, parts: parent.parts.slice(), f: parent.f, raw: '' });
  return c;
}
function structOk() {
  if (!S.sel) return false;
  const ep = S.eps[S.sel.e];
  if (ep.kind === 'xlsx' || ep.noTime) { toast('ไฟล์ Excel แก้ได้เฉพาะข้อความ แยก/รวม/เพิ่ม/ลบแถวไม่ได้'); return false; }
  if (S.lockTime) { toast('กด "ล็อกเวลาอยู่" เพื่อปลดล็อกก่อน ถึงจะแยก/รวม/แทรก/ลบคิวได้'); return false; }
  return true;
}
function afterStruct(ei, ci) {
  const ep = S.eps[ei];
  ep.struct = true; ep.dirty = true; S.playIdx = -1; S.multi.clear(); queueDraft(ep);
  renderList(); renderStats();
  if (ep.cues.length) select(ei, Math.max(0, Math.min(ci, ep.cues.length - 1)), { seek: false }); else { S.sel = null; loadEditor(); }
  drawWave();
}
$('bSplit').onclick = () => {
  if (!structOk()) return;
  const { e: ei, c: ci } = S.sel, ep = S.eps[ei], c = ep.cues[ci], t = c.t;
  const pos = ta.selectionStart;
  let a, b;
  if (pos > 0 && pos < t.length) { a = t.slice(0, pos).replace(/\s+$/, ''); b = t.slice(pos).replace(/^\s+/, ''); }
  else if (t.includes('\n')) { const i = t.indexOf('\n'); a = t.slice(0, i); b = t.slice(i + 1); }
  else { toast('คลิกวางเคอร์เซอร์ตรงจุดที่จะแยกในช่องข้อความก่อน'); return; }
  const vt = Math.round(video.currentTime * 1000);
  let mid;
  if (S.cur === ei && epVideo(ei) && vt > c.sm + 100 && vt < c.em - 100) mid = vt;
  else { const la = lineLen(a, 'len'), lb = lineLen(b, 'len'); mid = Math.round(c.sm + (c.em - c.sm) * (la / Math.max(1, la + lb))); }
  pushHist([ep], 'แยกคิว');
  const n = mkCue(ep, mid, c.em, b, c); n.e = c.e;
  c.t = a; c.e = fmtFor(ep)(mid); c.em = toMs(c.e);
  ep.cues.splice(ci + 1, 0, n);
  afterStruct(ei, ci);
};
$('bMerge').onclick = () => {
  if (!structOk()) return;
  const { e: ei, c: ci } = S.sel, ep = S.eps[ei];
  if (ci + 1 >= ep.cues.length) { toast('นี่คือคิวสุดท้ายของตอนแล้ว'); return; }
  pushHist([ep], 'รวมคิว');
  const c = ep.cues[ci], n = ep.cues[ci + 1];
  c.t = [c.t, n.t].filter(x => x.trim()).join('\n'); c.e = n.e; c.em = n.em;
  ep.cues.splice(ci + 1, 1);
  afterStruct(ei, ci);
};
$('bIns').onclick = () => {
  if (!structOk()) return;
  const { e: ei, c: ci } = S.sel, ep = S.eps[ei], c = ep.cues[ci], nx = ep.cues[ci + 1];
  const start = c.em, end = nx ? Math.min(nx.sm, start + 2000) : start + 2000;
  if (end - start < 200) { toast('ไม่มีช่องว่างพอระหว่างคิวนี้กับคิวถัดไป'); return; }
  pushHist([ep], 'แทรกคิว');
  ep.cues.splice(ci + 1, 0, mkCue(ep, start, end, '', c));
  afterStruct(ei, ci + 1); ta.focus();
};
$('bDel').onclick = () => {
  if (!structOk()) return;
  const { e: ei, c: ci } = S.sel, ep = S.eps[ei];
  pushHist([ep], 'ลบคิว');
  ep.cues.splice(ci, 1);
  afterStruct(ei, ci);
  toast('ลบคิวแล้ว', { label: 'เลิกทำ', fn: undo });
};

/* ---------- selection & navigation ---------- */
function select(ei, ci, o = {}) {
  const { seek = true, scroll = true, play = null, center = false, wave = true } = o;
  const ep = S.eps[ei];
  if (!ep || !ep.cues[ci]) return;
  if (S.sel) setRowClass(S.sel.e, S.sel.c, 'sel', false);
  S.sel = { e: ei, c: ci };
  setRowClass(ei, ci, 'sel', true);
  loadEditor();
  if (seek) { S.stopAt = null; seekTo(ei, (ep.cues[ci].sm + 2) / 1000, play === null ? false : play); }
  if (scroll) scrollRow(ei, ci, center);
  if ($('epJump').value !== String(ei)) $('epJump').value = ei;
  if (wave || video.paused) drawWave();
}
function nextRowEl(n, d) {
  for (let x = n; ;) {
    x = d > 0 ? x.nextElementSibling : x.previousElementSibling;
    if (x && x.classList.contains('row')) return x;
    if (!x) {
      let b = n.closest('.epb');
      for (;;) { b = b && (d > 0 ? b.nextElementSibling : b.previousElementSibling); if (!b) return null; const rs = b.querySelectorAll('.row'); if (rs.length) return d > 0 ? rs[0] : rs[rs.length - 1]; }
    }
  }
}
function moveSel(d) {
  let n = S.sel ? $(`r-${S.sel.e}-${S.sel.c}`) : null;
  if (n) n = nextRowEl(n, d);
  else { const rows = list.querySelectorAll('.row'); n = rows.length ? (d > 0 ? rows[0] : rows[rows.length - 1]) : null; }
  if (n) { S.multi.clear(); syncMulti(); select(+n.dataset.e, +n.dataset.c); }
}
function gotoEp(ei) {
  if (ei < 0 || ei >= S.eps.length) return;
  const playing = !video.paused;
  if (S.eps[ei].cues.length) select(ei, 0, { seek: false, scroll: false });
  loadEpisode(ei, 0, playing);
  const h = $('h-' + ei);
  if (h) list.scrollTop = h.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
}
list.addEventListener('click', e => {
  const r = e.target.closest('.row');
  if (r) {
    const ei = +r.dataset.e, ci = +r.dataset.c;
    if (e.shiftKey && S.sel) {
      const rows = [...list.querySelectorAll('.row')];
      const a = rows.findIndex(x => +x.dataset.e === (S.anchor || S.sel).e && +x.dataset.c === (S.anchor || S.sel).c), b = rows.indexOf(r);
      if (a >= 0 && b >= 0) { if (!S.anchor) S.anchor = { ...S.sel }; S.multi.clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.multi.add(key(+rows[i].dataset.e, +rows[i].dataset.c)); }
      syncMulti(); select(ei, ci, { scroll: false, seek: false }); return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (!S.multi.size && S.sel) S.multi.add(key(S.sel.e, S.sel.c));
      const k = key(ei, ci); if (S.multi.has(k)) S.multi.delete(k); else S.multi.add(k);
      S.anchor = { e: ei, c: ci }; syncMulti(); select(ei, ci, { scroll: false, seek: false }); return;
    }
    S.multi.clear(); S.anchor = { e: ei, c: ci }; syncMulti();
    select(ei, ci, { scroll: false });
    if (S.view.clickPlay && epVideo(ei) && !S.eps[ei].noTime) playCue();
    return;
  }
  const h = e.target.closest('.eph');
  if (h) gotoEp(+h.dataset.ep);
});
list.addEventListener('dblclick', e => { const r = e.target.closest('.row'); if (r) { S.stopAt = null; select(+r.dataset.e, +r.dataset.c, { play: true, scroll: false }); } });

/* ---------- player ---------- */
let pending = null;
function loadEpisode(ei, t, play) {
  const prev = S.cur;
  if (S.playIdx >= 0 && prev >= 0) setRowClass(prev, S.playIdx, 'play', false);
  S.cur = ei; S.playIdx = -1; S.stopAt = null;
  if (prev !== ei) { refreshHead(prev); refreshHead(ei); }
  const v = epVideo(ei);
  if (!v) {
    video.pause(); pending = null;
    if (video.getAttribute('src')) { video.removeAttribute('src'); delete video.dataset.url; video.load(); }
    showPh(phFor(ei)); tick(); updateTransport(); drawWave(); return;
  }
  hidePh();
  if (video.dataset.url !== v.url) {
    pending = { t, play };
    video.dataset.url = v.url;
    video.src = v.url;
    video.defaultPlaybackRate = S.view.rate; video.playbackRate = S.view.rate;
  } else {
    video.currentTime = t;
    if (play) video.play().catch(() => {});
  }
  updateTransport();
  ensureAudio(v);
  drawWave();
}
function seekTo(ei, t, play) {
  const v = epVideo(ei);
  if (ei !== S.cur || (v && video.dataset.url !== v.url)) loadEpisode(ei, t, play);
  else if (v) { video.currentTime = t; if (play) video.play().catch(() => {}); }
}
function togglePlay() {
  const ei = S.cur >= 0 ? S.cur : (S.sel ? S.sel.e : -1);
  if (ei < 0) return;
  const v = epVideo(ei);
  if (!v) { toast('ตอนนี้ยังไม่มีวิดีโอ'); return; }
  if (S.cur !== ei || video.dataset.url !== v.url) { loadEpisode(ei, 0, true); return; }
  if (video.paused) { S.stopAt = null; S.wv.manual = false; video.play().catch(() => {}); } else video.pause();
}
function playCue() {
  const c = curCue(); if (!c) return;
  const ei = S.sel.e;
  if (!epVideo(ei)) { toast('ตอนนี้ยังไม่มีวิดีโอ'); return; }
  S.wv.manual = false;
  seekTo(ei, (c.sm + 2) / 1000, true);
  S.stopAt = c.em / 1000;
}
function nudge(sec) { if (!epVideo(S.cur)) return; S.stopAt = null; video.currentTime = Math.max(0, video.currentTime + sec); }
function updateTransport() { $('bPlay').textContent = video.paused ? 'เล่น' : 'หยุด'; }
let clockAt = 0;
function updateClock(force) {
  if (!force && !video.paused) { const now = performance.now(); if (now - clockAt < 200) return; clockAt = now; }
  const ep = S.eps[S.cur];
  if (!ep) { clock.textContent = '--'; return; }
  if (!epVideo(S.cur)) { clock.textContent = ep.label; return; }
  const d = isFinite(video.duration) ? video.duration * 1000 : 0;
  clock.textContent = `${ep.label} · ${fmt(video.currentTime * 1000)}${d ? ' / ' + fmt(d).slice(0, 8) : ''}`;
}
function activeIdxs(ep, t) { const out = []; const cs = ep.cues; for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (t >= c.sm && t < c.em) out.push(i); } return out; }
let actives = [];
/* While the video plays, a cue change only swaps a row class and the overlay inside the frame; moving the selection,
   the editor and the list scroll happen right after, once per change (and only the last one if several land at once). */
let followJob = 0, followTo = -1;
function queueFollow(ei, ci) {
  followTo = ci;
  if (followJob) return;
  const fast = video.playbackRate >= 1.75;
  followJob = setTimeout(() => {
    followJob = 0;
    if (S.cur !== ei || followTo < 0 || !S.eps[ei] || !S.eps[ei].cues[followTo]) return;
    if (document.activeElement !== ta) select(ei, followTo, { seek: false, wave: false });
    else scrollRow(ei, followTo);
  }, fast ? 160 : 0);
}
function tick() {
  const ep = S.eps[S.cur];
  if (S.stopAt != null && video.currentTime >= S.stopAt) { video.pause(); S.stopAt = null; }
  actives = (ep && !ep.noTime && epVideo(S.cur) && video.getAttribute('src')) ? activeIdxs(ep, video.currentTime * 1000) : [];
  const ai = actives.length ? actives[0] : -1;
  if (ai !== S.playIdx) {
    if (S.playIdx >= 0) setRowClass(S.cur, S.playIdx, 'play', false);
    S.playIdx = ai;
    if (ai >= 0) {
      setRowClass(S.cur, ai, 'play', true);
      if (S.view.follow && !video.paused && S.stopAt == null) queueFollow(S.cur, ai);
    }
  }
  renderOverlay();
  updateClock();
  drawWave();
}
let raf = 0;
function loop() { cancelAnimationFrame(raf); const f = () => { tick(); if (!video.paused && !video.ended) raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
video.addEventListener('loadedmetadata', () => {
  layoutOverlay();
  if (pending) { const p = pending; pending = null; try { video.currentTime = p.t; } catch (e) {} if (p.play) video.play().catch(() => {}); }
});
video.addEventListener('loadeddata', () => { if (epVideo(S.cur)) hidePh(); });
video.addEventListener('play', () => { updateTransport(); loop(); });
video.addEventListener('pause', () => { updateTransport(); tick(); });
video.addEventListener('seeked', tick);
video.addEventListener('timeupdate', () => { if (video.paused) tick(); });
video.addEventListener('ended', () => {
  updateTransport();
  if (!S.view.autoNext) return;
  for (let i = S.cur + 1; i < S.eps.length; i++) {
    if (!epVideo(i)) continue;
    if (S.eps[i].cues.length && S.view.follow) select(i, 0, { seek: false });
    loadEpisode(i, 0, true);
    toast(`เล่นต่อ ${S.eps[i].label}`);
    return;
  }
  toast('จบตอนสุดท้ายแล้ว');
});
video.addEventListener('error', () => {
  if (!video.getAttribute('src')) return;
  const v = epVideo(S.cur);
  showPh(`<div class="ph-in"><strong>เปิดวิดีโอนี้ไม่ได้</strong><span class="fine">${esc(v ? v.name : '')}</span><span class="fine">เบราว์เซอร์เล่นได้แน่นอนคือ MP4 (H.264) ถ้าเป็น H.265/HEVC หรือ MKV บางแบบ ให้แปลงเป็น MP4 H.264 ก่อน ระหว่างนี้แก้ซับได้ตามปกติ</span></div>`);
});

/* ---------- overlay ---------- */
let lastCap = null;
function capFor(c) {
  if (/[{<]/.test(c.t)) return esc(c.t.replace(/\{\\[^}]*\}/g, '').replace(/<\/?[a-zA-Z][^>]*>/g, ''));
  return S.view.ovColor ? rangesHtml(c.t, Q(c).marks.filter(m => /^(gm|gf|pt)/.test(m.c))) : esc(c.t);
}
function renderOverlay(force) {
  const ep = S.eps[S.cur];
  const items = (S.view.overlay && ep) ? actives.map(i => ep.cues[i]).filter(Boolean) : [];
  const k = items.map(c => c.t).join('\u0001') + '|' + S.view.ovColor;
  if (!force && k === lastCap) return;
  lastCap = k;
  if (!items.length) { if (!cap.hidden) cap.hidden = true; return; }
  cap.innerHTML = items.map(capFor).join('\n');
  cap.hidden = !items.length || !ph.hidden;
}
function layoutOverlay() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const vw = video.videoWidth || 9, vh = video.videoHeight || 16;
  const sc = Math.min(W / vw, H / vh), w = vw * sc, h = vh * sc;
  const o = $('ov');
  o.style.left = (W - w) / 2 + 'px'; o.style.top = (H - h) / 2 + 'px'; o.style.width = w + 'px'; o.style.height = h + 'px';
  o.style.setProperty('--fs', Math.max(12, Math.min(w * 0.055, h * 0.05)).toFixed(1) + 'px');
  drawWave();
}
if ('ResizeObserver' in window) { new ResizeObserver(layoutOverlay).observe(stage); new ResizeObserver(en => { const r = en[0].contentRect; waveSize.w = Math.round(r.width); waveSize.h = Math.round(r.height); drawWave(); }).observe($('wv')); }
else window.addEventListener('resize', layoutOverlay);

/* ---------- audio: waveform + pitch ---------- */
S.wv = { t0: 0, manual: false, drag: null };
async function ensureAudio(v) {
  if (!v || S.audio.has(v.url)) return S.audio.get(v.url);
  const a = { status: 'loading' };
  S.audio.set(v.url, a);
  drawWave();
  try {
    if (!v.file) throw new Error('ไม่มีไฟล์');
    if (v.file.size > 900 * 1024 * 1024) { a.status = 'big'; drawWave(); return a; }
    const buf = await v.file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 8000, 8000);
    const ab = await ctx.decodeAudioData(buf);
    let pcm = ab.getChannelData(0);
    if (ab.numberOfChannels > 1) { const m = new Float32Array(pcm.length); for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < m.length; i++) m[i] += d[i] / ab.numberOfChannels; } pcm = m; }
    a.peaks = audioPeaks(pcm, ab.sampleRate);
    a.dur = pcm.length / ab.sampleRate;
    a.status = 'pitch'; drawWave();
    a.track = await pitchTrack(pcm, ab.sampleRate, () => sleep(0));
    a.status = 'ok';
    S.eps.forEach((ep, i) => { if (epVideo(i) === v) ep.dirty = true; });
    renderList(); renderStats(); loadEditor();
  } catch (e) { a.status = 'err'; a.err = e && e.message; }
  drawWave();
  return a;
}
let WV_COL = null;
function wcol() {
  if (!WV_COL) { const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim(); WV_COL = { wave: g('--wave'), text: g('--wave-text'), mute: g('--wave-mute'), cue: g('--cue'), e: g('--cue-e'), w: g('--cue-w'), sel: g('--cue-sel'), edge: g('--cue-edge'), head: g('--playhead'), accent: g('--accent') }; }
  return WV_COL;
}
function drawWave() {
  const cv = $('wv'); if (!cv) return;
  if (!waveSize.w) { waveSize.w = cv.clientWidth; waveSize.h = cv.clientHeight; }
  const W = waveSize.w, H = waveSize.h, dpr = window.devicePixelRatio || 1;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'), K = wcol();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const ep = S.eps[S.cur], v = epVideo(S.cur), a = v ? S.audio.get(v.url) : null;
  const info = $('wvInfo');
  if (!ep || !v || ep.noTime) { info.textContent = ep && ep.noTime ? 'ไฟล์นี้ไม่มีไทม์โค้ด' : 'เส้นเสียงจะขึ้นเมื่อเปิดวิดีโอ'; info.hidden = false; return; }
  info.textContent = !a ? '' : a.status === 'loading' ? 'กำลังสร้างเส้นเสียง…' : a.status === 'pitch' ? 'กำลังวิเคราะห์ระดับเสียง…' : a.status === 'big' ? 'ไฟล์ใหญ่เกินไปสำหรับเส้นเสียง' : a.status === 'err' ? 'สร้างเส้นเสียงไม่ได้' : '';
  info.hidden = !info.textContent;
  const span = S.view.wspan, t = video.currentTime || 0;
  if (!S.wv.manual && (!video.paused || t < S.wv.t0 || t > S.wv.t0 + span * 0.9)) S.wv.t0 = Math.max(0, t - span * 0.3);
  const t0 = S.wv.t0, xOf = sec => (sec - t0) / span * W;
  g.font = '10px "IBM Plex Mono", monospace'; g.fillStyle = K.mute;
  const step = span > 30 ? 10 : span > 12 ? 5 : 1;
  for (let s = Math.ceil(t0 / step) * step; s < t0 + span; s += step) { const x = xOf(s); g.fillRect(x, H - 10, 1, 10); g.fillText(fmt(s * 1000).slice(3, 8), x + 3, H - 2); }
  if (a && a.peaks) {
    g.fillStyle = K.wave; g.globalAlpha = 0.6;
    const mid = (H - 12) / 2;
    for (let x = 0; x < W; x++) {
      const s0 = Math.floor((t0 + x / W * span) * 100), s1 = Math.max(s0 + 1, Math.floor((t0 + (x + 1) / W * span) * 100));
      let m = 0; for (let i = s0; i < s1 && i < a.peaks.length; i++) if (a.peaks[i] > m) m = a.peaks[i];
      const h = m / 255 * mid; g.fillRect(x, mid - h, 1, h * 2 || 1);
    }
    g.globalAlpha = 1;
  }
  ep.cues.forEach((c, ci) => {
    const s = c.sm / 1000, e = c.em / 1000;
    if (e < t0 || s > t0 + span) return;
    const x1 = xOf(s), x2 = xOf(e), sel = S.sel && S.sel.e === S.cur && S.sel.c === ci;
    const q = Q(c), sev = q.iss.some(x => x.sev === 'e') ? 'e' : q.iss.some(x => x.sev === 'w') ? 'w' : '';
    g.fillStyle = sel ? K.sel : sev === 'e' ? K.e : sev === 'w' ? K.w : K.cue;
    g.fillRect(x1, 0, Math.max(1, x2 - x1), H - 12);
    g.fillStyle = sel ? K.accent : K.edge;
    g.fillRect(x1, 0, 2, H - 12); g.fillRect(x2 - 2, 0, 2, H - 12);
    g.save(); g.beginPath(); g.rect(x1 + 3, 0, Math.max(0, x2 - x1 - 6), H); g.clip();
    g.fillStyle = K.text; g.font = (sel ? '600 ' : '') + '12px "IBM Plex Sans Thai", Tahoma, sans-serif';
    g.fillText(c.t.split('\n')[0], x1 + 5, 16);
    g.fillStyle = K.mute; g.font = '10px "IBM Plex Mono", monospace'; g.fillText(String(ci + 1) + (q.vg ? (q.vg === 'm' ? ' · เสียงช' : ' · เสียงญ') : ''), x1 + 5, 29);
    g.restore();
  });
  g.fillStyle = K.head; g.fillRect(xOf(t), 0, 2, H - 12);
}
/* ---------- theme ---------- */
const SUN = '<circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M10 1v2.5M10 16.5V19M1 10h2.5M16.5 10H19M3.6 3.6l1.8 1.8M14.6 14.6l1.8 1.8M3.6 16.4l1.8-1.8M14.6 5.4l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const MOON = '<path d="M15 13.6A7.2 7.2 0 0 1 7.6 2.4a7.8 7.8 0 1 0 10 10.2 7 7 0 0 1-2.6 1z" fill="currentColor"/>';
function isNight() { const r = document.documentElement, ui = r.dataset.ui; if (ui) return ui === 'night'; const ht = r.getAttribute('data-theme'); if (ht) return ht === 'dark'; return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
function syncThemeBtn() { const n = isNight(); $('icoTheme').innerHTML = n ? SUN : MOON; $('txtTheme').textContent = n ? 'โหมดกลางวัน' : 'โหมดกลางคืน'; WV_COL = null; drawWave(); }
$('bTheme').onclick = () => { document.documentElement.dataset.ui = isNight() ? 'day' : 'night'; store.set('ui', document.documentElement.dataset.ui); syncThemeBtn(); };
new MutationObserver(syncThemeBtn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', syncThemeBtn); }
(() => {
  const cv = $('wv');
  const secAt = e => { const r = cv.getBoundingClientRect(); return S.wv.t0 + (e.clientX - r.left) / r.width * S.view.wspan; };
  const pxPerSec = () => cv.getBoundingClientRect().width / S.view.wspan;
  const hitCue = sec => { const ep = S.eps[S.cur]; if (!ep) return -1; return ep.cues.findIndex(c => sec * 1000 >= c.sm && sec * 1000 < c.em); };
  cv.addEventListener('pointerdown', e => {
    const ep = S.eps[S.cur]; if (!ep || !epVideo(S.cur) || ep.noTime) return;
    const sec = secAt(e), tol = 6 / pxPerSec();
    if (!S.lockTime && ep.kind !== 'xlsx') {
      for (let ci = 0; ci < ep.cues.length; ci++) {
        const c = ep.cues[ci];
        const edge = Math.abs(sec - c.sm / 1000) < tol ? 's' : Math.abs(sec - c.em / 1000) < tol ? 'e' : null;
        if (edge) { pushHist([ep], 'ลากเวลา'); S.wv.drag = { ci, edge }; cv.setPointerCapture(e.pointerId); if (!S.sel || S.sel.c !== ci) select(S.cur, ci, { seek: false }); return; }
      }
    }
    const ci = hitCue(sec);
    if (ci >= 0) { S.multi.clear(); syncMulti(); select(S.cur, ci); if (S.view.clickPlay) playCue(); }
    else { S.stopAt = null; video.currentTime = Math.max(0, sec); }
  });
  cv.addEventListener('pointermove', e => {
    const d = S.wv.drag, ep = S.eps[S.cur];
    if (!d || !ep) { if (!S.lockTime && ep && !ep.noTime) { const sec = secAt(e), tol = 6 / pxPerSec(); cv.style.cursor = ep.cues.some(c => Math.abs(sec - c.sm / 1000) < tol || Math.abs(sec - c.em / 1000) < tol) ? 'ew-resize' : 'crosshair'; } return; }
    const c = ep.cues[d.ci], ms = Math.max(0, Math.round(secAt(e) * 1000));
    if (d.edge === 's') { c.sm = Math.min(ms, c.em - 50); } else { c.em = Math.max(ms, c.sm + 50); }
    drawWave();
  });
  const end = () => {
    const d = S.wv.drag; if (!d) return; S.wv.drag = null;
    const ep = S.eps[S.cur], c = ep.cues[d.ci], F = fmtFor(ep);
    const ms = d.edge === 's' ? c.sm : c.em, orig = d.edge === 's' ? c.oS : c.oE;
    const v = (orig && ms === toMs(orig)) ? orig : F(ms);
    if (d.edge === 's') { c.s = v; c.sm = toMs(v); } else { c.e = v; c.em = toMs(v); }
    afterEdit(S.cur, d.ci);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', e => { const ci = hitCue(secAt(e)); if (ci >= 0) { select(S.cur, ci); playCue(); } });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomWave(e.deltaY > 0 ? 1.25 : 0.8); return; }
    S.wv.manual = true; S.wv.t0 = Math.max(0, S.wv.t0 + (e.deltaY + e.deltaX) / 400 * S.view.wspan); drawWave();
  }, { passive: false });
})();
function zoomWave(f) { const t = video.currentTime || 0; S.view.wspan = Math.min(60, Math.max(2, S.view.wspan * f)); S.wv.t0 = Math.max(0, t - S.view.wspan * 0.3); saveSettings(); drawWave(); }
$('wvIn').onclick = () => zoomWave(0.8);
$('wvOut').onclick = () => zoomWave(1.25);

/* ---------- drafts (autosave in this browser) ---------- */
const draftKey = ep => pk('draft3:' + ep.name + ':' + ep.hash);
const dq = new Set(); let dqT = 0;
function queueDraft(ep) { if (!ep || ep.sample) return; dq.add(ep); setSaveState('dirty'); clearTimeout(dqT); dqT = setTimeout(flushDrafts, 700); }
let saveAt = 0, saveMode = 'none';
function setSaveState(mode) {
  saveMode = mode; if (mode === 'saved') saveAt = Date.now();
  const el = $('saveState'); if (!el) return;
  const tm = saveAt ? new Date(saveAt).toTimeString().slice(0, 5) : '';
  if (mode === 'dirty') { el.textContent = '● ยังไม่บันทึก'; el.className = 'pill savest dirty'; }
  else if (mode === 'saved') { el.textContent = '✓ บันทึกแล้ว ' + tm; el.className = 'pill savest ok'; }
  else if (mode === 'error') { el.textContent = '✕ บันทึกไม่ได้'; el.className = 'pill savest dirty'; }
  else { el.textContent = 'ยังไม่มีงาน'; el.className = 'pill savest'; }
  el.title = 'บันทึกอัตโนมัติทุกครั้งที่แก้ เก็บไว้ในเครื่องนี้ · กด Ctrl+S เพื่อบันทึกทันที · ส่งไฟล์ให้ลูกค้าใช้ Ctrl+E';
}
function saveNow(manual) {
  for (const ep of realEps()) dq.add(ep);
  clearTimeout(dqT);
  const ok = flushDrafts();
  if (ok === false) { setSaveState('error'); if (manual) toast('บันทึกไม่ได้ พื้นที่เก็บในเครื่องอาจเต็ม ให้ส่งออกไฟล์ด้วย Ctrl+E ไว้ก่อน'); return; }
  setSaveState(realEps().length ? 'saved' : 'none');
  if (realEps().length) touchProj();
  if (manual) toast(realEps().length ? `บันทึกแล้ว ${new Date().toTimeString().slice(0, 5)} · เก็บไว้ในเครื่องนี้ ปิดแล้วเปิดใหม่กู้คืนได้ · ส่งไฟล์ให้ลูกค้ากด Ctrl+E` : 'ยังไม่มีงานให้บันทึก');
}
function flushDrafts() {
  for (const ep of dq) {
    if (!epEdited(ep)) { store.del(draftKey(ep)); continue; }
    try { localStorage.setItem(LS + draftKey(ep), JSON.stringify({ at: Date.now(), struct: !!ep.struct, cues: ep.cues.map(c => { const o = Object.assign({}, c); delete o._q; return o; }) })); }
    catch (e) { dq.clear(); return false; }
  }
  dq.clear();
  if (saveMode === 'dirty') setSaveState('saved');
  return true;
}
function checkDrafts() {
  const found = [];
  for (const ep of S.eps) {
    if (ep.sample || epEdited(ep)) continue;
    const d = store.get(draftKey(ep), null);
    if (d && Array.isArray(d.cues)) found.push([ep, d]);
  }
  S.drafts = found.length ? found : null;
  if (S.drafts && S.restoring) { applyDrafts(); return; }
  renderDraftBar();
}
function applyDrafts() {
  for (const [ep, d] of S.drafts) { ep.cues = d.cues.map(o => Object.assign({}, o, { sm: toMs(o.s), em: toMs(o.e) })); ep.struct = !!d.struct; ep.dirty = true; }
  S.drafts = null; renderDraftBar(); if (S.sel && !curCue()) S.sel = null;
}
function renderDraftBar() {
  const bar = $('draftBar');
  if (!S.drafts) { bar.hidden = true; return; }
  bar.innerHTML = `<span>เจองานที่แก้ค้างไว้ในเครื่องนี้ ${S.drafts.length} ตอน</span><button class="btn sm primary" type="button" id="dRestore">กู้คืน</button><button class="btn sm" type="button" id="dDrop">ทิ้ง</button>`;
  bar.hidden = false;
  $('dRestore').onclick = () => { applyDrafts(); renderAll(); toast('กู้คืนงานที่แก้ค้างไว้แล้ว'); };
  $('dDrop').onclick = () => { for (const [ep] of S.drafts) store.del(draftKey(ep)); S.drafts = null; renderDraftBar(); };
}
window.addEventListener('pagehide', flushDrafts);
window.addEventListener('beforeunload', e => { flushDrafts(); touchProj(); if (!(window.HF_PLATFORM && window.HF_PLATFORM.desktop) && realEps().some(epEdited)) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- loading files ---------- */
const VEXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ts', 'm2ts', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', '3gp']);
const WANT = new Set(['srt', 'ass', 'ssa', 'xlsx', 'csv', 'tsv', 'zip', 'rar', '7z']);
const VMIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ts: 'video/mp2t' };
let arcMod = null;
async function extractOther(f) {
  if (!arcMod) {
    const base = new URL('lib/', location.href).href;
    arcMod = await import(/* @vite-ignore */ base + 'libarchive.js');
    arcMod.Archive.init({ workerUrl: base + 'worker-bundle.js' });
  }
  const arc = await arcMod.Archive.open(f);
  if (await arc.hasEncryptedData()) throw new Error('ไฟล์ติดรหัสผ่าน');
  const ents = await arc.getFilesArray();
  const out = [];
  for (const { file, path } of ents) {
    const nm = (file.name || '').split('/').pop(), x = extOf(nm);
    if (!nm || nm.startsWith('.') || path.startsWith('__MACOSX')) continue;
    if (!WANT.has(x) && !VEXT.has(x)) continue;
    const got = file.extract ? await file.extract() : file;
    out.push(new File([got], nm, { type: VMIME[x] || '' }));
  }
  await arc.close();
  return out;
}
async function expandArchives(files, notes) {
  const out = [];
  for (const f of files) {
    const x = extOf(f.name);
    if (x === 'rar' || x === '7z') {
      try { toast(`กำลังแตก ${f.name}…`); out.push(...await expandArchives(await extractOther(f), notes)); if (!S.folder) S.folder = f.name.replace(/\.(rar|7z)$/i, ''); }
      catch (err) { notes.push(`${f.name}: ${location.protocol === 'file:' ? 'เปิด .rar/.7z ได้เฉพาะในหน้า claude.ai' : (err.message || 'เปิดไม่ได้')}`); }
      continue;
    }
    if (x !== 'zip') { out.push(f); continue; }
    try {
      const ents = await zipList(f);
      let enc = 0;
      for (const e of ents) {
        if (e.encrypted) { enc++; continue; }
        const nm = e.name.split('/').pop();
        if (!nm || nm.startsWith('.')) continue;
        const ex = extOf(nm);
        if (!WANT.has(ex) && !VEXT.has(ex)) continue;
        const blob = await zipRead(f, e);
        const file = new File([blob], nm, { type: VMIME[ex] || '' });
        if (['zip', 'rar', '7z'].includes(ex)) out.push(...await expandArchives([file], notes)); else out.push(file);
      }
      if (enc) notes.push(`${f.name}: มี ${enc} ไฟล์ติดรหัสผ่าน เปิดไม่ได้`);
      if (!S.folder) S.folder = f.name.replace(/\.zip$/i, '');
    } catch (err) { notes.push(`${f.name}: ${err.message || 'เปิด zip ไม่ได้'}`); }
  }
  return out;
}
function sortEps() { S.eps.sort((a, b) => nat(a.group, b.group) || ((a.num ?? 1e9) - (b.num ?? 1e9)) || nat(a.name, b.name)); }
function pairInto(field, pool, allowed) {
  const used = new Set(S.eps.map(e => e[field]).filter(v => v != null));
  const free = i => !used.has(i) && (!allowed || allowed.has(i));
  const take = (ep, i) => { ep[field] = i; used.add(i); };
  const todo = () => S.eps.filter(ep => !ep.sample && ep[field] == null);
  for (const ep of todo()) { const i = pool.findIndex((v, k) => free(k) && v.base === ep.base); if (i >= 0) take(ep, i); }
  for (const ep of todo()) { if (ep.num == null) continue; const i = pool.findIndex((v, k) => free(k) && v.num === ep.num && v.group === ep.group); if (i >= 0) take(ep, i); }
  for (const ep of todo()) {
    if (ep.num == null) continue;
    const cand = pool.map((v, k) => k).filter(k => free(k) && pool[k].num === ep.num);
    const rivals = todo().filter(e => e.num === ep.num);
    if (cand.length === 1 && rivals.length === 1) take(ep, cand[0]);
  }
}
function autoPair() {
  pairInto('video', S.videos);
  const want = S.cfg.src && S.cfg.src !== 'auto' ? S.cfg.src : 'zh';
  const zh = new Set(S.srcs.map((s, i) => s.lang === want && !s.sample && !s.fixed ? i : -1).filter(i => i >= 0));
  if (zh.size) pairInto('src', S.srcs, zh);
  pairInto('src', S.srcs, new Set(S.srcs.map((s, i) => s.sample || s.fixed ? -1 : i).filter(i => i >= 0)));
}
const xlsxQueue = [];
async function addFiles(files, folder) {
  const notes = [];
  if (files.some(f => ['zip', 'rar', '7z'].includes(extOf(f.name)))) toast('กำลังแตกไฟล์…');
  files = await expandArchives(files, notes);
  const subs = [], vids = [], gloss = [], books = [], other = [];
  for (const f of files) {
    const x = extOf(f.name);
    if (['srt', 'ass', 'ssa'].includes(x)) subs.push(f);
    else if (x === 'xlsx') books.push(f);
    else if (['csv', 'tsv'].includes(x)) gloss.push(f);
    else if (VEXT.has(x) || (f.type || '').startsWith('video/')) vids.push(f);
    else if (!f.name.startsWith('.')) other.push(f.name);
  }
  if (gloss.length) await loadGlossFiles(gloss, !subs.length && !vids.length && !books.length);
  if (!subs.length && !vids.length && !books.length) { if (!gloss.length) toast(notes[0] || (other.length ? 'ยังไม่รองรับไฟล์แบบนี้ (รับ srt / ass / zip / rar / วิดีโอ / xlsx)' : 'ไม่เจอไฟล์ซับหรือวิดีโอ')); return; }
  flushDrafts();
  if (folder && !S.restoring) { const pr = curProj(); if (!pr.folder) { pr.folder = folder; saveProjects(); } }
  if (folder && (!S.folder || !realEps().length)) S.folder = folder;
  const parsed = [];
  for (const f of subs) {
    let buf; try { buf = await f.arrayBuffer(); } catch (e) { continue; }
    const d = decode(buf);
    const cues = /\.(ass|ssa)$/i.test(f.name) ? parseAss(d.text).cues : parseSrt(d.text);
    const txt = cues.map(c => c.t).join(' ').replace(/\{\\[^}]*\}/g, '');
    parsed.push({ f, buf, d, target: scriptOf(txt) === tgtLang() });
  }
  if (!S.restoring) {
    const recs = parsed.map(p => ({ name: p.f.name, kind: 'sub', bytes: p.buf })).concat(await Promise.all(books.map(async b => ({ name: b.name, kind: 'book', bytes: await b.arrayBuffer() }))));
    persistFiles(recs);
    if (vids.length) { const pr = curProj(); pr.videos = [...new Set((pr.videos || []).concat(vids.map(v => v.name)))].slice(-400); saveProjects(); }
  }
  const before = snapshotSel();
  if (parsed.some(p => p.target)) dropSamples();
  let kept = 0, nS = 0;
  for (const p of parsed) {
    if (!p.target) {
      const s = makeSrc(p.f.name, p.d.text);
      const i = S.srcs.findIndex(x => x.name === p.f.name);
      if (i >= 0) S.srcs[i] = s; else S.srcs.push(s);
      nS++; continue;
    }
    const ep = makeEp(p.f.name, p.d.text, { raw: new Uint8Array(p.buf), bom: p.d.bom, enc: p.d.enc });
    const i = S.eps.findIndex(x => x.name === p.f.name);
    if (i >= 0) { if (epEdited(S.eps[i])) { kept++; continue; } ep.video = S.eps[i].video; ep.src = S.eps[i].src; S.eps[i] = ep; }
    else S.eps.push(ep);
  }
  for (const f of vids) {
    if (S.videos.some(v => v.name === f.name && v.size === f.size)) continue;
    const info = epInfo(f.name);
    S.videos.push({ name: f.name, size: f.size, file: f, url: URL.createObjectURL(f), num: info.num, group: info.group, base: baseOf(f.name) });
  }
  finishLoad(before, { kept, nS, other, notes });
  for (const b of books) xlsxQueue.push(b);
  if (books.length) nextXlsx();
}
function dropSamples() { if (S.eps.some(e => e.sample)) { S.eps = S.eps.filter(e => !e.sample); S.srcs = S.srcs.filter(s => !s.sample); S.sel = null; S.cur = -1; } }
function snapshotSel() { return { selEp: S.sel ? S.eps[S.sel.e] : null, selC: S.sel ? S.sel.c : 0, curEp: S.eps[S.cur] || null }; }
function finishLoad(before, info) {
  info = info || {};
  S.eps.forEach(ep => { if (ep.sample) return; if (ep.src != null && !S.srcs[ep.src]) ep.src = null; });
  sortEps(); autoPair(); S.multi.clear();
  S.eps.forEach(ep => { ep.dirty = true; });
  const ns = before.selEp ? S.eps.indexOf(before.selEp) : -1;
  S.sel = ns >= 0 ? { e: ns, c: Math.min(before.selC, Math.max(0, S.eps[ns].cues.length - 1)) } : (S.eps[0] && S.eps[0].cues.length ? { e: 0, c: 0 } : null);
  if (S.sel && !curCue()) S.sel = null;
  const nc = before.curEp ? S.eps.indexOf(before.curEp) : -1;
  S.playIdx = -1;
  if (nc >= 0) S.cur = nc;
  checkDrafts();
  renderAll();
  if (nc >= 0) { const v = epVideo(nc); if (!v || video.dataset.url !== v.url) loadEpisode(nc, 0, false); }
  else if (S.sel) { S.cur = -1; loadEpisode(S.sel.e, (curCue().sm + 2) / 1000, false); }
  else if (S.eps.length) loadEpisode(0, 0, false);
  if (S.sel) scrollRow(S.sel.e, S.sel.c, true);
  const real = realEps();
  const pv = real.filter(e => e.video != null).length, ps = real.filter(e => e.src != null).length;
  let msg = `译文 ${real.length} ตอน · 原文 ${S.srcs.filter(s => !s.sample).length} ไฟล์ · วิดีโอ ${S.videos.length} ไฟล์ · จับคู่วิดีโอ ${pv}/${real.length} · 原文 ${ps}/${real.length}`;
  if (info.kept) msg += ` · ข้าม ${info.kept} ไฟล์ที่ชื่อซ้ำกับตอนที่กำลังแก้`;
  if (info.other && info.other.length) msg += ` · ข้ามไฟล์อื่น ${info.other.length} ไฟล์`;
  if (info.notes && info.notes.length) msg += ' · ' + info.notes.join(' · ');
  const unpairedSrc = S.srcs.filter((s, i) => !s.sample && !S.eps.some(e => e.src === i)).length;
  if (S.restoring) toast(`เปิดโปรเจกต์ ${curProj().name}: ${real.length} ตอน${S.videos.length ? '' : ' · ลากวิดีโอมาวางอีกครั้งถ้าต้องการดูภาพ'}`);
  else if (unpairedSrc && (!real.length || info.nS)) toast(msg + ` · มี原文 ${unpairedSrc} ไฟล์ที่ยังไม่มีไฟล์แปล`, { label: 'สร้างไฟล์แปลเปล่า', fn: makeThaiFromSrc });
  else toast(msg);
  const usedV = new Set(real.map(e => e.video).filter(v => v != null)).size, usedS = new Set(real.map(e => e.src).filter(v => v != null)).size;
  if (real.length && !S.restoring && !xlsxQueue.length && ((pv < real.length && S.videos.length > usedV) || (ps < real.length && S.srcs.length > usedS && !real.every(e => e.kind === 'xlsx')))) openPair();
}
const GEN_SUF = { th: '_泰文.srt', zh: '_中文.srt', en: '_英文.srt' };
function makeGenEp(i) {
    const s = S.srcs[i];
    const base = s.name.replace(/\.[^.]+$/, '').replace(/[_\-\s.(（]*(cn|zh|chs|cht|中文|简体|繁体|中|en|eng|english|英文|英语|英|th|tha|thai|ไทย|泰语|泰文|泰)[)）]?$/i, '');
    const name = base + (GEN_SUF[tgtLang()] || '_译文.srt');
    const info = epInfo(name);
    const ep = { name, num: info.num, group: info.group, base: baseOf(name), kind: 'srt', label: info.num != null ? 'EP' + p2(info.num) : base,
      raw: null, bom: true, enc: 'utf-8', eol: '\r\n', trail: true, hash: fnv(name + s.cues.length), video: null, src: i, sample: false, struct: false, gen: true, dirty: true, qv: 0,
      cues: s.cues.map((c, k) => ({ idx: c.idx != null ? c.idx : String(k + 1), s: fmt(c.sm), sep: ' --> ', e: fmt(c.em), tail: '', t: '', oS: fmt(c.sm), oE: fmt(c.em), oT: '', sm: c.sm, em: c.em })) };
    return ep;
}
function makeThaiFromSrc() {
  const before = snapshotSel();
  dropSamples();
  let n = 0;
  const recs = [];
  S.srcs.forEach((s, i) => {
    if (s.sample || s.fixed || S.eps.some(e => e.src === i)) return;
    const ep = makeGenEp(i);
    S.eps.push(ep); n++;
    recs.push({ name: ep.name, kind: 'gen', bytes: new Uint8Array(0), srcName: s.name });
  });
  persistFiles(recs);
  finishLoad(before, {});
  toast(`สร้างไฟล์แปล${TGT_LABEL()}เปล่า ${n} ตอน (ไทม์โค้ดตาม原文) · พิมพ์เอง หรือกดปุ่ม AI`, { label: 'ให้ AI แปล', fn: () => openAI('fill') });
}
async function walkEntries(entries, flat) {
  if (!entries.length || entries.some(x => !x)) return { files: flat, folder: '' };
  const out = []; let folder = '';
  const walk = async en => {
    if (en.isFile) { try { out.push(await new Promise((res, rej) => en.file(res, rej))); } catch (e) {} }
    else if (en.isDirectory) {
      if (!folder) folder = en.name;
      const rd = en.createReader();
      for (;;) { const batch = await new Promise((res, rej) => rd.readEntries(res, rej)); if (!batch.length) break; for (const b of batch) await walk(b); }
    }
  };
  for (const en of entries) await walk(en);
  return { files: out, folder };
}
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
let dragN = 0;
document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; document.body.classList.add('dragging'); });
document.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragN = Math.max(0, dragN - 1); if (!dragN) document.body.classList.remove('dragging'); });
document.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragN = 0; document.body.classList.remove('dragging');
  const dt = e.dataTransfer;
  const entries = [...dt.items].filter(i => i.kind === 'file').map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  const flat = [...dt.files];
  const inM = sel => !!e.target.closest && !!e.target.closest(sel);
  if (inM('#mGuide')) { addGuideFiles(flat); return; }
  if (inM('#mProj')) { if (flat[0]) importProject(flat[0]); return; }
  const toGloss = inM('#mGloss');
  walkEntries(entries, flat).then(({ files, folder }) => toGloss ? loadGlossFiles(files, true) : addFiles(files, folder));
});
$('bFiles').onclick = () => $('fFiles').click();
$('bDir').onclick = () => $('fDir').click();
$('fFiles').addEventListener('change', e => { addFiles([...e.target.files], ''); e.target.value = ''; });
$('fDir').addEventListener('change', e => {
  const fs = [...e.target.files];
  const folder = fs[0] && fs[0].webkitRelativePath ? fs[0].webkitRelativePath.split('/')[0] : '';
  addFiles(fs, folder); e.target.value = '';
});
ph.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'dir') $('fDir').click(); else if (a === 'files') $('fFiles').click(); else if (a === 'pair') openPair();
});

/* ---------- Excel import ---------- */
let XI = null;
const ROLES = [['ep', 'ตอน / ชื่อไฟล์'], ['idx', 'ลำดับ'], ['tl', 'ไทม์ไลน์ (เริ่ม --> จบ)'], ['start', 'เวลาเริ่ม'], ['end', 'เวลาจบ'], ['src', '原文 (ต้นฉบับ)'], ['tgt', '译文 (คอลัมน์ที่จะแก้)']];
async function nextXlsx() {
  if (XI || !xlsxQueue.length) return;
  const f = xlsxQueue.shift();
  try {
    const book = await xlsxBook(f);
    const ms = book.sheets.map(s => guessMap(s.rows));
    let best = 0, bs = -1;
    book.sheets.forEach((s, i) => { const m = ms[i]; const sc = (m.tgt >= 0 ? s.rows.length : 0) + (m.tl >= 0 || m.start >= 0 ? 500 : 0) + (m.src >= 0 ? 100 : 0); if (sc > bs) { bs = sc; best = i; } });
    XI = { f, book, ms, si: best };
    $('xFile').textContent = f.name;
    $('xSheet').innerHTML = book.sheets.map((s, i) => `<option value="${i}">${esc(s.name)} (${s.rows.length} แถว)</option>`).join('');
    $('xSheet').value = best;
    const m = ms[best];
    const subLike = m.tgt >= 0 && (m.tl >= 0 || m.start >= 0 || book.sheets[best].rows.length > 30 || m.ep >= 0);
    document.querySelector(`input[name=xKind][value=${subLike ? 'sub' : (m.tgt >= 0 ? 'gloss' : 'sub')}]`).checked = true;
    renderXlsx();
    openM('mXlsx');
  } catch (e) { toast(`อ่าน ${f.name} ไม่ได้: ${e.message || ''}`); XI = null; nextXlsx(); }
}
function renderXlsx() {
  const sh = XI.book.sheets[XI.si], m = XI.ms[XI.si];
  const cols = [...Array(Math.max(1, m.ncol)).keys()];
  const head = m.head || [];
  const opt = (sel) => `<option value="-1">— ไม่มี —</option>` + cols.map(c => `<option value="${c}"${sel === c ? ' selected' : ''}>${colName(c)}${head[c] ? ' · ' + esc(String(head[c]).slice(0, 18)) : ''}</option>`).join('');
  $('xMap').innerHTML = ROLES.map(([k, lab]) => `<label>${esc(lab)}<select class="field sm" data-role="${k}">${opt(m[k])}</select></label>`).join('') + `<label>แถวหัวตาราง<input class="field sm" type="number" min="0" data-role="hr" value="${m.hr || 0}"></label>`;
  const rows = sh.rows.slice(0, 9);
  $('xPrev').innerHTML = `<table><thead><tr><th></th>${cols.map(c => `<th>${colName(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td class="mono">${r.r}</td>${cols.map(c => `<td>${esc(String(r.vals[c] || '').slice(0, 80))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const eps = sheetToEps(sh.rows, m, XI.f.name.replace(/\.xlsx$/i, ''));
  $('xInfo').textContent = document.querySelector('input[name=xKind]:checked').value === 'gloss'
    ? `จะใช้เป็น术语表 ${glossFromRows(sh.rows.map(r => r.vals)).length} คำ`
    : `จะได้ ${eps.length} ตอน · ${eps.reduce((a, e) => a + e.rows.length, 0)} คิว${m.tl < 0 && m.start < 0 ? ' · ไม่มีไทม์โค้ด (แก้ข้อความได้ แต่เล่นวิดีโอตามคิวไม่ได้)' : ''}${m.tgt < 0 ? ' · ยังไม่ได้เลือกคอลัมน์译文' : ''}`;
}
$('xSheet').addEventListener('change', () => { XI.si = +$('xSheet').value; renderXlsx(); });
$('mXlsx').addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'xKind') { renderXlsx(); return; }
  if (t.dataset.role) { const m = XI.ms[XI.si]; m[t.dataset.role] = t.dataset.role === 'hr' ? (+t.value || null) : +t.value; renderXlsx(); }
});
$('xSkip').onclick = () => { closeM('mXlsx'); XI = null; nextXlsx(); };
$('xGo').onclick = () => {
  const kind = document.querySelector('input[name=xKind]:checked').value;
  const { f, book, si } = XI, sh = book.sheets[si], m = XI.ms[si];
  if (kind === 'gloss') { const g = glossFromRows(sh.rows.map(r => r.vals)); if (g.length) { setGloss(g, f.name); toast(`โหลด术语表 ${g.length} คำ`); } }
  else if (kind === 'sub') {
    if (m.tgt < 0) { toast('เลือกคอลัมน์译文ก่อน'); return; }
    importSheet(f, book, si, m);
  }
  closeM('mXlsx'); XI = null; nextXlsx();
};
function importSheet(f, book, si, m) {
  const sh = book.sheets[si];
  const groups = sheetToEps(sh.rows, m, f.name.replace(/\.xlsx$/i, ''));
  const bi = S.books.push({ file: f, name: f.name, ents: book.ents, sheetPath: sh.path, col: m.tgt }) - 1;
  const before = snapshotSel();
  dropSamples();
  const norm = s => String(s || '').replace(/\r\n?/g, '\n').replace(/\\N/g, '\n');
  for (const g of groups) {
    const noTime = g.rows.every(r => isNaN(r.sm));
    const nl = g.rows.some(r => /\\N/.test(r.tgt)) ? '\\N' : '\n';
    const info = epInfo(g.key);
    const cues = g.rows.map((r, k) => {
      const sm = noTime ? k * 3000 : (isNaN(r.sm) ? 0 : r.sm), em = noTime ? k * 3000 + 2800 : (isNaN(r.em) ? sm + 2000 : r.em);
      const t = norm(r.tgt).replace(/\n+$/, '');
      return { idx: r.idx || null, xr: r.r, s: fmt(sm), sep: ' --> ', e: fmt(em), tail: '', t, oS: fmt(sm), oE: fmt(em), oT: t, sm, em, rawT: r.tgt };
    });
    const ep = { name: `${f.name} › ${g.key}`, key: g.key, num: info.num, group: info.group, base: baseOf(g.key), kind: 'xlsx', book: bi, nl, noTime,
      label: info.num != null ? 'EP' + p2(info.num) : g.key, raw: null, bom: true, enc: 'utf-8', eol: '\r\n', trail: true, hash: fnv(g.rows.map(r => r.tgt).join('\u0001')),
      video: null, src: null, sample: false, struct: false, dirty: true, qv: 0, cues };
    if (m.src >= 0) {
      const sc = g.rows.map((r, k) => ({ t: norm(r.src), sm: cues[k].sm, em: cues[k].em }));
      ep.src = S.srcs.push({ name: ep.name + ' · 原文', cues: sc, lang: scriptOf(sc.slice(0, 80).map(c => c.t).join(' ')), fixed: true }) - 1;
    }
    S.eps.push(ep);
  }
  finishLoad(before, {});
  toast(`นำเข้า ${f.name}: ${groups.length} ตอน`);
}

/* ---------- glossary ---------- */
function setGloss(listIn, name) {
  S.gloss = listIn; S.glossName = name; S.G = glossCompile(listIn);
  store.set(pk('gloss'), { name, list: listIn });
  renderGloss(); requalify();
}
async function loadGlossFiles(files, announce) {
  let all = [], names = [];
  for (const f of files) {
    const x = extOf(f.name);
    try {
      const rows = x === 'xlsx' ? (await xlsxBook(f)).sheets.flatMap(s => s.rows.map(r => r.vals)) : textRows(await f.text());
      const g = glossFromRows(rows);
      if (g.length) { all = all.concat(g); names.push(f.name); }
    } catch (e) { toast(`อ่าน ${f.name} ไม่ได้: ${e.message || ''}`); }
  }
  if (!all.length) { if (announce) toast('ไม่เจอคู่คำ 原文 | ไทย ในไฟล์นี้'); return; }
  const seen = new Set(); all = all.filter(g => !seen.has(g.src) && seen.add(g.src));
  setGloss(all, names.join(', '));
  if (announce) toast(`โหลด术语表 ${all.length} คำ`);
}
function renderGloss() {
  $('gInfo').textContent = S.gloss.length ? `ใช้อยู่ ${S.gloss.length} คำ${S.glossName ? ' จาก ' + S.glossName : ''} · ตรวจได้จริง ${S.G.length} คำ (ข้ามคำจีนตัวเดียว)` : 'ยังไม่มี术语表';
  renderGlossEd();
}
$('bGloss').onclick = () => { renderGloss(); openM('mGloss'); };
$('gFile').onclick = () => $('fGloss').click();
$('fGloss').addEventListener('change', e => { loadGlossFiles([...e.target.files], true); e.target.value = ''; });
$('gUse').onclick = () => { const g = glossFromRows(textRows($('gPaste').value)); if (!g.length) { toast('ไม่เจอคู่คำ 原文 | ไทย ในข้อความที่วาง'); return; } setGloss(g, 'ข้อความที่วาง'); toast(`ใช้术语表 ${g.length} คำ`); };
$('gClear').onclick = () => { setGloss([], ''); };

/* ---------- modals ---------- */
function openM(id) { $(id).classList.add('open'); const f = $(id).querySelector('.btn.primary:not([data-close]), input:not([type=radio]):not([type=checkbox]), select'); if (f) f.focus(); }
function closeM(id) {
  $(id).classList.remove('open');
  if (id === 'mPair') { S.eps.forEach(ep => { ep.dirty = true; }); renderList(); renderJump(); loadEditor(); }
  if (id === 'mXlsx' && XI) { XI = null; setTimeout(nextXlsx, 0); }
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) { closeM(c.closest('.modal').id); return; }
  if (e.target.classList && e.target.classList.contains('modal')) closeM(e.target.id);
});
function pairInfo() {
  const real = realEps();
  $('pairInfo').textContent = `译文 ${real.length} ตอน · 原文 ${S.srcs.filter(s => !s.sample).length} ไฟล์ · วิดีโอ ${S.videos.length} ไฟล์ · จับคู่原文แล้ว ${real.filter(e => e.src != null).length} · วิดีโอ ${real.filter(e => e.video != null).length}`;
}
function openPair() {
  const real = realEps();
  if (!real.length && !S.srcs.some(s => !s.sample)) { toast('ลากไฟล์ซับเข้ามาก่อน'); return; }
  const opts = (pool, cur, none) => `<option value="">— ${none} —</option>` + pool.map((x, i) => x.sample ? '' : `<option value="${i}"${cur === i ? ' selected' : ''}>${esc(x.name)}${x.lang ? ' (' + esc(LANG_LABEL[x.lang] || '') + ')' : ''}</option>`).join('');
  $('pairT').innerHTML = real.length ? `<table><thead><tr><th>ตอน</th><th>译文 (ไทย)</th><th>原文</th><th>วิดีโอ</th></tr></thead><tbody>${S.eps.map((ep, ei) => ep.sample ? '' : `<tr><td class="mono">${esc(ep.label)}</td><td class="fnc">${esc(ep.name)}</td><td><select class="field sm" data-ep="${ei}" data-k="src" aria-label="原文ของ ${esc(ep.label)}">${opts(S.srcs, ep.src, 'ไม่มี原文')}</select></td><td><select class="field sm" data-ep="${ei}" data-k="video" aria-label="วิดีโอของ ${esc(ep.label)}">${opts(S.videos, ep.video, 'ไม่มีวิดีโอ')}</select></td></tr>`).join('')}</tbody></table>` : '<p class="none">ยังไม่มีไฟล์แปลไทย กดปุ่มด้านล่างเพื่อสร้างจาก原文</p>';
  $('bMakeTh').disabled = !S.srcs.some((s, i) => !s.sample && !S.eps.some(e => e.src === i));
  pairInfo(); openM('mPair');
}
$('pairT').addEventListener('change', e => {
  const s = e.target.closest('select[data-ep]'); if (!s) return;
  const ei = +s.dataset.ep, k = s.dataset.k;
  S.eps[ei][k] = s.value === '' ? null : +s.value;
  S.eps[ei].dirty = true;
  if (k === 'video' && ei === S.cur) loadEpisode(ei, 0, false);
  pairInfo();
});
$('bPair').onclick = openPair;
$('bMakeTh').onclick = () => { closeM('mPair'); makeThaiFromSrc(); };

/* QA panel */
function qaScope() { const r = realEps(); return r.length ? r : S.eps; }
function renderQA() {
  ensureAll();
  const eps = qaScope(), cnt = {};
  let cues = 0, bad = 0;
  for (const ep of eps) for (const c of ep.cues) { cues++; const codes = new Set(Q(c).iss.map(x => x.code)); if (hasSev(c, ['e', 'w'])) bad++; codes.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; }); }
  const off = new Set(S.cfg.off || []);
  const rows = Object.keys(CAT).filter(k => cnt[k]).sort((a, b) => 'ewi'.indexOf(CAT[a][0]) - 'ewi'.indexOf(CAT[b][0]) || cnt[b] - cnt[a]);
  const nv = S.videos.length, done = S.videos.filter(v => { const a = S.audio.get(v.url); return a && a.status === 'ok'; }).length;
  $('qaSum').textContent = `${eps.length} ตอน · ${cues.toLocaleString('en')} คิว · ต้องแก้หรือควรเช็ก ${bad.toLocaleString('en')} คิว · เกณฑ์: ${S.cfg.mode === 'se' ? 'SE' : 'len'} ${S.cfg.limit}/บรรทัด, ${S.cfg.maxLines} บรรทัด${S.cfg.cpsMax ? `, CPS ≤ ${S.cfg.cpsMax}` : ''}${S.cfg.era !== 'off' ? ', ยุค' + (S.cfg.era === 'period' ? 'ย้อนยุค' : 'ปัจจุบัน') : ''}${nv ? ` · วิเคราะห์เสียงแล้ว ${done}/${nv} วิดีโอ` : ''}${off.size ? ` · ปิดการตรวจไว้ ${off.size} เรื่อง` : ''}`;
  $('qaT').innerHTML = rows.length ? `<table><thead><tr><th></th><th>เรื่องที่เจอ</th><th>ระดับ</th><th>จำนวนคิว</th><th></th></tr></thead><tbody>${rows.map(k => `<tr class="qa-row"><td><span class="qa-sev ${CAT[k][0]}"></span></td><td>${esc(CAT[k][1])}</td><td class="info">${SEVLAB[CAT[k][0]]}</td><td class="num">${cnt[k]}</td><td><button class="btn sm" type="button" data-qv="${k}">ดูในรายการ</button>${FIXABLE.has(k) ? ` <button class="btn sm" type="button" data-qf="${k}">แก้อัตโนมัติ</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="none">ไม่เจอปัญหาตามเกณฑ์ที่ตั้งไว้</p>';
  $('qaVoice').disabled = !nv || done === nv;
}
$('qaT').addEventListener('click', e => {
  const v = e.target.closest('[data-qv]'), f = e.target.closest('[data-qf]');
  if (v) { closeM('mQA'); setFilter('c:' + v.dataset.qv); }
  if (f) fixAll(f.dataset.qf);
});
$('qaVoice').onclick = async () => {
  $('qaVoice').disabled = true;
  for (let i = 0; i < S.videos.length; i++) { $('qaSum').textContent = `กำลังวิเคราะห์เสียง ${i + 1}/${S.videos.length}: ${S.videos[i].name}`; await ensureAudio(S.videos[i]); }
  renderQA(); toast('วิเคราะห์เสียงเสร็จแล้ว ดูหมวด "เสียงไม่ตรงหางเสียง"');
};
function fixAll(code) {
  ensureAll();
  const targets = [];
  qaScope().forEach(ep => { const ks = ep.cues.map((c, k) => hasCode(c, code) ? k : -1).filter(k => k >= 0); if (ks.length) targets.push([ep, ks]); });
  if (!targets.length) { toast('ไม่มีรายการให้แก้'); return; }
  pushHist(targets.map(x => x[0]), 'แก้อัตโนมัติ: ' + CAT[code][1]);
  let n = 0;
  for (const [ep, ks] of targets) {
    for (const k of ks) { const c = ep.cues[k], nt = fixText(code, c.t, S.cfg, S.L); if (nt !== c.t) { c.t = nt; n++; } }
    ep.dirty = true; queueDraft(ep);
  }
  renderList(); renderStats(); loadEditor(); renderOverlay(true); renderQA();
  toast(`แก้ ${CAT[code][1]} ไป ${n} คิว`, { label: 'เลิกทำ', fn: () => { undo(); renderQA(); } });
}
$('bQA').onclick = () => { renderQA(); openM('mQA'); };
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
$('qaCsv').onclick = () => {
  ensureAll();
  const rows = [['集', '文件', '序号', '开始', '结束', '原文', '译文', '级别', '问题']];
  for (const ep of qaScope()) ep.cues.forEach((c, i) => {
    const iss = Q(c).iss; if (!iss.length) return;
    rows.push([ep.label, ep.name, i + 1, c.s, c.e, srcTextOf(ep, c), c.t, [...new Set(iss.map(x => SEVLAB[x.sev]))].join('/'), iss.map(x => x.msg).join('; ')]);
  });
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveFile(defaultZipName().replace(/\.zip$/, '') + '_QA报告.csv', new TextEncoder().encode(csv), 'text/csv');
};

/* settings */
const CFG_FIELDS = [
  ['mode', 'นับตัวอักษรแบบ', 'sel', [['se', 'SE (ไม่นับสระบน-ล่าง/วรรณยุกต์)'], ['len', 'len (นับทุกตัว)']]],
  ['limit', 'ลิมิตต่อบรรทัด', 'num'],
  ['maxLines', 'บรรทัดสูงสุดต่อคิว', 'num'],
  ['cpsMax', 'CPS สูงสุด (0 = ไม่ตรวจ)', 'num'],
  ['cpsMode', 'CPS นับแบบ', 'sel', [['len', 'len'], ['se', 'SE']]],
  ['minDur', 'คิวสั้นสุด วินาที (0 = ไม่ตรวจ)', 'sec'],
  ['maxDur', 'คิวยาวสุด วินาที (0 = ไม่ตรวจ)', 'sec'],
  ['punct', 'เครื่องหมาย ! ? … , . " ;', 'sel', [['strict', 'ห้ามใช้'], ['off', 'ไม่ตรวจ']]],
  ['particles', 'หางเสียงสุภาพ (ครับ ค่ะ…)', 'sel', [['dense', 'เตือนเมื่อท้ายคิวติดกันหลายคิว'], ['ban', 'ห้ามมีเลย'], ['off', 'ไม่ตรวจ']]],
  ['denseN', 'ติดกันกี่คิวถึงเตือน', 'num'],
  ['era', 'ยุคของเรื่อง', 'sel', [['off', 'ไม่ตรวจ'], ['modern', 'ปัจจุบัน (ห้าม ข้า/เจ้า/เพคะ…)'], ['period', 'ย้อนยุค (ห้าม ครับ/ค่ะ/ผม/ฉัน/ไหม/เหรอ…)']]],
  ['bracket', 'ชนิดวงเล็บ', 'sel', [['half', 'ครึ่งความกว้าง ( )'], ['full', 'เต็มความกว้าง （）'], ['off', 'ไม่ตรวจ']]],
  ['ratioLo', 'เทียบ原文: สั้นผิดปกติถ้าต่ำกว่า (จีน)', 'dec'],
  ['ratioHi', 'เทียบ原文: ยาวผิดปกติถ้าสูงกว่า (จีน)', 'dec']
];
const LEX_FIELDS = [
  ['maleP', 'หางเสียงผู้ชาย'], ['femaleP', 'หางเสียงผู้หญิง'], ['neutralP', 'หางเสียงกลาง'], ['maleR', 'สรรพนามผู้ชาย'], ['femaleR', 'สรรพนามผู้หญิง'],
  ['polite', 'หางเสียงสุภาพ (ใช้นับความถี่/ห้าม)'], ['prof', 'คำหยาบ'], ['spell', 'คำสะกดผิด (ผิด > ถูก)'], ['period', 'คำที่ห้ามในเรื่องย้อนยุค (คำ > ใช้แทน)'],
  ['modern', 'คำที่ห้ามในเรื่องปัจจุบัน (คำ > ใช้แทน)'], ['spellEn', 'คำสะกดผิดภาษาอังกฤษ (ผิด > ถูก)'], ['spellZh', '错别字 ภาษาจีน (ผิด > ถูก)'], ['allow', 'คำยกเว้น (ไม่ต้องเตือน เช่น เจ้าหน้าที่ ทรงผม คุณหนู)'], ['conj', 'คำเชื่อม (ใช้ตอนตัดบรรทัดอัตโนมัติ)']
];
function presetOptions() { return presetsFor(tgtLang()).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('') + '<option value="custom">กำหนดเอง</option>'; }
function renderCfg() {
  const c = S.cfg;
  const field = ([k, lab, type, opts]) => {
    if (type === 'sel') return `<label>${esc(lab)}<select class="field sm" data-cfg="${k}">${opts.map(([v, n]) => `<option value="${v}"${c[k] === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    const val = type === 'sec' ? (c[k] / 1000) : c[k];
    return `<label>${esc(lab)}<input class="field sm" data-cfg="${k}" data-type="${type}" type="number" step="${type === 'num' ? 1 : 0.01}" min="0" value="${val}"></label>`;
  };
  const off = new Set(c.off || []);
  $('cfgBody').innerHTML = `<label class="col">ชุดเกณฑ์ของลูกค้า<select class="field" id="cfgPreset">${presetOptions()}</select></label>
  <div class="cfg-grid">${CFG_FIELDS.map(field).join('')}</div>
  <h3>เรื่องที่ตรวจ</h3>
  <div class="codes">${Object.keys(CAT).map(k => `<label class="chk"><input type="checkbox" data-code="${k}"${off.has(k) ? '' : ' checked'}> <span class="dot ${CAT[k][0]}"></span> ${esc(CAT[k][1])}</label>`).join('')}</div>
  <details><summary>รายการคำ (แก้เองได้ แยกคำด้วยเว้นวรรค หรือบรรทัดละคู่ "ผิด > ถูก")</summary><div class="lex">${LEX_FIELDS.map(([k, lab]) => `<label>${esc(lab)}<textarea data-lex="${k}" spellcheck="false">${esc(S.lexSrc[k] || '')}</textarea></label>`).join('')}</div></details>`;
  $('cfgPreset').value = c.preset || 'custom';
}
function applyPreset(k) {
  const p = PRESETS.find(x => x[0] === k);
  if (p) Object.assign(S.cfg, p[2]);
  S.cfg.preset = k;
  saveSettings(); syncCrit(); requalify();
}
$('cfgBody').addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cfgPreset') { applyPreset(t.value); renderCfg(); return; }
  if (t.dataset.cfg) {
    const k = t.dataset.cfg, ty = t.dataset.type;
    let v = t.value;
    if (ty === 'num') v = Math.max(0, parseInt(v, 10) || 0);
    else if (ty === 'dec') v = Math.max(0, parseFloat(v) || 0);
    else if (ty === 'sec') v = Math.round(Math.max(0, parseFloat(v) || 0) * 1000);
    if (k === 'limit' || k === 'maxLines') v = Math.max(1, v);
    S.cfg[k] = v;
    if (k !== 'era') { S.cfg.preset = 'custom'; $('cfgPreset').value = 'custom'; }
  }
  if (t.dataset.code) {
    const off = new Set(S.cfg.off || []);
    if (t.checked) off.delete(t.dataset.code); else off.add(t.dataset.code);
    S.cfg.off = [...off];
  }
  if (t.dataset.lex) { S.lexSrc[t.dataset.lex] = t.value; S.L = compileLex(S.lexSrc); }
  saveSettings(); syncCrit(); requalify();
});
$('bCfg').onclick = () => { renderCfg(); openM('mCfg'); };
$('cfgReset').onclick = () => { S.cfg = cfgForTarget(tgtLang(), S.cfg.src); S.lexSrc = Object.assign({}, DEF_LEX); S.L = compileLex(S.lexSrc); saveSettings(); renderCfg(); syncCrit(); requalify(); toast('คืนค่าเกณฑ์เริ่มต้นแล้ว'); };
function syncCrit() {
  document.body.dataset.tgt = tgtLang();
  $('preset').innerHTML = presetOptions();
  $('preset').value = S.cfg.preset || 'custom';
  document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === S.cfg.mode)));
  if (document.activeElement !== $('limit')) $('limit').value = S.cfg.limit;
  $('era').value = S.cfg.era;
}
$('preset').addEventListener('change', () => applyPreset($('preset').value));
$('modeSeg').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; S.cfg.mode = b.dataset.m; S.cfg.preset = 'custom'; saveSettings(); syncCrit(); requalify(); });
$('limit').addEventListener('input', () => { const v = parseInt($('limit').value, 10); if (v > 0) { S.cfg.limit = v; S.cfg.preset = 'custom'; $('preset').value = 'custom'; saveSettings(); requalify(); } });
$('era').addEventListener('change', () => { S.cfg.era = $('era').value; saveSettings(); requalify(); });

/* ---------- AI: Claude via claude.ai, or the user's own Gemini / Claude / ChatGPT key ---------- */
const AI = { ctl: null, res: [], map: new Map() };
const LANG_TH = { zh: 'จีน', th: 'ไทย', en: 'อังกฤษ', ja: 'ญี่ปุ่น', ko: 'เกาหลี', other: 'ต้นฉบับ' };
function taskText(task) {
  const T = TGT_LABEL();
  return {
    fill: `แปลจาก原文เป็นภาษา${T} เฉพาะคิวที่ "t" ยังว่าง`,
    retrans: `แปลจาก原文เป็นภาษา${T}ใหม่ทุกคิว`,
    qa: `ตรวจคำแปลภาษา${T}เทียบกับ原文 เสนอแก้เฉพาะคิวที่ผิดจริง (ความหมายผิด แปลขาด แปลเกิน เพศ/สรรพนามผิด ศัพท์ไม่ตรง术语表 คำผิด ภาษาไม่เป็นธรรมชาติ รูปแบบผิด) คิวที่ถูกและเป็นธรรมชาติอยู่แล้วห้ามแก้`,
    spell: `ตรวจเฉพาะคำผิดในคำแปลภาษา${T}: สะกดผิด พิมพ์ผิด ตัวอักษรตกหล่นหรือเกิน สระ/วรรณยุกต์ผิด เว้นวรรคผิด ${tgtLang() === 'zh' ? 'ใช้อักษรจีนผิดตัว (错别字 เช่น 的/地/得 在/再 以/已)' : tgtLang() === 'en' ? 'grammar ผิดชัดเจน ตัวพิมพ์ใหญ่-เล็กผิด' : 'คำที่มักเขียนผิดตามราชบัณฑิตยสถาน'} แก้เฉพาะคำที่ผิด ห้ามแก้สำนวน ความหมาย การตัดบรรทัด หรืออย่างอื่นที่ไม่ใช่คำผิด`,
    shorten: `เกลาคำแปลภาษา${T}ให้แต่ละบรรทัดอยู่ในลิมิต โดยความหมายครบเหมือนเดิม ไม่เปลี่ยนชื่อ สรรพนาม หรือระดับภาษา ตัดเฉพาะคำที่ไม่จำเป็น ถ้าจำเป็นให้ตัดเป็น 2 บรรทัดตรงรอยต่อวลี ห้ามฉีกคำ`,
    particles: 'ตัดหางเสียง (ครับ ค่ะ คะ นะคะ เพคะ ขอรับ ฯลฯ) ที่ไม่จำเป็นออก ให้เหลือเฉพาะที่ทำให้ประโยคสุภาพหรือเป็นธรรมชาติจริง เช่น คำตอบสั้น ๆ หรือคำเรียกขาน ห้ามแก้ส่วนอื่น'
  }[task];
}
function aiTargets(task, scope) {
  const out = [];
  const push = (ei, ci) => { out.push([ei, ci]); };
  if (scope === 'sel') selCues().forEach(([e, c]) => push(e, c));
  else {
    const eis = scope === 'all' ? qaScope().map(ep => S.eps.indexOf(ep)) : (S.sel ? [S.sel.e] : S.cur >= 0 ? [S.cur] : []);
    for (const ei of eis) { ensureQA(ei); S.eps[ei].cues.forEach((c, ci) => { if (scope === 'issues' && !hasSev(c, ['e', 'w'])) return; push(ei, ci); }); }
  }
  return out.filter(([ei, ci]) => {
    const c = S.eps[ei].cues[ci];
    if (task === 'fill') return !c.t.trim();
    if (task === 'spell') return !!c.t.trim();
    if (task === 'shorten') { ensureQA(ei); return Q(c).ov; }
    if (task === 'particles') { ensureQA(ei); return Q(c).marks.some(m => /^g[mf]/.test(m.c) && !/gr/.test(m.c)); }
    return true;
  });
}
function aiPrompt(task, items) {
  const cfg = S.cfg, T = tgtLang(), TN = TGT_LABEL();
  const lines = [];
  lines.push(`แต่ละบรรทัดยาวไม่เกิน ${cfg.limit} ตัวอักษร (${cfg.mode === 'se' && T === 'th' ? 'นับแบบ SE ไม่นับสระบน-ล่างและวรรณยุกต์' : 'นับทุกตัว รวมช่องว่าง'}) ไม่เกิน ${cfg.maxLines} บรรทัดต่อคิว ใช้ \\n คั่นบรรทัด ถ้าบรรทัดเดียวพอห้ามตัดบรรทัด`);
  if (T === 'th') {
    lines.push(cfg.era === 'period' ? 'ละครย้อนยุค: ใช้ภาษาโบราณ ข้า/เจ้า/ท่าน ใช้ราชาศัพท์ตามฐานะ (พ่ะย่ะค่ะ/เพคะ/กระหม่อม/หม่อมฉัน กับเชื้อพระวงศ์ · ขอรับ/เจ้าค่ะ/เจ้าคะ กับขุนนางหรือนาย) ใส่หางเสียงน้อยที่สุด ห้ามใช้ ไหม เหรอ ยังไง งั้น เถอะ แบบนี้ เมื่อไหร่ (ใช้ หรือไม่ หรือ อย่างไร เช่นนั้น เถิด เช่นนี้ เมื่อใด) ห้ามใช้ ครับ ค่ะ ผม ฉัน คุณ เธอ'
      : cfg.era === 'modern' ? 'ละครยุคปัจจุบัน: ใช้ ผม/ฉัน/คุณ/นาย/เธอ/แก ห้ามใช้ ข้า เจ้า ท่านพ่อ ราชาศัพท์' : 'ดูยุคของเรื่องจากเนื้อหา แล้วใช้ระดับภาษาให้ตรงยุค');
    lines.push(cfg.particles === 'ban' ? 'ห้ามมีหางเสียงสุภาพ (ครับ ค่ะ คะ นะคะ ฯลฯ)' : 'ใส่หางเสียงเท่าที่จำเป็น');
    lines.push(cfg.punct === 'strict' ? 'ห้ามใช้เครื่องหมาย ! ? … , . " ; (ตัวเลขอย่าง 10,000 ใช้ได้) ระหว่างวลีใช้เว้นวรรค' : 'ใช้เครื่องหมายตามมาตรฐานของงาน');
  } else if (T === 'zh') {
    lines.push('ใช้จีนตัวย่อ (简体中文)');
    lines.push(cfg.punct === 'strict' ? 'ห้ามใช้ ，。；、 ระหว่างวลีใช้เว้นวรรค' : 'ใช้เครื่องหมายตามมาตรฐานของงาน');
  } else lines.push('ภาษาอังกฤษแบบซับไตเติ้ล เครื่องหมายวรรคตอนปกติ');
  if (cfg.cpsMax) lines.push(`ความเร็วอ่านไม่เกิน ${cfg.cpsMax} ตัวอักษรต่อวินาที ("sec" คือความยาวคิว)`);
  const srcAll = items.map(([ei, ci]) => srcTextOf(S.eps[ei], S.eps[ei].cues[ci])).join('\n');
  const gl = S.G.filter(g => g.lat ? g.rx.test(srcAll) : srcAll.includes(g.src)).slice(0, 200);
  const cl = curClient();
  const srcLang = (() => { for (const [ei] of items) { const s = epSrc(S.eps[ei]); if (s) return LANG_TH[s.lang] || 'ต้นฉบับ'; } return S.cfg.src !== 'auto' ? LANG_TH[S.cfg.src] : 'ต้นฉบับ'; })();
  const data = items.map(([ei, ci], k) => {
    const ep = S.eps[ei], c = ep.cues[ci];
    return JSON.stringify({ i: String(k + 1), ep: ep.label, time: ep.noTime ? undefined : c.s, sec: ep.noTime ? undefined : +((c.em - c.sm) / 1000).toFixed(2), src: task === 'spell' ? undefined : srcTextOf(ep, c), t: c.t });
  }).join('\n');
  return `คุณคือนักแปลและ QA ซับไตเติ้ลมืออาชีพ (${srcLang} → ${TN}) ของ Hell's Factory

งาน: ${taskText(task)}

เกณฑ์รูปแบบ:
${lines.map(l => '- ' + l).join('\n')}
${cl && cl.rules ? `\nกฎของลูกค้า ${cl.name} (สำคัญที่สุด ถ้าขัดกับกฎอื่นให้ยึดข้อนี้):\n${cl.rules}\n` : ''}
กฎทั่วไปของงานนี้:
${S.aiRules}
${gl.length ? `\n术语表 (ต้องใช้คำแปลนี้เท่านั้น):\n${gl.map(g => `${g.src} = ${g.th}`).join('\n')}\n` : ''}
ข้อมูล (หนึ่งบรรทัดต่อคิว เรียงตามเวลา${task === 'spell' ? '' : ' "src" คือ原文'} "t" คือคำแปลภาษา${TN}ปัจจุบัน "sec" คือความยาวคิวเป็นวินาที):
${data}

ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น รูปแบบ: [{"i":"1","t":"คำแปลทั้งคิวหลังแก้","note":"เหตุผลสั้น ๆ ภาษาไทย"}]
${['qa', 'particles', 'spell'].includes(task) ? 'ใส่เฉพาะคิวที่ต้องแก้ ถ้าไม่มีคิวไหนต้องแก้ให้ตอบ []' : 'ใส่ให้ครบทุกคิว'} · "t" ต้องเป็นข้อความทั้งคิวหลังแก้ (ใช้ \\n คั่นบรรทัด)`;
}
/* provider + model pickers (shared by the AI and guide windows) */
let hostOK = null;
AIX.hostClaude().then(h => { hostOK = !!h; renderConnState(); });
async function provOptions(sel, model, cur) {
  const av = await AIX.available();
  const name = p => p === 'host' ? 'Claude (claude.ai)' : AIX.PROVIDERS[p].name;
  sel.innerHTML = av.map(p => `<option value="${p}">${esc(name(p))}</option>`).join('') + '<option value="__conn">＋ เชื่อมต่อ AI…</option>';
  const pick = av.includes(cur) ? cur : av[0] || '';
  sel.value = pick || '__conn';
  await modelOptions(model, pick, AIX.getSel().model);
  return pick;
}
async function modelOptions(sel, prov, cur) {
  if (!prov || prov === '__conn') { sel.innerHTML = '<option value="">—</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  let list = prov === 'host' ? AIX.HOST_MODELS : AIX.cachedModels(prov);
  if (!list.length) {
    sel.innerHTML = '<option value="">กำลังโหลดรายชื่อรุ่น…</option>';
    try { list = await AIX.listModels(prov); AIX.cacheModels(prov, list); } catch (e) { sel.innerHTML = `<option value="">โหลดรุ่นไม่ได้: ${esc(e.message || '')}</option>`; return; }
  }
  sel.innerHTML = list.map(m => `<option value="${esc(m.id)}">${m.top ? '★ ' : ''}${esc(m.name || m.id)}${m.top ? ' (แนะนำ)' : ''}</option>`).join('');
  sel.value = list.some(m => m.id === cur) ? cur : list[0] ? list[0].id : '';
}
function aiErr(e, prov) {
  const code = e && e.code, st = e && e.status, m = String((e && e.message) || '');
  if (code === 'cancelled' || (e && e.name === 'AbortError')) return 'หยุดแล้ว';
  if (code === 'not_granted') return 'ไม่ได้อนุญาตให้หน้านี้ใช้ Claude';
  if (code === 'rate_limited' || st === 429) return 'ใช้ถี่เกินไป หรือโควตาของวันนี้หมด รอสักพักแล้วลองใหม่ (หรือเปลี่ยนไปใช้รุ่นอื่น)';
  if (code === 'invalid_json') return 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ ลองกดใหม่ หรือลดขอบเขตลง';
  if (st === 401 || st === 403 || /api key|API_KEY|permission|unauthori/i.test(m)) return `กุญแจของ ${prov && AIX.PROVIDERS[prov] ? AIX.PROVIDERS[prov].name : 'AI'} ใช้ไม่ได้ หรือหมดอายุ ไปที่ ☰ → เชื่อมต่อ AI แล้วใส่กุญแจใหม่`;
  if (/credit|balance|billing|quota|insufficient/i.test(m)) return 'เครดิตหรือโควตาไม่พอ เติมเครดิตในเว็บของเจ้านั้นก่อน หรือเปลี่ยนไปใช้ AI อื่น';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'ต่ออินเทอร์เน็ตไม่ได้ หรือหน้านี้เรียก AI ภายนอกไม่ได้ (ในเว็บ claude.ai ใช้ได้เฉพาะ Claude ผ่าน claude.ai)';
  return 'เกิดข้อผิดพลาด: ' + m.slice(0, 220);
}
async function aiNote() {
  const av = await AIX.available();
  $('aiGo').hidden = !av.length;
  $('aiNote').textContent = av.length ? `เลือกงาน แล้วกด "ให้ AI ทำ" งานยาวจะแบ่งส่งทีละ 40 คิว ผลลัพธ์ยังไม่ถูกใส่จนกว่าจะกด "ใช้ข้อเสนอที่เลือก"`
    : 'ยังไม่ได้เชื่อม AI กด ☰ → "เชื่อมต่อ AI" (หรือเลือก "＋ เชื่อมต่อ AI…" ในช่อง AI) ใช้เวลาไม่ถึง 2 นาที · หรือใช้ปุ่ม "คัดลอก prompt" ไปวางเองก็ได้';
}
async function openAI(task, scope) {
  if (task) $('aiTask').value = task;
  if (scope) $('aiScope').value = scope;
  else $('aiScope').value = S.multi.size > 1 ? 'sel' : $('aiScope').value;
  $('aiRules').value = S.aiRules;
  openM('mAI'); renderAIRes(); aiNote();
  await provOptions($('aiProv'), $('aiModel'), AIX.getSel().provider);
}
$('bAI').onclick = () => openAI();
$('aiRules').addEventListener('change', () => { S.aiRules = $('aiRules').value; saveSettings(); });
$('aiProv').addEventListener('change', async () => {
  const p = $('aiProv').value;
  if (p === '__conn') { closeM('mAI'); openConn(); return; }
  AIX.setSel({ provider: p }); await modelOptions($('aiModel'), p, AIX.getSel().model);
  AIX.setSel({ model: $('aiModel').value });
});
$('aiModel').addEventListener('change', () => AIX.setSel({ model: $('aiModel').value }));
function renderAIRes() {
  if (!AI.res.length) { $('aiRes').innerHTML = ''; $('aiApply').disabled = true; return; }
  $('aiRes').innerHTML = `<table class="ai-res"><thead><tr><th></th><th>คิว</th><th>原文</th><th>เดิม</th><th>AI เสนอ</th><th>หมายเหตุ</th></tr></thead><tbody>${AI.res.map((r, k) => {
    const ep = S.eps[r.ei], c = ep && ep.cues[r.ci];
    if (!c) return '';
    return `<tr><td><input type="checkbox" data-k="${k}"${r.on ? ' checked' : ''} aria-label="ใช้ข้อเสนอนี้"></td><td class="mono"><button class="btn sm ghost" type="button" data-go="${k}">${esc(ep.label)} #${r.ci + 1}</button></td><td class="srcc">${esc(srcTextOf(ep, c))}</td><td class="th">${esc(c.t)}</td><td class="new">${esc(r.th)}</td><td class="note">${esc(r.note || '')}</td></tr>`;
  }).join('')}</tbody></table>`;
  $('aiApply').disabled = !AI.res.some(r => r.on);
}
$('aiRes').addEventListener('change', e => { const k = e.target.dataset.k; if (k != null) { AI.res[+k].on = e.target.checked; $('aiApply').disabled = !AI.res.some(r => r.on); } });
$('aiRes').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; const r = AI.res[+b.dataset.go]; closeM('mAI'); select(r.ei, r.ci, { center: true }); });
$('aiAll').onclick = () => { const on = !AI.res.every(r => r.on); AI.res.forEach(r => { r.on = on; }); renderAIRes(); };
function takeResults(arr, items) {
  if (arr && !Array.isArray(arr) && typeof arr === 'object') arr = arr.items || arr.results || arr.data || Object.values(arr).find(Array.isArray) || [];
  if (!Array.isArray(arr)) throw new Error('ผลลัพธ์ไม่ใช่ JSON array');
  let n = 0;
  for (const o of arr) {
    const k = parseInt(o && o.i, 10) - 1;
    const tv = o && (typeof o.t === 'string' ? o.t : typeof o.th === 'string' ? o.th : null);
    if (!(k >= 0 && k < items.length) || tv == null) continue;
    const [ei, ci] = items[k], th = tv.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\r/g, '').trim();
    const c = S.eps[ei].cues[ci];
    if (th === c.t) continue;
    AI.res = AI.res.filter(r => !(r.ei === ei && r.ci === ci));
    AI.res.push({ ei, ci, th, note: o.note || '', on: true }); n++;
  }
  AI.res.sort((a, b) => a.ei - b.ei || a.ci - b.ci);
  return n;
}
$('aiGo').onclick = async () => {
  const prov = $('aiProv').value, model = $('aiModel').value;
  if (!prov || prov === '__conn') { closeM('mAI'); openConn(); return; }
  const task = $('aiTask').value, items = aiTargets(task, $('aiScope').value);
  if (!items.length) { $('aiProg').textContent = task === 'fill' ? 'ไม่มีคิวที่ยังว่างในขอบเขตนี้' : 'ไม่มีคิวในขอบเขตนี้'; return; }
  if (['fill', 'retrans', 'qa'].includes(task) && !items.some(([ei, ci]) => srcTextOf(S.eps[ei], S.eps[ei].cues[ci]))) { $('aiProg').textContent = 'คิวพวกนี้ไม่มี原文 ใส่ซับต้นฉบับก่อน (เปิดไฟล์ → จับคู่ไฟล์)'; return; }
  S.aiRules = $('aiRules').value; saveSettings();
  AI.ctl = new AbortController();
  $('aiGo').disabled = true; $('aiStop').hidden = false;
  const B = 40, total = Math.ceil(items.length / B), who = $('aiProv').selectedOptions[0].textContent;
  let got = 0;
  try {
    for (let b = 0; b < total; b++) {
      const chunk = items.slice(b * B, (b + 1) * B);
      $('aiProg').textContent = `${who} กำลังทำชุด ${b + 1}/${total} (${chunk.length} คิว)…`;
      const arr = await AIX.chat({ provider: prov, model, prompt: aiPrompt(task, chunk), json: true, signal: AI.ctl.signal });
      got += takeResults(arr, chunk);
      renderAIRes();
    }
    $('aiProg').textContent = got ? `เสร็จแล้ว ได้ข้อเสนอ ${got} คิว เลือกแล้วกด "ใช้ข้อเสนอที่เลือก"` : (['qa', 'spell', 'particles'].includes(task) ? 'เสร็จแล้ว AI ไม่เจอจุดที่ต้องแก้' : 'เสร็จแล้ว ไม่มีอะไรเปลี่ยน');
  } catch (e) {
    $('aiProg').textContent = (got ? `ได้ข้อเสนอ ${got} คิว แล้วหยุด: ` : '') + aiErr(e, prov);
  } finally { $('aiGo').disabled = false; $('aiStop').hidden = true; AI.ctl = null; }
};
$('aiStop').onclick = () => { if (AI.ctl) AI.ctl.abort(); };
$('aiCopy').onclick = async () => {
  const task = $('aiTask').value, items = aiTargets(task, $('aiScope').value).slice(0, 500);
  if (!items.length) { $('aiProg').textContent = 'ไม่มีคิวในขอบเขตนี้'; return; }
  S.aiRules = $('aiRules').value; saveSettings();
  AI.pasteItems = items;
  const p = aiPrompt(task, items);
  try { await navigator.clipboard.writeText(p); $('aiProg').textContent = `คัดลอก prompt แล้ว (${items.length} คิว) ไปวางใน AI ที่ใช้อยู่ แล้วนำผลลัพธ์มาวางด้วยปุ่ม "วางผลลัพธ์จาก AI อื่น"`; $('aiPromptBox').hidden = true; }
  catch (e) { $('aiPromptBox').value = p; $('aiPromptBox').hidden = false; $('aiPromptBox').select(); $('aiProg').textContent = 'คัดลอกอัตโนมัติไม่ได้ ก๊อปจากกล่องด้านล่างแทน'; }
};
$('aiPasteT').onclick = () => { $('aiPaste').hidden = !$('aiPaste').hidden; $('aiPasteBtns').hidden = $('aiPaste').hidden; if (!$('aiPaste').hidden) $('aiPaste').focus(); };
$('aiPasteGo').onclick = () => {
  const items = AI.pasteItems || aiTargets($('aiTask').value, $('aiScope').value).slice(0, 500);
  try { const n = takeResults(AIX.parseJSON($('aiPaste').value), items); renderAIRes(); $('aiProg').textContent = `อ่านผลลัพธ์ได้ ${n} คิว`; }
  catch (e) { $('aiProg').textContent = 'อ่านผลลัพธ์ไม่ได้ ต้องเป็น JSON array แบบ [{"i":"1","t":"..."}]'; }
};
$('aiApply').onclick = () => {
  const take = AI.res.filter(r => r.on && S.eps[r.ei] && S.eps[r.ei].cues[r.ci]);
  if (!take.length) return;
  pushHist([...new Set(take.map(r => S.eps[r.ei]))], 'ใช้ข้อเสนอ AI');
  const eis = new Set();
  for (const r of take) { S.eps[r.ei].cues[r.ci].t = r.th; eis.add(r.ei); }
  eis.forEach(ei => { S.eps[ei].dirty = true; ensureQA(ei); updateEpRows(ei); queueDraft(S.eps[ei]); });
  AI.res = AI.res.filter(r => !r.on);
  renderAIRes(); renderStats(); loadEditor(); renderOverlay(true);
  toast(`ใส่ข้อเสนอ AI แล้ว ${take.length} คิว`, { label: 'เลิกทำ', fn: undo });
};

/* connections window */
function openConn() { renderConn(); openM('mConn'); }
function renderConnState() { if ($('mConn').classList.contains('open')) renderConn(); }
function renderConn() {
  const keys = AIX.getKeys();
  $('hostBox').hidden = !hostOK;
  $('provList').innerHTML = Object.entries(AIX.PROVIDERS).map(([p, P]) => `<div class="prov" data-p="${p}">
    <div class="prov-h"><b>${esc(P.name)}</b>${P.free ? '<span class="badge">มีโควตาฟรี</span>' : ''}<span class="st${keys[p] ? ' ok' : ''}" id="st-${p}">${keys[p] ? '✓ เชื่อมแล้ว' : 'ยังไม่เชื่อม'}</span></div>
    <ol class="steps"><li><button class="btn sm" type="button" data-login="${p}">ล็อกอินเพื่อรับกุญแจ ↗</button></li><li>${esc(P.keyHelp)}</li></ol>
    <div class="keyrow"><input class="field" type="password" id="k-${p}" placeholder="${keys[p] ? '••••••••' + esc(keys[p].slice(-4)) : 'วางกุญแจที่นี่'}" autocomplete="off" spellcheck="false" aria-label="กุญแจ ${esc(P.name)}">
      <button class="btn sm" type="button" data-paste="${p}">วาง</button><button class="btn sm primary" type="button" data-test="${p}">เชื่อมต่อ</button>${keys[p] ? `<button class="btn sm ghost" type="button" data-del="${p}">ลบกุญแจ</button>` : ''}</div>
    <p class="fine note">${esc(P.note)}</p></div>`).join('');
}
$('provList').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const p = b.dataset.login || b.dataset.paste || b.dataset.test || b.dataset.del;
  if (b.dataset.login) { AIX.openLink(AIX.PROVIDERS[p].keyUrl); return; }
  if (b.dataset.paste) { try { $('k-' + p).value = (await navigator.clipboard.readText()).trim(); } catch (err) { $('k-' + p).focus(); toast('กด Ctrl+V ในช่องกุญแจแทน'); } return; }
  if (b.dataset.del) { AIX.setKey(p, ''); AIX.cacheModels(p, []); renderConn(); return; }
  if (b.dataset.test) {
    const v = $('k-' + p).value.trim(), had = AIX.getKeys()[p];
    if (!v && !had) { toast('วางกุญแจก่อน'); $('k-' + p).focus(); return; }
    if (v) AIX.setKey(p, v);
    const st = $('st-' + p); st.textContent = 'กำลังทดสอบ…'; st.className = 'st';
    try {
      const list = await AIX.listModels(p); AIX.cacheModels(p, list);
      st.textContent = `✓ เชื่อมแล้ว · มี ${list.length} รุ่น · แนะนำ ${list.filter(m => m.top).map(m => m.name || m.id).join(', ')}`; st.className = 'st ok';
      if (!AIX.getSel().provider || AIX.getSel().provider === 'host' && !hostOK) AIX.setSel({ provider: p, model: list[0] && list[0].id });
      $('k-' + p).value = ''; $('k-' + p).placeholder = '••••••••' + AIX.getKeys()[p].slice(-4);
    } catch (err) {
      if (v && !had) AIX.setKey(p, '');
      st.textContent = '✕ ' + aiErr(err, p); st.className = 'st bad';
    }
  }
});
$('bConn').onclick = () => { closeMenus(); openConn(); };

/* ---------- export ---------- */
function defaultZipName() {
  const real = realEps();
  let base = (S.folder || '').replace(/_修改$/, '');
  if (!base) {
    const names = real.map(e => (e.kind === 'xlsx' ? S.books[e.book].name : e.name).replace(/\.[^.]+$/, ''));
    let p = names[0] || '';
    for (const n of names) { let k = 0; while (k < p.length && k < n.length && p[k] === n[k]) k++; p = p.slice(0, k); }
    base = p.replace(/(?:第|ep|e)?[\s._\-()（）[\]【】0-9]*$/i, '').trim();
  }
  if (!base) base = 'subtitles';
  return base + (real.some(epEdited) ? '_修改' : '') + '.zip';
}
function exList() {
  const scope = document.querySelector('input[name=exScope]:checked').value;
  let l = realEps();
  if (scope === 'edited') l = l.filter(epEdited);
  if (scope === 'cur') { const ep = S.eps[S.sel ? S.sel.e : S.cur]; l = l.filter(e => e === ep); }
  return l;
}
function updExInfo() {
  const l = exList(), ed = l.filter(epEdited).length, st = l.filter(e => e.struct).length, xl = l.filter(e => e.kind === 'xlsx').length;
  $('exXlsx').disabled = !xl; $('exXSrt').disabled = !l.some(e => e.kind === 'xlsx' && !e.noTime);
  $('exInfo').textContent = l.length ? `${l.length} ตอน · แก้ไป ${ed} ตอน${xl ? ` · มาจาก Excel ${xl} ตอน` : ''}${st ? ` · ระวัง: ${st} ตอนจำนวนคิวไม่เท่าต้นฉบับ` : ''}` : 'ไม่มีตอนที่ตรงเงื่อนไข';
  $('exGo').disabled = !l.length;
}
document.querySelectorAll('input[name=exScope]').forEach(r => r.addEventListener('change', updExInfo));
const exBase = () => defaultZipName().replace(/\.zip$/, '');
function exDefaultName() {
  const f = document.querySelector('input[name=exFmt]:checked').value;
  const onlyXl = f === 'xlsx' && !$('exDz').checked && !(realEps().some(e => e.kind === 'xlsx') && $('exXlsx').checked);
  return onlyXl ? exBase() + '.xlsx' : defaultZipName();
}
function syncExFmt() { const f = document.querySelector('input[name=exFmt]:checked').value; $('exXlOpts').hidden = f === 'subs'; if (!$('exName').dataset.touched) $('exName').value = exDefaultName(); }
document.querySelectorAll('input[name=exFmt]').forEach(r => r.addEventListener('change', syncExFmt));
['exDz', 'exXlsx'].forEach(id => $(id).addEventListener('change', syncExFmt));
$('exName').addEventListener('input', () => { $('exName').dataset.touched = '1'; });
function openExport() {
  if (!realEps().length) { toast('ยังไม่มีไฟล์ซับจริง ลากไฟล์เข้ามาก่อน'); return; }
  flushDrafts();
  delete $('exName').dataset.touched;
  syncExFmt();
  updExInfo(); openM('mExport');
}
const addSuffix = name => /_修改\.[^.]+$/.test(name) ? name : name.replace(/(\.[^.]+)$/, '_修改$1');
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim();
async function saveFile(name, data, type) {
  if (window.HF_PLATFORM && window.HF_PLATFORM.desktop) {
    try { const ok = await window.HF_PLATFORM.saveFile(name, data); toast(ok ? `บันทึก ${name} แล้ว` : 'ยกเลิกการบันทึกแล้ว'); }
    catch (err) { toast('บันทึกไม่ได้: ' + ((err && err.message) || err)); }
    return;
  }
  const host = window.claude && typeof window.claude.use === 'function';
  if (host) {
    let dl = null;
    try { dl = await window.claude.use('downloads'); } catch (e) {}
    if (!dl) { toast('หน้านี้บันทึกไฟล์ไม่ได้ ลองเปิดหน้านี้แบบเต็มจอใน claude.ai'); return; }
    try { await dl.save({ filename: name, data: new Blob([data]) }); toast(`บันทึก ${name} แล้ว`); }
    catch (err) {
      const code = err && err.code;
      if (code === 'declined') toast('ยกเลิกการบันทึกแล้ว');
      else if (code === 'rate_limited') toast('มีหน้าต่างบันทึกเปิดค้างอยู่ รอสักครู่แล้วกดใหม่');
      else toast('บันทึกไม่ได้: ' + ((err && err.message) || code || 'ไม่ทราบสาเหตุ'));
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: type || 'application/zip' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(`บันทึก ${name} แล้ว`);
}
function dzBook(eps) {
  const H = ['集', '文件', '序号', '时间轴', '原文', '原译文', '修改后', '是否修改', '问题'];
  const rows = [H.map(v => ({ v, s: 1 }))];
  for (const ep of eps) {
    ensureQA(S.eps.indexOf(ep));
    ep.cues.forEach((c, i) => {
      const ed = isEdited(c), s = ed ? 2 : 0;
      const iss = Q(c).iss.filter(x => x.sev !== 'i').map(x => x.msg).join('; ');
      rows.push([ep.label, ep.kind === 'xlsx' ? ep.key : ep.name, (!ep.struct && c.idx) || i + 1, ep.noTime ? '' : `${c.s} --> ${c.e}`, srcTextOf(ep, c), c.oT == null ? '' : c.oT, c.t, ed ? '是' : '否', iss].map(v => ({ v: v == null ? '' : v, s })));
    });
  }
  return xlsxNew('中泰对照', rows, [8, 26, 6, 26, 36, 36, 36, 8, 36]);
}
$('exGo').onclick = async () => {
  const l = exList(); if (!l.length) return;
  const suf = $('exSuf').checked, seen = new Map(), files = [];
  const add = (name, data) => { const n = (seen.get(name) || 0) + 1; seen.set(name, n); if (n > 1) name = name.replace(/(\.[^.]+)$/, ` (${n})$1`); files.push({ name, data }); };
  $('exGo').disabled = true; $('exInfo').textContent = 'กำลังสร้างไฟล์…';
  const fmtSel = document.querySelector('input[name=exFmt]:checked').value, wantSubs = fmtSel !== 'xlsx', wantXl = fmtSel !== 'subs';
  try {
    if (wantSubs && $('exSubs').checked) for (const ep of l.filter(e => e.kind !== 'xlsx')) {
      const ed = epEdited(ep);
      add(ed && suf ? addSuffix(ep.name) : ep.name, ed || !ep.raw ? encodeFile(ep) : ep.raw);
    }
    const xl = l.filter(e => e.kind === 'xlsx');
    if (xl.length && $('exXlsx').checked) {
      for (const bi of [...new Set(xl.map(e => e.book))]) {
        const bk = S.books[bi], eps = S.eps.filter(e => e.kind === 'xlsx' && e.book === bi);
        const edits = new Map();
        for (const ep of eps) for (const c of ep.cues) if (c.t !== c.oT) {
          const v = ep.nl === '\\N' ? c.t.split('\n').join('\\N') : c.t;
          if (!edits.has(c.xr)) edits.set(c.xr, new Map());
          edits.get(c.xr).set(bk.col, v);
        }
        const data = edits.size ? await xlsxPatch(bk.file, bk.ents, bk.sheetPath, edits, true) : new Uint8Array(await bk.file.arrayBuffer());
        add(edits.size && suf ? addSuffix(bk.name) : bk.name, data);
      }
    }
    if (wantSubs && $('exXSrt').checked) for (const ep of xl.filter(e => !e.noTime)) {
      const nm = /\.srt$/i.test(ep.key) ? ep.key : safeName(ep.key) + '.srt';
      add(epEdited(ep) && suf ? addSuffix(nm) : nm, encodeFile(Object.assign({}, ep, { kind: 'srt', struct: true })));
    }
    if (wantXl) add(exBase() + '.xlsx', xlBook(l, document.querySelector('input[name=exSheet]:checked').value === 'per', $('exXlIss').checked));
    if ($('exDz').checked) add(defaultZipName().replace(/\.zip$/, '').replace(/_修改$/, '') + '_对照表.xlsx', dzBook(l));
    if (!files.length) { $('exInfo').textContent = 'ยังไม่ได้เลือกไฟล์ที่จะส่งออก'; return; }
    let zn = $('exName').value.trim() || 'subtitles.zip';
    closeM('mExport');
    if (files.length === 1 && /\.xlsx$/i.test(files[0].name)) { const nm = /\.xlsx$/i.test(zn) ? zn : zn.replace(/\.zip$/i, '') + '.xlsx'; await saveFile(nm, files[0].data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); return; }
    zn = zn.replace(/\.xlsx$/i, ''); if (!/\.zip$/i.test(zn)) zn += '.zip';
    await saveFile(zn, makeZip(files));
  } catch (e) { $('exInfo').textContent = 'ส่งออกไม่ได้: ' + (e.message || e); }
  finally { $('exGo').disabled = false; }
};
$('bExport').onclick = openExport;

/* ---------- find & replace ---------- */
let qT = 0;
$('q').addEventListener('input', () => { S.query = $('q').value; clearTimeout(qT); qT = setTimeout(renderList, 170); });
function toggleBtn(id, k) { $(id).onclick = () => { S[k] = !S[k]; $(id).setAttribute('aria-pressed', String(S[k])); renderList(); }; }
toggleBtn('tCase', 'cs'); toggleBtn('tRe', 'regex'); toggleBtn('tOnly', 'onlyMatch');
function replStr() { const r = $('r').value; return S.regex ? r : r.replace(/\$/g, '$$$$'); }
function gotoMatch(d) {
  const re = goodRe(matcher());
  if (!re) { $('q').focus(); return; }
  const seq = [];
  S.eps.forEach((ep, ei) => ep.cues.forEach((c, ci) => { if (hits(c.t, re) || hits(srcTextOf(ep, c), re)) seq.push([ei, ci]); }));
  if (!seq.length) { toast('ไม่เจอ'); return; }
  let k;
  if (S.sel) {
    const pos = S.sel.e * 1e6 + S.sel.c;
    if (d > 0) { k = seq.findIndex(([e, c]) => e * 1e6 + c > pos); if (k < 0) k = 0; }
    else { k = -1; for (let i = seq.length - 1; i >= 0; i--) { if (seq[i][0] * 1e6 + seq[i][1] < pos) { k = i; break; } } if (k < 0) k = seq.length - 1; }
  } else k = d > 0 ? 0 : seq.length - 1;
  select(seq[k][0], seq[k][1], { center: true });
}
function replaceOne() {
  const re = goodRe(matcher()), c = curCue();
  if (!re || !c) { gotoMatch(1); return; }
  if (hits(c.t, re)) {
    pushHist([S.eps[S.sel.e]], 'แทนที่');
    re.lastIndex = 0; c.t = c.t.replace(re, replStr());
    afterEdit(S.sel.e, S.sel.c);
  }
  gotoMatch(1);
}
function replaceAll() {
  const re = goodRe(matcher());
  if (!re) { toast('ใส่คำที่จะค้นหาก่อน'); return; }
  const rep = replStr(), touched = [];
  S.eps.forEach((ep, ei) => {
    if ($('scope').value === 'cur' && (!S.sel || ei !== S.sel.e)) return;
    if (ep.cues.some(c => hits(c.t, re))) touched.push(ep);
  });
  if (!touched.length) { toast('ไม่เจอคำที่จะแทนที่ในคำแปล'); return; }
  pushHist(touched, 'แทนที่ทั้งหมด');
  let n = 0;
  for (const ep of touched) { for (const c of ep.cues) { re.lastIndex = 0; const m = c.t.match(re); if (m) { const nt = c.t.replace(re, rep); if (nt !== c.t) { n += m.length; c.t = nt; } } } ep.dirty = true; queueDraft(ep); }
  renderList(); loadEditor(); renderStats(); renderOverlay(true);
  toast(`แทนที่ ${n} จุด ใน ${touched.length} ตอน`, { label: 'เลิกทำ', fn: undo });
}
$('bPrevM').onclick = () => gotoMatch(-1);
$('bNextM').onclick = () => gotoMatch(1);
$('bRep1').onclick = replaceOne;
$('bRepAll').onclick = replaceAll;

/* ---------- filters & view ---------- */
function setFilter(f) {
  S.filter = f;
  document.querySelectorAll('#filt button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
  renderList(); list.scrollTop = 0;
}
$('filt').addEventListener('click', e => { const b = e.target.closest('button[data-f]'); if (b) setFilter(b.dataset.f); });
$('stats').addEventListener('click', e => { const b = e.target.closest('button[data-f]'); if (b && !b.disabled) setFilter(S.filter === b.dataset.f ? 'all' : b.dataset.f); });
$('epJump').addEventListener('change', e => gotoEp(+e.target.value));
$('tSrc').onclick = () => { S.view.showSrc = !S.view.showSrc; $('tSrc').setAttribute('aria-pressed', String(S.view.showSrc)); saveSettings(); renderList(); };
const viewChk = (id, k, after) => $(id).addEventListener('change', () => { S.view[k] = $(id).checked; saveSettings(); if (after) after(); });
viewChk('oNext', 'autoNext'); viewChk('oFollow', 'follow'); viewChk('oClickPlay', 'clickPlay');
viewChk('oOv', 'overlay', () => renderOverlay(true)); viewChk('oOvColor', 'ovColor', () => renderOverlay(true));
$('oPos').addEventListener('input', () => { S.view.subPos = +$('oPos').value; cap.style.bottom = S.view.subPos + '%'; saveSettings(); });
$('rate').addEventListener('change', () => { S.view.rate = +$('rate').value; video.defaultPlaybackRate = S.view.rate; video.playbackRate = S.view.rate; saveSettings(); });
$('bPlay').onclick = togglePlay;
$('bBack').onclick = () => nudge(-1);
$('bFwd').onclick = () => nudge(1);
$('bPrevEp').onclick = () => gotoEp((S.cur >= 0 ? S.cur : (S.sel ? S.sel.e : 0)) - 1);
$('bNextEp').onclick = () => gotoEp((S.cur >= 0 ? S.cur : (S.sel ? S.sel.e : -1)) + 1);
$('bPrevL').onclick = () => moveSel(-1);
$('bNextL').onclick = () => moveSel(1);
$('bPlayL').onclick = playCue;

/* ---------- splitter ---------- */
(() => {
  const sp = $('split'), main = $('main');
  sp.addEventListener('pointerdown', e => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('on');
    const mv = ev => {
      const r = main.getBoundingClientRect();
      const x = Math.round(Math.min(Math.max(240, ev.clientX - r.left), r.width - 420));
      S.view.left = x; main.style.setProperty('--left', x + 'px'); layoutOverlay();
    };
    const up = () => { sp.classList.remove('on'); sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up); saveSettings(); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  });
})();

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  const typing = !!(e.target.closest && e.target.closest('input, textarea, select, button, [contenteditable]'));
  if (e.key === 'Escape') { if (document.querySelector('.menu:not([hidden])')) { closeMenus(); return; } if (document.querySelector('.modal.open')) { document.querySelectorAll('.modal.open').forEach(m => closeM(m.id)); return; } if (!$('askPanel').hidden && e.target.closest && e.target.closest('#askPanel')) { closeAsk(); return; } return; }
  const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
  if (mod && !e.altKey && k === 's') { e.preventDefault(); saveNow(true); return; }
  if (e.key === 'F1' || (mod && (k === '/' || e.code === 'Slash'))) { e.preventDefault(); openM('mKeys'); return; }
  if (document.querySelector('.modal.open')) return;
  if (mod && !e.shiftKey && k === 'e') { e.preventDefault(); $('bExport').click(); return; }
  if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); $('bFiles').click(); return; }
  if (mod && e.shiftKey && k === 'o') { e.preventDefault(); $('bDir').click(); return; }
  if (mod && e.shiftKey && k === 'q') { e.preventDefault(); $('bQA').click(); return; }
  if (mod && e.shiftKey && k === 'a') { e.preventDefault(); $('bAI').click(); return; }
  if (mod && e.shiftKey && k === 'p') { e.preventDefault(); openProjWin(); return; }
  if (mod && !e.shiftKey && k === 'j') { e.preventDefault(); $('bAsk').click(); return; }
  if (mod && !e.shiftKey && k === 'h') { e.preventDefault(); if ($('repRow').hidden) $('tRep').click(); else $('r').focus(); return; }
  if (mod && !e.shiftKey && k === 'd') { e.preventDefault(); toggleDone(); return; }
  if (mod && !e.shiftKey && k === 'g') { e.preventDefault(); $('bGloss').click(); return; }
  if (mod && !typing && ((e.shiftKey && k === 'z') || (!e.shiftKey && k === 'y'))) { e.preventDefault(); redo(); return; }
  if (e.altKey && e.key === 'PageDown') { e.preventDefault(); $('bNextEp').click(); return; }
  if (e.altKey && e.key === 'PageUp') { e.preventDefault(); $('bPrevEp').click(); return; }
  if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); playCue(); return; }
  if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return; }
  if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); nudge(1); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); $('q').select(); return; }
  if (e.key === 'Enter' && e.target === $('q')) { e.preventDefault(); clearTimeout(qT); S.query = $('q').value; renderList(); gotoMatch(e.shiftKey ? -1 : 1); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
  if (typing) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveSel(e.key === 'ArrowDown' ? 1 : -1); }
});


/* ---------- projects ---------- */
const SRC_NAME = { auto: 'ต้นฉบับ', zh: 'จีน', th: 'ไทย', en: 'อังกฤษ' };
const pairName = pr => `${SRC_NAME[pr.src] || 'ต้นฉบับ'} → ${TGT_NAME[pr.tgt] || 'ไทย'}`;
const fmtDate = t => t ? new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const b64enc = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64dec = b => { const s = atob(b || ''), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function renderProjChip() {
  const pr = curProj(), cl = curClient();
  $('pjName').textContent = pr.name;
  $('pjMeta').textContent = `${pairName(pr)} · ${cl ? cl.name : 'ไม่ระบุลูกค้า'}`;
  document.title = pr.name + " · Hell's Factory Studio";
}
function touchProj() { const pr = curProj(); if (!pr) return; const n = realEps().length; if (n || !pr.eps) pr.eps = n; pr.updated = Date.now(); saveProjects(); }
async function persistFiles(recs) {
  const pid = S.pid;
  for (const r of recs) {
    try { await PDB.putFile(pid, r.name, r.kind, r.bytes, r.srcName ? { srcName: r.srcName } : null); }
    catch (e) { if (!persistFiles.warned) { persistFiles.warned = true; toast('เก็บไฟล์ของโปรเจกต์ไว้ในเครื่องไม่ได้ งานที่แก้ยังบันทึกอยู่ แต่เปิดโปรเจกต์ครั้งหน้าต้องลากไฟล์ซับเข้ามาใหม่'); } }
  }
  setTimeout(touchProj, 300);
}
function loadSamples() {
  const T = tgtLang();
  if (T === 'en') return;
  SAMPLE.forEach(([n, t, s], i) => {
    const [tt, st] = T === 'zh' ? [s, t] : [t, s];
    const ep = makeEp(T === 'zh' ? n.replace('.srt', '_中文.srt') : n, tt, { sample: true });
    const src = makeSrc(T === 'zh' ? n : n.replace('.srt', '_中文.srt'), st); src.sample = true;
    S.srcs.push(src); ep.src = S.srcs.length - 1; S.eps.push(ep);
  });
  S.cur = 0; S.sel = { e: 0, c: 0 };
}
const VCACHE = new Map(); // videos stay in memory per project while the app is open, so switching back keeps them
function resetWork(noSave) {
  if (!noSave) flushDrafts(); else dq.clear();
  clearTimeout(followJob); followJob = 0;
  try { video.pause(); } catch (e) {}
  if (video.getAttribute('src')) { video.removeAttribute('src'); delete video.dataset.url; try { video.load(); } catch (e) {} }
  if (S.videos.length) VCACHE.set(S.pid, S.videos.map(v => v.file).filter(Boolean));
  for (const v of S.videos) { try { URL.revokeObjectURL(v.url); } catch (e) {} }
  S.eps = []; S.srcs = []; S.videos = []; S.books = []; S.audio.clear();
  S.sel = null; S.cur = -1; S.playIdx = -1; S.stopAt = null; S.multi.clear(); S.anchor = null; S.drafts = null; S.folder = ''; S.filter = 'all';
  document.querySelectorAll('#filt button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === 'all')));
  HIST.length = 0; REDO.length = 0; $('bUndo').disabled = true;
  AI.res = []; AI.pasteItems = null; xlsxQueue.length = 0; ASK.log = []; renderAsk();
  lastOrient = '';
  renderDraftBar();
}
async function openProject(id, opt = {}) {
  if (id === S.pid && !opt.force) { closeM('mProj'); return; }
  if (!opt.noSave) { saveNow(false); touchProj(); }
  resetWork(opt.noSave);
  S.pid = id; PJ.cur = id; saveProjects();
  const pr = curProj();
  S.cfg = Object.assign(cfgForTarget(pr.tgt, pr.src), store.get(pk('cfg'), null) || {});
  S.cfg.tgt = pr.tgt || 'th'; S.cfg.src = pr.src || 'auto';
  const g = store.get(pk('gloss'), null);
  S.gloss = g && Array.isArray(g.list) ? g.list : []; S.glossName = g ? g.name || '' : ''; S.G = glossCompile(S.gloss);
  S.aiRules = store.get(pk('aiRules'), null) || defaultRules(S.cfg.tgt);
  if (opt.fresh && pr.client) { const c = getClient(pr.client); if (c) applyClient(c, true); }
  saveSettings(); renderProjChip(); renderClientSel();
  closeM('mProj');
  loadSamples();
  showPh(WELCOME);
  renderAll(); updateTransport(); updateClock(true);
  await restoreFiles();
}
async function restoreFiles() {
  let recs = [];
  try { recs = await PDB.listFiles(S.pid); } catch (e) {}
  const pid = S.pid, vids = VCACHE.get(pid) || [];
  if (!recs.length) return;
  const files = recs.filter(r => r.kind === 'sub' || r.kind === 'book').sort((a, b) => nat(a.name, b.name)).map(r => new File([r.bytes], r.name));
  const gens = recs.filter(r => r.kind === 'gen');
  S.restoring = true;
  try {
    dropSamples();
    if (files.length || vids.length) await addFiles(files.concat(vids), curProj().folder || '');
    if (pid !== S.pid) return;
    let n = 0;
    for (const g of gens) {
      if (S.eps.some(e => e.name === g.name)) continue;
      const i = S.srcs.findIndex(x => x.name === g.srcName); if (i < 0) continue;
      S.eps.push(makeGenEp(i)); n++;
    }
    if (n) { sortEps(); autoPair(); checkDrafts(); if (!S.sel && S.eps[0] && S.eps[0].cues.length) S.sel = { e: 0, c: 0 }; renderAll(); if (S.cur < 0 && S.eps.length) loadEpisode(0, 0, false); }
  } finally { S.restoring = false; }
  setSaveState(realEps().length ? 'saved' : 'none');
}
function newProjId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
async function createProject(name, src, tgt, client) {
  const id = newProjId();
  PJ.list.push({ id, name, src, tgt, client: client || '', created: Date.now(), updated: Date.now(), eps: 0 });
  saveProjects();
  store.set('p:' + id + ':cfg', cfgForTarget(tgt, src));
  store.set('p:' + id + ':aiRules', defaultRules(tgt));
  await openProject(id, { fresh: true });
  toast(`สร้างโปรเจกต์ ${name} แล้ว (${pairName(curProj())}) · ลากไฟล์ซับเข้ามาได้เลย`);
}
async function deleteProject(id) {
  const pre = LS + 'p:' + id + ':', ks = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) ks.push(k); }
  ks.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try { await PDB.delProject(id); } catch (e) {}
  PJ.list = PJ.list.filter(x => x.id !== id);
  if (!PJ.list.length) { const nid = newProjId(); PJ.list.push({ id: nid, name: 'โปรเจกต์ใหม่', src: 'auto', tgt: 'th', client: '', created: Date.now(), updated: Date.now(), eps: 0 }); }
  saveProjects();
  if (id === S.pid) { const next = [...PJ.list].sort((a, b) => (b.updated || 0) - (a.updated || 0))[0]; await openProject(next.id, { force: true, noSave: true }); openProjWin(); }
  else renderProjList();
}
async function exportProject(id) {
  const pr = PJ.list.find(x => x.id === id); if (!pr) return;
  if (id === S.pid) saveNow(false);
  const pre = LS + 'p:' + id + ':', ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) ls[k.slice(pre.length)] = localStorage.getItem(k); }
  let files = []; try { files = await PDB.listFiles(id); } catch (e) {}
  const out = { format: 'hfproj', v: 1, at: Date.now(), meta: Object.assign({}, pr), client: getClient(pr.client), ls,
    files: files.map(f => ({ name: f.name, kind: f.kind, srcName: f.srcName, b64: b64enc(new Uint8Array(f.bytes)) })) };
  await saveFile(safeName(pr.name) + '.hfproj', new TextEncoder().encode(JSON.stringify(out)), 'application/json');
}
async function importProject(f) {
  let o = null; try { o = JSON.parse(await f.text()); } catch (e) {}
  if (!o || o.format !== 'hfproj') { toast("ไฟล์นี้ไม่ใช่ไฟล์โปรเจกต์ของ Hell's Factory Studio (.hfproj)"); return; }
  const id = newProjId();
  const meta = Object.assign({ src: 'auto', tgt: 'th', client: '' }, o.meta || {}, { id, updated: Date.now() });
  if (PJ.list.some(x => x.name === meta.name)) meta.name += ' (นำเข้า)';
  if (o.client && o.client.id) { const cs = getClients(); if (!cs.some(c => c.id === o.client.id)) { cs.push(o.client); saveClients(cs); } meta.client = o.client.id; }
  for (const [k, v] of Object.entries(o.ls || {})) { try { localStorage.setItem(LS + 'p:' + id + ':' + k, v); } catch (e) {} }
  for (const fr of o.files || []) { try { await PDB.putFile(id, fr.name, fr.kind, b64dec(fr.b64), fr.srcName ? { srcName: fr.srcName } : null); } catch (e) {} }
  PJ.list.push(meta); saveProjects();
  await openProject(id);
  toast(`นำเข้าโปรเจกต์ ${meta.name} แล้ว`);
}
function openProjWin() { renderProjList(); $('npClient').innerHTML = clientOpts(''); openM('mProj'); }
function renderProjList() {
  const list = [...PJ.list].sort((a, b) => (b.id === S.pid) - (a.id === S.pid) || (b.updated || 0) - (a.updated || 0));
  $('pList').innerHTML = list.map(pr => {
    const cl = getClient(pr.client), cur = pr.id === S.pid;
    return `<div class="pitem${cur ? ' cur' : ''}" data-id="${pr.id}">
      <div class="pi-main"><b class="pi-name" data-no-i18n>${esc(pr.name)}</b>${cur ? '<span class="badge">เปิดอยู่</span>' : ''}<span class="info">${esc(pairName(pr))} · ${esc(cl ? cl.name : 'ไม่ระบุลูกค้า')} · ${pr.eps || 0} ตอน · แก้ล่าสุด ${esc(fmtDate(pr.updated))}</span></div>
      <div class="pi-act">${cur ? '' : '<button class="btn sm primary" type="button" data-act="open">เปิด</button>'}<button class="btn sm ghost" type="button" data-act="ren">เปลี่ยนชื่อ</button><button class="btn sm ghost" type="button" data-act="exp">ส่งออก</button><button class="btn sm ghost" type="button" data-act="del">ลบ</button></div></div>`;
  }).join('');
}
$('pList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const it = b.closest('.pitem'), id = it.dataset.id, pr = PJ.list.find(x => x.id === id);
  if (b.dataset.act === 'open') openProject(id);
  else if (b.dataset.act === 'exp') exportProject(id);
  else if (b.dataset.act === 'ren') {
    const nm = it.querySelector('.pi-name');
    nm.outerHTML = `<span class="pi-ren"><input class="field sm" type="text" value="${esc(pr.name)}" aria-label="ชื่อโปรเจกต์"><button class="btn sm primary" type="button" data-act="renok">บันทึก</button></span>`;
    const inp = it.querySelector('.pi-ren input'); inp.focus(); inp.select();
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); it.querySelector('[data-act=renok]').click(); } });
  } else if (b.dataset.act === 'renok') {
    const v = it.querySelector('.pi-ren input').value.trim(); if (v) { pr.name = v; saveProjects(); renderProjChip(); } renderProjList();
  } else if (b.dataset.act === 'del') {
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'กดอีกครั้งเพื่อลบถาวร'; setTimeout(() => { if (b.isConnected) { b.classList.remove('confirm'); b.textContent = 'ลบ'; } }, 4000); return; }
    deleteProject(id);
  }
});
$('npGo').onclick = () => {
  const [src, tgt] = $('npPair').value.split('>');
  const name = $('npName').value.trim() || `โปรเจกต์ ${PJ.list.length + 1}`;
  $('npName').value = '';
  createProject(name, src, tgt, $('npClient').value);
};
$('npName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('npGo').click(); } });
$('npImport').onclick = () => $('fProj').click();
$('fProj').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importProject(f); });
$('bProj').onclick = openProjWin;

/* ---------- clients (rules from each client's guide) ---------- */
const getClients = () => store.get('clients', []) || [];
const saveClients = l => store.set('clients', l);
const getClient = id => id ? getClients().find(c => c.id === id) || null : null;
const curClient = () => getClient(curProj().client);
const clientOpts = sel => '<option value="">— ไม่ระบุลูกค้า —</option>' + getClients().map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
function renderClientSel() {
  $('clientSel').innerHTML = clientOpts(curProj().client) + '<option value="__new">＋ เพิ่มลูกค้าจากไฟล์ guide…</option>' + (getClients().length ? '<option value="__manage">แก้ไข / จัดการลูกค้า…</option>' : '');
  $('clientSel').value = curProj().client || '';
  renderOrient();
}
$('clientSel').addEventListener('change', () => {
  const v = $('clientSel').value;
  if (v === '__new' || v === '__manage') { $('clientSel').value = curProj().client || ''; openGuide(v === '__new' ? '' : curProj().client || (getClients()[0] || {}).id || ''); return; }
  setProjClient(v);
});
function setProjClient(id) {
  const pr = curProj(); pr.client = id || ''; saveProjects();
  const c = getClient(id);
  if (c) applyClient(c);
  renderProjChip(); renderClientSel();
  toast(c ? `ใช้เกณฑ์ตามคู่มือของ ${c.name} แล้ว` : 'ไม่ผูกกับลูกค้าแล้ว (เกณฑ์ยังเหมือนเดิม ปรับเองได้)');
}
const CL_KEYS = ['mode', 'limit', 'maxLines', 'cpsMax', 'cpsMode', 'minDur', 'maxDur', 'punct', 'particles', 'denseN', 'era', 'bracket'];
function videoOrient() { if (!epVideo(S.cur) || !video.videoWidth || !video.getAttribute('src')) return ''; return video.videoHeight > video.videoWidth ? 'v' : 'h'; }
function applyClient(c) {
  if (!c) return;
  for (const k of CL_KEYS) if (c.cfg && c.cfg[k] != null && c.cfg[k] !== '') S.cfg[k] = c.cfg[k];
  const o = videoOrient() || (c.orient === 'v' || c.orient === 'h' ? c.orient : '');
  if (o === 'v' && c.limitV) S.cfg.limit = c.limitV;
  else if (o === 'h' && c.limitH) S.cfg.limit = c.limitH;
  else if (c.limitH || c.limitV) S.cfg.limit = c.limitH || c.limitV;
  S.cfg.preset = 'custom';
  saveSettings(); syncCrit(); requalify(); renderOrient();
}
function renderOrient() {
  const c = curClient(), el = $('orient');
  if (!c || !(c.limitH && c.limitV)) { el.hidden = true; return; }
  const o = videoOrient();
  el.hidden = false;
  el.textContent = o ? `วิดีโอ${o === 'v' ? 'แนวตั้ง' : 'แนวนอน'} · ลิมิต ${o === 'v' ? c.limitV : c.limitH}` : `แนวนอน ${c.limitH} · แนวตั้ง ${c.limitV}`;
  el.title = 'ลิมิตเปลี่ยนเองตามวิดีโอที่เปิด (ตามคู่มือลูกค้า)';
}
let lastOrient = '';
function autoOrient() {
  const c = curClient(), o = videoOrient();
  if (!c || !o || o === lastOrient) { renderOrient(); return; }
  lastOrient = o;
  const lim = o === 'v' ? c.limitV : c.limitH;
  if (lim && S.cfg.limit !== lim) { S.cfg.limit = lim; saveSettings(); syncCrit(); requalify(); toast(`วิดีโอ${o === 'v' ? 'แนวตั้ง' : 'แนวนอน'} ใช้ลิมิต ${lim} ตามคู่มือ ${c.name}`); }
  renderOrient();
}
video.addEventListener('loadedmetadata', autoOrient);

/* guide window: client guide files → AI → rules to review → saved client */
const G = { files: [], id: '', cur: null };
const GUIDE_EXT = new Set(['pdf', 'docx', 'xlsx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'csv']);
function openGuide(id) {
  G.id = id || ''; G.files = []; G.cur = null;
  renderGuidePick(); renderGFiles(); $('gText').value = ''; $('gProg').textContent = '';
  if (G.id) showClientForm(getClient(G.id)); else $('gStep2').hidden = true;
  openM('mGuide');
  provOptions($('gProv'), $('gModel'), AIX.getSel().provider);
}
function renderGuidePick() {
  $('cuPick').innerHTML = '<option value="">＋ ลูกค้าใหม่</option>' + getClients().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('cuPick').value = G.id; $('cuDel').hidden = !G.id;
}
$('cuPick').addEventListener('change', () => { G.id = $('cuPick').value; $('cuDel').hidden = !G.id; G.cur = null; if (G.id) showClientForm(getClient(G.id)); else $('gStep2').hidden = true; });
$('cuDel').onclick = () => {
  const b = $('cuDel');
  if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'กดอีกครั้งเพื่อลบ'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'ลบลูกค้านี้'; }, 4000); return; }
  b.classList.remove('confirm'); b.textContent = 'ลบลูกค้านี้';
  saveClients(getClients().filter(c => c.id !== G.id));
  PJ.list.forEach(pr => { if (pr.client === G.id) pr.client = ''; }); saveProjects();
  G.id = ''; renderGuidePick(); $('gStep2').hidden = true; renderClientSel(); renderProjChip();
};
function addGuideFiles(files) {
  const ok = files.filter(f => GUIDE_EXT.has(extOf(f.name)));
  if (!ok.length) { toast('รับไฟล์ PDF, Word (.docx), Excel, รูป และ txt'); return; }
  for (const f of ok) if (!G.files.some(x => x.name === f.name && x.size === f.size)) G.files.push(f);
  renderGFiles();
}
function renderGFiles() {
  $('gFiles').innerHTML = G.files.map((f, i) => `<span class="fchip">${esc(f.name)} <small>${Math.max(1, Math.round(f.size / 1024))} KB</small><button type="button" data-rm="${i}" aria-label="เอาออก">✕</button></span>`).join('');
}
$('gFiles').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { G.files.splice(+b.dataset.rm, 1); renderGFiles(); } });
$('gDrop').addEventListener('click', () => $('fGuide').click());
$('gDrop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fGuide').click(); } });
$('fGuide').addEventListener('change', e => { addGuideFiles([...e.target.files]); e.target.value = ''; });
$('gProv').addEventListener('change', async () => { const p = $('gProv').value; if (p === '__conn') { closeM('mGuide'); openConn(); return; } AIX.setSel({ provider: p }); await modelOptions($('gModel'), p, AIX.getSel().model); });
$('gModel').addEventListener('change', () => AIX.setSel({ model: $('gModel').value }));
async function docxText(f) {
  const ents = await zipList(f);
  const doc = ents.find(x => x.name === 'word/document.xml'); if (!doc) return '';
  const xml = await (await zipRead(f, doc)).text();
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:tc>/g, '\t').replace(/<\/w:p>|<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}
async function xlsxText(f) {
  const bk = await xlsxBook(f);
  return bk.sheets.map(sh => `## ชีต ${sh.name || ''}\n` + sh.rows.slice(0, 3000).map(r => r.vals.map(v => String(v == null ? '' : v).replace(/\s+/g, ' ')).join('\t').replace(/\t+$/, '')).filter(Boolean).join('\n')).join('\n\n');
}
function guidePrompt(text, tgt) {
  return `คุณคือผู้ช่วยอ่านคู่มือ (guide / style guide / 翻译规范 / 字幕要求) งานแปลซับไตเติ้ลของลูกค้า
อ่านเอกสารทั้งหมดที่แนบมา รวมถึงตารางและข้อความที่อยู่ในรูปภาพ แล้วสรุปข้อกำหนดสำหรับงานแปลซับเป็นภาษา${TGT_NAME[tgt] || 'ไทย'}
ถ้าคู่มือมีหลายภาษา ให้เอาเฉพาะส่วนที่ใช้กับภาษา${TGT_NAME[tgt] || 'ไทย'} (หรือส่วนที่ใช้กับทุกภาษา)

ตอบเป็น JSON object เท่านั้น ห้ามมีข้อความอื่น ค่าไหนคู่มือไม่ได้บอกให้ใส่ null ห้ามเดา:
{
  "client": "ชื่อลูกค้า แพลตฟอร์ม หรือโปรเจกต์",
  "target_lang": "th | zh | en",
  "orientation": "horizontal | vertical | both | null",
  "limit_horizontal": ตัวเลขตัวอักษรสูงสุดต่อบรรทัดของวิดีโอแนวนอน,
  "limit_vertical": ตัวเลขตัวอักษรสูงสุดต่อบรรทัดของวิดีโอแนวตั้ง,
  "count_mode": "len (นับทุกตัวรวมสระและวรรณยุกต์) | se (ไม่นับสระบน-ล่างและวรรณยุกต์) | null",
  "max_lines": จำนวนบรรทัดสูงสุดต่อคิว,
  "cps_max": ตัวอักษรต่อวินาทีสูงสุด,
  "min_duration_sec": ความยาวคิวขั้นต่ำเป็นวินาที,
  "max_duration_sec": ความยาวคิวสูงสุดเป็นวินาที,
  "punctuation": "none (ห้ามใช้เครื่องหมายวรรคตอน) | keep (ใช้ได้) | null",
  "polite_particles": "ban (ห้ามใส่หางเสียง) | minimal (ใส่ให้น้อย) | keep | null",
  "bracket": "half ( ) | full （） | null",
  "era_language": "modern | period | null",
  "rules": ["ข้อกำหนดอื่นทั้งหมดเป็นข้อ ๆ ภาษาไทย สั้น ชัด เอาไปใช้ได้ทันที เช่น วิธีเขียนชื่อคน ค่าเงิน ตัวเลข 画面字 เสียงในใจ คำต้องห้าม การแบ่งบรรทัด ชื่อเรื่อง เรื่องย่อ ชื่อไฟล์ การส่งงาน"],
  "glossary": [{"src": "คำต้นฉบับ", "t": "คำแปลที่คู่มือกำหนด"}],
  "unclear": ["จุดที่คู่มือเขียนไม่ชัด ขัดกันเอง หรือควรถาม PM"]
}
${text ? `\nเนื้อหาจากไฟล์ที่เป็นข้อความ:\n${text}` : ''}`;
}
function clientFromAI(o) {
  if (Array.isArray(o)) o = o[0];
  o = o || {};
  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  const tgt = ['th', 'zh', 'en'].includes(o.target_lang) ? o.target_lang : tgtLang();
  const cfg = {};
  if (o.count_mode === 'se' || o.count_mode === 'len') cfg.mode = o.count_mode;
  if (num(o.max_lines)) cfg.maxLines = Math.round(num(o.max_lines));
  if (num(o.cps_max)) cfg.cpsMax = num(o.cps_max);
  if (num(o.min_duration_sec)) cfg.minDur = Math.round(num(o.min_duration_sec) * 1000);
  if (num(o.max_duration_sec)) cfg.maxDur = Math.round(num(o.max_duration_sec) * 1000);
  if (o.punctuation === 'none') cfg.punct = 'strict'; else if (o.punctuation === 'keep') cfg.punct = 'off';
  if (o.polite_particles === 'ban') cfg.particles = 'ban'; else if (o.polite_particles === 'minimal') cfg.particles = 'dense'; else if (o.polite_particles === 'keep') cfg.particles = 'off';
  if (o.bracket === 'half' || o.bracket === 'full') cfg.bracket = o.bracket;
  if (o.era_language === 'modern' || o.era_language === 'period') cfg.era = o.era_language;
  const limitH = num(o.limit_horizontal) ? Math.round(num(o.limit_horizontal)) : null, limitV = num(o.limit_vertical) ? Math.round(num(o.limit_vertical)) : null;
  const orient = o.orientation === 'vertical' ? 'v' : o.orientation === 'horizontal' ? 'h' : o.orientation === 'both' ? 'both' : '';
  const rules = (Array.isArray(o.rules) ? o.rules : String(o.rules || '').split('\n')).map(x => String(x).replace(/^[-•*\s]+/, '').trim()).filter(Boolean).map(x => '- ' + x).join('\n');
  const gloss = (Array.isArray(o.glossary) ? o.glossary : []).map(g => ({ src: String((g && g.src) || '').trim(), th: String((g && (g.t || g.th || g.target)) || '').trim() })).filter(g => g.src && g.th);
  const prev = G.id ? getClient(G.id) : null;
  return { id: G.id || '', name: String(o.client || '').trim() || (prev && prev.name) || (G.files[0] ? G.files[0].name.replace(/\.[^.]+$/, '') : 'ลูกค้าใหม่'), tgt, cfg, limitH, limitV, orient, rules, gloss,
    unclear: (Array.isArray(o.unclear) ? o.unclear : []).map(String).filter(Boolean), files: G.files.map(f => f.name).concat(prev ? prev.files || [] : []) };
}
$('gGo').onclick = async () => {
  const prov = $('gProv').value, model = $('gModel').value;
  if (!prov || prov === '__conn') { closeM('mGuide'); openConn(); return; }
  if (!G.files.length && !$('gText').value.trim()) { $('gProg').textContent = 'ใส่ไฟล์ guide หรือวางข้อความก่อน'; return; }
  $('gGo').disabled = true; $('gProg').textContent = 'กำลังเปิดไฟล์…';
  try {
    const texts = [], att = [];
    for (const f of G.files) {
      const x = extOf(f.name);
      if (x === 'pdf') att.push({ name: f.name, mime: 'application/pdf', blob: f });
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(x)) att.push({ name: f.name, mime: f.type || 'image/' + (x === 'jpg' ? 'jpeg' : x), blob: f });
      else if (x === 'docx') texts.push(`# ไฟล์ ${f.name}\n` + await docxText(f));
      else if (x === 'xlsx') texts.push(`# ไฟล์ ${f.name}\n` + await xlsxText(f));
      else texts.push(`# ไฟล์ ${f.name}\n` + (await f.text()).slice(0, 80000));
    }
    if ($('gText').value.trim()) texts.push('# ข้อความเพิ่มเติม\n' + $('gText').value.trim());
    $('gProg').textContent = `${$('gProv').selectedOptions[0].textContent} กำลังอ่านคู่มือ (ไฟล์ใหญ่อาจใช้เวลา 1-2 นาที)…`;
    const tgt = (G.id && getClient(G.id) && getClient(G.id).tgt) || tgtLang();
    const out = await AIX.chat({ provider: prov, model, prompt: guidePrompt(texts.join('\n\n').slice(0, 200000), tgt), files: att, json: true, maxTokens: 12000 });
    showClientForm(clientFromAI(out));
    $('gProg').textContent = 'อ่านเสร็จแล้ว ตรวจกฎด้านล่าง แก้ได้ทุกช่อง แล้วกดบันทึก';
  } catch (e) { $('gProg').textContent = aiErr(e, prov); }
  finally { $('gGo').disabled = false; }
};
$('gManual').onclick = () => {
  const c = G.id ? getClient(G.id) : null;
  showClientForm(c || { id: '', name: '', tgt: tgtLang(), cfg: Object.fromEntries(CL_KEYS.map(k => [k, S.cfg[k]])), limitH: S.cfg.limit, limitV: null, orient: '', rules: '', gloss: [], unclear: [], files: [] });
};
const CU_FIELDS = [
  ['orient', 'วิดีโอของงานนี้', 'sel', [['', 'ไม่ระบุ'], ['h', 'แนวนอน'], ['v', 'แนวตั้ง'], ['both', 'มีทั้งแนวนอนและแนวตั้ง']]],
  ['limitH', 'ลิมิตต่อบรรทัด · แนวนอน', 'num'],
  ['limitV', 'ลิมิตต่อบรรทัด · แนวตั้ง', 'num'],
  ['mode', 'นับตัวอักษรแบบ', 'sel', [['len', 'len (นับทุกตัว)'], ['se', 'SE (ไม่นับสระบน-ล่าง/วรรณยุกต์)']], 'th'],
  ['maxLines', 'บรรทัดสูงสุดต่อคิว', 'num'],
  ['cpsMax', 'CPS สูงสุด (0 = ไม่ตรวจ)', 'num'],
  ['minDur', 'คิวสั้นสุด วินาที (0 = ไม่ตรวจ)', 'sec'],
  ['maxDur', 'คิวยาวสุด วินาที (0 = ไม่ตรวจ)', 'sec'],
  ['punct', 'เครื่องหมายวรรคตอน', 'sel', [['strict', 'ห้ามใช้'], ['off', 'ใช้ได้ / ไม่ตรวจ']]],
  ['particles', 'หางเสียง', 'sel', [['dense', 'ใส่ให้น้อย (เตือนเมื่อติดกัน)'], ['ban', 'ห้ามมีเลย'], ['off', 'ไม่ตรวจ']], 'th'],
  ['bracket', 'ชนิดวงเล็บ', 'sel', [['half', 'ครึ่งความกว้าง ( )'], ['full', 'เต็มความกว้าง （）'], ['off', 'ไม่ตรวจ']]],
  ['era', 'ยุคของเรื่อง', 'sel', [['off', 'ไม่ตรวจ'], ['modern', 'ปัจจุบัน'], ['period', 'ย้อนยุค']], 'th']
];
const TOP_KEYS = new Set(['orient', 'limitH', 'limitV']);
function showClientForm(c) {
  if (!c) return;
  G.cur = JSON.parse(JSON.stringify(c));
  $('gStep2').hidden = false;
  $('cuName').value = c.name || '';
  $('cuTgt').value = c.tgt || tgtLang();
  const val = k => TOP_KEYS.has(k) ? c[k] : (c.cfg || {})[k];
  $('cuForm').innerHTML = CU_FIELDS.map(([k, lab, type, opts, only]) => {
    const v = val(k), oc = only ? ` data-only="${only}"` : '';
    if (type === 'sel') return `<label${oc}>${esc(lab)}<select class="field sm" data-cu="${k}"><option value="">${k === 'orient' ? 'ไม่ระบุ' : '— ไม่ระบุ (ใช้เกณฑ์เดิม) —'}</option>${opts.filter(o => o[0] !== '').map(([ov, n]) => `<option value="${ov}"${v === ov ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    const shown = v == null || v === '' ? '' : type === 'sec' ? v / 1000 : v;
    return `<label${oc}>${esc(lab)}<input class="field sm" type="number" min="0" step="${type === 'sec' ? 0.01 : 1}" data-cu="${k}" data-type="${type}" value="${shown}" placeholder="ไม่ระบุ"></label>`;
  }).join('');
  syncCuTgt();
  $('cuRules').value = c.rules || '';
  $('cuGloss').innerHTML = c.gloss && c.gloss.length ? `<label class="chk"><input type="checkbox" id="cuGlossAdd" checked> เจอศัพท์ในคู่มือ ${c.gloss.length} คำ เพิ่มเข้า术语表ของโปรเจกต์ตอนกด "ใช้กับโปรเจกต์นี้"</label><div class="tbl"><table><tbody>${c.gloss.slice(0, 8).map(g => `<tr><td>${esc(g.src)}</td><td>${esc(g.th)}</td></tr>`).join('')}${c.gloss.length > 8 ? `<tr><td colspan="2" class="info">และอีก ${c.gloss.length - 8} คำ</td></tr>` : ''}</tbody></table></div>` : '';
  $('cuUnclear').innerHTML = c.unclear && c.unclear.length ? `<div class="unclear"><b>จุดที่คู่มือไม่ชัด ควรถาม PM</b><ul>${c.unclear.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>` : '';
  $('gStep2').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function syncCuTgt() { const t = $('cuTgt').value; $('cuForm').querySelectorAll('[data-only]').forEach(l => { l.hidden = l.dataset.only !== t; }); }
$('cuTgt').addEventListener('change', syncCuTgt);
function readClientForm() {
  const c = Object.assign({}, G.cur || {}, { name: $('cuName').value.trim(), tgt: $('cuTgt').value, rules: $('cuRules').value.trim(), cfg: {} });
  $('cuForm').querySelectorAll('[data-cu]').forEach(el => {
    const k = el.dataset.cu, ty = el.dataset.type; let v = el.value;
    if (el.closest('label').hidden) v = '';
    if (ty) v = v === '' ? null : ty === 'sec' ? Math.round(parseFloat(v) * 1000) : parseFloat(v);
    else if (v === '') v = null;
    if (v != null && typeof v === 'number' && !isFinite(v)) v = null;
    if (TOP_KEYS.has(k)) c[k] = v; else if (v != null) c.cfg[k] = v;
  });
  if (!c.cfg.limit && (c.limitH || c.limitV)) c.cfg.limit = c.limitH || c.limitV;
  return c;
}
function saveClientForm() {
  const c = readClientForm();
  if (!c.name) { toast('ใส่ชื่อลูกค้าก่อน'); $('cuName').focus(); return null; }
  const list = getClients();
  if (!c.id) c.id = 'c' + Date.now().toString(36);
  c.updated = Date.now();
  const i = list.findIndex(x => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  saveClients(list); G.id = c.id; G.cur = c; renderGuidePick(); renderClientSel(); renderProjChip();
  return c;
}
$('cuSave').onclick = () => { const c = saveClientForm(); if (!c) return; toast(`บันทึกลูกค้า ${c.name} แล้ว`); if (curProj().client === c.id) applyClient(c); };
$('cuUse').onclick = () => {
  const c = saveClientForm(); if (!c) return;
  if ($('cuGlossAdd') && $('cuGlossAdd').checked && c.gloss && c.gloss.length) {
    const have = new Set(S.gloss.map(g => g.src));
    const add = c.gloss.filter(g => !have.has(g.src));
    if (add.length) setGloss(S.gloss.concat(add), S.glossName ? S.glossName + ' + ' + c.name : 'คู่มือ ' + c.name);
  }
  if (c.tgt && c.tgt !== tgtLang()) toast(`หมายเหตุ: ลูกค้านี้แปลเป็นภาษา${TGT_NAME[c.tgt]} แต่โปรเจกต์นี้เป็น${pairName(curProj())}`);
  setProjClient(c.id); closeM('mGuide');
};
$('cuBack').onclick = () => { $('gStep2').hidden = true; $('gStep1').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
$('bClients').onclick = () => { closeMenus(); openGuide(curProj().client || ''); };

/* ---------- ask AI: a side panel assistant that knows the current cue ---------- */
const ASK = { log: [], busy: false, ctl: null, key: '' };
function askContext() {
  const c = curCue(), ep = S.sel ? S.eps[S.sel.e] : null;
  if (!c || !ep || ep.sample) return null;
  const prev = ep.cues[S.sel.c - 1], next = ep.cues[S.sel.c + 1];
  return { ep, c, src: srcTextOf(ep, c), prevT: prev ? prev.t : '', prevS: prev ? srcTextOf(ep, prev) : '', nextT: next ? next.t : '', nextS: next ? srcTextOf(ep, next) : '' };
}
function askSelected() {
  if (document.activeElement === ta && ta.selectionEnd > ta.selectionStart) return ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
  const s = String(window.getSelection ? window.getSelection() : '').trim();
  return s.length <= 80 ? s : '';
}
let askSel = '';
document.addEventListener('selectionchange', () => { const s = askSelected(); if (s) askSel = s; });
function renderAskCtx() {
  const x = askContext();
  $('askCtx').innerHTML = x ? `<div><b>${esc(x.ep.label)} · คิว ${S.sel.c + 1}</b></div>${x.src ? `<div class="ac-src">${esc(x.src)}</div>` : ''}<div class="ac-t">${esc(x.c.t) || '<span class="empty">(ว่าง)</span>'}</div>` : '<span class="info">เลือกคิวจากรายการ แล้วถามได้เลย หรือพิมพ์ถามเรื่องไหนก็ได้</span>';
  $('askSel').textContent = askSel ? `คำที่เลือก: ${askSel}` : 'ลากคลุมคำในคิวหรือใน原文 เพื่อถามเฉพาะคำนั้น';
}
function renderAsk() {
  const box = $('askLog'); if (!box) return;
  box.innerHTML = ASK.log.map((m, i) => m.role === 'user' ? `<div class="msg me">${esc(m.show || m.content)}</div>`
    : `<div class="msg ai">${m.content.split('\n').map(l => { const o = l.match(/^\s*»\s*(.+)$/); return o ? `<div class="opt"><span>${esc(o[1])}</span><button class="btn sm" type="button" data-use="${esc(o[1])}">ใช้</button></div>` : `<div>${esc(l) || '&nbsp;'}</div>`; }).join('')}</div>`).join('') + (ASK.busy ? '<div class="msg ai busy">กำลังคิด…</div>' : '');
  box.scrollTop = box.scrollHeight;
}
function openAsk() { $('askPanel').hidden = false; document.body.classList.add('asking'); renderAskCtx(); renderAsk(); provOptions($('askProv'), $('askModel'), AIX.getSel().provider); setTimeout(() => $('askIn').focus(), 0); layoutOverlay(); }
function closeAsk() { $('askPanel').hidden = true; document.body.classList.remove('asking'); layoutOverlay(); }
async function askSend(q, show) {
  q = String(q || '').trim(); if (!q || ASK.busy) return;
  const prov = $('askProv').value, model = $('askModel').value;
  if (!prov || prov === '__conn') { openConn(); return; }
  const x = askContext(), cl = curClient(), T = TGT_LABEL();
  const ctx = x ? `บริบทตอนนี้ (${x.ep.label} คิว ${S.sel.c + 1}):
${x.prevS || x.prevT ? `คิวก่อนหน้า: 原文「${x.prevS}」 คำแปล「${x.prevT}」\n` : ''}คิวนี้: 原文「${x.src}」 คำแปล${T}「${x.c.t}」
${x.nextS || x.nextT ? `คิวถัดไป: 原文「${x.nextS}」 คำแปล「${x.nextT}」\n` : ''}` : '';
  const gl = x && x.src ? S.G.filter(g => g.lat ? g.rx.test(x.src) : x.src.includes(g.src)).slice(0, 40) : [];
  const system = `คุณคือผู้ช่วยนักแปลซับไตเติ้ล (ต้นฉบับ → ${T}) ของ Hell's Factory ตอบเป็นภาษาไทย สั้น ตรงประเด็น เป็นกันเอง
- ถ้าถามความหมายคำ: บอกความหมาย คำอ่าน (พินอินถ้าเป็นจีน) และคำแปล${T}ที่เหมาะกับบริบทนี้
- ถ้าเสนอคำแปลให้เลือก: ใส่แต่ละตัวเลือกเป็นบรรทัดเดียว ขึ้นต้นด้วย "» " ตามด้วยข้อความทั้งคิวที่ใช้แทนได้ทันที (ไม่มีเครื่องหมายคำพูด ไม่มีคำอธิบายในบรรทัดเดียวกัน) แล้วอธิบายสั้น ๆ บรรทัดถัดไป
- คำแปลที่เสนอต้องทำตามเกณฑ์: แต่ละบรรทัดไม่เกิน ${S.cfg.limit} ตัวอักษร ไม่เกิน ${S.cfg.maxLines} บรรทัด${S.cfg.punct === 'strict' && tgtLang() === 'th' ? ' ห้ามใช้ ! ? … , . " ;' : ''}${S.cfg.particles === 'ban' ? ' ห้ามมีหางเสียง' : ''}
${cl && cl.rules ? `กฎของลูกค้า ${cl.name}:\n${cl.rules}\n` : ''}กฎทั่วไปของงาน:\n${S.aiRules}${gl.length ? `\n术语表ที่เกี่ยวข้อง:\n${gl.map(g => `${g.src} = ${g.th}`).join('\n')}` : ''}`;
  const hist = ASK.log.filter(m => !m.err).slice(-10).map(m => ({ role: m.role, content: m.content }));
  ASK.log.push({ role: 'user', content: (ctx ? ctx + '\n' : '') + 'คำถาม: ' + q, show: show || q });
  ASK.busy = true; renderAsk(); $('askIn').value = '';
  ASK.ctl = new AbortController();
  try {
    const ans = await AIX.chat({ provider: prov, model, system, prompt: ASK.log[ASK.log.length - 1].content, history: hist, json: false, signal: ASK.ctl.signal, maxTokens: 2000 });
    ASK.log.push({ role: 'assistant', content: String(ans || '').trim() || '(ไม่มีคำตอบ)' });
  } catch (e) { ASK.log.push({ role: 'assistant', content: aiErr(e, prov), err: true }); }
  finally { ASK.busy = false; ASK.ctl = null; renderAsk(); }
}
$('askLog').addEventListener('click', e => {
  const b = e.target.closest('[data-use]'); if (!b) return;
  if (!S.sel || !curCue()) { toast('เลือกคิวที่จะใส่ก่อน'); return; }
  const v = b.dataset.use.replace(/\\n|\\N/g, '\n').replace(/\s*\/\s*/g, m => m.includes('\n') ? m : m);
  batchText(() => v, 'ใช้คำแปลจาก AI', [[S.sel.e, S.sel.c]]);
  toast('ใส่คำแปลนี้แล้ว', { label: 'เลิกทำ', fn: undo });
});
$('askQuick').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]'); if (!b) return;
  const w = askSel, k = b.dataset.q;
  if (k === 'word') { if (!w) { toast('ลากคลุมคำที่อยากรู้ในคิวหรือใน原文ก่อน'); return; } askSend(`「${w}」 ในประโยคนี้แปลว่าอะไร ใช้คำ${TGT_LABEL()}ว่าอะไรดี`, `คำนี้แปลว่าอะไร: ${w}`); }
  else if (k === 'alt') askSend(`ขอคำแปลของคิวนี้แบบอื่น 3 แบบ (สั้นลง / ธรรมชาติขึ้น / ใกล้ต้นฉบับ) พร้อมบอกว่าแต่ละแบบต่างกันยังไง`, 'ขอคำแปลแบบอื่น');
  else if (k === 'check') askSend('คำแปลคิวนี้ถูกต้อง ครบ และลื่นไหลไหม ถ้าแปลกหรือผิดตรงไหน บอกเหตุผลและเสนอคำแปลที่ดีกว่า', 'ประโยคนี้แปลกไหม');
  else if (k === 'explain') askSend('อธิบาย原文ของคิวนี้ให้เข้าใจง่าย (ความหมาย สำนวน คำแสลง มุก หรือบริบททางวัฒนธรรม)', 'อธิบาย原文');
});
$('askGo').onclick = () => askSend($('askIn').value);
$('askIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askSend($('askIn').value); } });
$('askClear').onclick = () => { ASK.log = []; renderAsk(); };
$('askClose').onclick = closeAsk;
$('bAsk').onclick = () => { if ($('askPanel').hidden) openAsk(); else { renderAskCtx(); $('askIn').focus(); } };
$('askProv').addEventListener('change', async () => { const p = $('askProv').value; if (p === '__conn') { openConn(); return; } AIX.setSel({ provider: p }); await modelOptions($('askModel'), p, AIX.getSel().model); });
$('askModel').addEventListener('change', () => AIX.setSel({ model: $('askModel').value }));

/* ---------- menus ---------- */
function closeMenus() { document.querySelectorAll('.menu').forEach(m => { if (!m.hidden) { m.hidden = true; const b = m.parentElement.querySelector('[aria-expanded]'); if (b) b.setAttribute('aria-expanded', 'false'); } }); }
function menu(btnId, menuId) {
  const b = $(btnId), m = $(menuId);
  b.addEventListener('click', e => { e.stopPropagation(); const open = m.hidden; closeMenus(); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) { const f = m.querySelector('button, input, select'); if (f) f.focus(); } });
  m.addEventListener('click', e => { if (e.target.closest('button[role=menuitem]')) closeMenus(); });
}
menu('bOpen', 'mnOpen'); menu('bMenu', 'mnMain'); menu('bPlayOpt', 'mnPlay');
document.addEventListener('click', e => { if (!e.target.closest('.menu') && !e.target.closest('[aria-haspopup]')) closeMenus(); });
$('tRep').onclick = () => { const on = $('repRow').hidden; $('repRow').hidden = !on; $('tRep').setAttribute('aria-pressed', String(on)); if (on) $('r').focus(); };
$('qaAISpell').onclick = () => { closeM('mQA'); openAI('spell', 'all'); };

/* ---------- 术语表 editor ---------- */
let glQ = '';
function renderGlossEd() {
  const q = glQ.trim().toLowerCase();
  const rows = []; for (let i = 0; i < S.gloss.length && rows.length < 300; i++) { const g = S.gloss[i]; if (!q || (g.src + ' ' + g.th).toLowerCase().includes(q)) rows.push(i); }
  $('gPrev').innerHTML = `<div class="gl-tools"><input class="field sm grow" id="glQ" type="search" placeholder="ค้นหาศัพท์" value="${esc(glQ)}" aria-label="ค้นหาศัพท์"><button class="btn sm" type="button" id="glAdd">＋ เพิ่มคำ</button><button class="btn sm" type="button" id="glExp"${S.gloss.length ? '' : ' disabled'}>ส่งออก .xlsx</button></div>`
    + (S.gloss.length ? `<table class="gl-ed"><thead><tr><th>原文</th><th>คำแปล</th><th></th></tr></thead><tbody>${rows.map(i => `<tr><td><input class="field sm" data-gi="${i}" data-gk="src" value="${esc(S.gloss[i].src)}" aria-label="原文"></td><td><input class="field sm" data-gi="${i}" data-gk="th" value="${esc(S.gloss[i].th)}" aria-label="คำแปล"></td><td><button class="btn sm ghost" type="button" data-gdel="${i}" aria-label="ลบคำนี้">✕</button></td></tr>`).join('')}</tbody></table>${rows.length >= 300 ? '<p class="info">แสดง 300 คำแรก ใช้ช่องค้นหาเพื่อหาคำอื่น</p>' : ''}` : '');
}
$('gPrev').addEventListener('input', e => { if (e.target.id === 'glQ') { glQ = e.target.value; const pos = e.target.selectionStart; renderGlossEd(); const n = $('glQ'); n.focus(); n.setSelectionRange(pos, pos); } });
$('gPrev').addEventListener('change', e => {
  const t = e.target; if (t.dataset.gi == null) return;
  S.gloss[+t.dataset.gi][t.dataset.gk] = t.value.trim();
  S.glossName = S.glossName || 'แก้ในโปรแกรม'; S.G = glossCompile(S.gloss);
  store.set(pk('gloss'), { name: S.glossName, list: S.gloss.filter(g => g.src || g.th) });
  $('gInfo').textContent = `ใช้อยู่ ${S.gloss.filter(g => g.src && g.th).length} คำ · แก้แล้วบันทึกทันที`; requalify();
});
$('gPrev').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'glAdd') { S.gloss.unshift({ src: '', th: '' }); glQ = ''; renderGlossEd(); const f = $('gPrev').querySelector('input[data-gk=src]'); if (f) f.focus(); return; }
  if (b.dataset.gdel != null) { S.gloss.splice(+b.dataset.gdel, 1); setGloss(S.gloss, S.glossName); return; }
  if (b.id === 'glExp') {
    const rows = [[{ v: '原文', s: 1 }, { v: '译文', s: 1 }]].concat(S.gloss.filter(g => g.src && g.th).map(g => [{ v: g.src }, { v: g.th }]));
    await saveFile(safeName((S.glossName || curProj().name).replace(/\.[^.]+$/, '')) + '_术语表.xlsx', xlsxNew('术语表', rows, [30, 40]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
});

/* ---------- Excel export of every cue ---------- */
function xlBook(eps, per, withIss) {
  const H = ['ตอน 集', 'ไฟล์ 文件', '# 序号', 'เริ่ม 开始', 'จบ 结束', '原文', 'คำแปลเดิม 原译文', 'คำแปล 译文', '是否修改'].concat(withIss ? ['ปัญหาที่ตรวจเจอ 问题'] : []);
  const W = [9, 26, 7, 14, 14, 38, 38, 38, 9].concat(withIss ? [40] : []);
  const head = H.map(v => ({ v, s: 1 }));
  const rowsOf = ep => {
    ensureQA(S.eps.indexOf(ep));
    return ep.cues.map((c, i) => {
      const ed = isEdited(c), st = ed ? 2 : 0;
      const r = [ep.label, ep.kind === 'xlsx' ? ep.key : ep.name, (!ep.struct && c.idx) || i + 1, ep.noTime ? '' : c.s, ep.noTime ? '' : c.e, srcTextOf(ep, c), c.oT == null ? '' : c.oT, c.t, ed ? '是' : '否'];
      if (withIss) r.push(Q(c).iss.filter(x => x.sev !== 'i').map(x => x.msg).join('; '));
      return r.map(v => ({ v: v == null ? '' : v, s: st }));
    });
  };
  if (per) return xlsxMulti(eps.map(ep => ({ name: ep.label, rows: [head].concat(rowsOf(ep)), widths: W })));
  return xlsxMulti([{ name: 'ซับทุกตอน', rows: [head].concat(...eps.map(rowsOf)), widths: W }]);
}

/* ---------- start ---------- */
window.__hfState = () => S; // read-only peek for automated tests
setSaveState('none');
$('bKeys').onclick = () => openM('mKeys');
setInterval(() => { if (saveMode === 'dirty') saveNow(false); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(false); });
$('oNext').checked = S.view.autoNext; $('oFollow').checked = S.view.follow; $('oOv').checked = S.view.overlay; $('oOvColor').checked = S.view.ovColor; $('oClickPlay').checked = S.view.clickPlay;
$('oPos').value = S.view.subPos; cap.style.bottom = S.view.subPos + '%';
$('rate').value = String(S.view.rate);
if ($('rate').value !== String(S.view.rate)) { S.view.rate = 1; $('rate').value = '1'; }
video.defaultPlaybackRate = S.view.rate; video.playbackRate = S.view.rate;
$('tSrc').setAttribute('aria-pressed', String(S.view.showSrc));
if (S.view.left) $('main').style.setProperty('--left', S.view.left + 'px');
loadSamples();
showPh(WELCOME);
syncThemeBtn();
renderProjChip(); renderClientSel();
renderAll(); updateTransport(); updateClock(true);
restoreFiles();
PDB.persist();
})();
