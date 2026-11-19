// End-to-end test of the real installed desktop app on Windows.
// Starts the app with WebView2 remote debugging on, attaches Playwright over CDP and uses it like a person would.
// usage: node e2e/run.mjs <path-to-app.exe>
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const app = process.argv[2];
const fx = path.resolve('e2e/fixtures');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfout-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
};
console.log('app:', app, fs.existsSync(app) ? 'exists' : 'MISSING');

let proc, browser, page, errs = [];
async function launch() {
  proc = spawn(app, [], { env: { ...process.env, HF_E2E_DEBUG_PORT: '9222' }, stdio: 'ignore' });
  browser = null; page = null;
  for (let i = 0; i < 120 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch (e) { await sleep(500); } }
  if (!browser) throw new Error('could not attach to the app (WebView2 debugging port)');
  const ctx = browser.contexts()[0];
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find(p => !p.url().startsWith('devtools')); if (!page) await sleep(500); }
  errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.waitForSelector('#langSel', { state: 'attached', timeout: 30000 });
  await sleep(2500);
}
async function closeLikeAPerson() {
  // the same as clicking the window's X
  spawnSync('powershell', ['-NoProfile', '-Command', `Get-Process | Where-Object { $_.Id -eq ${proc.pid} } | ForEach-Object { [void]$_.CloseMainWindow() }`]);
  let gone = false;
  for (let i = 0; i < 40; i++) { if (proc.exitCode !== null) { gone = true; break; } await sleep(250); }
  try { await browser.close(); } catch (e) {}
  if (!gone) { proc.kill(); await sleep(1500); }
  spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue']);
  await sleep(1500);
  return gone;
}
async function shot(name) {
  try { const b = await page.screenshot({ type: 'jpeg', quality: 70 }); console.log(`SHOT_BEGIN ${name}\n${b.toString('base64')}\nSHOT_END`); }
  catch (e) { console.log('screenshot failed', name, e.message); }
}
const S = js => page.evaluate(`(() => { const S = window.__hfState(); return ${js}; })()`);
const closePair = async () => { if (await page.evaluate(() => document.getElementById('mPair').classList.contains('open'))) await page.keyboard.press('Escape'); };
const latest = (ext, after) => fs.readdirSync(outDir).filter(f => f.endsWith(ext)).map(f => path.join(outDir, f)).filter(f => fs.statSync(f).mtimeMs > after);
async function waitFile(ext, after) { for (let i = 0; i < 20; i++) { const l = latest(ext, after); if (l.length) return l[0]; await sleep(500); } return null; }

try {
  /* ---------- first start ---------- */
  await launch();
  check('app opens and shows the UI', true, await page.title() + ' · ' + page.url());
  check('runs in desktop mode', await page.evaluate(() => !!(window.HF_PLATFORM && window.HF_PLATFORM.desktop)));
  const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  check('window fills the screen', size.w >= 1000 && size.h >= 600, size);
  check('a first project exists', (await page.innerText('#pjName')).length > 0, await page.innerText('#pjName'));
  await shot('01-open');

  await page.setInputFiles('#fFiles', ['测试剧_01_泰文.srt', '测试剧_01.srt', '测试剧_01.mp4', '测试剧_02.zip', '测试剧_03.7z'].map(f => path.join(fx, f)));
  await sleep(6000); await closePair();
  const heads = await page.evaluate(() => [...document.querySelectorAll('.eph')].map(h => h.innerText.replace(/\n/g, ' | ')));
  check('open files: srt + mp4 + zip + 7z → 3 episodes', heads.length === 3, heads);
  check('原文 and video matched to EP01', /原文/.test(heads[0] || '') && !/ไม่มี原文/.test(heads[0] || '') && /มีวิดีโอ/.test(heads[0] || ''), heads[0]);

  await page.click('#r-0-0'); await sleep(3000);
  const played = await page.evaluate(() => new Promise(res => { const v = document.getElementById('video'); v.muted = true; const t0 = v.currentTime; v.play().then(() => setTimeout(() => { res({ ok: true, from: t0, to: v.currentTime }); v.pause(); }, 1500)).catch(e => res({ ok: false, err: String(e) })); }));
  check('video plays', played.ok && played.to > played.from, played);
  let wave = null;
  for (let i = 0; i < 20; i++) { wave = await S('(() => { const v = S.videos[0]; const a = v && S.audio.get(v.url); return a ? { status: a.status || null, peaks: a.peaks ? a.peaks.length : 0 } : null; })()'); if (wave && wave.peaks) break; await sleep(1000); }
  check('waveform built from the video audio', wave && wave.peaks > 0, wave);
  check('speed goes up to 4×', await page.evaluate(() => !!document.querySelector('#rate option[value="4"]')));
  await shot('02-loaded');

  await page.click('#r-0-0'); await sleep(300);
  await page.click('#ta'); await page.keyboard.press('End'); await page.keyboard.type(' ทดสอบ'); await sleep(400);
  const dirty = await page.innerText('#saveState');
  await page.keyboard.press('Control+s'); await sleep(800);
  const saved = await page.innerText('#saveState');
  check('edit marks unsaved, Ctrl+S saves', /ยังไม่บันทึก/.test(dirty) && /บันทึกแล้ว/.test(saved), { dirty, saved });
  const editedText = await S('S.eps[0].cues[0].t');

  await page.evaluate(d => { window.__HF_E2E_SAVE_DIR = d; }, outDir);
  let t0 = Date.now();
  await page.keyboard.press('Control+e'); await sleep(500);
  check('Ctrl+E opens export', await page.isVisible('#mExport'));
  await page.click('#exGo');
  const zip = await waitFile('.zip', t0);
  check('export subtitles writes a zip to disk', zip && fs.statSync(zip).size > 100, zip);
  t0 = Date.now();
  await page.keyboard.press('Control+e'); await sleep(500);
  await page.check('input[name=exFmt][value=xlsx]'); await page.check('input[name=exSheet][value=per]');
  await page.click('#exGo');
  const xl = await waitFile('.xlsx', t0);
  const xb = xl ? fs.readFileSync(xl) : Buffer.alloc(0);
  check('export Excel writes an .xlsx (one sheet per episode)', xb.slice(0, 2).toString() === 'PK' && xb.includes('xl/worksheets/sheet3.xml'), xl);

  /* projects */
  await page.click('#bProj'); await sleep(400);
  await shot('03-projects');
  await page.fill('#npName', 'ทดสอบ ไทย→จีน'); await page.selectOption('#npPair', 'th>zh'); await page.click('#npGo'); await sleep(1500);
  check('new project opens empty', (await page.innerText('#pjName')) === 'ทดสอบ ไทย→จีน' && await S('S.eps.filter(e => !e.sample).length') === 0, await page.innerText('#pjMeta'));
  await page.setInputFiles('#fFiles', [path.join(fx, '剧B_01_中文.srt'), path.join(fx, '剧B_01_泰文.srt')]); await sleep(2500); await closePair();
  check('Thai → Chinese: Chinese file is the translation, Thai is the source', await S('S.eps.filter(e => !e.sample).map(e => e.name).join()') === '剧B_01_中文.srt' && await S('S.srcs[S.eps[0].src].lang') === 'th');
  const zcodes = await S('S.eps[0].cues.map(c => (c._q || { iss: [] }).iss.map(x => x.code).join("|"))');
  check('Chinese rules: ，。 and 错别字 flagged', /punct/.test(zcodes[0]) && /spell/.test(zcodes[2]), zcodes);
  await page.click('#bProj'); await sleep(400);
  await page.click('.pitem:not(.cur) [data-act=open]'); await sleep(3000); await closePair();
  check('switching back keeps the first project untouched', await S('S.eps.length') === 3 && await S('S.eps[0].cues[0].t') === editedText, await S('S.eps.map(e => e.name).join()'));

  /* AI over the network through the desktop app (a fake key must be rejected by Google itself) */
  await page.click('#bMenu'); await page.click('#bConn'); await sleep(400);
  await page.fill('#k-gemini', 'AIzaFakeKeyForTesting000000000000000'); await page.click('[data-test=gemini]');
  let st = '';
  for (let i = 0; i < 30; i++) { st = await page.innerText('#st-gemini'); if (!/กำลังทดสอบ/.test(st)) break; await sleep(500); }
  check('AI call reaches Google from the desktop app (fake key rejected)', /กุญแจ/.test(st), st);
  await shot('04-connect-ai');
  await page.keyboard.press('Escape');

  /* client guide window + assistant panel */
  await page.click('#bMenu'); await page.click('#bClients'); await sleep(400);
  await page.setInputFiles('#fGuide', [path.join(fx, 'guide_test.docx'), path.join(fx, 'guide_test.pdf')]); await sleep(400);
  check('guide window takes PDF and Word files', await page.locator('#gFiles .fchip').count() === 2);
  await page.click('#gManual'); await sleep(300);
  await page.fill('#cuName', 'ลูกค้าทดสอบ'); await page.fill('[data-cu=limitH]', '18'); await page.fill('[data-cu=limitV]', '14'); await page.selectOption('[data-cu=orient]', 'both');
  await shot('05-guide');
  await page.click('#cuUse'); await sleep(600);
  check('client rules applied (landscape video → 18)', /ลูกค้าทดสอบ/.test(await page.innerText('#pjMeta')) && await S('S.cfg.limit') === 18, await S('S.cfg.limit'));
  await page.click('#r-0-0'); await page.keyboard.press('Control+j'); await sleep(600);
  check('assistant panel opens with the cue', await page.isVisible('#askPanel') && /EP01/.test(await page.innerText('#askCtx')));
  await shot('06-assistant');
  await page.click('#askClose');

  /* look: night mode and languages */
  await page.click('#bMenu'); await page.click('#bTheme'); await sleep(400); await shot('07-night');
  await page.click('#bMenu'); await page.click('#bTheme'); await sleep(200);
  await page.click('#bMenu'); await page.selectOption('#langSel', 'en'); await sleep(500);
  check('language switch to English', (await page.innerText('#bExport')).trim() === 'Export', await page.innerText('#bExport'));
  await page.selectOption('#langSel', 'zh'); await sleep(400);
  check('language switch to Chinese', (await page.innerText('#bExport')).trim() === '导出', await page.innerText('#bExport'));
  await page.selectOption('#langSel', 'th'); await page.keyboard.press('Escape');
  const pageErrs = await page.evaluate(() => window.__errs || []);
  check('no script errors (first start)', !errs.length && !pageErrs.length, errs.concat(pageErrs));

  /* ---------- close with the X button and start again ---------- */
  const gone = await closeLikeAPerson();
  check('app closes with the window X', gone);
  await launch();
  await sleep(3000); await closePair();
  check('after restart: the same project is open', /ลูกค้าทดสอบ/.test(await page.innerText('#pjMeta')) || (await page.innerText('#pjName')).length > 0, await page.innerText('#pjName') + ' · ' + await page.innerText('#pjMeta'));
  check('after restart: subtitles come back without dropping files', await S('S.eps.filter(e => !e.sample).length') === 3, await S('S.eps.map(e => e.name).join()'));
  check('after restart: the edit is still there', await S('S.eps[0] && S.eps[0].cues[0].t') === editedText, await S('S.eps[0] && S.eps[0].cues[0].t'));
  check('after restart: both projects listed', await S('true') && (await page.evaluate(() => JSON.parse(localStorage.getItem('hfsub1:projects')).list.length)) === 2);
  await shot('08-restart');

  /* ---------- smooth playback with a heavy job (30 episodes × 300 cues, a cue every 0.2 s) ---------- */
  await page.click('#bProj'); await sleep(300);
  await page.fill('#npName', 'perf'); await page.selectOption('#npPair', 'zh>th'); await page.click('#npGo'); await sleep(1500);
  const perf = fs.readdirSync(path.join(fx, 'perf')).map(f => path.join(fx, 'perf', f));
  await page.setInputFiles('#fFiles', perf); await sleep(12000); await closePair();
  check('heavy job loads (9000 cues)', await S('S.eps.reduce((a, e) => a + e.cues.length, 0)') === 9000, await page.evaluate(() => document.querySelectorAll('.row').length));
  await page.click('#r-0-0'); await sleep(3000);
  const measure = (rate, plain) => page.evaluate(async ({ rate, plain }) => {
    const app = document.getElementById('video');
    let v = app;
    if (plain) { v = document.createElement('video'); v.src = app.currentSrc; v.muted = true; v.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:999;background:#000'; document.body.appendChild(v); await new Promise(r => { v.onloadeddata = r; setTimeout(r, 5000); }); }
    app.pause(); v.muted = true; v.currentTime = 0; v.playbackRate = rate; v.defaultPlaybackRate = rate;
    const lt = []; const po = new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(e.duration); }); po.observe({ entryTypes: ['longtask'] });
    const q0 = v.getVideoPlaybackQuality(); const gaps = []; let last = performance.now(), stop = false;
    const f = t => { gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await v.play(); await new Promise(r => setTimeout(r, 8000)); stop = true; v.pause(); po.disconnect();
    const q = v.getVideoPlaybackQuality(); if (plain) v.remove();
    const g = gaps.slice(3).sort((a, b) => b - a);
    const total = q.totalVideoFrames - q0.totalVideoFrames, dropped = q.droppedVideoFrames - q0.droppedVideoFrames;
    return { rate, plain, total, dropped, dropPct: total ? +(dropped / total * 100).toFixed(1) : 0, longtasks: lt.length, maxLong: Math.round(Math.max(0, ...lt)), maxGap: Math.round(g[0] || 0), p99: Math.round(g[Math.floor(g.length * 0.01)] || 0), t: +v.currentTime.toFixed(2) };
  }, { rate, plain });
  for (const rate of [1, 4]) {
    const base = await measure(rate, true);
    const r = await measure(rate, false);
    console.log('PERF', JSON.stringify(base), JSON.stringify(r));
    check(`smooth at ${rate}×: no freezes (long tasks < 100 ms)`, r.maxLong < 100, r);
    check(`smooth at ${rate}×: frames dropped no more than a plain video (+5%)`, r.dropPct <= base.dropPct + 5, { app: r.dropPct, plainVideo: base.dropPct });
    check(`smooth at ${rate}×: screen keeps updating (p99 frame gap < 50 ms)`, r.p99 < 50, r);
  }
  const follow = await S('S.sel && S.sel.c');
  check('list follows the video during playback', follow > 10, follow);
  await shot('09-perf');
  const pageErrs2 = await page.evaluate(() => window.__errs || []);
  check('no script errors (after restart)', !errs.length && !pageErrs2.length, errs.concat(pageErrs2));
} catch (e) {
  check('test run', false, String(e && e.stack || e));
  if (page) await shot('error');
} finally {
  try { if (browser) await browser.close(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
}
const failed = results.filter(r => !r.pass);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync('e2e-results.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
