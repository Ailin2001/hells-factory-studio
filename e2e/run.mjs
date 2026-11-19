// End-to-end test of the real desktop app through tauri-driver (WebDriver).
// usage: node e2e/run.mjs <path-to-app.exe>
import { Builder, By, Capabilities, Key, until } from 'selenium-webdriver';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const app = process.argv[2];
const fx = path.resolve('e2e/fixtures');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfout-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

console.log('app:', app, fs.existsSync(app) ? 'exists' : 'MISSING');
const drv = spawn(process.env.TAURI_DRIVER || 'tauri-driver', ['--native-driver', process.env.NATIVE_DRIVER], { stdio: ['ignore', 'inherit', 'inherit'] });
await sleep(4000);

const caps = new Capabilities();
caps.set('tauri:options', { application: app });
caps.setBrowserName('wry');
let d;
async function shot(name) {
  try { const b64 = await d.takeScreenshot(); console.log(`SHOT_BEGIN ${name}\n${b64}\nSHOT_END`); } catch (e) { console.log('screenshot failed', name, e.message); }
}
const js = (code, ...args) => d.executeScript(code, ...args);
const jsAsync = (code, ...args) => d.executeAsyncScript(code, ...args);

try {
  d = await new Builder().withCapabilities(caps).usingServer('http://127.0.0.1:4444/').build();
  await d.wait(until.elementLocated(By.id('langSel')), 30000);
  check('app opens and shows the UI', true, await d.getTitle());
  check('runs in desktop mode', await js('return !!(window.HF_PLATFORM && window.HF_PLATFORM.desktop)'));
  const errs0 = await js('return window.__errs || []');
  await shot('01-open');

  const files = ['测试剧_01_泰文.srt', '测试剧_01.srt', '测试剧_01.mp4', '测试剧_02.zip', '测试剧_03.7z'].map(f => path.join(fx, f));
  await d.findElement(By.id('fFiles')).sendKeys(files.join('\n'));
  await sleep(6000);
  const pairOpen = await js("return document.getElementById('mPair').classList.contains('open')");
  await js("document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'))");
  const heads = await js("return [...document.querySelectorAll('.eph')].map(h => h.innerText.replace(/\\n/g, ' | '))");
  check('open files: srt + mp4 + zip + 7z → 3 episodes', heads.length === 3, { pairOpen, heads });
  check('source (原文) matched to EP01', /原文/.test(heads[0] || '') && !/ไม่มี原文/.test(heads[0] || ''), heads[0]);
  check('video matched to EP01', /มีวิดีโอ/.test(heads[0] || ''), heads[0]);
  await shot('02-loaded');

  await d.findElement(By.id('r-0-0')).click();
  await sleep(4000);
  const v = await js("const v = document.getElementById('video'); return { src: !!v.currentSrc, ready: v.readyState, dur: v.duration, err: v.error && v.error.code }");
  check('video loads', v.src && v.ready >= 1 && !v.err, v);
  const played = await jsAsync("const cb = arguments[arguments.length - 1]; const v = document.getElementById('video'); v.muted = true; const t0 = v.currentTime; v.play().then(() => setTimeout(() => { cb({ ok: true, from: t0, to: v.currentTime }); v.pause(); }, 1500)).catch(e => cb({ ok: false, err: String(e) }));");
  check('video plays', played.ok && played.to > played.from, played);
  let wave = null;
  for (let i = 0; i < 20; i++) {
    wave = await js("const S = window.__hfState(); const v = S.videos[0]; const a = v && S.audio.get(v.url); return a ? { status: a.status || null, peaks: a.peaks ? a.peaks.length : 0 } : null");
    if (wave && wave.peaks) break;
    await sleep(1000);
  }
  check('waveform is built from the video audio', wave && wave.peaks > 0, wave);
  await shot('03-video');

  const ta = await d.findElement(By.id('ta'));
  await ta.click();
  await ta.sendKeys(Key.END, ' ทดสอบ');
  await sleep(300);
  const dirty = await js("return document.getElementById('saveState').innerText");
  await ta.sendKeys(Key.CONTROL, 's');
  await sleep(800);
  const saved = await js("return document.getElementById('saveState').innerText");
  check('edit marks unsaved, Ctrl+S saves', /ยังไม่บันทึก/.test(dirty) && /บันทึกแล้ว/.test(saved), { dirty, saved });

  await js('window.__HF_E2E_SAVE_DIR = arguments[0]', outDir);
  await js("document.getElementById('bExport').click()");
  await sleep(600);
  await js("document.getElementById('exGo').click()");
  let outFiles = [];
  for (let i = 0; i < 15; i++) { outFiles = fs.readdirSync(outDir); if (outFiles.length) break; await sleep(1000); }
  const toast = await js("return document.getElementById('toastMsg').innerText");
  check('export writes a zip to disk', outFiles.some(f => f.endsWith('.zip')) && fs.statSync(path.join(outDir, outFiles[0])).size > 100, { outFiles, toast });

  await js("const s = document.getElementById('langSel'); s.value = 'en'; s.dispatchEvent(new Event('change'))");
  await sleep(500);
  const en = await js("return document.getElementById('bDir').innerText");
  check('language switch to English', en === 'Open folder', en);
  await js("const s = document.getElementById('langSel'); s.value = 'th'; s.dispatchEvent(new Event('change'))");
  await shot('04-end');
  const errs = await js('return window.__errs || []');
  check('no script errors', !errs.length, errs);
} catch (e) {
  check('test run', false, String(e && e.stack || e));
  await shot('error');
} finally {
  try { if (d) await d.quit(); } catch (e) {}
  drv.kill();
}
const failed = results.filter(r => !r.pass);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync('e2e-results.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
