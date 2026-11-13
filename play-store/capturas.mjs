// Genera las capturas y gráficos para la ficha de Google Play.
// Uso (desde la raíz del repo): node play-store/capturas.mjs [movil|tablet7|tablet10]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = ROOT + 'play-store/';
const APP = 'file://' + ROOT + 'www/index.html';
const b = await chromium.launch();

// Partidas de ejemplo: cuatro amigos, varias jornadas, con la clasificación llena
const seed = () => {
  const names = ['Carlos', 'Tere', 'Aitor', 'Lola']; let s = 17; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  S.roster = names.slice();
  const base = new Date(2026, 9, 2, 21).getTime();
  for (let i = 0; i < 24; i++) {
    const n = 3 + (i % 2), ppl = names.slice().sort(() => rnd() - 0.5).slice(0, n);
    const players = ppl.map(nm => ({ id: uid(), name: nm }));
    const g = { id: uid(), created: base + i * 864e5 * 1.5, cfg: Object.assign({}, S.draft.cfg || {}), players, firstDealer: players[0].id, events: [] };
    g.cfg = cleanCfg(g.cfg);
    const tot = Object.fromEntries(players.map(p => [p.id, 0]));
    let k = 0;
    while (k++ < 40) {
      const vivos = players.filter(p => tot[p.id] <= g.cfg.limit);
      if (vivos.length < 2) break;
      const closer = vivos[Math.floor(rnd() * vivos.length)].id, scores = {};
      vivos.forEach(p => { scores[p.id] = p.id === closer ? (rnd() < 0.08 ? -50 : -10) : Math.floor(rnd() * 24); tot[p.id] += scores[p.id]; });
      g.events.push({ t: 'hand', dealer: players[k % n].id, closer, kind: scores[closer] === -50 ? 'chinchon' : 'bonus', scores, at: g.created + k * 120e3 });
    }
    const R = compute(g);
    S.archive.unshift({ ...g, finished: g.created + k * 120e3, hands: R.hand, winnerName: R.ended ? pname(g, R.ended.winner) : '(sin terminar)' });
  }
  save();
};

const setup = async (p, name) => {
  await p.evaluate(() => { closeModal(); S.game = null; });
  if (name === '1-mesa') {
    await p.evaluate(() => { S.draft.mode = 'play'; S.draft.play = Object.assign(S.draft.play || {}, { name: 'Carlos', bots: 3, level: 'normal' }); render(); });
    await p.evaluate(() => { const bt = [...document.querySelectorAll('#app button.btn-gold')].pop(); bt && bt.click(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { if (S.game && S.game.play) { runBotsInstant(S.game); render(); } });
  }
  if (name === '2-marcador') {
    await p.evaluate(() => {
      const players = ['Carlos', 'Tere', 'Aitor', 'Lola'].map(n => ({ id: uid(), name: n }));
      const g = { id: uid(), created: Date.now(), cfg: cleanCfg(S.draft.cfg || {}), players, firstDealer: players[0].id, events: [] };
      const manos = [[-10, 7, 12, 4], [9, -10, 3, 15], [2, 11, -10, 8], [14, 5, 6, -10], [-10, 21, 9, 3], [6, -10, 17, 12]];
      manos.forEach((m, k) => { const scores = {}; players.forEach((p, i) => scores[p.id] = m[i]); const c = players[m.indexOf(-10)].id; g.events.push({ t: 'hand', dealer: players[k % 4].id, closer: c, kind: 'bonus', scores, at: Date.now() - (6 - k) * 180e3 }); });
      S.game = g; render();
    });
  }
  if (name === '3-inicio') {
    await p.evaluate(() => { S.draft.mode = 'score'; S.draft.names = ['Carlos', 'Tere', 'Aitor', 'Lola']; S.draft.dealer = 0; render(); });
  }
  if (name === '4-clasificacion') await p.evaluate(() => { render(); openArchive('ranking'); });
  if (name === '5-reglas') await p.evaluate(() => { render(); openGameRules(); });
  await p.waitForTimeout(700);
};

const SHOTS = ['1-mesa', '2-marcador', '3-inicio', '4-clasificacion', '5-reglas'];
const SIZES = [['movil', 405, 720, 1080 / 405], ['tablet7', 600, 960, 2], ['tablet10', 1280, 800, 1.5]];
const only = process.argv[2];
for (const [dev, w, h, dsf] of SIZES) {
  if (only && only !== dev) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: 'es-ES', hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(APP); await p.waitForTimeout(800);
  await p.evaluate(seed); await p.waitForTimeout(200);
  for (const name of SHOTS) {
    await setup(p, name);
    await p.screenshot({ path: `${OUT}${dev}-${name}.png` });
  }
  await ctx.close();
}

// Icono 512 y gráfico destacado 1024×500
const g = await b.newPage({ viewport: { width: 1024, height: 500 } });
await g.goto(APP); await g.waitForTimeout(600);
const icon = await g.evaluate(() => { const l = document.querySelector('link[rel~="icon"],link[rel="apple-touch-icon"]'); return l ? l.href : null; });
await g.setContent(`<html><body style="margin:0;width:1024px;height:500px;background:radial-gradient(circle at 30% 40%,#14563f,#0b2a20);display:flex;align-items:center;gap:48px;padding:0 70px;box-sizing:border-box;font-family:system-ui;color:#f3efe2">
  <img src="${icon}" style="width:260px;height:260px;border-radius:52px;box-shadow:0 10px 40px #0008">
  <div><div style="font-size:84px;font-weight:800;color:#f4c13d;line-height:1">Chinchón</div>
  <div style="font-size:34px;margin-top:18px;line-height:1.25">Juega contra la máquina,<br>en línea o lleva los puntos</div>
  <div style="font-size:22px;margin-top:22px;opacity:.75">Baraja española · sin anuncios · sin cuentas</div></div></body></html>`);
await g.waitForTimeout(400);
await g.screenshot({ path: OUT + 'grafico-destacado-1024x500.png' });
await g.setViewportSize({ width: 512, height: 512 });
await g.setContent(`<html><body style="margin:0;width:512px;height:512px;overflow:hidden"><img src="${icon}" style="width:512px;height:512px"></body></html>`);
await g.waitForTimeout(300);
await g.screenshot({ path: OUT + 'icono-512.png' });
await b.close();
console.log('Capturas listas en play-store/');
