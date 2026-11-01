// Pruebas automáticas de Chinchón · Marcador
// Se ejecutan en GitHub antes de compilar: si alguna falla, no se publica la versión.
// Uso local: node tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../www/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try { const f = await readFile(join(ROOT, path === '/' ? 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }); res.end(f); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const URL_APP = `http://localhost:${server.address().port}/`;

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); if (process.env.GITHUB_ACTIONS) console.log('::error::' + (name + (extra ? ' → ' + extra : '')).replace(/\n/g, ' ').slice(0, 900)); } };

const browser = await chromium.launch();
async function fresh(state) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(st => { if (st && !sessionStorage.getItem('seeded')) { localStorage.setItem('chinchon.v1', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } }, state || { onboarded: true });
  await p.goto(URL_APP);
  return { p, ctx, errors };
}
const totals = p => p.evaluate(() => { const R = compute(S.game); return Object.fromEntries(S.game.players.map(x => [x.name, R.st[x.id].total])); });
const keys = async (p, s) => { for (const ch of s) await p.click(`[data-k="${ch}"]`); };
async function startGame(p, names, dealer = 0) {
  for (const [i, n] of names.entries()) { if (!(await p.$(`[data-name="${i}"]`))) await p.click('#addP'); await p.fill(`[data-name="${i}"]`, n); }
  if (dealer) await p.click(`[data-deal="${dealer}"]`);
  await p.click('#start');
}
async function hand(p, pts, closer, kind) {
  await p.click('#addHand');
  if (closer) { await p.click(`[data-close="${await p.evaluate(n => S.game.players.find(x => x.name === n).id, closer)}"]`); if (kind) await p.click(`[data-kind="${kind}"]`); }
  for (const [name, v] of Object.entries(pts)) {
    const id = await p.evaluate(n => S.game.players.find(x => x.name === n).id, name);
    await p.click(`[data-sc="${id}"]`);
    await keys(p, String(v));
  }
  await p.click('#hSave');
  await p.waitForTimeout(50);
}

console.log('Puntuación, eliminación, reparto y reenganche');
{
  const { p, ctx, errors } = await fresh();
  await startGame(p, ['Carlos', 'Ana', 'Pepe', 'Lola'], 1);
  await hand(p, { Carlos: 12, Ana: 3, Pepe: 40, Lola: 25 }, 'Ana');
  await hand(p, { Ana: 8, Pepe: 50, Lola: 20 }, 'Carlos', 'bonus');
  await hand(p, { Carlos: 20, Ana: 45, Pepe: 15 }, 'Lola', 'bonus');
  const t = await totals(p);
  check('totales correctos', t.Carlos === 22 && t.Ana === 56 && t.Pepe === 105 && t.Lola === 35, JSON.stringify(t));
  const st = await p.evaluate(() => { const R = compute(S.game); return { out: S.game.players.filter(x => R.st[x.id].out).map(x => x.name), next: S.game.players.find(x => x.id === R.next).name }; });
  check('Pepe eliminado al pasar de 100', st.out.join() === 'Pepe', st.out.join());
  check('el reparto pasa al siguiente (Ana → Pepe → Lola → Carlos)', st.next === 'Carlos', st.next);
  const pepe = await p.evaluate(() => S.game.players.find(x => x.name === 'Pepe').id);
  await p.click(`[data-rebuy="${pepe}"]`); await p.click('#cOk');
  check('reenganche con los puntos del que más tiene', (await totals(p)).Pepe === 56);
  check('no se puede reenganchar dos veces (límite 1)', await p.evaluate(id => { S.game.events.push({ t: 'hand', dealer: S.game.players[0].id, closer: null, kind: 'normal', scores: Object.fromEntries(S.game.players.map(x => [x.id, x.id === id ? 60 : 0])) }); const R = compute(S.game); const r = canRebuy(S.game, R, id); S.game.events.pop(); return !r; }, pepe));
  await hand(p, { Ana: 60, Pepe: 10, Lola: 50 }, 'Carlos', 'chinchon');
  check('chinchón gana la partida', await p.evaluate(() => { const R = compute(S.game); return R.ended && R.ended.by === 'chinchon' && pname(S.game, R.ended.winner) === 'Carlos'; }));
  check('sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Teclado, deshacer y corrección');
{
  const { p, ctx, errors } = await fresh();
  await startGame(p, ['A', 'B', 'C']);
  await p.click('#addHand'); await keys(p, '12'); await p.click('#kNext'); await keys(p, '7'); await p.click('#kNext'); await keys(p, '459'); await p.click('[data-k="del"]');
  check('máximo 3 cifras y borrar', (await p.$$eval('[data-sc]', e => e.map(x => x.textContent))).join() === '12,7,45');
  await p.click('#hSave'); await p.waitForTimeout(50);
  check('aparece «Deshacer»', await p.$eval('#undoBar', b => b.classList.contains('on')));
  await p.click('#undoBtn');
  check('deshacer quita la mano', await p.evaluate(() => S.game.events.length === 0));
  await p.click('#addHand'); await keys(p, '5'); await p.click('#hSave');
  check('avisa si falta una puntuación', /Falta/.test(await p.textContent('#hErr')));
  await p.click('#hCancel');
  await hand(p, { A: 10, B: 20, C: 30 });
  await p.click('tr.hand'); const cId = await p.evaluate(() => S.game.players[2].id);
  await p.click(`[data-sc="${cId}"]`); await p.click('[data-k="del"]'); await p.click('[data-k="del"]'); await keys(p, '31'); await p.click('#hSave');
  check('corregir una mano recalcula', (await totals(p)).C === 31);
  check('sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

// genera un historial de ejemplo determinista
const seedArchive = () => {
  const names = ['Carlos', 'Tere', 'Aitor', 'Lola']; let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const mk = (ts, players) => { const ps = players.map(n => ({ id: uid(), name: n })); const g = { id: uid(), created: ts, cfg: Object.assign({}, DEF_CFG), players: ps, firstDealer: ps[0].id, events: [] };
    let guard = 0; while (!compute(g).ended && guard++ < 80) { const R = compute(g); const act = R.active; const closer = act[Math.floor(rnd() * act.length)].id; const sc = {}; act.forEach(p => sc[p.id] = p.id === closer ? Math.floor(rnd() * 5) : Math.floor(rnd() * 45)); g.events.push({ t: 'hand', dealer: R.next, closer, kind: 'normal', scores: sc }); }
    const R = compute(g); return { ...g, finished: ts, hands: R.hand, winnerName: pname(g, R.ended.winner) }; };
  const base = new Date(2026, 8, 1, 21).getTime();
  for (let d = 0; d < 30; d += 3) for (let i = 0; i < 4; i++) S.archive.unshift(mk(base + d * 864e5 + i * 40 * 60e3, names));
  S.archive.unshift(mk(base + 31 * 864e5, ['Carlos', 'Pepe']));
  save(); render();
};

console.log('Clasificación, ficha, récords y jugadores');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(seedArchive);
  const rank = await p.evaluate(() => aggregate(S.archive.map(gameResult).filter(Boolean)).sort((a, b) => b.rating - a.rating).map(o => [o.name, o.pj]));
  check('ranking con todos los jugadores', rank.length === 5, JSON.stringify(rank));
  check('quien juega 1 partida no lidera', rank[0][0] !== 'Pepe');
  check('jornadas agrupadas (de 6:00 a 6:00)', await p.evaluate(() => new Set(S.archive.map(a => jornadaKey(a.finished))).size === 11));
  await p.click('#menuBtn'); await p.click('#mArch');
  await p.click('#modal [data-player="Tere"]');
  check('ficha del jugador', /Cara a cara/.test(await p.textContent('#modal')));
  await p.click('#pfBack'); await p.click('#modal [data-tab="records"]');
  check('récords', (await p.$$('#modal .hrow')).length >= 6);
  await p.click('#modal [data-tab="jornadas"]'); await p.click('#modal [data-tab="partidas"]'); await p.click('#aC');
  await p.evaluate(() => { S.archive[0].players[0].name = 'carlos '; S.roster = ['Carlos', 'Tere', 'Aitor', 'Lola', 'Teresa']; S.archive[1].players.find(x => x.name === 'Tere').name = 'Teresa'; save(); render(); });
  await p.click('#manageRoster'); await p.fill('[data-orig="Teresa"]', 'Tere'); await p.click('#roS'); await p.click('#cOk');
  check('unir «Teresa» con «Tere»', await p.evaluate(() => !S.archive.some(a => a.players.some(x => x.name === 'Teresa')) && !S.roster.includes('Teresa')));
  check('nombres con mayúsculas o espacios cuentan como el mismo jugador', await p.evaluate(() => aggregate(S.archive.map(gameResult).filter(Boolean)).filter(o => nkey(o.name) === 'carlos').length === 1));
  check('sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Copias, grupo y borrar datos');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(seedArchive);
  const json = await p.evaluate(() => backupJSON());
  const { p: p2, ctx: ctx2, errors: e2 } = await fresh();
  const n1 = await p2.evaluate(j => { const n = mergeBackup(JSON.parse(j)); save(); return n; }, json);
  const n2 = await p2.evaluate(j => mergeBackup(JSON.parse(j)), json);
  check('recibir partidas del grupo', n1 === 41, String(n1));
  check('recibir dos veces no duplica', n2 === 0 && (await p2.evaluate(() => S.archive.length)) === 41);
  check('se recuperan los jugadores habituales', await p2.evaluate(() => S.roster.includes('Tere')));
  check('rechaza archivos que no son copias', await p2.evaluate(() => !validBackup({ foo: 1 })));
  const evil = JSON.stringify({ app: 'chinchon-marcador', archive: [{ id: 'x"><img src=x onerror=window.__pwn=1>', created: 1, finished: 1, cfg: { limit: '<b>', closeBonus: '"><svg onload=window.__pwn=1>' },
    players: [{ id: '"><img src=x onerror=window.__pwn=1>', name: '<img src=x onerror=window.__pwn=1>' }, { id: 'b', name: 'B' }],
    firstDealer: 'b', events: [{ t: 'hand', dealer: 'b', closer: 'b', kind: 'x', scores: { b: 0, '"><img src=x onerror=window.__pwn=1>': '<img src=x onerror=window.__pwn=1>' } }] }],
    game: { id: 'g', players: [{ id: '"><b>', name: '<script>window.__pwn=1</script>' }, { id: 'c', name: 'C' }], events: [], cfg: { limit: '"><img src=x onerror=window.__pwn=1>' } } });
  const { p: p3, ctx: ctx3 } = await fresh();
  await p3.evaluate(j => { mergeBackup(JSON.parse(j)); save(); render(); }, evil);
  await p3.click('#menuBtn'); await p3.click('#mArch'); await p3.click('#modal [data-tab="partidas"]'); await p3.click('#modal [data-arch]'); await p3.waitForTimeout(150);
  await p3.click('#arClose'); await p3.click('#aC'); await p3.click('#addHand'); await p3.waitForTimeout(150);
  check('un archivo manipulado no puede inyectar código', await p3.evaluate(() => !window.__pwn && !document.querySelector('#app img, #modal img, #app svg[onload]')));
  check('los datos manipulados se limpian', await p3.evaluate(() => S.game && typeof S.game.cfg.limit === 'number' && S.archive[0].players.every(x => /^[A-Za-z0-9_-]+$/.test(x.id)) && !/[<>]/.test(S.archive[0].players.map(x => x.name).join(''))));
  await ctx3.close();
  await p2.click('#menuBtn'); await p2.click('#mWipe'); await p2.click('#wHist'); await p2.click('#cOk');
  check('borrar solo el historial', await p2.evaluate(() => S.archive.length === 0 && S.roster.length > 0));
  await p2.click('#menuBtn'); await p2.click('#mWipe'); await p2.click('#wAll'); await p2.click('#cOk'); await p2.click('#cOk');
  await p2.waitForLoadState('load'); await p2.waitForTimeout(200);
  check('borrar todo deja la app como nueva', await p2.evaluate(() => !S.archive.length && !S.game && !S.roster.length));
  check('sin errores de JavaScript', !errors.length && !e2.length, errors.concat(e2).join(' | '));
  await ctx.close(); await ctx2.close();
}

console.log('Bienvenida, actualizaciones y tamaño de letra');
{
  const { p, ctx, errors } = await fresh({});
  await p.waitForTimeout(600);
  check('bienvenida la primera vez', /Bienvenido/.test(await p.textContent('#modal')));
  for (let i = 0; i < 5; i++) await p.click('#wbNext');
  await p.click('#wbNext');
  check('la bienvenida no vuelve a salir', await p.evaluate(() => S.onboarded === true));
  check('comparar versiones', await p.evaluate(() => cmpVer('1.10.0', '1.9.9') > 0 && cmpVer('2.0.0', '2.0.0') === 0 && cmpVer('1.4.2', '1.5.0') < 0));
  await p.evaluate(() => { S.fontScale = '1.3'; applyFont(); render(); });
  check('con letra muy grande no se sale de la pantalla', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Juego contra la máquina');
{
  const { p, ctx, errors } = await fresh();
  const m = await p.evaluate(() => ({
    set: bestMelds(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'o12']).dead,             // trío de 5 + escalera 2-3-4 de bastos, suelta el rey
    run710: bestMelds(['c6', 'c7', 'c10', 'c11', 'o1', 'e1', 'b1']).dead,         // 6-7-sota-caballo de copas (7 y sota seguidas) + trío de ases
    overlap: bestMelds(['o3', 'o4', 'o5', 'c5', 'e5', 'b6', 'o6']).dead,           // escalera 3-6 de oros (deja 5+5+6) mejor que trío de cincos
    loose: bestMelds(['o1', 'c3', 'e5', 'b7', 'o10', 'c11', 'e12']).dead,
    chin: isChinchon(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']), chinNo: isChinchon(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'o7']),
    disc: bestDiscard(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'o12', 'c1']).discard
  }));
  check('trío + escalera, suelto el rey (10)', m.set === 10, JSON.stringify(m));
  check('el 7 y la sota van seguidos en escalera', m.run710 === 0);
  check('elige la mejor combinación cuando una carta vale para dos', m.overlap === 16, String(m.overlap));
  check('mano sin nada ligado suma todo', m.loose === 1 + 3 + 5 + 7 + 10 + 10 + 10);
  check('detecta el chinchón', m.chin && !m.chinNo);
  check('la máquina tira la carta que más pesa sin ligar', m.disc === 'o12', m.disc);
  // 150 partidas completas entre máquinas
  const sim = await p.evaluate(() => {
    let games = 0, hands = 0, bad = 0, ended = 0, early = 0;
    for (let k = 0; k < 150; k++) {
      const n = 2 + (k % 3), ps = Array.from({ length: n }, (_, i) => ({ id: uid(), name: '🤖 ' + i }));
      const g = { id: uid(), created: Date.now(), cfg: Object.assign({}, DEF_CFG, { rebuyMode: 'none' }), players: ps, firstDealer: ps[0].id, events: [], play: { level: k % 2 ? 'facil' : 'normal', bots: ps.map(x => x.id), hand: null } };
      let guard = 0;
      while (!compute(g).ended && guard++ < 300) {
        dealHand(g);
        const h = g.play.hand, all = [...h.deck, ...h.discard, ...Object.values(h.hands).flat()];
        if (all.length !== 40 || new Set(all).size !== 40) bad++;
        runBotsInstant(g); hands++;
        const e = g.events[g.events.length - 1];
        if (!e || Object.keys(e.scores).length !== h.order.length) bad++;
        if (e.closer && e.kind === 'normal' && e.scores[e.closer] > 5) bad++;
        if (e.closer && h.result.round < 2) early++;
      }
      games++; if (compute(g).ended) ended++;
    }
    return { games, hands, bad, ended, early };
  });
  const jk = await p.evaluate(() => { JOKER_VALUE = 0; return ({
    group: bestMelds(['o5', 'c5', 'j1', 'b2', 'b3', 'b4', 'o1']).dead,          // 5-5-comodín + 2-3-4 de bastos, suelto el as
    gap: bestMelds(['c1', 'c2', 'j1', 'c4', 'o7', 'e7', 'b7']).dead,            // as-2-(comodín)-4 de copas + trío de 7
    two: bestMelds(['o5', 'o6', 'j1', 'j2', 'c1', 'e1', 'b1']).dead,            // 5-6 + 2 comodines + trío de ases
    loose: bestMelds(['j1', 'o1', 'c3', 'e5', 'b7', 'o10', 'c11']).dead,        // comodín con una sola carta no liga: vale 25
    alone: bestMelds(['j1', 'j2', 'o1', 'c3', 'e5', 'b7', 'o10']).dead,
    chin: isChinchon(['e1', 'e2', 'j1', 'e4', 'e5', 'e6', 'e7']),
    disc: bestDiscard(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'j1', 'c12']).discard,
    closeLoose: bestDiscard(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'j1', 'c12']).bm.dead
  }); });
  check('comodín completa un grupo', jk.group === 1, JSON.stringify(jk));
  check('comodín tapa un hueco en la escalera', jk.gap === 0);
  check('dos comodines con dos cartas forman escalera', jk.two === 0);
  check('comodín suelto vale 0', jk.loose === 36, String(jk.loose));
  check('se puede cerrar con el comodín suelto', jk.closeLoose === 0, String(jk.closeLoose));
  check('los comodines necesitan al menos 2 cartas de verdad', jk.alone === 26, String(jk.alone));
  check('el chinchón no vale con comodín', !jk.chin);
  const bonus = await p.evaluate(() => {
    const ps = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const mk = hand => { const g = { id: uid(), created: 1, cfg: Object.assign({}, DEF_CFG), players: ps, firstDealer: 'a', events: [], play: { jokers: 2, jokerValue: 0, bots: ['b'], hand: { dealer: 'a', order: ['a', 'b'], hands: { a: hand, b: ['o1', 'c3', 'e5', 'b7', 'o10', 'c11', 'e12'] }, deck: [], discard: [] } } }; closeHand(g, 'a', null); return g.events[0].scores.a; };
    return { jokerTied: mk(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'j1']), allTied: mk(['o5', 'c5', 'e5', 'b2', 'b3', 'b4', 'b5']), looseJoker: mk(['o5', 'c5', 'e5', 'b5', 'o1', 'c2', 'j1']) };
  });
  check('con el comodín ligado y todo lo demás ligado da −10', bonus.jokerTied === -10 && bonus.allTied === -10, JSON.stringify(bonus));
  check('con el comodín suelto no es «todo ligado»: suma lo suelto', bonus.looseJoker === 3, JSON.stringify(bonus));
  check('la máquina no tira el comodín', jk.disc !== 'j1', jk.disc);
  const simJ = await p.evaluate(() => {
    let bad = 0, hands = 0, ended = 0, jokerPlays = 0;
    for (let k = 0; k < 60; k++) {
      const ps = Array.from({ length: 3 }, (_, i) => ({ id: uid(), name: '🤖 ' + i }));
      const g = { id: uid(), created: Date.now(), cfg: Object.assign({}, DEF_CFG, { rebuyMode: 'none' }), players: ps, firstDealer: ps[0].id, events: [], play: { level: 'normal', jokers: 2, jokerValue: 0, bots: ps.map(x => x.id), hand: null } };
      let guard = 0;
      while (!compute(g).ended && guard++ < 300) {
        dealHand(g); const h = g.play.hand, all = [...h.deck, ...h.discard, ...Object.values(h.hands).flat()];
        if (all.length !== 42 || new Set(all).size !== 42) bad++;
        runBotsInstant(g); hands++;
        const e = g.events[g.events.length - 1];
        if (e.closer && e.kind === 'normal' && e.scores[e.closer] > 5) bad++;
        if (Object.values(h.hands).flat().some(isJoker)) jokerPlays++;
      }
      if (compute(g).ended) ended++;
    }
    return { bad, hands, ended, jokerPlays };
  });
  const duel = await p.evaluate(() => { let wa = 0, N = 600, bad = 0;
    for (let k = 0; k < N; k++) { const ps = [{ id: 'a' + k, name: 'A' }, { id: 'b' + k, name: 'B' }]; if (k % 2) ps.reverse();
      const g = { id: uid(), created: 1, cfg: Object.assign({}, DEF_CFG, { rebuyMode: 'none' }), players: ps, firstDealer: ps[0].id, events: [], play: { level: 'normal', jokers: k % 3 ? 0 : 2, jokerValue: 0, closeFrom: 2, bots: ps.map(x => x.id), hand: null } };
      let guard = 0; while (!compute(g).ended && guard++ < 300) { dealHand(g); let n = 0; while (g.play.hand.phase !== 'over' && n++ < 3000) { g.play.level = g.play.hand.turn.startsWith('a') ? 'dificil' : 'normal'; botStep(g); } }
      const R = compute(g); if (!R.ended) bad++; else if (R.ended.winner.startsWith('a')) wa++; }
    return { pct: Math.round(wa / N * 1000) / 10, bad }; });
  check(`el nivel difícil gana al normal (${duel.pct} % de 600 partidas)`, duel.bad === 0 && duel.pct > 50, JSON.stringify(duel));
  check(`60 partidas con comodines sin errores (${simJ.hands} manos)`, simJ.bad === 0 && simJ.ended === 60, JSON.stringify(simJ));
  check(`150 partidas simuladas sin errores (${sim.hands} manos)`, sim.bad === 0, JSON.stringify(sim));
  check('todas las partidas simuladas terminan', sim.ended === sim.games, JSON.stringify(sim));
  check('nadie cierra en la primera vuelta', sim.early === 0, JSON.stringify(sim));
  check('regla: desde la 2ª vuelta por defecto', await p.evaluate(() => { const g = { play: { hand: { turns: 2, order: ['a', 'b', 'c'] } } }; const r1 = canCloseNow(g); g.play.hand.turns = 3; return !r1 && canCloseNow(g); }));
  // partida jugada desde la pantalla
  await p.evaluate(() => { window.PLAY_DELAY = 10; });
  await p.click('[data-mode="play"]');
  check('sin nombres por defecto', await p.evaluate(() => [...document.querySelectorAll('#plName, [data-botname]')].every(i => i.value === '')));
  await p.fill('#plName', 'Carlos'); await p.click('[data-bots="2"]');
  await p.fill('[data-botname="0"]', 'Chano'); await p.fill('[data-botname="1"]', 'carlos');
  await p.click('#plStart');
  let guard = 0, handsDone = 0;
  while (guard++ < 4000) {
    const st = await p.evaluate(() => { const g = S.game; if (!g || !g.play) return 'nogame'; if (compute(g).ended) return 'ended'; const h = g.play.hand; if (!h) return 'nohand'; return h.phase === 'over' ? 'over' : (h.turn === me(g) ? h.phase : 'bot'); });
    if (st === 'ended' || st === 'nogame') break;
    if (st === 'over') { handsDone++; await p.click('#prNext'); continue; }
    if (st === 'bot') { await p.waitForTimeout(25); continue; }
    if (st === 'draw') { await p.click(guard % 3 ? '#pDeck' : '#pDisc'); continue; }
    if (st === 'discard') {
      const d = await p.evaluate(() => bestDiscard(S.game.play.hand.hands[me(S.game)]).discard);
      await p.click(`[data-card="${d}"]`);
      if (await p.$eval('#pClose', b => !b.disabled)) { await p.click('#pClose'); await p.click('#cOk'); }
      else await p.click('#pDrop');
    }
  }
  const fin = await p.evaluate(() => ({ ended: !!(S.game && compute(S.game).ended), hands: S.game ? compute(S.game).hand : 0 }));
  check(`partida completa jugando desde la pantalla (${fin.hands} manos)`, fin.ended, JSON.stringify(fin));
  await p.click('#newGame');
  // modo aprendizaje
  await p.click('[data-mode="play"]'); await p.fill('#plName', 'Carlos'); await p.fill('[data-botname="0"]', 'Chano'); await p.fill('[data-botname="1"]', 'carlos'); await p.click('#plStart');
  for (let i = 0; i < 200; i++) { const st = await p.evaluate(() => { const h = S.game.play.hand; return h && h.turn === me(S.game) && h.phase === 'draw'; }); if (st) break; await p.waitForTimeout(25); }
  check('por defecto la mesa no sugiere jugadas', await p.evaluate(() => !/💡/.test(document.querySelector('.pt-hint').textContent) && !document.querySelector('.tip')));
  await p.click('#pLearn');
  check('con aprendizaje sugiere qué robar', await p.evaluate(() => /💡/.test(document.querySelector('.pt-hint').textContent) && !!document.querySelector('.pt-btn.tip')));
  await p.click('#pDeck');
  check('con aprendizaje marca la carta que conviene tirar', await p.evaluate(() => document.querySelector('.pc-card.tip')?.dataset.card === bestDiscard(S.game.play.hand.hands[me(S.game)]).discard));
  await p.click('#menuBtn'); await p.click('#mEnd'); await p.click('#cOk');
  check('nombres de rivales personalizados y sin repetir', await p.evaluate(() => S.archive[0].players.map(x => x.name).join() === 'Carlos,🤖 Chano,🤖 carlos 2'), await p.evaluate(() => S.archive[0].players.map(x => x.name).join()));
  check('la partida contra la máquina queda en el historial', await p.evaluate(() => S.archive.length === 1 && S.archive[0].players.some(x => x.name.startsWith('🤖'))));
  check('los rivales de la máquina no se añaden a jugadores habituales', await p.evaluate(() => !S.roster.some(n => n.startsWith('🤖')) && S.roster.includes('Carlos')));
  check('sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

// Jugar en línea: dos personas en dos móviles + la máquina, contra el servidor real
{
  console.log('Jugar en línea');
  // Copia local del servidor común (csuarezsm/juegos-servidor) con las reglas de ESTA versión de la app
  const { createRequire } = await import('node:module');
  const os = await import('node:os'); const fs = await import('node:fs');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  const motores = fs.mkdtempSync(join(os.tmpdir(), 'motores-'));
  fs.mkdirSync(join(motores, 'chinchon'));
  for (const f of ['marcador.js', 'juego.js']) fs.copyFileSync(join(ROOT, f), join(motores, 'chinchon', f));
  // los motores de los demás juegos, tal como están en el servidor (ajedrez, pumba…)
  for (const j of fs.readdirSync(join(SERV, 'motores'))) if (j !== 'chinchon') fs.cpSync(join(SERV, 'motores', j), join(motores, j), { recursive: true });
  Object.assign(process.env, { PASO_BOT_MS: '30', SEGUIR_MS: '6000', AUSENTE_MS: '800', MOTORES_DIR: motores, DATA_DIR: fs.mkdtempSync(join(os.tmpdir(), 'juegos-')) });
  const req = createRequire(join(SERV, 'package.json'));
  const { crearServidor } = req('./src/server.js');
  const { server: js } = crearServidor();
  await new Promise(r => js.listen(0, '127.0.0.1', r));
  const WS = `ws://127.0.0.1:${js.address().port}/ws`;
  const abrir = async () => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.addInitScript(u => { window.ONLINE_URL = u; if (!localStorage.getItem('chinchon.v1')) localStorage.setItem('chinchon.v1', JSON.stringify({ onboarded: true })); }, WS);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL_APP); return { p, ctx, errors };
  };
  const A = await abrir(), B = await abrir();
  await A.p.click('[data-mode="online"]');
  await A.p.waitForSelector('#onStatus:has-text("Conectado")');
  check('el modo en línea conecta con el servidor', true);
  await A.p.click('#onCreate');
  check('pide el nombre antes de crear', await A.p.evaluate(() => !ON.sala));
  await A.p.fill('#onName', 'Carlos'); await A.p.click('#onCreate');
  await A.p.waitForSelector('#onCodeBig');
  const codigo = (await A.p.textContent('#onCodeBig')).trim();
  check('crea la partida y enseña el código', /^[A-Z2-9]{4}$/.test(codigo), codigo);
  await B.p.click('[data-mode="online"]'); await B.p.fill('#onName', 'Mari'); await B.p.fill('#onCode', codigo.toLowerCase()); await B.p.click('#onJoin');
  await B.p.waitForSelector('text=Esperando a que Carlos empiece');
  check('el segundo móvil entra con el código', true);
  await A.p.waitForSelector('.on-seat >> nth=1');
  await A.p.click('#onBot'); await A.p.waitForSelector('.on-seat >> nth=2');
  check('se añade a la máquina', (await A.p.textContent('.sec:has(.on-seat)')).includes('🤖'));
  await A.p.click('#onStart');
  await A.p.waitForSelector('.pt-table'); await B.p.waitForSelector('.pt-table');
  const manos = await Promise.all([A, B].map(x => x.p.evaluate(() => ON.sala.partida.miMano)));
  check('cada móvil ve sus 7 cartas y no las del otro', manos[0].length === 7 && manos[1].length === 7 && !manos[0].some(c => manos[1].includes(c)));
  check('al llegar tu turno en línea suena y vibra el aviso (a alguno de los dos ya le ha tocado)', await (async () => { for (let k = 0; k < 100; k++) { const v = await A.p.evaluate(() => AvisoTurno.veces) + await B.p.evaluate(() => AvisoTurno.veces); if (v > 0) return true; await new Promise(r => setTimeout(r, 100)); } return false; })());
  // juegan los dos desde la pantalla hasta terminar una mano
  const paso = async x => {
    const st = await x.p.evaluate(() => { const s = ON.sala; if (!s || !s.partida) return 'nada'; const p = s.partida; if (p.fase === 'over') return document.querySelector('#prNext') ? 'seguir' : 'nada'; return p.turno === s.yo ? p.fase : 'nada'; });
    if (st === 'draw') await x.p.click('#pDeck:not([disabled])', { timeout: 500 }).catch(() => {});
    else if (st === 'discard') { const d = await x.p.evaluate(() => bestDiscard(ON.sala.partida.miMano).discard); await x.p.click(`[data-card="${d}"]`, { timeout: 500 }).catch(() => {}); await x.p.click('#pDrop:not([disabled])', { timeout: 500 }).catch(() => {}); }
    else if (st === 'seguir') { await x.p.click('#prNext', { timeout: 500 }).catch(() => {}); return 'seguir'; }
    return st;
  };
  let vista = false, siguientes = 0;
  for (let i = 0; i < 600 && siguientes < 2; i++) {
    for (const x of [A, B]) { if (await x.p.$('#prNext') && (await x.p.textContent('.sec')).includes('anotada')) vista = true; const r = await paso(x); if (r === 'seguir') siguientes++; }
    await A.p.waitForTimeout(20);
  }
  check('al terminar la mano se ven las cartas de todos y los puntos', vista);
  await A.p.waitForFunction(() => ON.sala.partida.fase !== 'over' || ON.sala.estado === 'fin', null, { timeout: 8000 }).catch(() => {});
  check('se reparte la siguiente mano', await A.p.evaluate(() => ON.sala.estado === 'fin' || (ON.sala.partida.mano >= 2 && ON.sala.partida.fase !== 'over')));
  // Mari cierra la app y vuelve: recupera la partida
  const B2 = { p: await B.ctx.newPage(), errors: [] };
  await B.p.close(); await B2.p.goto(URL_APP);
  await B2.p.waitForSelector('.pt-table, #prNext, #onAgain', { timeout: 8000 }).catch(() => {});
  check('al volver a abrir la app, vuelve a la partida', await B2.p.evaluate(() => !!(ON.sala && ON.sala.codigo)) && (await B2.p.textContent('#subtitle')).includes(codigo));
  // Carlos abandona: su silla la ocupa la máquina
  await A.p.click('#pScore'); await A.p.click('#onLeave3'); await A.p.click('#cOk');
  await A.p.waitForSelector('#onCreate');
  check('al abandonar vuelve a la pantalla de inicio en línea', await A.p.evaluate(() => !ON.sala));
  await B2.p.waitForFunction(() => ON.sala && ON.sala.asientos.find(a => a.id === 'p1').bot, null, { timeout: 5000 }).catch(() => {});
  check('la máquina ocupa la silla de quien abandona', await B2.p.evaluate(() => !!(ON.sala && ON.sala.asientos.find(a => a.id === 'p1').bot)));
  check('en línea, sin errores de JavaScript', !A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close(); js.close();
  // servidor antiguo (sin chinchón): la app avisa de que estará disponible pronto y no deja crear
  const { WebSocketServer } = req('ws');
  const viejo = new WebSocketServer({ port: 0 });
  viejo.on('connection', w => w.send(JSON.stringify({ t: 'hola', protocolo: 1, juegos: ['ajedrez'] })));
  await new Promise(r => viejo.on('listening', r));
  const ctxV = await browser.newContext({ viewport: { width: 412, height: 860 }, serviceWorkers: 'block' });
  await ctxV.addInitScript(u => { window.ONLINE_URL = u; localStorage.setItem('chinchon.v1', JSON.stringify({ onboarded: true })); }, `ws://127.0.0.1:${viejo.address().port}`);
  const pv = await ctxV.newPage(); await pv.goto(URL_APP); await pv.click('[data-mode="online"]');
  await pv.waitForSelector('#onStatus:has-text("muy pronto")', { timeout: 5000 }).catch(() => {});
  check('con un servidor sin chinchón avisa y no deja crear', /muy pronto/.test(await pv.textContent('#onStatus')) && await pv.$eval('#onCreate', b => b.disabled));
  await ctxV.close(); viejo.close();
}

// Versión de Google Play: sin actualizador propio ni donativos
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('chinchon.v1', JSON.stringify({ onboarded: true, updAvail: { v: '99.0.0', url: 'x' } }));
    window.Capacitor = { isNativePlatform: () => false, Plugins: { AppUpdater: { info: async () => ({ store: 'play' }), setSystemBars: async () => {} } } }; });
  await p.goto(URL_APP); await p.waitForTimeout(200);
  await p.click('#menuBtn');
  check('Play: el menú no ofrece actualizar', !(await p.$('#mUpd')));
  await p.click('#mAbout');
  check('Play: sin donativo en Acerca de', !(await p.$('#donate')) && /Google Play/.test(await p.textContent('#modal')));
  check('Play: compartir enlaza a Google Play', await p.evaluate(() => isPlay() && !hasUpd()));
  check('Play: sin errores de JavaScript', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Idioma inglés');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://**', r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov]) => { window[ov] = ''; navigator.share = async d => { window.__compartido = d.text; }; if (!sessionStorage.l) { localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); sessionStorage.l = 1; } }, ['chinchon.v1', 'ONLINE_URL']);
  await p.goto(URL_APP); await p.waitForTimeout(400);
  check('por defecto (pruebas) en español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Keep the scores')));
  await p.click('#menuBtn'); await p.click('#mLang');
  check('el menú tiene el selector de idioma', await p.evaluate(() => document.querySelectorAll('[data-lang]').length === 2));
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="en"]')]); await p.waitForTimeout(500);
  check('al elegir inglés, la app se ve en inglés', await p.evaluate(() => Idioma.lang() === 'en' && document.body.textContent.includes('Keep the scores') && document.documentElement.lang === 'en'));
  await p.click('#menuBtn');
  check('y el menú también', await p.evaluate(() => document.querySelector('#modal').textContent.includes('Share the app') && !document.querySelector('#modal').textContent.includes('Compartir la app')));
  check('compartir la app en inglés', await p.evaluate(async () => { closeModal(); await shareApp(); const t = window.__compartido || ''; return /free/i.test(t) && /iPhone/.test(t) && !/Gratis/.test(t); }), await p.evaluate(() => window.__compartido));
  check('las fechas y números en inglés', await p.evaluate(() => new Date(2026, 10, 1).toLocaleDateString('es-ES', { month: 'long' }) === 'November'));
  await p.click('#menuBtn'); await p.click('#mLang');
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="es"]')]); await p.waitForTimeout(400);
  check('y se vuelve al español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Keep the scores')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Contador anónimo de instalaciones');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const avisos = [];
  await ctx.route('https://contador.prueba/contar', async r => { avisos.push(JSON.parse(r.request().postData())); await r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); });
  const p = await ctx.newPage();
  await p.addInitScript(([k, ov]) => { window[ov] = ''; window.CONTADOR_URL = 'https://contador.prueba/contar'; window.CONTADOR_FORZAR = true; if (!sessionStorage.c) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.c = 1; } }, ['chinchon.v1', 'ONLINE_URL']);
  await p.goto(URL_APP);
  await p.evaluate(() => Contador.avisar());
  check('al instalar avisa una vez, sin datos personales', avisos.length === 1 && avisos[0].evento === 'instalacion' && avisos[0].plataforma === 'web' && Object.keys(avisos[0]).sort().join() === 'evento,juego,plataforma,version', JSON.stringify(avisos));
  await p.reload(); await p.evaluate(() => Contador.avisar());
  check('no vuelve a avisar en la misma versión', avisos.length === 1);
  await p.evaluate(() => { S.contadoVer = '0.0.1'; save(); }); await p.evaluate(() => Contador.avisar());
  check('con una versión nueva avisa de la actualización', avisos.length === 2 && avisos[1].evento === 'actualizacion' && avisos[1].de === '0.0.1');
  check('en las pruebas automáticas normales no avisa al servidor real', await p.evaluate(async () => { window.CONTADOR_FORZAR = false; S.contadoVer = null; return (await Contador.avisar()) === false; }));
  await ctx.close();
}

console.log('Más juegos de IT Canarias');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const CAT = 'https://catalogo.prueba/juegos.json';
  await ctx.route(CAT, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ juegos: [
    { id: 'ajedrez', nombre: 'Ajedrez', descripcion: 'a', descarga: 'https://csuarezsm.github.io/Ajedrez/', web: 'https://csuarezsm.github.io/Ajedrez/app/' },
    { id: 'damas', nombre: 'Damas', descripcion: 'd', descarga: 'https://csuarezsm.github.io/Damas/', web: 'https://csuarezsm.github.io/Damas/app/' },
    { id: 'chinchon', nombre: 'Chinchón', descripcion: 'c', descarga: 'https://csuarezsm.github.io/chinchon-marcador/', web: 'https://csuarezsm.github.io/chinchon-marcador/app/' },
    { id: 'pumba', nombre: 'Pumba', descripcion: 'p', descarga: 'https://csuarezsm.github.io/Pumba/', web: 'https://csuarezsm.github.io/Pumba/app/' },
    { id: 'parchis', nombre: 'Parchís <b>', emoji: '🎲', descripcion: 'Nuevo', descarga: 'https://csuarezsm.github.io/Parchis/' },
    { id: '<mal>', nombre: 'Malo', descarga: 'https://x.example/' },
    { id: 'malo2', nombre: 'Malo 2', descarga: 'javascript:alert(1)' }] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov, cat]) => { window[ov] = ''; window.MAS_JUEGOS_URL = cat; if (!sessionStorage.mj) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.mj = 1; } }, ['chinchon.v1', 'ONLINE_URL', CAT]);
  await p.goto(URL_APP); await p.waitForTimeout(300);
  await p.click('#menuBtn');
  check('el menú tiene «Más juegos de IT Canarias»', !!(await p.$('#mMas')));
  await p.click('#mMas'); await p.waitForTimeout(200);
  const base = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('sin conexión: los otros tres juegos, y no este', base.length === 3 && !base.some(n => n.toLowerCase().startsWith('chinc')), base.join());
  check('con sus iconos dentro de la app', await p.evaluate(() => [...document.querySelectorAll('.mji img')].every(i => i.getAttribute('src').startsWith('juegos/'))));
  check('el catálogo común se descarga y se guarda', await p.evaluate(async () => await MasJuegos.actualizar(true) && S.masJuegos.juegos.length === 5));
  await p.evaluate(() => { closeModal(); MasJuegos.abrir(); }); await p.waitForTimeout(200);
  const nuevos = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('un juego nuevo del catálogo aparece sin actualizar la app', nuevos.length === 4 && nuevos.includes('Parchís b'), nuevos.join());
  check('los datos raros del catálogo se descartan', !nuevos.includes('Malo') && !nuevos.includes('Malo 2'));
  const abierto = await p.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; const i = MasJuegos.juegos().findIndex(j => j.id === 'parchis'); document.querySelector(`[data-mj="${i}"]`).click(); return u; });
  check('en el navegador, el botón lleva a su página', abierto === 'https://csuarezsm.github.io/Parchis/', abierto);
  await p.reload(); await p.waitForTimeout(300);
  check('sin internet usa el último catálogo guardado', await p.evaluate(() => MasJuegos.juegos().some(j => j.id === 'parchis')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
  // en iPhone, cada juego abre su versión web
  const ci = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ci.route('https://**/*.json', r => r.abort());
  const q = await ci.newPage();
  await q.addInitScript(([k, ov]) => { window[ov] = ''; localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); }, ['chinchon.v1', 'ONLINE_URL']);
  await q.goto(URL_APP); await q.waitForTimeout(300);
  const web = await q.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; MasJuegos.abrir(); document.querySelector('[data-mj="0"]').click(); return u; });
  check('en iPhone el botón abre la versión web del juego', /\/app\/$/.test(web), web);
  // aviso de turno: se puede quitar en los ajustes
  const aviso = await q.evaluate(() => { closeModal(); document.querySelector('#menuBtn').click(); document.querySelector('#mTheme').click(); const el = document.querySelector('#thTurno'); const antes = !!el && el.checked; el.click(); const off = S.avisoTurno === false && JSON.parse(localStorage.getItem(KEY)).avisoTurno === false; const n = AvisoTurno.veces; const sono = AvisoTurno.sonar(); return { ok: antes && off && !sono && AvisoTurno.veces === n, antes, off, sono, el: !!el }; });
  check('el aviso de turno en línea se puede quitar en ajustes', aviso.ok, JSON.stringify(aviso));
  await ci.close();
}

console.log('Versión web e iPhone');
{
  const { execSync } = await import('node:child_process');
  let iguales = true; try { execSync('diff -r www docs/app', { cwd: fileURLToPath(new URL('..', import.meta.url)) }); } catch (e) { iguales = false; }
  check('docs/app (versión web) es igual que www/ — si no: npm run web', iguales);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v99.0.0', assets: [] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.ONLINE_URL = ''; if (!sessionStorage.s) { localStorage.setItem('chinchon.v1', JSON.stringify({ onboarded: true })); sessionStorage.s = 1; } });
  await p.goto(URL_APP);
  let hint = true; try { await p.waitForSelector('#iosOk', { timeout: 3000 }); } catch (e) { hint = false; }
  check('en Safari de iPhone explica cómo añadirla a la pantalla de inicio', hint);
  await p.click('#iosOk'); await p.click('#menuBtn');
  check('en la versión web no hay actualizador de APK', !(await p.$('#mUpd')) && !!(await p.$('#mIOS')));
  check('y lo vuelve a explicar desde el menú', await p.evaluate(() => { document.querySelector('#mIOS').click(); return !!document.querySelector('#iosOk'); }));
  check('etiquetas de iPhone: icono, título y pantalla completa', await p.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]').content === 'Chinchón'));
  check('compartir la app: un mensaje para Android e iPhone', await p.evaluate(async () => { let txt = ''; navigator.share = async d => { txt = d.text; }; await shareApp(); return txt.includes('csuarezsm.github.io/chinchon-marcador/') && /Android/.test(txt) && /iPhone/.test(txt); }));
  check('la invitación en línea también vale para iPhone', await p.evaluate(async () => { let txt = ''; navigator.share = async d => { txt = d.text; }; await onInvitar('ABCD'); return txt.includes('ABCD') && txt.includes('csuarezsm.github.io/chinchon-marcador/') && /iPhone/.test(txt); }));
  await p.reload(); await p.waitForTimeout(800);
  check('el aviso de instalar sale solo una vez', !(await p.$('#iosOk')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
