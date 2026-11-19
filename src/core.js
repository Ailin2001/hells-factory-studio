/* Pure subtitle logic: parsing, writing, counting, QA checks, fixes, zip/xlsx reading. No DOM. */
const SubCore = (() => {
'use strict';
const p2 = n => String(n).padStart(2, '0');
const uniq = a => [...new Set(a)];

/* ---------- time ---------- */
function toMs(str) {
  const m = String(str).trim().match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  return ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + parseInt((m[4] + '00').slice(0, 3), 10);
}
function fmt(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = ms % 1000;
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(x).padStart(3, '0')}`;
}
function fmtAss(ms) {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60, c = cs % 100;
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
}

/* ---------- text decoding ---------- */
function decode(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(u8.subarray(3)), bom: true, enc: 'utf-8' };
  if (u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), bom: true, enc: 'utf-16le' };
  if (u8[0] === 0xFE && u8[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(u8.subarray(2)), bom: true, enc: 'utf-16be' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), bom: false, enc: 'utf-8' }; } catch (e) {}
  const thai = new TextDecoder('windows-874').decode(u8);
  let gbk = null; try { gbk = new TextDecoder('gbk').decode(u8); } catch (e) {}
  if (gbk && (gbk.match(/[一-鿿]/g) || []).length > (thai.match(/[ก-๎]/g) || []).length) return { text: gbk, bom: false, enc: 'gbk' };
  return { text: thai, bom: false, enc: 'windows-874' };
}

/* ---------- SRT ---------- */
const TRE = /^\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})(\s*-->\s*)(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})(.*)$/;
const IDX = /^\s*\d+\s*$/;
function parseSrt(text) {
  const L = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < L.length) {
    const m = L[i].match(TRE);
    if (!m) { i++; continue; }
    const idx = (i > 0 && IDX.test(L[i - 1])) ? L[i - 1].trim() : null;
    i++;
    const tl = [];
    while (i < L.length) {
      const s = L[i];
      if (TRE.test(s)) break;
      if (IDX.test(s) && i + 1 < L.length && TRE.test(L[i + 1])) break;
      if (s.trim() === '') {
        let j = i;
        while (j < L.length && L[j].trim() === '') j++;
        if (j >= L.length || TRE.test(L[j]) || (IDX.test(L[j]) && j + 1 < L.length && TRE.test(L[j + 1]))) { i = j; break; }
      }
      tl.push(s); i++;
    }
    while (tl.length && tl[tl.length - 1].trim() === '') tl.pop();
    const t = tl.join('\n');
    out.push({ idx, s: m[1], sep: m[2], e: m[3], tail: m[4] || '', t, oS: m[1], oE: m[3], oT: t, sm: toMs(m[1]), em: toMs(m[3]) });
  }
  return out;
}
function buildSrt(ep) {
  const E = ep.eol;
  const body = ep.cues.map((c, i) => ((!ep.struct && c.idx != null) ? c.idx : String(i + 1)) + E + c.s + (c.sep || ' --> ') + c.e + (c.tail || '') + E + c.t.split('\n').join(E) + E).join(E);
  return body + (ep.trail ? E : '');
}

/* ---------- ASS ---------- */
function parseAss(text) {
  const lines = text.split('\n');
  const cues = [];
  let inEv = false, fm = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, ''), tr = l.trim();
    if (/^\[events\]/i.test(tr)) { inEv = true; continue; }
    if (/^\[/.test(tr)) { inEv = false; continue; }
    if (!inEv) continue;
    if (/^format\s*:/i.test(tr)) { fm = l.slice(l.indexOf(':') + 1).split(',').map(s => s.trim().toLowerCase()); continue; }
    const m = l.match(/^dialogue\s*:\s*/i);
    if (!m) continue;
    const f = fm || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const body = l.slice(m[0].length), parts = [];
    let p = 0;
    for (let k = 0; k < f.length - 1; k++) { const q = body.indexOf(',', p); if (q < 0) break; parts.push(body.slice(p, q)); p = q + 1; }
    if (parts.length !== f.length - 1) continue;
    const raw = body.slice(p), si = f.indexOf('start'), ei = f.indexOf('end');
    if (si < 0 || ei < 0) continue;
    const t = raw.replace(/\\N/g, '\n'), s = parts[si].trim(), e = parts[ei].trim();
    cues.push({ ass: true, line: i, head: l.slice(0, m[0].length), parts, f, raw, s, e, t, oS: s, oE: e, oT: t, sm: toMs(s), em: toMs(e), idx: null });
  }
  return { lines, cues, dlg: cues.map(c => c.line) };
}
function assLine(ep, c) {
  const L = ep.lines;
  if (c.line != null && c.t === c.oT && c.s === c.oS && c.e === c.oE) return L[c.line];
  const tpl = L[c.line != null ? c.line : c.tplLine] || '';
  const cr = tpl.endsWith('\r') ? '\r' : '';
  const parts = c.parts.slice();
  parts[c.f.indexOf('start')] = c.s;
  parts[c.f.indexOf('end')] = c.e;
  const text = (c.line != null && c.t === c.oT) ? c.raw : c.t.split('\n').join('\\N');
  return c.head + parts.join(',') + ',' + text + cr;
}
function buildAss(ep) {
  const L = ep.lines;
  if (!ep.struct) {
    const out = L.slice();
    for (const c of ep.cues) if (c.line != null) out[c.line] = assLine(ep, c);
    return out.join('\n');
  }
  const byLine = new Map();
  for (const c of ep.cues) if (c.line != null && !byLine.has(c.line)) byLine.set(c.line, c);
  const lead = [], after = new Map();
  let anchor = -1;
  for (const c of ep.cues) {
    if (c.line != null && byLine.get(c.line) === c) { anchor = c.line; continue; }
    if (anchor < 0) lead.push(c); else { if (!after.has(anchor)) after.set(anchor, []); after.get(anchor).push(c); }
  }
  const dl = new Set(ep.dlg || []);
  const first = (ep.dlg && ep.dlg.length) ? ep.dlg[0] : L.length;
  const out = [];
  L.forEach((line, i) => {
    if (i === first) lead.forEach(c => out.push(assLine(ep, c)));
    if (dl.has(i)) { const c = byLine.get(i); if (c) out.push(assLine(ep, c)); }
    else out.push(line);
    if (after.has(i)) after.get(i).forEach(c => out.push(assLine(ep, c)));
  });
  if (first >= L.length) lead.forEach(c => out.push(assLine(ep, c)));
  return out.join('\n');
}
function encodeFile(ep) {
  const body = new TextEncoder().encode(ep.kind === 'ass' ? buildAss(ep) : buildSrt(ep));
  if (!(ep.bom || ep.enc !== 'utf-8')) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xEF, 0xBB, 0xBF]); out.set(body, 3);
  return out;
}

/* ---------- counting ---------- */
const MARK = /\p{Mn}/u;
const INVIS = /[\u0000-\u001f\u007f​-‏‪-‮⁠﻿]/;
const stripTags = s => s.replace(/\{\\[^}]*\}/g, '').replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/\\h/g, ' ');
function seLen(line, countMarks) {
  let n = 0;
  for (const ch of stripTags(line)) { if (INVIS.test(ch)) continue; if (!countMarks && MARK.test(ch)) continue; n++; }
  return n;
}
const lineLen = (line, mode) => mode === 'len' ? [...stripTags(line)].length : seLen(line, false);
function cutIndex(l, mode, limit) {
  let n = 0, i = 0;
  for (const ch of l) {
    const c = mode === 'len' ? 1 : (INVIS.test(ch) || MARK.test(ch)) ? 0 : 1;
    if (c) { n++; if (n > limit) return i; }
    i += ch.length;
  }
  return l.length;
}
const THAI = /[ก-๎]/g;
function scriptOf(t) {
  const c = rx => (t.match(rx) || []).length;
  const zh = c(/[一-鿿]/g), ja = c(/[぀-ヿ]/g), ko = c(/[가-힯]/g), lat = c(/[A-Za-z]/g), th = c(THAI);
  const best = Math.max(zh, ja, ko, lat, th);
  if (!best) return 'other';
  if (best === th) return 'th';
  if (best === ja || (ja && zh && ja * 3 > zh)) return 'ja';
  if (best === zh) return 'zh';
  if (best === ko) return 'ko';
  return 'en';
}
const LANG_LABEL = { zh: '中文', ja: '日本語', ko: '한국어', en: 'EN', other: '原文', th: 'ไทย' };
function baseLen(t, lang) {
  if (lang === 'zh' || lang === 'ja') return (t.match(/[一-鿿぀-ヿ]/g) || []).length;
  if (lang === 'ko') return (t.match(/[가-힯]/g) || []).length;
  return (t.match(/\p{L}/gu) || []).length;
}

/* ---------- word segmentation ---------- */
const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
function segInfo(text) {
  const b = new Set([0, text.length]), toks = [];
  if (SEG) for (const s of SEG.segment(text)) { const e = s.index + s.segment.length; b.add(s.index); b.add(e); toks.push({ s: s.index, e, t: s.segment, w: !!s.isWordLike }); }
  return { b, toks, ok: !!SEG };
}
const LEAD = /[เ-ไ]/, TMARK = /[ัิ-ฺ็-๎]/;
function wordOk(text, i, e, si, relax) {
  if (TMARK.test(text[e] || '')) return false;
  if (LEAD.test(text[i - 1] || '')) return false;
  if (!si.ok) return true;
  if (si.b.has(i) && si.b.has(e)) return true;
  if (relax) return e === text.length || /\s/.test(text[e]);
  return false;
}
function findTagged(text, entries, si, block) {
  const out = [], taken = new Uint8Array(text.length + 1);
  if (block) for (const w of block) { let i = text.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) taken[k] = 1; i = text.indexOf(w, i + 1); } }
  for (const en of entries) {
    const w = en.w; if (!w) continue;
    let i = text.indexOf(w);
    while (i >= 0) {
      const e = i + w.length;
      if (wordOk(text, i, e, si, en.relax)) {
        let free = true; for (let k = i; k < e; k++) if (taken[k]) { free = false; break; }
        if (free) { for (let k = i; k < e; k++) taken[k] = 1; out.push(Object.assign({ s: i, e }, en)); }
      }
      i = text.indexOf(w, i + 1);
    }
  }
  return out.sort((a, b) => a.s - b.s);
}
function findSpell(text, pairs) {
  const out = [], taken = new Uint8Array(text.length + 1);
  for (const [w, r] of pairs) {
    let i = text.indexOf(w);
    while (i >= 0) {
      const e = i + w.length;
      const ok = !TMARK.test(text[e] || '') && !LEAD.test(text[i - 1] || '') && (w.length > 3 || !/[ก-ฮ]/.test(text[e] || ''));
      let free = ok; if (ok) for (let k = i; k < e; k++) if (taken[k]) { free = false; break; }
      if (free) { for (let k = i; k < e; k++) taken[k] = 1; out.push({ s: i, e, w, r }); }
      i = text.indexOf(w, i + 1);
    }
  }
  return out.sort((a, b) => a.s - b.s);
}

/* ---------- lexicon ---------- */
const DEF_LEX = {
  maleP: 'ครับ ครับผม นะครับ คร้าบ คับ ขอรับ พ่ะย่ะค่ะ พะยะค่ะ',
  femaleP: 'ค่ะ คะ นะคะ ค๊ะ ค้า เจ้าค่ะ เจ้าคะ เพคะ',
  neutralP: 'นะ น่ะ จ้ะ จ๊ะ จ้า จ๋า สิ ซิ ล่ะ หรอก เถอะ เถิด เนอะ ฮะ หนา เน้อ วะ ว่ะ โว้ย เว้ย ย่ะ',
  maleR: 'ผม กระผม กระหม่อม เกล้ากระผม',
  femaleR: 'ดิฉัน หม่อมฉัน อิฉัน หนู',
  polite: 'ครับ ครับผม นะครับ คร้าบ คับ ขอรับ พ่ะย่ะค่ะ พะยะค่ะ ค่ะ คะ นะคะ ค๊ะ เจ้าค่ะ เจ้าคะ เพคะ จ้ะ จ๊ะ',
  prof: 'กู มึง เหี้ย เชี่ย สัส แม่ง อีห่า ตายห่า ควย เย็ด หี หมอย ร่าน กะหรี่ อีกะหรี่ อีดอกทอง อีตอแหล อีควาย พ่อมึง แม่มึง จัญไร เจ๊ก นิโกร อีดำ',
  period: 'ครับ > ขอรับ\nค่ะ > เจ้าค่ะ\nคะ > เจ้าคะ\nนะครับ > นะ/ขอรับ\nนะคะ > นะ/เจ้าคะ\nผม > ข้า\nฉัน > ข้า\nคุณ > ท่าน/เจ้า\nเธอ > เจ้า\nนาย > เจ้า/ท่าน\nแก > เจ้า\nไหม > หรือไม่\nมั้ย > หรือไม่\nเหรอ > หรือ\nหรอ > หรือ\nยังไง > อย่างไร\nงั้น > เช่นนั้น\nแบบนี้ > เช่นนี้\nแบบนั้น > เช่นนั้น\nเมื่อไหร่ > เมื่อใด\nเถอะ > เถิด\nโอเค > ตกลง\nเปิ่นกง > ข้า\nเจิ้น > เรา/ข้า',
  modern: 'ข้า > ฉัน/ผม\nข้าน้อย > ผม/ฉัน\nเจ้า > เธอ/นาย\nท่านพ่อ > พ่อ\nท่านแม่ > แม่\nกระหม่อม >\nหม่อมฉัน >\nอิฉัน > ฉัน\nเพคะ >\nพ่ะย่ะค่ะ >\nขอรับ > ครับ\nเจ้าค่ะ > ค่ะ\nเจ้าคะ > คะ',
  spell: 'อนุญาติ > อนุญาต\nสังเกตุ > สังเกต\nลายเซ็นต์ > ลายเซ็น\nกระทันหัน > กะทันหัน\nนะค่ะ > นะคะ\nนะค๊ะ > นะคะ\nค๊ะ > คะ\nหรอ > เหรอ\nหล่ะ > ล่ะ\nราชวงค์ > ราชวงศ์\nโอกาศ > โอกาส\nปฎิบัติ > ปฏิบัติ\nปฎิเสธ > ปฏิเสธ\nปรากฎ > ปรากฏ\nกฏ > กฎ\nผลลัพท์ > ผลลัพธ์\nรสชาด > รสชาติ\nศรีษะ > ศีรษะ\nอิสระภาพ > อิสรภาพ\nสัญญลักษณ์ > สัญลักษณ์\nคำนวน > คำนวณ\nทรมาณ > ทรมาน\nบุคคลากร > บุคลากร\nเครื่องสำอางค์ > เครื่องสำอาง\nไอศครีม > ไอศกรีม\nคุ้กกี้ > คุกกี้\nอีเมล์ > อีเมล\nโน๊ต > โน้ต\nฟังก์ชั่น > ฟังก์ชัน\nเวอร์ชั่น > เวอร์ชัน\nผาสุข > ผาสุก\nกงศุล > กงสุล\nดำรงค์ > ดำรง\nลูกเกต > ลูกเกด\nเกมส์ > เกม\nช็อค > ช็อก\nโควต้า > โควตา\nสาระพัด > สารพัด\nอัฒจรรย์ > อัฒจันทร์\nเอ็นจอย > เอนจอย\nกะเพาะ > กระเพาะ\nกระเพรา > กะเพรา\nกังวาล > กังวาน\nกากบาด > กากบาท\nกาละเทศะ > กาลเทศะ\nกิติมศักดิ์ > กิตติมศักดิ์\nเกล็ดความรู้ > เกร็ดความรู้\nเกษียนอายุ > เกษียณอายุ\nขะโมย > ขโมย\nข้าวเหนียวมูล > ข้าวเหนียวมูน\nไข่มุข > ไข่มุก\nคลินิค > คลินิก\nคัดสรรค์ > คัดสรร\nโครงการณ์ > โครงการ\nฆาตรกร > ฆาตกร\nฆาตรกรรม > ฆาตกรรม\nจลาจน > จลาจล\nจักรพรรดิ์ > จักรพรรดิ\nจารไน > จาระไน\nจำนงค์ > จำนง\nเจตนารมย์ > เจตนารมณ์\nฉนั้น > ฉะนั้น\nชงัก > ชะงัก\nซีรี่ส์ > ซีรีส์\nทราบซึ้ง > ซาบซึ้ง\nดาดดื่น > ดาษดื่น\nดึกดำบรรพ > ดึกดำบรรพ์\nตระเวณ > ตระเวน\nทะเลสาป > ทะเลสาบ\nธุระกิจ > ธุรกิจ\nนวตกรรม > นวัตกรรม\nนัยตา > นัยน์ตา\nนานับประการ > นานัปการ\nบิณฑบาตร > บิณฑบาต\nบุคคลิก > บุคลิก\nบัลลังค์ > บัลลังก์\nปฎิกิริยา > ปฏิกิริยา\nปฎิทิน > ปฏิทิน\nปฎิวัติ > ปฏิวัติ\nปฎิญาณ > ปฏิญาณ\nประสพการณ์ > ประสบการณ์\nประสพความสำเร็จ > ประสบความสำเร็จ\nประสพอุบัติเหตุ > ประสบอุบัติเหตุ\nปลาบปลิ้ม > ปลาบปลื้ม\nผลัดวันประกันพรุ่ง > ผัดวันประกันพรุ่ง\nผูกพันธ์ > ผูกพัน\nพงษาวดาร > พงศาวดาร\nพรรณา > พรรณนา\nพิศดาร > พิสดาร\nเพชรฆาต > เพชฌฆาต\nภาพยนต์ > ภาพยนตร์\nมงกุฏ > มงกุฎ\nมนุษย์สัมพันธ์ > มนุษยสัมพันธ์\nมหัสจรรย์ > มหัศจรรย์\nมัสหมั่น > มัสมั่น\nมุขตลก > มุกตลก\nรื่นรมณ์ > รื่นรมย์\nริดรอน > ลิดรอน\nเลือกสรรค์ > เลือกสรร\nโลกาภิวัฒน์ > โลกาภิวัตน์\nสาบแช่ง > สาปแช่ง\nสาปสูญ > สาบสูญ\nสีสรร > สีสัน\nหลงไหล > หลงใหล\nหลับไหล > หลับใหล\nอะหลั่ย > อะไหล่\nอานิสงฆ์ > อานิสงส์\nอัพเดท > อัปเดต\nอัพเดต > อัปเดต\nกรุนา > กรุณา\nศรัตรู > ศัตรู\nพิถิพิถัน > พิถีพิถัน\nมาตราฐาน > มาตรฐาน\nอุปสรรค์ > อุปสรรค\nเทคโนโลยี่ > เทคโนโลยี\nแอพพลิเคชั่น > แอปพลิเคชัน\nแอพพลิเคชัน > แอปพลิเคชัน\nอินเตอร์เน็ต > อินเทอร์เน็ต\nอินเตอร์เน็ท > อินเทอร์เน็ต\nคอนเสริต > คอนเสิร์ต\nซอฟท์แวร์ > ซอฟต์แวร์\nเซ็นต์สัญญา > เซ็นสัญญา\nลิฟท์ > ลิฟต์\nคริสมาส > คริสต์มาส\nสตอเบอรี่ > สตรอว์เบอร์รี\nบัตรเครดิท > บัตรเครดิต\nเครดิท > เครดิต\nดิจิตอล > ดิจิทัล\nโน๊ตบุ๊ค > โน้ตบุ๊ก\nโน้ตบุ๊ค > โน้ตบุ๊ก\nบล๊อก > บล็อก\nเค๊ก > เค้ก\nช้อปปิ้ง > ช็อปปิ้ง\nแทปเลต > แท็บเล็ต\nอะลุ่มอล่วย > อะลุ้มอล่วย\nเบญจเพศ > เบญจเพส\nสัมนา > สัมมนา\nทะยอย > ทยอย\nทนุถนอม > ทะนุถนอม\nเหม็นสาป > เหม็นสาบ\nปิคนิค > ปิกนิก\nเปอร์เซนต์ > เปอร์เซ็นต์\nบังสกุล > บังสุกุล\nจรเข้ > จระเข้\nตระกร้า > ตะกร้า\nตระไคร้ > ตะไคร้\nสใภ้ > สะใภ้\nกระทิ > กะทิ\nกาละมัง > กะละมัง\nกลาสี > กะลาสี\nเครื่องลาง > เครื่องราง\nสถิตย์ > สถิต\nชักกะเย่อ > ชักเย่อ\nอุตสาห์ > อุตส่าห์\nเกียรติ์ > เกียรติ\nญาติ์ > ญาติ\nโครต > โคตร\nนาลิกา > นาฬิกา\nฟ้าแลป > ฟ้าแลบ\nเวทย์มนต์ > เวทมนตร์\nเวทย์มนตร์ > เวทมนตร์\nเวทมนต์ > เวทมนตร์\nองค์รักษ์ > องครักษ์\nอาจารณ์ > อาจารย์\nจอมยุทธ์ > จอมยุทธ\nยุทธ์ภพ > ยุทธภพ\nวิทยายุทธ์ > วิทยายุทธ\nปรมาจารณ์ > ปรมาจารย์\nฮองเต้ > ฮ่องเต้\nอาวุท > อาวุธ\nปีสาจ > ปีศาจ\nสวรรณ์ > สวรรค์\nวิญญาน > วิญญาณ\nหลักฐาณ > หลักฐาน\nบริษัธ > บริษัท\nธนาคาน > ธนาคาร\nโรงพญาบาล > โรงพยาบาล\nอุบัตเหตุ > อุบัติเหตุ\nโทรศัพย์ > โทรศัพท์\nไปรษนีย์ > ไปรษณีย์\nขอโทด > ขอโทษ\nทุเรด > ทุเรศ\nเกลงใจ > เกรงใจ\nอนาคด > อนาคต\nอดีด > อดีต\nประวัติศาสต์ > ประวัติศาสตร์\nวิทยาศาสต์ > วิทยาศาสตร์\nเศรฐกิจ > เศรษฐกิจ\nเศรษฐี่ > เศรษฐี\nทรัพสิน > ทรัพย์สิน\nพิสูทธิ์ > พิสูจน์\nยุตธรรม > ยุติธรรม\nอนุเสาวรีย์ > อนุสาวรีย์\nสังสรรณ์ > สังสรรค์\nสร้างสรรณ์ > สร้างสรรค์\nริศยา > ริษยา\nผเอิญ > เผอิญ\nผิวพรรน > ผิวพรรณ\nพรรยา > ภรรยา\nมารยาด > มารยาท\nขมักเขม้น > ขะมักเขม้น\nไหลตาย > ใหลตาย\nเบรค > เบรก\nบุฟเฟ่ต์ > บุฟเฟต์\nแซนวิช > แซนด์วิช\nตุ้กตา > ตุ๊กตา\nเนี้ย > เนี่ย\nปราณีต > ประณีต\nกระตือรือล้น > กระตือรือร้น\nไหมค่ะ > ไหมคะ\nมั้ยค่ะ > มั้ยคะ\nเหรอค่ะ > เหรอคะ\nหรือเปล่าค่ะ > หรือเปล่าคะ\nทำไมค่ะ > ทำไมคะ\nยังไงค่ะ > ยังไงคะ\nที่ไหนค่ะ > ที่ไหนคะ\nเมื่อไหร่ค่ะ > เมื่อไหร่คะ\nขอบคุณคะ > ขอบคุณค่ะ\nสวัสดีคะ > สวัสดีค่ะ\nขอโทษคะ > ขอโทษค่ะ',
  spellEn: 'recieve > receive\nrecieved > received\ndefinately > definitely\nseperate > separate\noccured > occurred\nuntill > until\nwich > which\nteh > the\nbecuase > because\nbeleive > believe\nalot > a lot\nthier > their\ntruely > truly\ngoverment > government\ntommorow > tomorrow\ntomorow > tomorrow\naccomodate > accommodate\nwierd > weird\nfreind > friend\nbegining > beginning\ncomming > coming\nneccessary > necessary\noccassion > occasion\ndissapear > disappear\nembarass > embarrass\nexistance > existence\nforiegn > foreign\ngaurd > guard\nhappend > happened\nimmediatly > immediately\nindependant > independent\nknowlege > knowledge\nnoticable > noticeable\npersistant > persistent\nposession > possession\nprefered > preferred\npublically > publicly\nremeber > remember\nresponsability > responsibility\nsuccesful > successful\nsuprise > surprise\nunfortunatly > unfortunately\nyoure > you\'re\ndont > don\'t\ndidnt > didn\'t\ndoesnt > doesn\'t\nisnt > isn\'t\nwasnt > wasn\'t\ncouldnt > couldn\'t\nshouldnt > shouldn\'t\nwouldnt > wouldn\'t\nhavent > haven\'t\nim > I\'m\nive > I\'ve\nlets go > let\'s go\nyour welcome > you\'re welcome\ncould of > could have\nshould of > should have\nwould of > would have',
  spellZh: '以经 > 已经\n己经 > 已经\n自已 > 自己\n在见 > 再见\n做为 > 作为\n按装 > 安装\n既使 > 即使\n必竟 > 毕竟\n一但 > 一旦\n迫不急待 > 迫不及待\n再接再励 > 再接再厉\n谈笑风声 > 谈笑风生\n默守成规 > 墨守成规\n穿流不息 > 川流不息\n甘败下风 > 甘拜下风\n走头无路 > 走投无路\n一愁莫展 > 一筹莫展\n关怀倍至 > 关怀备至\n不径而走 > 不胫而走\n按步就班 > 按部就班\n震憾 > 震撼\n松驰 > 松弛\n精萃 > 精粹\n辨论 > 辩论\n布署 > 部署\n幅射 > 辐射\n气慨 > 气概\n帐号 > 账号\n渡假 > 度假\n煤体 > 媒体\n侯车 > 候车\n暴燥 > 暴躁\n烦燥 > 烦躁\n安祥 > 安详\n针贬 > 针砭\n家俱 > 家具\n装璜 > 装潢\n九宵 > 九霄\n兴高彩烈 > 兴高采烈\n名符其实 > 名副其实\n一股作气 > 一鼓作气\n莫明其妙 > 莫名其妙\n出奇不意 > 出其不意\n一如继往 > 一如既往\n饮鸠止渴 > 饮鸩止渴\n世外桃园 > 世外桃源\n黄梁美梦 > 黄粱美梦\n鬼鬼崇崇 > 鬼鬼祟祟\n破斧沉舟 > 破釜沉舟\n人情事故 > 人情世故\n有持无恐 > 有恃无恐\n挖墙角 > 挖墙脚\n即然 > 既然\n不可思义 > 不可思议\n哭笑不的 > 哭笑不得',
  allow: 'ตัดผม สระผม ทรงผม เส้นผม หวีผม ย้อมผม มัดผม ผูกผม ไดร์ผม ผมยาว ผมสั้น ผมหงอก ผมร่วง ผมเปีย ผมม้า ปิ่นปักผม ร้านทำผม ช่างทำผม ทำผม ผมขาว ผมดำ ผมเผ้า เกล้าผม ถักผม ไรผม ผมหยิก ผมตรง คุณหนู คุณชาย คุณหญิง คุณนาย คุณท่าน คุณธรรม คุณค่า คุณภาพ คุณสมบัติ คุณประโยชน์ บุญคุณ ขอบคุณ นายท่าน นายน้อย นายหญิง นายพล นายกอง นายอำเภอ นายก นายทุน นายหน้า นายจ้าง เจ้านาย นายทหาร แกง แกล้ง เจ้าหน้าที่ เจ้านาย เจ้าของ เจ้าสาว เจ้าบ่าว เจ้าภาพ เจ้าชาย เจ้าหญิง เจ้าพ่อ เจ้าแม่ เจ้าตัว เจ้ามือ เจ้าหนี้ เจ้าเล่ห์ เจ้าถิ่น เจ้าประจำ เจ้าที่ เจ้าอาวาส เจ้าพระยา เจ้าเมือง เจ้าสำนัก เจ้ากรม ข้าราชการ ข้าราชบริพาร ข้าวของ ผ้าไหม ไหมพรม ไหมขัดฟัน',
  conj: 'แต่ ที่ ว่า เพื่อ เพราะ ถ้า หาก ก็ และ หรือ แล้ว จึง เมื่อ ซึ่ง โดย จน ตั้งแต่ แม้'
};
const words = s => uniq(String(s || '').split(/[\s,，、]+/).map(x => x.trim()).filter(Boolean));
const pairs = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => { const m = l.split(/\s*(?:>|→)\s*/); return [m[0].trim(), (m[1] || '').trim()]; }).filter(p => p[0]);
const byLen = (a, b) => b.w.length - a.w.length;
function compileLex(lx) {
  const polite = new Set(words(lx.polite));
  const E = [];
  const push = (list, c, g, part) => { for (const w of list) E.push({ w, c, g, part, relax: part, polite: polite.has(w) }); };
  push(words(lx.maleP), 'gm', 'm', true);
  push(words(lx.femaleP), 'gf', 'f', true);
  push(words(lx.neutralP), 'pt', '', true);
  push(words(lx.maleR), 'gm gr', 'm', false);
  push(words(lx.femaleR), 'gf gr', 'f', false);
  const seen = new Set();
  const entries = E.filter(e => !seen.has(e.w) && seen.add(e.w)).sort(byLen);
  const tag = list => list.map(([w, r]) => ({ w, r, c: 'era' })).sort(byLen);
  return {
    entries,
    parts: entries.filter(e => e.part).map(e => e.w),
    profE: words(lx.prof).map(w => ({ w, c: 'bad' })).sort(byLen),
    periodE: tag(pairs(lx.period)), modernE: tag(pairs(lx.modern)),
    spell: pairs(lx.spell).filter(p => p[1]).sort((a, b) => b[0].length - a[0].length),
    spellEn: pairs(lx.spellEn).filter(p => p[1]).map(([w, r]) => ({ w, r, rx: new RegExp('(?<![A-Za-z\'])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?![A-Za-z\'])', 'gi') })),
    spellZh: pairs(lx.spellZh).filter(p => p[1]).sort((a, b) => b[0].length - a[0].length),
    conj: words(lx.conj),
    allow: words(lx.allow).sort((a, b) => b.length - a.length)
  };
}

/* ---------- check catalogue ---------- */
const CAT = {
  over: ['e', 'เกินลิมิต'], lines: ['e', 'เกินจำนวนบรรทัด'], empty: ['e', 'คิวว่าง'], zero: ['e', 'เวลาจบผิด'], overlap: ['e', 'ไทม์โค้ดซ้อน'],
  cjk: ['e', 'อักษรจีนหลุด'], dupmark: ['e', 'สระ/วรรณยุกต์ซ้ำ'], spell: ['e', 'คำสะกดผิด'], prof: ['e', 'คำหยาบ'], brk: ['e', 'วงเล็บไม่ครบคู่'],
  cps: ['w', 'CPS เกิน'], short: ['w', 'คิวสั้นเกิน'], yamok: ['w', 'ๆ ไม่เว้นวรรค'], space: ['w', 'เว้นวรรคเกิน'], punct: ['w', 'เครื่องหมายต้องห้าม'],
  stutter: ['w', 'ตะกุกตะกักแบบใส่จุด'], hehe: ['w', 'หึหึ → หึ ๆ'], dense: ['w', 'หางเสียงถี่'], polite: ['w', 'มีหางเสียงสุภาพ'], mixg: ['w', 'ชาย+หญิงในคิวเดียว'], vgender: ['w', 'เสียงไม่ตรงหางเสียง'],
  era: ['w', 'คำไม่เข้ายุค'], lstart: ['w', 'ขึ้นบรรทัดด้วย ๆ/คำลงท้าย'], tear: ['w', 'ตัดบรรทัดกลางคำ'], card: ['w', '画面字ปนบทพูด'], dash: ['w', 'รูปแบบสองคนพูด'],
  bspace: ['w', 'เว้นวรรคชิดวงเล็บ/='], bwidth: ['w', 'ชนิดวงเล็บผิด'], repeat: ['w', 'คำซ้ำติดกัน'], srcbrk: ['w', 'วงเล็บไม่ตรง原文'], gloss: ['w', '术语ไม่ตรง'], miss: ['w', '原文ไม่มีคำแปล'],
  canjoin: ['i', 'รวมบรรทัดได้'], latin: ['i', 'มีอักษรอังกฤษ'], long: ['i', 'คิวยาวเกิน'], ratio: ['i', 'ยาว/สั้นผิดปกติเทียบ原文'], nosrc: ['i', 'ไม่มี原文ตรงเวลา'],
  num: ['i', 'ตัวเลขไม่ตรง原文'], money: ['i', 'ค่าเงิน'],
  typo: ['e', 'พิมพ์ผิด'], script: ['e', 'อักษรผิดภาษา']
};
const FIXABLE = new Set(['typo', 'yamok', 'space', 'dupmark', 'spell', 'hehe', 'canjoin', 'punct', 'bwidth', 'bspace', 'dash']);
const BASE = { mode: 'len', limit: 40, maxLines: 2, cpsMax: 0, cpsMode: 'len', minDur: 0, maxDur: 0, punct: 'strict', particles: 'dense', denseN: 3, bracket: 'half' };
const PRESETS = [
  ['hf', "มาตรฐาน Hell's Factory · len 40", Object.assign({}, BASE), 'th'],
  ['se40', 'SE 40 · 2 บรรทัด', Object.assign({}, BASE, { mode: 'se' }), 'th'],
  ['wetvh', 'WeTV แนวนอน · len 40 · CPS 25', Object.assign({}, BASE, { cpsMax: 25, minDur: 833, maxDur: 7000, punct: 'off' }), 'th'],
  ['wetvv', 'WeTV แนวตั้ง · len 24 · CPS 25', Object.assign({}, BASE, { limit: 24, cpsMax: 25, minDur: 833, maxDur: 7000, punct: 'off' }), 'th'],
  ['yw', 'YW แนวตั้ง · len 25', Object.assign({}, BASE, { limit: 25, punct: 'off' }), 'th'],
  ['v30', 'แนวตั้ง · len 30 · CPS 30', Object.assign({}, BASE, { limit: 30, cpsMax: 30 }), 'th'],
  ['se35', 'SE 35 · 2 บรรทัด', Object.assign({}, BASE, { mode: 'se', limit: 35 }), 'th'],
  ['dub20', 'พากย์ AI · SE 20', Object.assign({}, BASE, { mode: 'se', limit: 20 }), 'th'],
  ['zh16', 'ซับจีน · 16 ตัว · 1 บรรทัด', Object.assign({}, BASE, { limit: 16, maxLines: 1, particles: 'off', bracket: 'full' }), 'zh'],
  ['zh18', 'ซับจีน · 18 ตัว · 2 บรรทัด', Object.assign({}, BASE, { limit: 18, particles: 'off', bracket: 'full' }), 'zh'],
  ['zhv', 'ซับจีนแนวตั้ง · 12 ตัว', Object.assign({}, BASE, { limit: 12, particles: 'off', bracket: 'full' }), 'zh'],
  ['en42', 'ซับอังกฤษ · 42 ตัว · CPS 20', Object.assign({}, BASE, { limit: 42, cpsMax: 20, punct: 'off', particles: 'off' }), 'en'],
  ['en32v', 'ซับอังกฤษแนวตั้ง · 32 ตัว', Object.assign({}, BASE, { limit: 32, cpsMax: 20, punct: 'off', particles: 'off' }), 'en']
];
const presetsFor = tgt => PRESETS.filter(p => (p[3] || 'th') === (tgt || 'th'));
const DEF_CFG = Object.assign({ preset: 'hf' }, BASE, { era: 'off', ratioLo: 1.2, ratioHi: 4.5, off: [], src: 'auto', tgt: 'th' });
function cfgForTarget(tgt, src) {
  const p = presetsFor(tgt)[0];
  return Object.assign({}, DEF_CFG, p ? p[2] : {}, { preset: p ? p[0] : 'custom', tgt: tgt || 'th', src: src || 'auto' });
}
const TGT_NAME = { th: 'ไทย', zh: 'จีน', en: 'อังกฤษ' };
const DENS = { zh: 1, ja: 1, ko: 1.67, th: 3, en: 3.1, other: 3 };

const lineOf = (offs, pos) => { let i = 0; while (i + 1 < offs.length && offs[i + 1] <= pos) i++; return i; };
function joinLines(ls) {
  return ls.reduce((a, b) => {
    a = a.replace(/\s+$/, ''); b = b.replace(/^\s+/, '');
    if (!a) return b; if (!b) return a;
    const sp = /[ๆ!?.,…:;]$/.test(a) || (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b));
    return a + (sp ? ' ' : '') + b;
  });
}
function glossCompile(list) {
  return (list || []).filter(g => g.src && g.th).map(g => {
    const lat = /[A-Za-z]/.test(g.src) && !/[一-鿿]/.test(g.src);
    return { src: g.src, th: g.th, lat, rx: lat ? new RegExp('\\b' + g.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null };
  }).filter(g => g.lat ? g.src.length >= 3 : g.src.length >= 2);
}
const glossIn = (st, g) => g.lat ? g.rx.test(st) : st.includes(g.src);

/* ---------- analysis ---------- */
function analyzeEpisode(cues, src, cfg, L, gloss, opt) {
  opt = opt || {};
  const off = new Set(cfg.off || []);
  const R = cues.map(() => ({ iss: [], marks: [], g: '', cps: null, src: null, ends: false, ov: false }));
  const add = (k, code, msg) => { if (!off.has(code) && !R[k].iss.some(x => x.code === code && x.msg === msg)) R[k].iss.push({ code, sev: CAT[code][0], msg }); };
  let owners = null;
  const lang = src && src.length ? scriptOf(src.slice(0, 80).map(s => s.t).join(' ')) : null;
  if (src && src.length) {
    owners = new Uint16Array(src.length);
    cues.forEach((c, k) => {
      const list = [], dc = c.em - c.sm;
      for (let j = 0; j < src.length; j++) {
        const s = src[j], ov = Math.min(c.em, s.em) - Math.max(c.sm, s.sm);
        if (ov > 0 && ov >= Math.min(300, 0.3 * Math.min(dc, s.em - s.sm))) list.push(j);
      }
      R[k].src = list; list.forEach(j => owners[j]++);
    });
  }
  const T = cfg.tgt || 'th', TH = T === 'th';
  cues.forEach((c, k) => {
    const t = c.t, lines = t.split('\n'), o = R[k], si = segInfo(t);
    const offs = []; { let p = 0; for (const l of lines) { offs.push(p); p += l.length + 1; } }
    const mk = (s, e, cl) => o.marks.push({ s, e, c: cl });
    const scan = (rx, fn) => { rx.lastIndex = 0; let m; while ((m = rx.exec(t))) { if (m[0] === '') { rx.lastIndex++; continue; } fn(m); } };
    let f;
    if (!t.trim()) add(k, 'empty', 'คิวว่าง');
    lines.forEach((l, i) => {
      const n = lineLen(l, cfg.mode);
      if (n > cfg.limit) {
        add(k, 'over', `บรรทัด ${i + 1}: ${n}/${cfg.limit} ${cfg.mode === 'se' ? 'SE' : 'len'}`);
        const cut = cutIndex(l, cfg.mode, cfg.limit);
        if (cut < l.length) mk(offs[i] + cut, offs[i] + l.length, 'ovf');
        o.ov = true;
      }
    });
    if (lines.length > cfg.maxLines) { add(k, 'lines', `${lines.length} บรรทัด (สูงสุด ${cfg.maxLines})`); o.ov = true; }
    const dur = c.em - c.sm;
    if (!(dur > 0)) add(k, 'zero', 'เวลาจบไม่มากกว่าเวลาเริ่ม');
    else {
      o.cps = lineLen(lines.join(''), cfg.cpsMode || 'len') / (dur / 1000);
      if (cfg.cpsMax > 0 && o.cps > cfg.cpsMax) add(k, 'cps', `CPS ${o.cps.toFixed(1)} > ${cfg.cpsMax}`);
      if (cfg.minDur > 0 && dur < cfg.minDur) add(k, 'short', `ยาว ${(dur / 1000).toFixed(2)} วิ (ขั้นต่ำ ${(cfg.minDur / 1000).toFixed(2)})`);
      if (cfg.maxDur > 0 && dur > cfg.maxDur) add(k, 'long', `ยาว ${(dur / 1000).toFixed(1)} วิ`);
    }
    if (!opt.ass && k + 1 < cues.length && c.em > cues[k + 1].sm) add(k, 'overlap', `ทับคิวถัดไป ${c.em - cues[k + 1].sm} ms`);

    if (TH) { f = false; scan(/[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]+/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'cjk', 'มีอักษรจีน/ญี่ปุ่น/เกาหลีในคำแปล'); }
    else { f = false; scan(T === 'zh' ? /[ก-๛]+/g : /[ก-๛\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]+/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'script', T === 'zh' ? 'มีอักษรไทยในซับจีน' : 'มีอักษรไทย/จีนในซับอังกฤษ'); }
    if (T !== 'en' && /[A-Za-z]{2,}/.test(stripTags(t))) add(k, 'latin', 'มีอักษรอังกฤษ');
    f = false; scan(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, m => { mk(m.index, m.index + 1, 'bad'); f = true; }); if (f) add(k, 'typo', 'มีอักขระมองไม่เห็น (ก๊อปมาจากที่อื่น)');
    if (/[\u0e01-\u0e5b]/.test(t)) {
      const ty = [];
      const tyScan = (rx, msg) => { let hit = false; scan(rx, m => { mk(m.index, m.index + m[0].length, 'bad'); hit = true; }); if (hit) ty.push(msg); };
      tyScan(/\u0e40\u0e40/g, 'เเ (เ สองตัว) ควรเป็น แ');
      tyScan(/\u0e4d\u0e32/g, 'ํา ควรเป็น ำ');
      tyScan(/[\u0e48-\u0e4b][\u0e31\u0e34-\u0e37\u0e47]/g, 'วรรณยุกต์อยู่ก่อนสระบน');
      tyScan(/[\u0e48-\u0e4b][\u0e48-\u0e4b]|[\u0e31\u0e34-\u0e37][\u0e31\u0e34-\u0e37]|[\u0e38-\u0e3a][\u0e38-\u0e3a]/g, 'สระ/วรรณยุกต์ซ้อนกันสองตัว');
      tyScan(/(?:^|(?<=[^\u0e01-\u0e2e\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]))[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/gm, 'สระหรือวรรณยุกต์ลอย ไม่มีพยัญชนะ');
      tyScan(/[\u0e40-\u0e44](?![\u0e01-\u0e2e])/g, 'สระหน้า (เ แ โ ใ ไ) ไม่มีพยัญชนะตาม');
      tyScan(/\u0e46\s*\u0e46/g, 'ๆ ซ้ำ');
      if (ty.length) add(k, 'typo', ty.join(' · '));
    }
    if (TH) { f = false; scan(/(?<=\S)ๆ|ๆ(?=\S)/g, m => { mk(m.index, m.index + 1, 'bad'); f = true; }); if (f) add(k, 'yamok', 'ๆ ต้องเว้นวรรคหน้าและหลัง'); }
    f = false; scan(/ {2,}|^ +| +$/gm, m => { mk(m.index, m.index + m[0].length, 'sp'); f = true; }); if (f) add(k, 'space', 'เว้นวรรคซ้อน หรือมีช่องว่างหัว/ท้ายบรรทัด');
    f = false; scan(/([ัิ-ฺ็-๎])\1+/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'dupmark', 'พิมพ์สระ/วรรณยุกต์ซ้ำ');
    if (cfg.punct === 'strict' && TH) { f = false; scan(/[!?！？;"“”…]+|\.{2,}|[.,](?=[ \t]*$)|(?<!\d),|,(?!\d)/gm, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'punct', 'มี ! ? … , . " ; ในประโยค'); }
    if (cfg.punct === 'strict' && T === 'zh') { f = false; scan(/[，。；、,;]+|(?<!\d)\.(?!\d)/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'punct', 'ซับจีนไม่ใช้ ，。；、 ให้เว้นวรรคแทน'); }
    if (T === 'en') {
      const se = []; for (const p of L.spellEn || []) { p.rx.lastIndex = 0; let m; while ((m = p.rx.exec(t))) { mk(m.index, m.index + m[0].length, 'bad'); se.push(`${m[0]} → ${p.r}`); } }
      if (se.length) add(k, 'spell', uniq(se).join(', '));
      if (/\bi\b/.test(t)) add(k, 'typo', 'i ควรเป็น I');
    }
    if (T === 'zh') {
      const sz = []; for (const [w, r] of L.spellZh || []) { let i = t.indexOf(w); while (i >= 0) { mk(i, i + w.length, 'bad'); sz.push(`${w} → ${r}`); i = t.indexOf(w, i + w.length); } }
      if (sz.length) add(k, 'spell', uniq(sz).join(', '));
    }
    f = false; if (TH) scan(/([ก-ฮ])[.…]+\s?(?=\1)/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'stutter', 'ตะกุกตะกักให้เขียนเป็นคำซ้ำ เช่น จะ จะ');
    f = false; if (TH) scan(/หึหึ/g, m => { mk(m.index, m.index + m[0].length, 'bad'); f = true; }); if (f) add(k, 'hehe', 'เขียนเป็น หึ ๆ');

    const cnt = rx => (t.match(rx) || []).length;
    if (cnt(/[(（]/g) !== cnt(/[)）]/g) || cnt(/[[【]/g) !== cnt(/[\]】]/g)) add(k, 'brk', 'วงเล็บเปิด-ปิดไม่ครบคู่');
    if (cfg.bracket === 'half' && /[（）]/.test(t)) add(k, 'bwidth', 'ใช้วงเล็บครึ่งความกว้าง ( )');
    if (cfg.bracket === 'full' && /[()]/.test(t)) add(k, 'bwidth', 'ใช้วงเล็บเต็มความกว้าง （）');
    if (/[(（[]\s|\s[)）\]]/.test(t) || /^=\s|\s=$/m.test(t)) add(k, 'bspace', 'ห้ามเว้นวรรคชิดวงเล็บหรือ = ของชื่อเรื่อง');
    if (lines.some(l => /[(（][^)）]*[)）]/.test(l) && l.replace(/[(（][^)）]*[)）]/g, '').replace(/[\s\-]/g, '').length > 0)) add(k, 'card', '画面字กับบทพูดอยู่บรรทัดเดียวกัน ควรแยกคนละบรรทัด');
    const dl = lines.filter(l => /^\s*-/.test(l));
    const dash = lines.length > 1 && dl.length === lines.length;
    if (dl.some(l => /^\s*-(?=\S)/.test(l))) add(k, 'dash', 'ขีดสองคนพูดต้องตามด้วยเว้นวรรค (- ข้อความ)');
    else if (dl.length && lines.length > 1 && !dash) add(k, 'dash', 'ขีดสองคนพูดไม่ครบทุกบรรทัด');

    const hits = TH ? findTagged(t, L.entries, si, L.allow) : [];
    let nm = 0, nf = 0;
    const per = lines.map(() => ({ m: 0, f: 0 }));
    for (const h of hits) {
      mk(h.s, h.e, h.c);
      const li = lineOf(offs, h.s);
      if (h.g === 'm') { nm++; per[li].m++; }
      if (h.g === 'f') { nf++; per[li].f++; }
    }
    o.g = nm && nf ? 'mf' : nm ? 'm' : nf ? 'f' : '';
    if (opt.pitch) {
      const vo = voiceOf(opt.pitch, c.sm, c.em);
      if (vo) { o.vg = vo.g; o.f0 = vo.f0; if (vo.g && (o.g === 'm' || o.g === 'f') && vo.g !== o.g) add(k, 'vgender', `เสียงน่าจะเป็น${vo.g === 'm' ? 'ผู้ชาย' : 'ผู้หญิง'} (~${Math.round(vo.f0)} Hz) แต่ใช้คำ${o.g === 'm' ? 'ผู้ชาย' : 'ผู้หญิง'}`); }
    }
    if (nm && nf && !(dash && per.every(x => !(x.m && x.f)))) add(k, 'mixg', 'มีทั้งคำผู้ชายและผู้หญิงในคิวเดียว');
    const pol = hits.filter(h => h.polite);
    if (cfg.particles === 'ban' && pol.length) add(k, 'polite', 'มีหางเสียง: ' + uniq(pol.map(h => h.w)).join(' '));
    const tEnd = t.replace(/\s+$/, '').length;
    o.ends = pol.some(h => h.e === tEnd);
    for (let i = 1; i < lines.length; i++) {
      const st = offs[i] + (lines[i].length - lines[i].trimStart().length);
      if (t[st] === 'ๆ' || hits.some(h => h.s === st && h.part)) { add(k, 'lstart', 'บรรทัดใหม่ขึ้นต้นด้วย ๆ หรือคำลงท้าย'); break; }
    }
    const pr = TH ? findTagged(t, L.profE, si, L.allow) : [];
    if (pr.length) { pr.forEach(h => mk(h.s, h.e, 'bad')); add(k, 'prof', 'คำหยาบ: ' + uniq(pr.map(h => h.w)).join(' ')); }
    const eraE = !TH ? null : cfg.era === 'period' ? L.periodE : cfg.era === 'modern' ? L.modernE : null;
    if (eraE) {
      const eh = findTagged(t, eraE, si, L.allow);
      if (eh.length) { eh.forEach(h => mk(h.s, h.e, 'era')); add(k, 'era', uniq(eh.map(h => h.r ? `${h.w} → ${h.r}` : h.w)).join(', ')); }
    }
    const sp = TH ? findSpell(t, L.spell) : [];
    if (sp.length) { sp.forEach(h => mk(h.s, h.e, 'bad')); add(k, 'spell', uniq(sp.map(h => `${h.w} → ${h.r}`)).join(', ')); }
    if (si.ok && T !== 'zh') {
      for (let i = 1; i < si.toks.length; i++) {
        const a = si.toks[i - 1], b = si.toks[i];
        if (a.w && b.w && a.t === b.t && a.t.length >= 2 && a.e === b.s) { mk(a.s, b.e, 'bad'); add(k, 'repeat', `คำซ้ำติดกัน: ${a.t}${b.t}`); break; }
      }
    }
    if (lines.length === 2) {
      const [a, b] = lines;
      if (TH && si.ok && /[ก-๎]$/.test(a) && /^[ก-๎]/.test(b)) { const sj = segInfo(a + b); if (!sj.b.has(a.length)) add(k, 'tear', 'ตัดบรรทัดกลางคำ'); }
      if (!dash && !/[(（[【]/.test(t) && a.trim() && b.trim()) { const n = lineLen(joinLines(lines), cfg.mode); if (n <= cfg.limit) add(k, 'canjoin', `รวมเป็นบรรทัดเดียวได้ (${n}/${cfg.limit})`); }
    }
    if (/หยวน|บาท|ดอลลาร์|元|¥|\$/.test(t)) add(k, 'money', 'มีค่าเงิน เช็กกฎแปลงค่าเงินของงานนี้');

    if (o.src) {
      const st = o.src.map(j => src[j].t).join('\n');
      if (!o.src.length) add(k, 'nosrc', 'ไม่มี原文ที่เวลาตรงกัน');
      else {
        if (o.src.length === 1 && owners[o.src[0]] === 1) {
          const base = baseLen(st, lang);
          if (base >= 4 && lang !== T) {
            const r = lineLen(lines.join(''), 'se') / base;
            const sc = ((DENS[T] || 3) / (DENS[lang] || 3)) / 3;
            if (r < cfg.ratioLo * sc) add(k, 'ratio', `สั้นกว่าปกติ (${r.toFixed(2)}×) อาจแปลขาด`);
            else if (r > cfg.ratioHi * sc) add(k, 'ratio', `ยาวกว่าปกติ (${r.toFixed(2)}×) อาจแปลเกิน`);
          }
        }
        const sB = /[(（]/.test(st), tB = /[(（]/.test(t);
        if (sB && !tB) add(k, 'srcbrk', '原文มีวงเล็บ แต่คำแปลไม่มี');
        else if (!sB && tB) add(k, 'srcbrk', 'คำแปลมีวงเล็บ แต่原文ไม่มี');
        const nums = (st.match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/,/g, ''));
        const tn = t.replace(/,/g, '');
        const miss = uniq(nums.filter(x => !tn.includes(x)));
        if (miss.length) add(k, 'num', 'ตัวเลขใน原文: ' + miss.join(' '));
        if (gloss && gloss.length) {
          const near = [cues[k - 1], c, cues[k + 1]].filter(Boolean).map(x => x.t).join('\n');
          const bad = [];
          for (const g of gloss) if (glossIn(st, g) && !near.includes(g.th)) bad.push(`${g.src} → ${g.th}`);
          if (bad.length) add(k, 'gloss', '术语: ' + bad.slice(0, 4).join(', ') + (bad.length > 4 ? ` +${bad.length - 4}` : ''));
        }
      }
    }
    if (gloss && gloss.length) for (const g of gloss) { let i = t.indexOf(g.th); while (i >= 0) { mk(i, i + g.th.length, 'gl'); i = t.indexOf(g.th, i + g.th.length); } }
  });
  if (owners) {
    src.forEach((s, j) => {
      if (owners[j] || !/\p{L}/u.test(s.t)) return;
      let best = -1, bd = Infinity;
      cues.forEach((c, k) => { const d = Math.abs(c.sm - s.sm); if (d < bd) { bd = d; best = k; } });
      if (best >= 0) add(best, 'miss', `原文ไม่มีคำแปล ${fmt(s.sm).slice(3)}: 「${s.t.replace(/\n/g, ' ').slice(0, 40)}」`);
    });
  }
  if (cfg.particles === 'dense') {
    const N = Math.max(2, cfg.denseN | 0 || 3);
    let run = [];
    const flush = () => { if (run.length >= N) run.forEach(k => add(k, 'dense', `หางเสียงท้ายคิวติดกัน ${run.length} คิว`)); run = []; };
    R.forEach((o, k) => { if (o.ends) run.push(k); else flush(); });
    flush();
  }
  R.forEach(o => o.iss.sort((a, b) => 'ewi'.indexOf(a.sev) - 'ewi'.indexOf(b.sev)));
  return R;
}

/* ---------- fixes ---------- */
function fixText(code, t, cfg, L) {
  const per = fn => t.split('\n').map(fn).join('\n');
  switch (code) {
    case 'yamok': return per(l => l.replace(/[ \t]*ๆ[ \t]*/g, ' ๆ ').replace(/ {2,}/g, ' ').trim());
    case 'space': return per(l => l.replace(/ {2,}/g, ' ').trim());
    case 'dupmark': return t.replace(/([ัิ-ฺ็-๎])\1+/g, '$1');
    case 'hehe': return fixText('yamok', t.replace(/หึหึ/g, 'หึ ๆ'), cfg, L);
    case 'spell': {
      const T = (cfg && cfg.tgt) || 'th';
      if (T === 'en') { let s = t; for (const p of L.spellEn || []) s = s.replace(p.rx, m => /^[A-Z]/.test(m) ? p.r[0].toUpperCase() + p.r.slice(1) : p.r); return s; }
      if (T === 'zh') { let s = t; for (const [w, r] of L.spellZh || []) s = s.split(w).join(r); return s; }
      let s = t; const hs = findSpell(s, L.spell); for (let i = hs.length - 1; i >= 0; i--) s = s.slice(0, hs[i].s) + hs[i].r + s.slice(hs[i].e); return s;
    }
    case 'typo': {
      let s = t.replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '').replace(/\u0e40\u0e40/g, '\u0e41').replace(/\u0e4d\u0e32/g, '\u0e33')
        .replace(/([\u0e48-\u0e4b])([\u0e31\u0e34-\u0e37\u0e47])/g, '$2$1').replace(/([\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])\1+/g, '$1').replace(/\u0e46\s*\u0e46/g, '\u0e46');
      if (((cfg && cfg.tgt) || 'th') === 'en') s = s.replace(/\bi\b/g, 'I');
      return s;
    }
    case 'canjoin': { const ls = t.split('\n'); return ls.length === 2 ? joinLines(ls) : t; }
    case 'punct': if (cfg && cfg.tgt === 'zh') return per(l => l.replace(/[，。；、,;]+|(?<!\d)\.(?!\d)/g, ' ').replace(/ {2,}/g, ' ').trim());
      return per(l => l.replace(/[!?！？;"“”]+/g, '').replace(/…+|\.{2,}/g, ' ').replace(/[.,]+(?=[ \t]*$)/g, '').replace(/(?<!\d),|,(?!\d)/g, ' ').replace(/ {2,}/g, ' ').trim());
    case 'bwidth': return cfg.bracket === 'full' ? t.replace(/\(/g, '（').replace(/\)/g, '）') : t.replace(/（/g, '(').replace(/）/g, ')');
    case 'bspace': return per(l => l.replace(/([(（[])\s+/g, '$1').replace(/\s+([)）\]])/g, '$1').replace(/^=\s+/, '=').replace(/\s+=$/, '='));
    case 'dash': return per(l => l.replace(/^(\s*)-(?=\S)/, '$1- '));
    default: return t;
  }
}
function autoBreak(t, cfg, L) {
  const flat = t.includes('\n') ? joinLines(t.split('\n')) : t;
  let m = flat.match(/^\s*([(（][^)）]*[)）])\s*(\S.*)$/) || flat.match(/^(.*\S)\s*([(（][^)）]*[)）])\s*$/);
  if (m) return m[1].trim() + '\n' + m[2].trim();
  const si = segInfo(flat);
  const cands = si.ok ? [...si.b] : [...flat.matchAll(/ /g)].map(x => x.index);
  let best = null;
  for (const p of cands) {
    if (p <= 0 || p >= flat.length) continue;
    const left = flat.slice(0, p).replace(/\s+$/, ''), right = flat.slice(p).replace(/^\s+/, '');
    if (!left || !right || /^ๆ/.test(right)) continue;
    const sr = segInfo(right);
    if (L.parts.some(w => right.startsWith(w) && (!sr.ok || sr.b.has(w.length)))) continue;
    if ((left.match(/[(（]/g) || []).length > (left.match(/[)）]/g) || []).length) continue;
    const a = lineLen(left, cfg.mode), b = lineLen(right, cfg.mode);
    let score = Math.max(a, b) * 2 + Math.abs(a - b) * 0.3;
    if (flat[p - 1] !== ' ' && flat[p] !== ' ') score += 4;
    if (L.conj.some(w => right.startsWith(w))) score -= 3;
    if (/\d$/.test(left) && /^[ก-๎]/.test(right)) score += 12;
    if (Math.min(a, b) < 4) score += 8;
    if (a > cfg.limit || b > cfg.limit) score += 100;
    if (!best || score < best.score) best = { score, left, right };
  }
  return best ? best.left + '\n' + best.right : t;
}


/* ---------- gender swap & particle trimming ---------- */
const QEND = /(ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|หรือไม่|หรือ|เหรอ|หรอ|อะไร|ทำไม|ยังไง|อย่างไร|ที่ไหน|ไหน|ใคร|เท่าไร|เท่าไหร่|กี่\S*|เมื่อไร|เมื่อไหร่|ไง|บ้าง|ป่าว|มิใช่หรือ|ใช่ไหม|ได้ไหม|[?？])\s*$/;
const TO_F = [['ครับผม', 'ค่ะ'], ['นะครับ', 'นะคะ'], ['คร้าบ', 'Q'], ['ครับ', 'Q'], ['คับ', 'Q'], ['ขอรับ', 'QJ'], ['พ่ะย่ะค่ะ', 'เพคะ'], ['พะยะค่ะ', 'เพคะ'], ['กระหม่อม', 'หม่อมฉัน'], ['กระผม', 'ดิฉัน'], ['ผม', 'ฉัน']];
const TO_M = [['นะคะ', 'นะครับ'], ['อิฉัน', 'กระผม'], ['เจ้าค่ะ', 'ขอรับ'], ['เจ้าคะ', 'ขอรับ'], ['ค่ะ', 'ครับ'], ['คะ', 'ครับ'], ['ค๊ะ', 'ครับ'], ['ค้า', 'ครับ'], ['เพคะ', 'พ่ะย่ะค่ะ'], ['หม่อมฉัน', 'กระหม่อม'], ['ดิฉัน', 'ผม'], ['ฉัน', 'ผม']];
function swapGender(t, to, L, opt) {
  opt = opt || {};
  const map = (to === 'f' ? TO_F : TO_M).filter(([w]) => opt.pron !== false || !['ผม', 'ฉัน', 'ดิฉัน', 'กระผม'].includes(w));
  const entries = map.map(([w, r]) => ({ w, r, relax: !['ผม', 'ฉัน', 'ดิฉัน', 'อิฉัน', 'กระผม', 'กระหม่อม', 'หม่อมฉัน'].includes(w) })).sort((a, b) => b.w.length - a.w.length);
  const si = segInfo(t);
  const hs = findTagged(t, entries, si, L.allow);
  let out = t;
  for (let i = hs.length - 1; i >= 0; i--) {
    const h = hs[i];
    let r = h.r;
    if (r === 'Q' || r === 'QJ') {
      const ls = out.lastIndexOf('\n', h.s - 1) + 1;
      const q = QEND.test(out.slice(ls, h.s));
      r = r === 'Q' ? (q ? 'คะ' : 'ค่ะ') : (q ? 'เจ้าคะ' : 'เจ้าค่ะ');
    }
    out = out.slice(0, h.s) + r + out.slice(h.e);
  }
  return out;
}
function dropParticles(t, L) {
  const entries = words(DEF_LEX.polite).concat(['นะครับ', 'นะคะ']).map(w => ({ w, r: /^นะ/.test(w) ? 'นะ' : '', relax: true })).sort((a, b) => b.w.length - a.w.length);
  return t.split('\n').map(line => {
    const si = segInfo(line), hs = findTagged(line, entries, si, L.allow);
    let out = line;
    for (let i = hs.length - 1; i >= 0; i--) out = out.slice(0, hs[i].s) + hs[i].r + out.slice(hs[i].e);
    out = out.replace(/ {2,}/g, ' ').trim();
    return out ? out : line;
  }).join('\n');
}

/* ---------- audio: peaks and pitch ---------- */
function audioPeaks(pcm, sr) {
  const step = Math.max(1, Math.round(sr / 100)), n = Math.ceil(pcm.length / step), out = new Uint8Array(n);
  let mx = 1e-6;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > mx) mx = a; }
  for (let b = 0; b < n; b++) { let m = 0; const e = Math.min(pcm.length, (b + 1) * step); for (let i = b * step; i < e; i++) { const a = Math.abs(pcm[i]); if (a > m) m = a; } out[b] = Math.min(255, Math.round(m / mx * 255)); }
  return out;
}
async function pitchTrack(pcm, sr, onProgress) {
  const hop = Math.round(sr * 0.02), win = Math.round(sr * 0.03), minLag = Math.floor(sr / 400), maxLag = Math.ceil(sr / 70);
  const n = Math.max(0, Math.floor((pcm.length - win - maxLag) / hop));
  const f0 = new Float32Array(n), rms = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s2 = 0; const o = k * hop; for (let j = 0; j < win; j++) { const x = pcm[o + j]; s2 += x * x; } rms[k] = Math.sqrt(s2 / win); }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const thr = Math.max(0.008, (sorted[Math.floor(sorted.length * 0.9)] || 0) * 0.25);
  const d = new Float32Array(maxLag + 2);
  for (let k = 0; k < n; k++) {
    if (rms[k] < thr) continue;
    const o = k * hop;
    let run = 0; d[0] = 1;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      let sum = 0;
      for (let j = 0; j < win; j++) { const df = pcm[o + j] - pcm[o + j + tau]; sum += df * df; }
      run += sum; d[tau] = run > 0 ? sum * tau / run : 1;
    }
    let best = -1;
    for (let tau = minLag; tau <= maxLag; tau++) { if (d[tau] < 0.15 && d[tau] <= d[tau - 1] && d[tau] <= d[tau + 1]) { best = tau; break; } }
    if (best < 0) continue;
    const a = d[best - 1], b = d[best], c = d[best + 1], den = a - 2 * b + c;
    const t = den ? best + 0.5 * (a - c) / den : best;
    f0[k] = sr / t;
    if (onProgress && k % 3000 === 0) await onProgress(k / n);
  }
  return { f0, hop: hop / sr };
}
function voiceOf(track, sm, em) {
  if (!track || !track.f0) return null;
  const a = Math.max(0, Math.floor(sm / 1000 / track.hop)), b = Math.min(track.f0.length, Math.ceil(em / 1000 / track.hop));
  const v = [];
  for (let i = a; i < b; i++) if (track.f0[i] > 0) v.push(track.f0[i]);
  if (b - a < 4 || v.length < 6 || v.length < (b - a) * 0.2) return null;
  v.sort((x, y) => x - y);
  const med = v[v.length >> 1];
  return { f0: med, g: med < 160 ? 'm' : med > 190 ? 'f' : '' };
}

/* ---------- zip writer ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/* ---------- zip reader (works on a Blob slice by slice, so big video zips are not loaded into memory) ---------- */
function zipName(bytes, flag) {
  if (flag & 0x800) return new TextDecoder('utf-8').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {}
  try { return new TextDecoder('gbk').decode(bytes); } catch (e) {}
  return new TextDecoder('latin1').decode(bytes);
}
async function zipList(blob) {
  const size = blob.size, tl = Math.min(size, 65557);
  const tail = new Uint8Array(await blob.slice(size - tl).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { at = i; break; }
  if (at < 0) throw new Error('ไฟล์นี้ไม่ใช่ zip หรือไฟล์เสีย');
  let n = tv.getUint16(at + 10, true), cdSize = tv.getUint32(at + 12, true), cdOff = tv.getUint32(at + 16, true);
  if (cdOff === 0xFFFFFFFF || n === 0xFFFF) {
    const loc = at - 20;
    if (loc >= 0 && tv.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(tv.getBigUint64(loc + 8, true));
      const zv = new DataView(await blob.slice(z64, z64 + 56).arrayBuffer());
      n = Number(zv.getBigUint64(32, true)); cdSize = Number(zv.getBigUint64(40, true)); cdOff = Number(zv.getBigUint64(48, true));
    }
  }
  const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dv = new DataView(cd.buffer);
  const out = [];
  let p = 0;
  for (let k = 0; k < n && p + 46 <= cd.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    let lho = dv.getUint32(p + 42, true);
    let name = zipName(cd.subarray(p + 46, p + 46 + nl), flag);
    let x = p + 46 + nl;
    const xe = x + xl;
    while (x + 4 <= xe) {
      const id = dv.getUint16(x, true), len = dv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (lho === 0xFFFFFFFF) { lho = Number(dv.getBigUint64(q, true)); }
      } else if (id === 0x7075 && !(flag & 0x800)) {
        try { name = new TextDecoder('utf-8').decode(cd.subarray(x + 9, x + 4 + len)); } catch (e) {}
      }
      x += 4 + len;
    }
    p = xe + cl;
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    out.push({ name, flag, method, csize, usize, lho, encrypted: !!(flag & 1) });
  }
  return out;
}
async function zipRead(blob, e) {
  const lh = new DataView(await blob.slice(e.lho, e.lho + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('zip เสีย');
  const start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const raw = blob.slice(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  throw new Error('zip ใช้วิธีบีบอัดที่ไม่รองรับ');
}

/* ---------- xlsx / csv (glossary) ---------- */
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
const tText = x => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');
function textRows(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim()).map(l => {
    if (l.includes('\t')) return l.split('\t');
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
}
function glossFromRows(rows) {
  const out = [], seen = new Set();
  for (const r of rows) {
    const cells = r.map(x => String(x || '').trim());
    let si = cells.findIndex(x => x && /[一-鿿가-힯぀-ヿA-Za-z]/.test(x) && !/[ก-๎]/.test(x));
    if (si < 0) continue;
    const ti = cells.findIndex((x, i) => i > si && /[ก-๎]/.test(x));
    if (ti < 0) continue;
    const src = cells[si], th = cells[ti].split(/\n/)[0].trim();
    if (/^(中文|原文|source|term|chinese|english)$/i.test(src) || seen.has(src)) continue;
    seen.add(src); out.push({ src, th });
  }
  return out;
}


/* ---------- Excel: read with row numbers, guess subtitle columns, patch in place, write new ---------- */
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function parseSheetRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = +((rm[1].match(/\br="(\d+)"/) || [])[1] || rows.length + 1);
    const vals = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : vals.length;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (type === 's' && v != null) val = shared[+v] || '';
      else if (type === 'inlineStr') val = tText(inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''));
      else if (v != null) val = unxml(v);
      vals[col] = val;
    }
    rows.push({ r, vals: Array.from(vals, x => x == null ? '' : x) });
  }
  return rows;
}
async function xlsxBook(blob) {
  const ents = await zipList(blob);
  const txt = async name => { const e = ents.find(x => x.name === name); return e ? (await zipRead(blob, e)).text() : null; };
  const wb = await txt('xl/workbook.xml') || '';
  const rels = await txt('xl/_rels/workbook.xml.rels') || '';
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = (m[0].match(/\bId="([^"]+)"/) || [])[1], tg = (m[0].match(/\bTarget="([^"]+)"/) || [])[1]; if (id && tg) relMap[id] = tg; }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unxml((m[0].match(/\bname="([^"]*)"/) || [])[1] || '');
    const rid = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
    let tg = relMap[rid]; if (!tg) continue;
    tg = tg.replace(/^\//, '');
    sheets.push({ name, path: tg.startsWith('xl/') ? tg : 'xl/' + tg });
  }
  if (!sheets.length) ents.filter(x => /^xl\/worksheets\/sheet\d*\.xml$/.test(x.name)).forEach((e, i) => sheets.push({ name: 'Sheet' + (i + 1), path: e.name }));
  const ss = await txt('xl/sharedStrings.xml');
  const shared = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => tText(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))) : [];
  for (const sh of sheets) sh.rows = parseSheetRows(await txt(sh.path) || '', shared);
  return { ents, sheets };
}
async function xlsxRows(blob) { const b = await xlsxBook(blob); return b.sheets.flatMap(s => s.rows.map(r => r.vals)); }
const HDR = /原文|中文|译文|泰|ไทย|thai|chinese|source|target|时间|time|集|^ep|ตอน|序号|^id$|^no\.?$|timeline|file|start|end|开始|结束|备注|修改|英文|english|台词|字幕|^cn$|^th$|^zh$|^en$|ต้นฉบับ|คำแปล|เวลา|ลำดับ/i;
function guessMap(rows) {
  const sample = rows.slice(0, 600);
  const ncol = sample.reduce((a, r) => Math.max(a, r.vals.length), 0);
  let hi = -1;
  for (let i = 0; i < Math.min(12, sample.length); i++) { const k = sample[i].vals.filter(x => x && x.length < 40 && HDR.test(String(x).trim())).length; if (k >= 2) { hi = i; break; } }
  const head = hi >= 0 ? sample[hi].vals : [];
  const data = sample.slice(hi + 1);
  const stat = c => {
    const s = { n: 0, th: 0, cjk: 0, lat: 0, tl: 0, tm: 0, int: 0 };
    for (const r of data) {
      const v = String(r.vals[c] || '').trim(); if (!v) continue;
      s.n++;
      if (/-->/.test(v)) s.tl++;
      else if (/^\d{1,2}:\d{2}:\d{2}[,.:]\d{1,3}$/.test(v) || /^0?\.\d+$/.test(v)) s.tm++;
      else if (/^\d+$/.test(v)) s.int++;
      const t = (v.match(/[ก-๎]/g) || []).length, z = (v.match(/[一-鿿぀-ヿ가-힯]/g) || []).length, l = (v.match(/[A-Za-z]/g) || []).length;
      if (t > z && t > l) s.th++; else if (z && z >= l) s.cjk++; else if (l) s.lat++;
    }
    return s;
  };
  const st = [...Array(ncol).keys()].map(stat);
  const hdr = c => String(head[c] || '').trim();
  const pick = (pred, score) => { let best = -1, bs = -Infinity; st.forEach((s, c) => { if (!pred(s, c)) return; const v = score(s, c); if (v > bs) { bs = v; best = c; } }); return best; };
  const m = { hr: hi >= 0 ? sample[hi].r : null, head: head.map(x => String(x || '')) };
  m.tl = pick(s => s.n && s.tl >= s.n * 0.5, s => s.tl);
  const times = st.map((s, c) => [s, c]).filter(([s]) => s.n && s.tm >= s.n * 0.6).map(x => x[1]);
  m.start = m.tl < 0 && times.length >= 1 ? times[0] : -1;
  m.end = m.tl < 0 && times.length >= 2 ? times[1] : -1;
  const thai = st.map((s, c) => [s, c]).filter(([s]) => s.n && s.th >= s.n * 0.4).map(x => x[1]);
  let tg = thai.find(c => /修改后|修订|修改|เกลา|แก้|最终|final|after|审校/i.test(hdr(c)));
  if (tg == null) tg = thai.slice().sort((a, b) => st[b].th - st[a].th || a - b)[0];
  m.tgt = tg == null ? -1 : tg;
  m.src = pick((s, c) => c !== m.tgt && s.n && (s.cjk + s.lat) >= s.n * 0.5 && !s.tl && !/file|文件|集|^ep/i.test(hdr(c)), s => s.cjk * 3 + s.lat);
  m.ep = pick((s, c) => /集|^ep|episode|ตอน|file|文件|剧集/i.test(hdr(c)) && c !== m.tgt && c !== m.src, s => s.n);
  m.idx = pick((s, c) => c !== m.ep && c !== m.tgt && c !== m.src && s.n && (/序号|^id$|^no|编号|^#$|ลำดับ/i.test(hdr(c)) || s.int >= s.n * 0.9), (s, c) => s.int + (/序号|^id$|^no|编号|ลำดับ/i.test(hdr(c)) ? 1e6 : 0));
  m.ncol = ncol;
  return m;
}
function cellTime(v) {
  v = String(v || '').trim();
  if (/^0?\.\d+$|^\d+\.\d+$/.test(v) && +v < 2) return Math.round(+v * 86400000);
  let mm = v.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{2})$/);
  if (mm) return ((+mm[1]) * 3600 + (+mm[2]) * 60 + (+mm[3])) * 1000 + Math.round(+mm[4] * 40);
  return toMs(v.replace(/:(\d{3})$/, ',$1'));
}
const SEPROW = /^(?:📁\s*)?(?:第\s*\d+\s*[集个個話话回]|ep\.?\s*\d+|episode\s*\d+|ตอนที่\s*\d+)/i;
function sheetToEps(rows, m, fallbackKey) {
  const out = [];
  let cur = null;
  const get = (r, c) => c >= 0 ? String(r.vals[c] == null ? '' : r.vals[c]) : '';
  const open = key => { cur = out.find(o => o.key === key); if (!cur) { cur = { key, rows: [] }; out.push(cur); } };
  for (const r of rows) {
    if (m.hr != null && r.r <= m.hr) continue;
    const ne = r.vals.map((v, i) => [String(v || '').trim(), i]).filter(x => x[0]);
    if (!ne.length) continue;
    if (ne.length === 1 && SEPROW.test(ne[0][0]) && ne[0][1] !== m.tgt && ne[0][1] !== m.src) { open(ne[0][0].replace(/^📁\s*/, '')); continue; }
    const ev = get(r, m.ep).trim();
    if (m.ep >= 0 && ev) open(ev);
    if (!cur) open(fallbackKey);
    const tgt = get(r, m.tgt), src = get(r, m.src);
    if (!tgt.trim() && !src.trim()) continue;
    let sm = NaN, em = NaN;
    if (m.tl >= 0) { const mm = get(r, m.tl).match(/(\d{1,2}:\d{1,2}:\d{1,2}[,.:]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.:]\d{1,3})/); if (mm) { sm = cellTime(mm[1]); em = cellTime(mm[2]); } }
    else if (m.start >= 0) { sm = cellTime(get(r, m.start)); em = m.end >= 0 ? cellTime(get(r, m.end)) : NaN; }
    cur.rows.push({ r: r.r, sm, em, idx: get(r, m.idx).trim(), tgt, src });
  }
  return out.filter(o => o.rows.length);
}
function patchSheet(xml, edits, styleFor) {
  return xml.replace(/<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, (whole, attrs, tail, inner) => {
    const rn = +((attrs.match(/\br="(\d+)"/) || [])[1]);
    const ed = edits.get(rn);
    if (!ed) return whole;
    let body = inner || '';
    for (const [col, val] of ed) {
      const ref = colName(col) + rn;
      const re = new RegExp('<c\\b[^>]*?\\br="' + ref + '"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)');
      const cm = body.match(re);
      const base = cm ? (cm[0].match(/\bs="(\d+)"/) || [])[1] : null;
      const ns = styleFor ? styleFor(base) : base;
      const cell = `<c r="${ref}"${ns != null ? ` s="${ns}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
      if (cm) body = body.replace(cm[0], () => cell);
      else {
        let inserted = false;
        body = body.replace(/<c\b[^>]*?\br="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (c, letters) => {
          if (inserted) return c;
          const ci = [...letters].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
          if (ci > col) { inserted = true; return cell + c; }
          return c;
        });
        if (!inserted) body += cell;
      }
    }
    return `<row${attrs}>${body}</row>`;
  });
}
function stylesPatcher(xml, rgb) {
  const fm = xml && xml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/);
  const xm = xml && xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!fm || !xm) return null;
  const nFills = (fm[1].match(/<fill\b/g) || []).length;
  const xfs = [...xm[1].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(m => m[0]);
  const add = [], map = new Map();
  return {
    styleFor(base) {
      const b = base == null ? 0 : +base;
      if (map.has(b)) return map.get(b);
      let x = xfs[b] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      x = /\bfillId="\d+"/.test(x) ? x.replace(/\bfillId="\d+"/, `fillId="${nFills}"`) : x.replace('<xf', `<xf fillId="${nFills}"`);
      x = /\bapplyFill="\w+"/.test(x) ? x.replace(/\bapplyFill="\w+"/, 'applyFill="1"') : x.replace('<xf', '<xf applyFill="1"');
      const idx = xfs.length + add.length; add.push(x); map.set(b, idx); return idx;
    },
    build() {
      if (!add.length) return xml;
      return xml.replace(/<fills\b([^>]*)>([\s\S]*?)<\/fills>/, (m, a, b) => `<fills${/count="/.test(a) ? a.replace(/count="\d+"/, `count="${nFills + 1}"`) : a}>${b}<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill></fills>`)
        .replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (m, a, b) => `<cellXfs${/count="/.test(a) ? a.replace(/count="\d+"/, `count="${xfs.length + add.length}"`) : a}>${b}${add.join('')}</cellXfs>`);
    }
  };
}
async function xlsxPatch(blob, ents, sheetPath, edits, highlight) {
  const sEnt = ents.find(e => e.name === 'xl/styles.xml');
  const sp = highlight && sEnt ? stylesPatcher(await (await zipRead(blob, sEnt)).text(), 'FFFFFF00') : null;
  const files = [];
  for (const e of ents) {
    let data = new Uint8Array(await (await zipRead(blob, e)).arrayBuffer());
    if (e.name === sheetPath) data = new TextEncoder().encode(patchSheet(new TextDecoder().decode(data), edits, sp ? b => sp.styleFor(b) : null));
    files.push({ name: e.name, data });
  }
  if (sp) { const i = files.findIndex(f => f.name === 'xl/styles.xml'); files[i].data = new TextEncoder().encode(sp.build()); }
  return makeZip(files);
}
function xlsxNew(sheetName, rows, widths) { return xlsxMulti([{ name: sheetName, rows, widths }]); }
function xlsxMulti(sheets) {
  const enc = s => new TextEncoder().encode(s);
  const used = new Set();
  const names = sheets.map(sh => {
    let nm = String(sh.name || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Sheet1', k = 2;
    const b = nm; while (used.has(nm.toLowerCase())) nm = (b.slice(0, 27) + ' (' + k++ + ')');
    used.add(nm.toLowerCase()); return nm;
  });
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const sheetXml = ({ rows, widths }) => {
    const ncol = rows.reduce((a, r) => Math.max(a, r.length), 1);
    const body = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => (c == null || (c.v === '' && !c.s)) ? '' : `<c r="${colName(j)}${i + 1}"${c.s ? ` s="${c.s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(c.v))}</t></is></c>`).join('')}</row>`).join('');
    const cols = widths ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS}><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData><autoFilter ref="A1:${colName(ncol - 1)}${Math.max(1, rows.length)}"/></worksheet>`;
  };
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Tahoma"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7B6BB5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const wbx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS}><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wrels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return makeZip([{ name: '[Content_Types].xml', data: enc(ct) }, { name: '_rels/.rels', data: enc(rels) }, { name: 'xl/workbook.xml', data: enc(wbx) }, { name: 'xl/_rels/workbook.xml.rels', data: enc(wrels) }, { name: 'xl/styles.xml', data: enc(styles) }]
    .concat(sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(sh)) }))));
}

/* ---------- names ---------- */
function normName(name) {
  return name.replace(/\.[^.]+$/, '')
    .replace(/^(th|tha|thai|cn|zh|chs|en|eng)[_\-\s.]+/i, '')
    .replace(/[_\-\s.]?修改(?:v?\d+)?$/i, '')
    .replace(/[_\-\s.(（]*(th|tha|thai|ไทย|泰语|泰文|泰|cn|zh|chs|cht|中文|简体|繁体|中|en|eng|english|英文|英语|英)[)）]?$/i, '')
    .replace(/[_\-\s.]?修改(?:v?\d+)?$/i, '');
}
const blank = s => ' '.repeat(s.length);
function epInfo(name) {
  const b = normName(name);
  let m, num = null, idx = b.length;
  if ((m = b.match(/(^|[^a-z])((?:episode|ep|e)[\s._-]*)(\d{1,4})(?!\d)/i))) { num = +m[3]; idx = m.index + m[1].length; }
  else if ((m = b.match(/第\s*(\d{1,4})\s*[集话話回]/))) { num = +m[1]; idx = m.index; }
  else {
    const c = b.replace(/[xh]\.?26[45]/gi, blank).replace(/\d{3,4}p(?![a-z])/gi, blank).replace(/\d{5,}/g, blank);
    const all = [...c.matchAll(/\d{1,4}/g)];
    if (all.length) { const last = all[all.length - 1]; num = +last[0]; idx = last.index; }
  }
  const group = b.slice(0, idx).toLowerCase().replace(/[\s._\-()（）[\]【】]+/g, '').replace(/(?:第|ep|e)$/, '');
  return { num, group };
}
const baseOf = name => normName(name).toLowerCase();
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }

return { p2, toMs, fmt, fmtAss, decode, parseSrt, buildSrt, parseAss, buildAss, encodeFile, seLen, lineLen, scriptOf, LANG_LABEL, segInfo,
  DEF_LEX, compileLex, CAT, FIXABLE, PRESETS, DEF_CFG, analyzeEpisode, fixText, autoBreak, joinLines, glossCompile,
  swapGender, dropParticles, audioPeaks, pitchTrack, voiceOf, colName, xlsxBook, guessMap, sheetToEps, cellTime, xlsxPatch, xlsxNew,
  crc32, makeZip, zipList, zipRead, xlsxRows, textRows, glossFromRows, normName, epInfo, baseOf, fnv, xlsxMulti, presetsFor, cfgForTarget, TGT_NAME, stripTags };
})();
window.SubCore = SubCore;
export default SubCore;
