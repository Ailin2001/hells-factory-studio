// End-to-end test of the real installed desktop app on Windows.
// Starts the app with WebView2 remote debugging on, attaches Playwright over CDP and uses it like a person would.
// usage: node e2e/run.mjs <path-to-app.exe>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
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
const proc = spawn(app, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
  stdio: 'ignore'
});

let browser, page;
async function shot(name) {
  try { const b = await page.screenshot({ type: 'jpeg', quality: 70 }); console.log(`SHOT_BEGIN ${name}\n${b.toString('base64')}\nSHOT_END`); }
  catch (e) { console.log('screenshot failed', name, e.message); }
}

try {
  for (let i = 0; i < 40 && !browser; i++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch (e) { await sleep(500); }
  }
  if (!browser) throw new Error('could not attach to the app (WebView2 debugging port)');
  const ctx = browser.contexts()[0];
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find(p => !p.url().startsWith('devtools')); if (!page) await sleep(500); }
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.waitForSelector('#langSel', { timeout: 30000 });
  check('app opens and shows the UI', true, await page.title() + ' · ' + page.url());
  check('runs in desktop mode', await page.evaluate(() => !!(window.HF_PLATFORM && window.HF_PLATFORM.desktop)));
  const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  check('window fills the screen', size.w >= 1000 && size.h >= 600, size);
  await shot('01-open');

  const files = ['测试剧_01_泰文.srt', '测试剧_01.srt', '测试剧_01.mp4', '测试剧_02.zip', '测试剧_03.7z'].map(f => path.join(fx, f));
  await page.setInputFiles('#fFiles', files);
  await sleep(6000);
  const pairOpen = await page.evaluate(() => document.getElementById('mPair').classList.contains('open'));
  if (pairOpen) await page.keyboard.press('Escape');
  const heads = await page.evaluate(() => [...document.querySelectorAll('.eph')].map(h => h.innerText.replace(/\n/g, ' | ')));
  check('open files: srt + mp4 + zip + 7z → 3 episodes', heads.length === 3, { pairOpen, heads });
  check('原文 matched to EP01', /原文/.test(heads[0] || '') && !/ไม่มี原文/.test(heads[0] || ''), heads[0]);
  check('video matched to EP01', /มีวิดีโอ/.test(heads[0] || ''), heads[0]);
  await shot('02-loaded');

  await page.click('#r-0-0');
  await sleep(4000);
  const v = await page.evaluate(() => { const v = document.getElementById('video'); return { src: !!v.currentSrc, ready: v.readyState, dur: v.duration, err: v.error && v.error.code }; });
  check('video loads', v.src && v.ready >= 1 && !v.err, v);
  const played = await page.evaluate(() => new Promise(res => {
    const v = document.getElementById('video'); v.muted = true; const t0 = v.currentTime;
    v.play().then(() => setTimeout(() => { res({ ok: true, from: t0, to: v.currentTime }); v.pause(); }, 1500)).catch(e => res({ ok: false, err: String(e) }));
  }));
  check('video plays', played.ok && played.to > played.from, played);
  let wave = null;
  for (let i = 0; i < 20; i++) {
    wave = await page.evaluate(() => { const S = window.__hfState(); const v = S.videos[0]; const a = v && S.audio.get(v.url); return a ? { status: a.status || null, peaks: a.peaks ? a.peaks.length : 0 } : null; });
    if (wave && wave.peaks) break;
    await sleep(1000);
  }
  check('waveform built from the video audio', wave && wave.peaks > 0, wave);
  await shot('03-video');

  await page.click('#ta');
  await page.keyboard.press('End');
  await page.keyboard.type(' ทดสอบ');
  await sleep(300);
  const dirty = await page.innerText('#saveState');
  await page.keyboard.press('Control+s');
  await sleep(800);
  const saved = await page.innerText('#saveState');
  check('edit marks unsaved, Ctrl+S saves', /ยังไม่บันทึก/.test(dirty) && /บันทึกแล้ว/.test(saved), { dirty, saved });

  await page.evaluate(d => { window.__HF_E2E_SAVE_DIR = d; }, outDir);
  await page.keyboard.press('Control+e');
  await sleep(600);
  check('Ctrl+E opens export', await page.isVisible('#mExport'));
  await page.click('#exGo');
  let outFiles = [];
  for (let i = 0; i < 15; i++) { outFiles = fs.readdirSync(outDir); if (outFiles.length) break; await sleep(1000); }
  const toast = await page.innerText('#toastMsg');
  check('export writes a zip to disk', outFiles.some(f => f.endsWith('.zip')) && fs.statSync(path.join(outDir, outFiles[0])).size > 100, { outFiles, toast });

  await page.selectOption('#langSel', 'en');
  await sleep(500);
  check('language switch to English', (await page.innerText('#bDir')) === 'Open folder', await page.innerText('#bDir'));
  await page.selectOption('#langSel', 'zh');
  await sleep(300);
  check('language switch to Chinese', (await page.innerText('#bDir')) === '打开文件夹', await page.innerText('#bDir'));
  await shot('04-chinese');
  await page.selectOption('#langSel', 'th');

  const pageErrs = await page.evaluate(() => window.__errs || []);
  check('no script errors', !errs.length && !pageErrs.length, errs.concat(pageErrs));
} catch (e) {
  check('test run', false, String(e && e.stack || e));
  if (page) await shot('error');
} finally {
  try { if (browser) await browser.close(); } catch (e) {}
  proc.kill();
}
const failed = results.filter(r => !r.pass);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync('e2e-results.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
