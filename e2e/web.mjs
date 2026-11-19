// Browser test of the web build (dist/), with Gemini answered by a fake server so no real key or client file leaves the machine.
// usage: node e2e/web.mjs [chromium|webkit|firefox]
// Run with webkit on macOS to cover the engine the Mac app uses (WKWebView).
import * as pw from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const engine = process.argv[2] || 'chromium';
const dist = path.resolve('dist'), fx = path.resolve('e2e/fixtures');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfweb-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | [${engine}] ${name} | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/index.html`;
// files are handed over as data (works the same in every engine)
const MT = { '.srt': 'application/x-subrip', '.mp4': 'video/mp4', '.zip': 'application/zip', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.hfproj': 'application/json' };
const F = list => list.map(f => ({ name: path.basename(f), mimeType: MT[path.extname(f)] || 'application/octet-stream', buffer: fs.readFileSync(f) }));

const calls = [];
async function gemini(route) {
  const req = route.request(), url = req.url();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST' } });
  const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (req.method() === 'GET') {
    if (/key=BADKEY/.test(url)) return route.fulfill({ status: 400, headers: h, body: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }) });
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ models: [
      { name: 'models/gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', supportedGenerationMethods: ['generateContent'] }] }) });
  }
  const body = JSON.parse(req.postData() || '{}'); calls.push(body);
  const text = body.contents.at(-1).parts.map(p => p.text || '').join('');
  const sys = ((body.systemInstruction || {}).parts || []).map(p => p.text || '').join('');
  let out;
  if (/ผู้ช่วยอ่านคู่มือ/.test(text)) out = JSON.stringify({ client: 'ลูกค้าทดสอบ', target_lang: 'th', orientation: 'both', limit_horizontal: 18, limit_vertical: 14, count_mode: 'len', max_lines: 2, punctuation: 'none', polite_particles: 'ban', rules: ['ห้ามแปลงค่าเงิน'], glossary: [{ src: '沈总', t: 'ประธานเสิ่น' }], unclear: ['ไม่ได้บอกเรื่อง CPS'] });
  else if (/ผู้ช่วยนักแปล/.test(sys)) out = 'ลองแบบนี้\n» สวัสดี ผมกลับมาแล้ว\nสั้นกว่า\n» ผมมาถึงแล้วนะ';
  else out = JSON.stringify([{ i: '1', t: 'สวัสดี ผมมาถึงแล้ว', note: 'ทดสอบ' }]);
  return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: out }] } }] }) });
}

let browser;
try {
  browser = await pw[engine].launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.route('https://generativelanguage.googleapis.com/**', gemini);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d|400 \(Bad Request\)/.test(m.text())) errs.push('console: ' + m.text()); });
  const S = js => page.evaluate(`(() => { const S = window.__hfState(); return ${js}; })()`);
  const closePair = async () => { if (await page.evaluate(() => document.getElementById('mPair').classList.contains('open'))) await page.keyboard.press('Escape'); };
  const shot = async name => { const b = await page.screenshot({ type: 'jpeg', quality: 70 }); console.log(`SHOT_BEGIN ${engine}-${name}\n${b.toString('base64')}\nSHOT_END`); };
  await page.goto(base); await sleep(2000);
  check('opens', (await page.innerText('#pjName')).length > 0);
  await page.setInputFiles('#fFiles', F(['测试剧_01_泰文.srt', '测试剧_01.srt', '测试剧_01.mp4', '测试剧_02.zip'].map(f => path.join(fx, f))));
  await sleep(4000); await closePair();
  check('files load (zip too)', await S('S.eps.filter(e => !e.sample).length') === 2, await S('S.eps.map(e => e.name).join()'));
  await page.click('#r-0-0'); await sleep(1500);
  const v = await page.evaluate(() => new Promise(res => { const v = document.getElementById('video'); v.muted = true; const t0 = v.currentTime; v.play().then(() => setTimeout(() => { res({ ok: v.currentTime > t0, t: v.currentTime }); v.pause(); }, 1500)).catch(e => res({ ok: false, err: String(e) })); }));
  check('video plays', v.ok, v);
  await shot('01-loaded');
  await page.click('#r-0-0'); await page.fill('#ta', 'แก้แล้วคิวแรก'); await sleep(900);
  await page.keyboard.press(engine === 'webkit' ? 'Meta+s' : 'Control+s'); await sleep(800);
  await page.reload(); await sleep(3500); await closePair();
  check('reopens with files and edits after reload', await S('S.eps.filter(e => !e.sample).length') === 2 && await S('S.eps[0].cues[0].t') === 'แก้แล้วคิวแรก', await S('S.eps.map(e => e.name).join()'));

  await page.click('#bProj'); await sleep(300);
  await page.fill('#npName', 'zh'); await page.selectOption('#npPair', 'th>zh'); await page.click('#npGo'); await sleep(1200);
  await page.setInputFiles('#fFiles', F([path.join(fx, '剧B_01_中文.srt'), path.join(fx, '剧B_01_泰文.srt')])); await sleep(1500); await closePair();
  check('Thai → Chinese project sorts files by language', await S('S.eps.filter(e => !e.sample).map(e => e.name).join()') === '剧B_01_中文.srt');
  await page.click('#bProj'); await sleep(300); await page.click('.pitem:not(.cur) [data-act=open]'); await sleep(3000); await closePair();
  check('first project untouched', await S('S.eps[0].cues[0].t') === 'แก้แล้วคิวแรก');

  await page.click('#bMenu'); await page.click('#bConn'); await sleep(300);
  await page.fill('#k-gemini', 'BADKEY'); await page.click('[data-test=gemini]'); await sleep(800);
  check('bad key explained', /กุญแจ/.test(await page.innerText('#st-gemini')), await page.innerText('#st-gemini'));
  await page.fill('#k-gemini', 'TESTKEY'); await page.click('[data-test=gemini]'); await sleep(800);
  check('key connects, best model first', /แนะนำ Gemini 3 Pro/.test(await page.innerText('#st-gemini')), await page.innerText('#st-gemini'));
  await page.keyboard.press('Escape');
  await page.click('#bAI'); await sleep(800);
  await page.selectOption('#aiTask', 'qa'); await page.click('#aiGo'); await sleep(1500);
  await page.click('#aiApply'); await sleep(300);
  check('AI suggestion applied', await S('S.eps[0].cues[0].t') === 'สวัสดี ผมมาถึงแล้ว', await page.innerText('#aiProg'));
  await page.keyboard.press('Escape');
  await page.click('#bMenu'); await page.click('#bClients'); await sleep(500);
  await page.setInputFiles('#fGuide', F([path.join(fx, 'guide_test.docx'), path.join(fx, 'guide_test.pdf')])); await sleep(300);
  await page.click('#gGo'); await sleep(2000);
  check('guide read into rules', await page.inputValue('[data-cu=limitV]') === '14', await page.innerText('#gProg'));
  await page.click('#cuUse'); await sleep(500);
  check('client applied', /ลูกค้าทดสอบ/.test(await page.innerText('#pjMeta')));
  await page.click('#r-0-0'); await page.click('#bAsk'); await sleep(600);
  await page.click('#askQuick [data-q=alt]'); await sleep(1200);
  check('assistant offers options', await page.locator('#askLog .opt').count() === 2);
  await page.locator('#askLog .opt button').first().click(); await sleep(300);
  check('assistant option used', await S('S.eps[0].cues[0].t') === 'สวัสดี ผมกลับมาแล้ว');
  await shot('02-assistant');
  await page.click('#askClose');

  await page.click('#bExport'); await sleep(300);
  await page.check('input[name=exFmt][value=xlsx]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exGo')]);
  const xp = path.join(outDir, dl.suggestedFilename()); await dl.saveAs(xp);
  const xb = fs.readFileSync(xp);
  check('Excel export', xb.slice(0, 2).toString() === 'PK' && xb.includes('xl/workbook.xml') && xb.includes('xl/worksheets/sheet1.xml'), dl.suggestedFilename());

  await page.setInputFiles('#fFiles', F([path.join(fx, 'typo_01_泰文.srt')])); await sleep(1500); await closePair();
  const ty = await S('(() => { const ep = S.eps.find(e => e.name === "typo_01_泰文.srt"); return ep.cues.map(c => (c._q || { iss: [] }).iss.map(x => x.code).join("|")); })()');
  check('Thai typos found', /typo/.test(ty[0]) && /typo/.test(ty[1]) && /spell/.test(ty[2]), ty);

  // smooth playback with 9000 cues
  await page.click('#bProj'); await sleep(300);
  await page.fill('#npName', 'perf'); await page.selectOption('#npPair', 'zh>th'); await page.click('#npGo'); await sleep(1200);
  await page.setInputFiles('#fFiles', F(fs.readdirSync(path.join(fx, 'perf')).map(f => path.join(fx, 'perf', f)))); await sleep(10000); await closePair();
  await page.click('#r-0-0'); await sleep(2500);
  for (const rate of [1, 4]) {
    const r = await page.evaluate(async rate => {
      const v = document.getElementById('video'); v.muted = true; v.pause(); v.currentTime = 0; v.playbackRate = rate;
      const q0 = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : { totalVideoFrames: 0, droppedVideoFrames: 0 };
      const gaps = []; let last = performance.now(), stop = false;
      const f = t => { gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(f); }; requestAnimationFrame(f);
      await v.play(); await new Promise(r => setTimeout(r, 6000)); stop = true; v.pause();
      const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : q0;
      const g = gaps.slice(3).sort((a, b) => b - a);
      return { rate, total: q.totalVideoFrames - q0.totalVideoFrames, dropped: q.droppedVideoFrames - q0.droppedVideoFrames, maxGap: Math.round(g[0] || 0), p99: Math.round(g[Math.floor(g.length * 0.01)] || 0), t: v.currentTime };
    }, rate);
    console.log('PERF', JSON.stringify(r));
    check(`playback at ${rate}× keeps the screen updating (p99 frame gap < 50 ms)`, r.p99 < 50 && r.t > rate * 4, r);
  }
  await shot('03-perf');
  const pe = await page.evaluate(() => window.__errs || []);
  check('no script errors', !errs.length && !pe.length, errs.concat(pe));
} catch (e) {
  check('test run', false, String(e && e.stack || e));
} finally {
  try { if (browser) await browser.close(); } catch (e) {}
  server.close();
}
const failed = results.filter(r => !r.pass);
console.log(`\nRESULT [${engine}]: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
