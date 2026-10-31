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
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); } };

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

await browser.close(); server.close();
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
