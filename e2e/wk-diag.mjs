// Layout and playback check of the cue list in one engine, with a few CSS variants, to pick what works in WebKit (Mac).
// usage: node e2e/wk-diag.mjs webkit
import * as pw from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const engine = process.argv[2] || 'webkit';
const dist = path.resolve('dist'), fx = path.resolve('e2e/fixtures');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/index.html`;
const F = list => list.map(f => ({ name: path.basename(f), mimeType: f.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream', buffer: fs.readFileSync(f) }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VARIANTS = { asis: '', none: '.epb{content-visibility:visible!important}' };
const browser = await pw[engine].launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] } : {});
const summary = [];
for (const [name, css] of Object.entries(VARIANTS)) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base); await sleep(1500);
  if (css) await page.addStyleTag({ content: css });
  await page.setInputFiles('#fFiles', F(fs.readdirSync(path.join(fx, 'perf')).slice(0, process.env.ALL ? 999 : 13).map(f => path.join(fx, 'perf', f)))); // 6 episodes + video
  await sleep(5000);
  if (await page.evaluate(() => document.getElementById('mPair').classList.contains('open'))) await page.keyboard.press('Escape');
  const lay = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.epb')].slice(0, 4).map(b => { const r = b.getBoundingClientRect(); return { id: b.id, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), cv: getComputedStyle(b).contentVisibility }; });
    const r0 = document.getElementById('r-0-0').getBoundingClientRect();
    const hit = document.elementFromPoint(r0.left + 200, r0.top + r0.height / 2);
    return { blocks: bs, row0: { top: Math.round(r0.top), h: Math.round(r0.height) }, hit: hit && (hit.closest('.row, .eph') || hit).id };
  });
  let clickOk = true; try { await page.click('#r-0-1', { timeout: 3000 }); } catch (e) { clickOk = false; }
  const overlap = lay.blocks.some((b, i) => i && b.top < lay.blocks[i - 1].bottom - 1);
  await page.click('#r-0-0', { timeout: 3000 }).catch(() => {}); await sleep(1500);
  const perf = await page.evaluate(async () => {
    const v = document.getElementById('video'); v.muted = true; v.pause(); v.currentTime = 0; v.playbackRate = 4;
    const gaps = []; let last = performance.now(), stop = false;
    const f = t => { gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(f); }; requestAnimationFrame(f);
    try { await v.play(); } catch (e) { return { err: String(e) }; }
    await new Promise(r => setTimeout(r, 5000)); stop = true; v.pause();
    const g = gaps.slice(3).sort((a, b) => b - a);
    return { frames: g.length, maxGap: Math.round(g[0] || 0), p99: Math.round(g[Math.floor(g.length * 0.01)] || 0), t: +v.currentTime.toFixed(1) };
  });
  const plain = await page.evaluate(async () => {
    const a = document.getElementById('video'); const v = document.createElement('video'); v.src = a.currentSrc; v.muted = true; v.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:999;background:#000'; document.body.appendChild(v);
    await new Promise(r => { v.onloadeddata = r; setTimeout(r, 5000); }); v.playbackRate = 4;
    const gaps = []; let last = performance.now(), stop = false;
    const f = t => { gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await v.play(); await new Promise(r => setTimeout(r, 5000)); stop = true; v.pause(); v.remove();
    const g = gaps.slice(3).sort((a, b) => b - a);
    return { frames: g.length, maxGap: Math.round(g[0] || 0), p99: Math.round(g[Math.floor(g.length * 0.01)] || 0) };
  });
  const r = { name, overlap, clickOk, hit: lay.hit, blocks: lay.blocks, perf, plain };
  summary.push(r);
  console.log('VARIANT', JSON.stringify(r));
  const b = await page.screenshot({ type: 'jpeg', quality: 60 }); console.log(`SHOT_BEGIN ${engine}-${name}\n${b.toString('base64')}\nSHOT_END`);
  await page.close();
}
await browser.close(); server.close();
console.log('SUMMARY', JSON.stringify(summary.map(s => ({ name: s.name, ok: !s.overlap && s.clickOk && s.hit === 'r-0-0', p99: s.perf.p99, maxGap: s.perf.maxGap, plainP99: s.plain.p99 }))));
