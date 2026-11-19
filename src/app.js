(() => {
'use strict';
const C = window.SubCore;
const { toMs, fmt, fmtAss, decode, parseSrt, parseAss, buildSrt, encodeFile, lineLen, scriptOf, LANG_LABEL, compileLex, CAT, FIXABLE, PRESETS, DEF_CFG, DEF_LEX,
  analyzeEpisode, fixText, autoBreak, joinLines, glossCompile, makeZip, zipList, zipRead, xlsxBook, guessMap, sheetToEps, xlsxPatch, xlsxNew, colName,
  textRows, glossFromRows, epInfo, baseOf, fnv, p2, swapGender, dropParticles, audioPeaks, pitchTrack } = C;
const $ = id => document.getElementById(id);
const video = $('video'), stage = $('stage'), cap = $('cap'), ph = $('ph'), list = $('list'), ta = $('ta'), clock = $('clock');

/* ---------- storage ---------- */
const LS = 'hfsub1:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }
};
const LEXVER = 3;
const AI_RULES = `- แปลให้ครบความหมาย ห้ามแปลขาด ห้ามแปลเกิน ห้ามเติมความหมายที่ต้นฉบับไม่มี ประโยคบอกเล่าห้ามกลายเป็นคำถาม
- ภาษาพูดธรรมชาติ กระชับ ไม่แข็งเหมือนเครื่องแปล คำพูดธรรมชาติที่ถูกอยู่แล้วไม่ต้องแก้
- ใส่หางเสียงเท่าที่จำเป็น ห้ามลงท้ายด้วยหางเสียงเดิมติดกันหลายคิว
- ห้ามใช้ กู มึง และคำหยาบ ใช้ ฉัน/แก ไอ้บ้า บ้าเอ๊ย แทน
- ไม้ยมก ๆ เว้นวรรคหน้าและหลัง
- ห้ามเปลี่ยนชื่อตัวละคร ศัพท์ที่อยู่ใน术语表ต้องใช้ตามนั้นเท่านั้น
- 画面字 เสียงในใจ เสียงโทรศัพท์ ใส่วงเล็บ ( ) เฉพาะเมื่อต้นฉบับมีวงเล็บ ถ้าต้นฉบับไม่มีวงเล็บห้ามเติมเอง
- เรื่องปัจจุบัน: ผู้หญิงใช้ ฉัน (หนู เฉพาะพูดกับพ่อแม่หรือญาติผู้ใหญ่) ผู้ชายใช้ ผม
- ค่าเงิน: ทำตามกฎของงานนี้ (แก้บรรทัดนี้ได้ เช่น ห้ามแปลงค่าเงิน / หยวน×10 = บาท)`;
const old = store.get('settings', {}) || {};
const saved = store.get('settings2', null) || {};
const VIEW_DEF = { autoNext: true, follow: true, overlay: true, ovColor: true, subPos: 8, rate: 1, left: null, showSrc: true, clickPlay: true, wspan: 8, aiRules: AI_RULES, aiTier: 'default' };
const S = {
  view: Object.assign({}, VIEW_DEF, saved.view || {}),
  cfg: Object.assign({}, DEF_CFG, saved.cfg || {}),
  lexSrc: Object.assign({}, DEF_LEX, saved.lex || {}),
  eps: [], srcs: [], videos: [], books: [], sel: null, cur: -1, playIdx: -1, stopAt: null, lockTime: true, multi: new Set(), anchor: null,
  query: '', regex: false, cs: false, onlyMatch: true, filter: 'all', folder: '', drafts: null, qv: 1,
  gloss: [], glossName: '', audio: new Map()
};
if (!saved.view) for (const k of ['autoNext', 'follow', 'overlay', 'subPos', 'rate', 'left']) if (old[k] !== undefined) S.view[k] = old[k];
if (saved.lex && saved.lexVer !== LEXVER) {
  const W = s => String(s || '').split(/[\s,，、]+/).filter(Boolean);
  const P = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const k of Object.keys(DEF_LEX)) {
    if (['period', 'modern', 'spell'].includes(k)) {
      const have = new Set(P(S.lexSrc[k]).map(l => l.split(/\s*(?:>|→)\s*/)[0]));
      S.lexSrc[k] = P(S.lexSrc[k]).concat(P(DEF_LEX[k]).filter(l => !have.has(l.split(/\s*(?:>|→)\s*/)[0]))).join('\n');
    } else S.lexSrc[k] = [...new Set(W(S.lexSrc[k]).concat(W(DEF_LEX[k])))].join(' ');
  }
}
S.L = compileLex(S.lexSrc);
const gsaved = store.get('gloss', null);
if (gsaved && Array.isArray(gsaved.list)) { S.gloss = gsaved.list; S.glossName = gsaved.name || ''; }
S.G = glossCompile(S.gloss);
const saveSettings = () => store.set('settings2', { view: S.view, cfg: S.cfg, lex: S.lexSrc, lexVer: LEXVER });
const uiSaved = store.get('ui', null);
if (uiSaved === 'day' || uiSaved === 'night') document.documentElement.dataset.ui = uiSaved;
saveSettings();

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const isEdited = c => c.t !== c.oT || c.s !== c.oS || c.e !== c.oE;
const epEdited = ep => !!ep.struct || !!ep.gen || ep.cues.some(isEdited);
const doneKey = ep => 'done:' + ep.name + ':' + ep.hash;
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
const WELCOME = `<div class="ph-in"><strong>ลากไฟล์ทั้งหมดมาวางตรงไหนก็ได้</strong><span>ซับไทย ซับต้นฉบับ (จีน อังกฤษ ภาษาไหนก็ได้) วิดีโอ zip rar Excel 中泰对照 หรือ术语表 ระบบแยกให้เองและจับคู่ตามเลขตอน</span><div class="ph-btns"><button class="btn primary" type="button" data-act="dir">เปิดโฟลเดอร์</button><button class="btn" type="button" data-act="files">เลือกไฟล์</button></div><span class="fine">ไฟล์เปิดในเครื่องเธอเท่านั้น ไม่มีการอัปโหลด<br>เล่นได้แน่นอนคือ MP4 (H.264) · รายการด้านขวาตอนนี้เป็นซับตัวอย่าง</span></div>`;
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
    if (n) html += headHtml(ei) + rows;
    else if (!re && S.filter === 'all') html += headHtml(ei) + '<div class="none">ไฟล์นี้ไม่มีคิวซับ</div>';
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
function scrollToEl(el, center) {
  if (!el) return;
  const lr = list.getBoundingClientRect(), r = el.getBoundingClientRect();
  const top = r.top - lr.top + list.scrollTop, head = 34;
  if (center) { list.scrollTop = top - list.clientHeight / 2 + r.height / 2; return; }
  if (r.top < lr.top + head) list.scrollTop = top - head;
  else if (r.bottom > lr.bottom) list.scrollTop = top - list.clientHeight + r.height;
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
    $('stats').innerHTML = `<span class="pill">${sample ? 'ตัวอย่าง · ' : ''}${S.eps.length} ตอน · ${n.toLocaleString('en')} คิว</span><button class="pill warn" type="button" data-f="issues"${p ? '' : ' disabled'}>มีปัญหา ${p}</button><button class="pill warn" type="button" data-f="over"${o ? '' : ' disabled'}>เกินลิมิต ${o}</button><button class="pill edit" type="button" data-f="edited"${e ? '' : ' disabled'}>แก้แล้ว ${e}</button>${sample ? '' : progressPill()}`;
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
    let btn = FIXABLE.has(x.code) ? `<button type="button" data-fix="${x.code}">แก้</button>` : '';
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
function pushHist(eps, label) {
  HIST.push({ label, items: eps.map(ep => ({ ep, cues: ep.cues.map(c => Object.assign({}, c, { _q: undefined })), struct: !!ep.struct })) });
  if (HIST.length > 60) HIST.shift();
  $('bUndo').disabled = false;
}
function undo() {
  const h = HIST.pop();
  $('bUndo').disabled = !HIST.length;
  if (!h) { toast('ไม่มีอะไรให้เลิกทำ'); return; }
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
  const { seek = true, scroll = true, play = null, center = false } = o;
  const ep = S.eps[ei];
  if (!ep || !ep.cues[ci]) return;
  if (S.sel) setRowClass(S.sel.e, S.sel.c, 'sel', false);
  S.sel = { e: ei, c: ci };
  setRowClass(ei, ci, 'sel', true);
  loadEditor();
  if (seek) { S.stopAt = null; seekTo(ei, (ep.cues[ci].sm + 2) / 1000, play === null ? false : play); }
  if (scroll) scrollRow(ei, ci, center);
  $('epJump').value = ei;
  drawWave();
}
function moveSel(d) {
  let n = S.sel ? $(`r-${S.sel.e}-${S.sel.c}`) : null;
  if (n) { do { n = d > 0 ? n.nextElementSibling : n.previousElementSibling; } while (n && !n.classList.contains('row')); }
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
function updateClock() {
  const ep = S.eps[S.cur];
  if (!ep) { clock.textContent = '--'; return; }
  if (!epVideo(S.cur)) { clock.textContent = ep.label; return; }
  const d = isFinite(video.duration) ? video.duration * 1000 : 0;
  clock.textContent = `${ep.label} · ${fmt(video.currentTime * 1000)}${d ? ' / ' + fmt(d).slice(0, 8) : ''}`;
}
function activeIdxs(ep, t) { const out = []; ep.cues.forEach((c, i) => { if (t >= c.sm && t < c.em) out.push(i); }); return out; }
let actives = [];
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
      if (S.view.follow && !video.paused && S.stopAt == null) {
        if (document.activeElement !== ta) select(S.cur, ai, { seek: false });
        else scrollRow(S.cur, ai);
      }
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
if ('ResizeObserver' in window) { new ResizeObserver(layoutOverlay).observe(stage); new ResizeObserver(() => drawWave()).observe($('wave')); }
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
  const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
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
const draftKey = ep => 'draft3:' + ep.name + ':' + ep.hash;
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
  renderDraftBar();
}
function renderDraftBar() {
  const bar = $('draftBar');
  if (!S.drafts) { bar.hidden = true; return; }
  bar.innerHTML = `<span>เจองานที่แก้ค้างไว้ในเครื่องนี้ ${S.drafts.length} ตอน</span><button class="btn sm primary" type="button" id="dRestore">กู้คืน</button><button class="btn sm" type="button" id="dDrop">ทิ้ง</button>`;
  bar.hidden = false;
  $('dRestore').onclick = () => {
    for (const [ep, d] of S.drafts) { ep.cues = d.cues.map(o => Object.assign({}, o, { sm: toMs(o.s), em: toMs(o.e) })); ep.struct = !!d.struct; ep.dirty = true; }
    S.drafts = null; renderDraftBar(); if (S.sel && !curCue()) S.sel = null; renderAll(); toast('กู้คืนงานที่แก้ค้างไว้แล้ว');
  };
  $('dDrop').onclick = () => { for (const [ep] of S.drafts) store.del(draftKey(ep)); S.drafts = null; renderDraftBar(); };
}
window.addEventListener('pagehide', flushDrafts);
window.addEventListener('beforeunload', e => { flushDrafts(); if (realEps().some(epEdited)) { e.preventDefault(); e.returnValue = ''; } });

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
  const zh = new Set(S.srcs.map((s, i) => s.lang === 'zh' && !s.sample && !s.fixed ? i : -1).filter(i => i >= 0));
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
  if (folder && (!S.folder || !realEps().length)) S.folder = folder;
  const parsed = [];
  for (const f of subs) {
    let buf; try { buf = await f.arrayBuffer(); } catch (e) { continue; }
    const d = decode(buf);
    const cues = /\.(ass|ssa)$/i.test(f.name) ? parseAss(d.text).cues : parseSrt(d.text);
    const txt = cues.map(c => c.t).join(' ').replace(/\{\\[^}]*\}/g, '');
    parsed.push({ f, buf, d, target: scriptOf(txt) === 'th' });
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
  if (unpairedSrc && (!real.length || info.nS)) toast(msg + ` · มี原文 ${unpairedSrc} ไฟล์ที่ยังไม่มีไฟล์แปล`, { label: 'สร้างไฟล์แปลไทย', fn: makeThaiFromSrc });
  else toast(msg);
  const usedV = new Set(real.map(e => e.video).filter(v => v != null)).size, usedS = new Set(real.map(e => e.src).filter(v => v != null)).size;
  if (real.length && !xlsxQueue.length && ((pv < real.length && S.videos.length > usedV) || (ps < real.length && S.srcs.length > usedS && !real.every(e => e.kind === 'xlsx')))) openPair();
}
function makeThaiFromSrc() {
  const before = snapshotSel();
  dropSamples();
  let n = 0;
  S.srcs.forEach((s, i) => {
    if (s.sample || S.eps.some(e => e.src === i)) return;
    const base = s.name.replace(/\.[^.]+$/, '').replace(/[_\-\s.(（]*(cn|zh|chs|cht|中文|简体|繁体|中|en|eng|english|英文|英语|英)[)）]?$/i, '');
    const name = base + '_泰文.srt';
    const info = epInfo(name);
    const ep = { name, num: info.num, group: info.group, base: baseOf(name), kind: 'srt', label: info.num != null ? 'EP' + p2(info.num) : base,
      raw: null, bom: true, enc: 'utf-8', eol: '\r\n', trail: true, hash: fnv(name + s.cues.length), video: null, src: i, sample: false, struct: false, gen: true, dirty: true, qv: 0,
      cues: s.cues.map((c, k) => ({ idx: c.idx != null ? c.idx : String(k + 1), s: fmt(c.sm), sep: ' --> ', e: fmt(c.em), tail: '', t: '', oS: fmt(c.sm), oE: fmt(c.em), oT: '', sm: c.sm, em: c.em })) };
    S.eps.push(ep); n++;
  });
  finishLoad(before, {});
  toast(`สร้างไฟล์แปลไทยเปล่า ${n} ตอน (ไทม์โค้ดตาม原文) · พิมพ์เอง หรือกด "AI ช่วยแปล/ตรวจ"`, { label: 'เปิด AI ช่วยแปล', fn: () => openAI('fill') });
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
  const toGloss = !!e.target.closest && !!e.target.closest('#mGloss');
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
  store.set('gloss', { name, list: listIn });
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
  $('gPrev').innerHTML = S.gloss.length ? `<table><thead><tr><th>原文</th><th>ไทย</th></tr></thead><tbody>${S.gloss.slice(0, 12).map(g => `<tr><td>${esc(g.src)}</td><td>${esc(g.th)}</td></tr>`).join('')}${S.gloss.length > 12 ? `<tr><td colspan="2" class="info">และอีก ${S.gloss.length - 12} คำ</td></tr>` : ''}</tbody></table>` : '';
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
  ['modern', 'คำที่ห้ามในเรื่องปัจจุบัน (คำ > ใช้แทน)'], ['allow', 'คำยกเว้น (ไม่ต้องเตือน เช่น เจ้าหน้าที่ ทรงผม คุณหนู)'], ['conj', 'คำเชื่อม (ใช้ตอนตัดบรรทัดอัตโนมัติ)']
];
function presetOptions() { return PRESETS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('') + '<option value="custom">กำหนดเอง</option>'; }
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
$('cfgReset').onclick = () => { S.cfg = Object.assign({}, DEF_CFG); S.lexSrc = Object.assign({}, DEF_LEX); S.L = compileLex(S.lexSrc); saveSettings(); renderCfg(); syncCrit(); requalify(); toast('คืนค่าเกณฑ์เริ่มต้นแล้ว'); };
function syncCrit() {
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

/* ---------- AI (Claude via this page; copy prompt for other models) ---------- */
const AI = { ctl: null, res: [], map: new Map() };
const TASKS = {
  fill: 'แปลจาก原文เป็นภาษาไทย เฉพาะคิวที่ "th" ยังว่าง',
  retrans: 'แปลจาก原文เป็นภาษาไทยใหม่ทุกคิว',
  qa: 'ตรวจคำแปลไทยเทียบกับ原文 เสนอแก้เฉพาะคิวที่ผิดจริง (ความหมายผิด แปลขาด แปลเกิน เพศ/สรรพนาม/หางเสียงผิด ศัพท์ไม่ตรง术语表 คำผิด ภาษาไม่เป็นธรรมชาติ รูปแบบผิด) คิวที่ถูกและเป็นธรรมชาติอยู่แล้วห้ามแก้',
  shorten: 'เกลาคำแปลไทยให้แต่ละบรรทัดอยู่ในลิมิต โดยความหมายครบเหมือนเดิม ไม่เปลี่ยนชื่อ สรรพนาม หรือระดับภาษา ตัดเฉพาะคำที่ไม่จำเป็น ถ้าจำเป็นให้ตัดเป็น 2 บรรทัดตรงรอยต่อวลี ห้ามฉีกคำ',
  particles: 'ตัดหางเสียง (ครับ ค่ะ คะ นะคะ เพคะ ขอรับ ฯลฯ) ที่ไม่จำเป็นออก ให้เหลือเฉพาะที่ทำให้ประโยคสุภาพหรือเป็นธรรมชาติจริง เช่น คำตอบสั้น ๆ หรือคำเรียกขาน ห้ามแก้ส่วนอื่น'
};
function aiTargets(task, scope) {
  const out = [];
  const push = (ei, ci) => { const ep = S.eps[ei], c = ep.cues[ci]; out.push([ei, ci]); };
  if (scope === 'sel') selCues().forEach(([e, c]) => push(e, c));
  else {
    const eis = scope === 'all' ? qaScope().map(ep => S.eps.indexOf(ep)) : (S.sel ? [S.sel.e] : S.cur >= 0 ? [S.cur] : []);
    for (const ei of eis) { ensureQA(ei); S.eps[ei].cues.forEach((c, ci) => { if (scope === 'issues' && !hasSev(c, ['e', 'w'])) return; push(ei, ci); }); }
  }
  return out.filter(([ei, ci]) => {
    const c = S.eps[ei].cues[ci];
    if (task === 'fill') return !c.t.trim();
    if (task === 'shorten') { ensureQA(ei); return Q(c).ov; }
    if (task === 'particles') { ensureQA(ei); return Q(c).marks.some(m => /^g[mf]/.test(m.c) && !/gr/.test(m.c)); }
    return true;
  });
}
function aiPrompt(task, items) {
  const cfg = S.cfg;
  const era = cfg.era === 'period' ? 'ละครย้อนยุค: ใช้ภาษาโบราณ ข้า/เจ้า/ท่าน ใช้ราชาศัพท์ตามฐานะ (พ่ะย่ะค่ะ/เพคะ/กระหม่อม/หม่อมฉัน กับเชื้อพระวงศ์ · ขอรับ/เจ้าค่ะ/เจ้าคะ กับขุนนางหรือนาย) ใส่หางเสียงน้อยที่สุด ห้ามใช้ ไหม เหรอ ยังไง งั้น เถอะ แบบนี้ เมื่อไหร่ (ใช้ หรือไม่ หรือ อย่างไร เช่นนั้น เถิด เช่นนี้ เมื่อใด) ห้ามใช้ ครับ ค่ะ ผม ฉัน คุณ เธอ'
    : cfg.era === 'modern' ? 'ละครยุคปัจจุบัน: ใช้ ผม/ฉัน/คุณ/นาย/เธอ/แก ห้ามใช้ ข้า เจ้า ท่านพ่อ ราชาศัพท์' : 'ดูยุคของเรื่องจากเนื้อหา แล้วใช้ระดับภาษาให้ตรงยุค';
  const lim = `แต่ละบรรทัดยาวไม่เกิน ${cfg.limit} ตัวอักษร (${cfg.mode === 'se' ? 'นับแบบ SE ไม่นับสระบน-ล่างและวรรณยุกต์' : 'นับทุกตัว รวมสระ วรรณยุกต์ และช่องว่าง'}) ไม่เกิน ${cfg.maxLines} บรรทัดต่อคิว ใช้ \\n คั่นบรรทัด ถ้าบรรทัดเดียวพอห้ามตัดบรรทัด`;
  const part = cfg.particles === 'ban' ? 'ห้ามมีหางเสียงสุภาพ (ครับ ค่ะ คะ นะคะ ฯลฯ)' : 'ใส่หางเสียงเท่าที่จำเป็น';
  const punct = cfg.punct === 'strict' ? 'ห้ามใช้เครื่องหมาย ! ? … , . " ; (ตัวเลขอย่าง 10,000 ใช้ได้) ระหว่างวลีใช้เว้นวรรค' : 'ใช้เครื่องหมายตามมาตรฐานของงาน';
  const srcAll = items.map(([ei, ci]) => srcTextOf(S.eps[ei], S.eps[ei].cues[ci])).join('\n');
  const gl = S.G.filter(g => g.lat ? g.rx.test(srcAll) : srcAll.includes(g.src)).slice(0, 200);
  const data = items.map(([ei, ci], k) => {
    const ep = S.eps[ei], c = ep.cues[ci];
    return JSON.stringify({ i: String(k + 1), ep: ep.label, time: ep.noTime ? undefined : c.s, sec: ep.noTime ? undefined : +((c.em - c.sm) / 1000).toFixed(2), src: srcTextOf(ep, c), th: c.t });
  }).join('\n');
  return `คุณคือนักแปลและ QA ซับไตเติ้ลภาษาไทยมืออาชีพ (原文 → ไทย) ของ Hell's Factory

งาน: ${TASKS[task]}

เกณฑ์รูปแบบ:
- ${lim}
- ${era}
- ${part}
- ${punct}

กฎของงานนี้:
${S.view.aiRules}
${gl.length ? `\n术语表 (ต้องใช้คำแปลนี้เท่านั้น):\n${gl.map(g => `${g.src} = ${g.th}`).join('\n')}\n` : ''}
ข้อมูล (หนึ่งบรรทัดต่อคิว เรียงตามเวลา "src" คือ原文 "th" คือคำแปลไทยปัจจุบัน "sec" คือความยาวคิวเป็นวินาที):
${data}

ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น รูปแบบ: [{"i":"1","th":"คำแปลไทย","note":"เหตุผลสั้น ๆ ภาษาไทย"}]
${task === 'qa' || task === 'particles' ? 'ใส่เฉพาะคิวที่ต้องแก้ ถ้าไม่มีคิวไหนต้องแก้ให้ตอบ []' : 'ใส่ให้ครบทุกคิว'} · "th" ต้องเป็นข้อความทั้งคิวหลังแก้ (ใช้ \\n คั่นบรรทัด)`;
}
function aiNote() {
  getSample().then(s => { $('aiGo').hidden = !s; $('aiNote').textContent = s ? 'ใช้ Claude จากบัญชีของเธอ (ครั้งแรกจะถามอนุญาตก่อน) งานยาวจะแบ่งส่งทีละ 40 คิว ผลลัพธ์ยังไม่ถูกใส่จนกว่าจะกด "ใช้ข้อเสนอที่เลือก"' : 'หน้านี้เรียก Claude ไม่ได้ (เปิดนอก claude.ai) ใช้ปุ่ม "คัดลอก prompt" ไปวางใน Gemini / ChatGPT / Claude แล้ววางผลลัพธ์กลับมาได้'; });
}
function openAI(task) {
  if (task) $('aiTask').value = task;
  $('aiScope').value = S.multi.size > 1 ? 'sel' : $('aiScope').value;
  $('aiRules').value = S.view.aiRules;
  $('aiTier').value = S.view.aiTier;
  aiNote(); renderAIRes(); openM('mAI');
}
$('bAI').onclick = () => openAI();
$('aiRules').addEventListener('change', () => { S.view.aiRules = $('aiRules').value; saveSettings(); });
$('aiTier').addEventListener('change', () => { S.view.aiTier = $('aiTier').value; saveSettings(); });
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
  if (!Array.isArray(arr)) throw new Error('ผลลัพธ์ไม่ใช่ JSON array');
  let n = 0;
  for (const o of arr) {
    const k = parseInt(o && o.i, 10) - 1;
    if (!(k >= 0 && k < items.length) || typeof o.th !== 'string') continue;
    const [ei, ci] = items[k], th = o.th.replace(/\\N/g, '\n').replace(/\r/g, '').trim();
    const c = S.eps[ei].cues[ci];
    if (th === c.t) continue;
    AI.res = AI.res.filter(r => !(r.ei === ei && r.ci === ci));
    AI.res.push({ ei, ci, th, note: o.note || '', on: true }); n++;
  }
  AI.res.sort((a, b) => a.ei - b.ei || a.ci - b.ci);
  return n;
}
$('aiGo').onclick = async () => {
  const sample = await getSample();
  if (!sample) { aiNote(); return; }
  const task = $('aiTask').value, items = aiTargets(task, $('aiScope').value);
  if (!items.length) { $('aiProg').textContent = task === 'fill' ? 'ไม่มีคิวที่ยังว่างในขอบเขตนี้' : 'ไม่มีคิวในขอบเขตนี้'; return; }
  if (['fill', 'retrans', 'qa'].includes(task) && !items.some(([ei, ci]) => srcTextOf(S.eps[ei], S.eps[ei].cues[ci]))) { $('aiProg').textContent = 'คิวพวกนี้ไม่มี原文 ใส่ซับต้นฉบับก่อน (จับคู่ไฟล์)'; return; }
  S.view.aiRules = $('aiRules').value; saveSettings();
  AI.ctl = new AbortController();
  $('aiGo').disabled = true; $('aiStop').hidden = false;
  const B = 40, total = Math.ceil(items.length / B);
  let got = 0;
  try {
    for (let b = 0; b < total; b++) {
      const chunk = items.slice(b * B, (b + 1) * B);
      $('aiProg').textContent = `Claude กำลังทำชุด ${b + 1}/${total} (${chunk.length} คิว)…`;
      const arr = await sample.json(aiPrompt(task, chunk), { modelTier: $('aiTier').value, signal: AI.ctl.signal });
      got += takeResults(arr, chunk);
      renderAIRes();
    }
    $('aiProg').textContent = `เสร็จแล้ว ได้ข้อเสนอ ${got} คิว เลือกแล้วกด "ใช้ข้อเสนอที่เลือก"`;
  } catch (e) {
    const code = e && e.code;
    $('aiProg').textContent = code === 'cancelled' ? `หยุดแล้ว ได้ข้อเสนอ ${got} คิว` : code === 'not_granted' ? 'ไม่ได้อนุญาตให้หน้านี้ใช้ Claude' : code === 'rate_limited' ? 'ใช้ Claude ถี่เกินไปหรือถึงลิมิตการใช้งาน รอสักพักแล้วลองใหม่' : code === 'invalid_json' ? 'Claude ตอบกลับมาไม่ใช่ JSON ลองกดใหม่ หรือลดขอบเขตลง' : `เกิดข้อผิดพลาด: ${(e && (e.message || code)) || ''}`;
  } finally { $('aiGo').disabled = false; $('aiStop').hidden = true; AI.ctl = null; }
};
$('aiStop').onclick = () => { if (AI.ctl) AI.ctl.abort(); };
$('aiCopy').onclick = async () => {
  const task = $('aiTask').value, items = aiTargets(task, $('aiScope').value).slice(0, 500);
  if (!items.length) { $('aiProg').textContent = 'ไม่มีคิวในขอบเขตนี้'; return; }
  S.view.aiRules = $('aiRules').value; saveSettings();
  AI.pasteItems = items;
  const p = aiPrompt(task, items);
  try { await navigator.clipboard.writeText(p); $('aiProg').textContent = `คัดลอก prompt แล้ว (${items.length} คิว) ไปวางใน Gemini / ChatGPT แล้วนำผลลัพธ์มาวางด้วยปุ่ม "วางผลลัพธ์จาก AI อื่น"`; $('aiPromptBox').hidden = true; }
  catch (e) { $('aiPromptBox').value = p; $('aiPromptBox').hidden = false; $('aiPromptBox').select(); $('aiProg').textContent = 'คัดลอกอัตโนมัติไม่ได้ ก๊อปจากกล่องด้านล่างแทน'; }
};
$('aiPasteT').onclick = () => { $('aiPaste').hidden = !$('aiPaste').hidden; $('aiPasteBtns').hidden = $('aiPaste').hidden; if (!$('aiPaste').hidden) $('aiPaste').focus(); };
$('aiPasteGo').onclick = () => {
  const items = AI.pasteItems || aiTargets($('aiTask').value, $('aiScope').value).slice(0, 500);
  let txt = $('aiPaste').value.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) txt = fence[1];
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  try { const n = takeResults(JSON.parse(txt.slice(a, b + 1)), items); renderAIRes(); $('aiProg').textContent = `อ่านผลลัพธ์ได้ ${n} คิว`; }
  catch (e) { $('aiProg').textContent = 'อ่านผลลัพธ์ไม่ได้ ต้องเป็น JSON array แบบ [{"i":"1","th":"..."}]'; }
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
function openExport() {
  if (!realEps().length) { toast('ยังไม่มีไฟล์ซับจริง ลากไฟล์เข้ามาก่อน'); return; }
  flushDrafts();
  $('exName').value = defaultZipName();
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
  try {
    if ($('exSubs').checked) for (const ep of l.filter(e => e.kind !== 'xlsx')) {
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
    if ($('exXSrt').checked) for (const ep of xl.filter(e => !e.noTime)) {
      const nm = /\.srt$/i.test(ep.key) ? ep.key : safeName(ep.key) + '.srt';
      add(epEdited(ep) && suf ? addSuffix(nm) : nm, encodeFile(Object.assign({}, ep, { kind: 'srt', struct: true })));
    }
    if ($('exDz').checked) add(defaultZipName().replace(/\.zip$/, '').replace(/_修改$/, '') + '_中泰对照.xlsx', dzBook(l));
    if (!files.length) { $('exInfo').textContent = 'ยังไม่ได้เลือกไฟล์ที่จะส่งออก'; return; }
    let zn = $('exName').value.trim() || 'subtitles.zip';
    if (!/\.zip$/i.test(zn)) zn += '.zip';
    closeM('mExport');
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
  if (e.key === 'Escape') { document.querySelectorAll('.modal.open').forEach(m => closeM(m.id)); return; }
  const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
  if (mod && !e.altKey && k === 's') { e.preventDefault(); saveNow(true); return; }
  if (e.key === 'F1' || (mod && (k === '/' || e.code === 'Slash'))) { e.preventDefault(); openM('mKeys'); return; }
  if (document.querySelector('.modal.open')) return;
  if (mod && !e.shiftKey && k === 'e') { e.preventDefault(); $('bExport').click(); return; }
  if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); $('bFiles').click(); return; }
  if (mod && e.shiftKey && k === 'o') { e.preventDefault(); $('bDir').click(); return; }
  if (mod && e.shiftKey && k === 'q') { e.preventDefault(); $('bQA').click(); return; }
  if (mod && e.shiftKey && k === 'a') { e.preventDefault(); $('bAI').click(); return; }
  if (mod && !e.shiftKey && k === 'd') { e.preventDefault(); toggleDone(); return; }
  if (mod && !e.shiftKey && k === 'g') { e.preventDefault(); $('bGloss').click(); return; }
  if (mod && e.shiftKey && k === 'z' && !typing) { e.preventDefault(); undo(); return; }
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

/* ---------- start ---------- */
setSaveState('none');
$('bKeys').onclick = () => openM('mKeys');
setInterval(() => { if (saveMode === 'dirty') saveNow(false); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(false); });
$('oNext').checked = S.view.autoNext; $('oFollow').checked = S.view.follow; $('oOv').checked = S.view.overlay; $('oOvColor').checked = S.view.ovColor; $('oClickPlay').checked = S.view.clickPlay;
$('oPos').value = S.view.subPos; cap.style.bottom = S.view.subPos + '%';
$('rate').value = String(S.view.rate);
$('tSrc').setAttribute('aria-pressed', String(S.view.showSrc));
if (S.view.left) $('main').style.setProperty('--left', S.view.left + 'px');
SAMPLE.forEach(([n, t, s], i) => {
  const ep = makeEp(n, t, { sample: true });
  const src = makeSrc(n.replace('.srt', '_中文.srt'), s); src.sample = true;
  S.srcs.push(src); ep.src = i; S.eps.push(ep);
});
S.cur = 0; S.sel = { e: 0, c: 0 };
showPh(WELCOME);
syncThemeBtn();
renderAll(); updateTransport(); updateClock();
})();
