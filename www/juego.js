'use strict';
/* =====================================================================
   Chinchón · Jugar contra la máquina
   Motor de juego, rivales y mesa. Se apoya en el marcador de index.html:
   cada mano terminada se anota como una mano normal (totales, eliminados,
   reenganches, historial y ranking funcionan igual).
   © 2026 IT Canarias
   ===================================================================== */

/* ---------- Cartas ---------- */
const SUITS = ['o', 'c', 'e', 'b'];
const SUIT_NAME = { o: 'oros', c: 'copas', e: 'espadas', b: 'bastos' };
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];             // baraja de 40
const RANK_IDX = Object.fromEntries(RANKS.map((r, i) => [r, i])); // 7 y sota son seguidas
const RANK_LABEL = r => ({ 10: 'S', 11: 'C', 12: 'R' })[r] || String(r);
const RANK_NAME = r => ({ 1: 'as', 10: 'sota', 11: 'caballo', 12: 'rey' })[r] || String(r);
const CLOSE_MAX = 5;                                          // se cierra con 5 o menos sin ligar
const BOTS = ['Paco', 'Lola', 'Manolo'];

const card = id => ({ id, s: id[0], r: Number(id.slice(1)) });
const cardValue = c => (c.r <= 7 ? c.r : 10);
const cardName = c => RANK_NAME(c.r) + ' de ' + SUIT_NAME[c.s];
function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(s + r);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

/* ---------- Mejor forma de ligar una mano ----------
   Devuelve { melds: [[ids]], loose: [ids], dead: puntos sin ligar }.
   Grupos: 3 o 4 del mismo número. Escaleras: 3 o más seguidas del mismo palo. */
function bestMelds(ids) {
  const cs = ids.map(card), n = cs.length;
  const cands = [];
  const byRank = {};
  cs.forEach((c, i) => (byRank[c.r] = byRank[c.r] || []).push(i));
  for (const r in byRank) {
    const g = byRank[r];
    if (g.length >= 3) {
      if (g.length === 4) cands.push(g.reduce((m, i) => m | (1 << i), 0));
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) for (let c = b + 1; c < g.length; c++) cands.push((1 << g[a]) | (1 << g[b]) | (1 << g[c]));
    }
  }
  for (const s of SUITS) {
    const idx = cs.map((c, i) => [c, i]).filter(([c]) => c.s === s).sort((a, b) => RANK_IDX[a[0].r] - RANK_IDX[b[0].r]);
    for (let a = 0; a < idx.length; a++) {
      let mask = 1 << idx[a][1], len = 1;
      for (let b = a + 1; b < idx.length && RANK_IDX[idx[b][0].r] === RANK_IDX[idx[b - 1][0].r] + 1; b++) {
        mask |= 1 << idx[b][1]; len++;
        if (len >= 3) cands.push(mask);
      }
    }
  }
  const memo = new Map();
  const solve = mask => {
    if (!mask) return { dead: 0, used: [] };
    if (memo.has(mask)) return memo.get(mask);
    const i = 31 - Math.clz32(mask & -mask), bit = 1 << i;
    let best = solve(mask & ~bit); best = { dead: best.dead + cardValue(cs[i]), used: best.used };
    for (const m of cands) if ((m & bit) && (m & mask) === m) {
      const r = solve(mask & ~m);
      if (r.dead < best.dead) best = { dead: r.dead, used: [m, ...r.used] };
    }
    memo.set(mask, best);
    return best;
  };
  const res = solve((1 << n) - 1);
  const inMeld = res.used.reduce((a, m) => a | m, 0);
  return {
    melds: res.used.map(m => cs.filter((_, i) => m & (1 << i)).map(c => c.id)),
    loose: cs.filter((_, i) => !(inMeld & (1 << i))).map(c => c.id),
    dead: res.dead
  };
}
// ¿Las 7 cartas son una escalera de 7 del mismo palo?
function isChinchon(ids) {
  if (ids.length !== 7) return false;
  const cs = ids.map(card);
  if (!cs.every(c => c.s === cs[0].s)) return false;
  const ix = cs.map(c => RANK_IDX[c.r]).sort((a, b) => a - b);
  return ix.every((v, i) => !i || v === ix[i - 1] + 1);
}
// Con 8 cartas: qué tirar para quedarse con lo mejor
function bestDiscard(ids) {
  let best = null;
  for (const d of ids) {
    const rest = ids.filter(x => x !== d), bm = bestMelds(rest);
    const sc = bm.dead * 100 - cardValue(card(d)) + (isChinchon(rest) ? -10000 : 0);
    if (!best || sc < best.sc) best = { discard: d, rest, bm, sc };
  }
  return best;
}

/* ---------- Estado de la mano ----------
   g.play.hand = { order:[pid], hands:{pid:[ids]}, deck:[ids], discard:[ids], turn:pid, phase:'draw'|'discard'|'over',
                   turns, log, result } */
const isBot = (g, pid) => g.play.bots.includes(pid);
function dealHand(g) {
  const R = compute(g);
  const order = []; let i = g.players.findIndex(p => p.id === R.lead);
  for (let k = 0; k < g.players.length; k++) { const p = g.players[(i + k) % g.players.length]; if (!R.st[p.id].out) order.push(p.id); }
  const deck = newDeck(), hands = {};
  order.forEach(pid => (hands[pid] = deck.splice(0, 7)));
  g.play.hand = { dealer: R.next, order, hands, deck, discard: [deck.shift()], turn: order[0], phase: 'draw', turns: 0, log: pname(g, R.next) + ' ha repartido. Sale ' + pname(g, order[0]) + '.', result: null };
}
function drawFrom(h, src) {
  if (src === 'discard' && h.discard.length) return h.discard.pop();
  if (!h.deck.length) { const top = h.discard.pop(); h.deck = h.discard.sort(() => Math.random() - .5); h.discard = [top]; }
  return h.deck.shift();
}
function nextTurn(h) {
  const i = h.order.indexOf(h.turn);
  h.turn = h.order[(i + 1) % h.order.length]; h.phase = 'draw'; h.turns++;
}
// Termina la mano: puntos de cada uno y se anota en el marcador
function closeHand(g, closer, discardId) {
  const h = g.play.hand, c = g.cfg;
  const scores = {}, detail = {};
  let kind = 'normal';
  for (const pid of h.order) {
    const bm = bestMelds(h.hands[pid]);
    detail[pid] = bm;
    scores[pid] = bm.dead;
  }
  if (closer) {
    if (isChinchon(h.hands[closer])) { kind = 'chinchon'; scores[closer] = c.chinchon === 'win' ? 0 : c.chinchonPts; }
    else if (detail[closer].dead === 0) { kind = 'bonus'; scores[closer] = c.closeBonus; }
  }
  if (discardId) h.discard.push(discardId);
  h.phase = 'over';
  h.result = { closer, kind, scores, detail };
  g.events.push({ t: 'hand', dealer: h.dealer, closer: closer || null, kind: closer ? kind : 'normal', scores, at: Date.now() });
}

/* ---------- La máquina ---------- */
function botStep(g) {
  const h = g.play.hand, pid = h.turn, easy = g.play.level === 'facil';
  const hand = h.hands[pid];
  if (h.phase === 'draw') {
    const top = h.discard[h.discard.length - 1];
    let src = 'deck';
    if (top) {
      const now = bestMelds(hand).dead, withTop = bestDiscard([...hand, top]);
      if (withTop.discard !== top && withTop.bm.dead < now - (easy ? 3 : 0)) src = 'discard';
    }
    const got = drawFrom(h, src);
    hand.push(got);
    h.phase = 'discard';
    h.log = pname(g, pid) + (src === 'discard' ? ' coge el ' + cardName(card(got)) + ' del descarte.' : ' roba del mazo.');
    return;
  }
  let best = bestDiscard(hand);
  if (easy && Math.random() < .25) {
    const loose = bestMelds(hand).loose; if (loose.length) { const d = loose[Math.floor(Math.random() * loose.length)]; const rest = hand.filter(x => x !== d); best = { discard: d, rest, bm: bestMelds(rest) }; }
  }
  const canClose = best.bm.dead <= CLOSE_MAX;
  const wantClose = canClose && (easy ? best.bm.dead <= 2 || h.turns > 40 : true);
  h.hands[pid] = best.rest;
  if (wantClose) { closeHand(g, pid, best.discard); h.log = pname(g, pid) + ' cierra' + (g.play.hand.result.kind === 'chinchon' ? ' ¡con CHINCHÓN!' : g.play.hand.result.kind === 'bonus' ? ' con todo ligado.' : '.'); return; }
  h.discard.push(best.discard);
  h.log += ' Tira el ' + cardName(card(best.discard)) + '.';
  nextTurn(h);
  if (h.turns > 400) closeHand(g, null, null);                // por seguridad: nadie cierra
}
// Juega sin pausas hasta que le toque a la persona o termine la mano
function runBotsInstant(g) { let k = 0; while (g.play.hand && g.play.hand.phase !== 'over' && isBot(g, g.play.hand.turn) && k++ < 2000) botStep(g); }

/* ---------- Dibujo de cartas ---------- */
const SUIT_SVG = {
  o: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#e0a419" stroke="#8a6500" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#8a6500" stroke-width="1.4"/></svg>',
  c: '<svg viewBox="0 0 24 24"><path d="M5 3h14l-1.5 7.5A5.6 5.6 0 0 1 12 15a5.6 5.6 0 0 1-5.5-4.5z" fill="#c0392b"/><path d="M11 14.5h2v4h3.5V21h-9v-2.5H11z" fill="#c0392b"/></svg>',
  e: '<svg viewBox="0 0 24 24"><path d="M12 1.5l2 3.2V15h-4V4.7z" fill="#2a5aa8"/><path d="M6.5 15h11v2.2h-11z" fill="#1d3f78"/><path d="M11 17.2h2V22h-2z" fill="#1d3f78"/></svg>',
  b: '<svg viewBox="0 0 24 24"><path d="M9.2 4.2a3 3 0 0 1 5.6 0l.4 2.6L13.6 22h-3.2L8.8 6.8z" fill="#3b8b3f"/><circle cx="10" cy="9" r="1" fill="#1f5c22"/><circle cx="13.6" cy="12.5" r="1" fill="#1f5c22"/></svg>'
};
const MELD_COLORS = ['#2e9e62', '#2a73c2', '#8e44ad', '#d35400'];
function cardHtml(id, opts) {
  opts = opts || {};
  if (!id) return '<div class="pc-card empty"></div>';
  const c = card(id), tag = opts.data ? 'button' : 'div';   // solo las cartas de tu mano son botones
  return `<${tag} class="pc-card ${opts.sel ? 'sel' : ''} ${opts.small ? 'small' : ''}" ${opts.data || ''} aria-label="${cardName(c)}" style="${opts.meld != null ? '--mc:' + MELD_COLORS[opts.meld % MELD_COLORS.length] : ''}">
    <b class="pc-r pc-${c.s}">${RANK_LABEL(c.r)}</b><span class="pc-s">${SUIT_SVG[c.s]}</span>${opts.meld != null ? '<i class="pc-m"></i>' : ''}${opts.isNew ? '<em class="pc-new">nueva</em>' : ''}</${tag}>`;
}
function backHtml(n) { return `<div class="pc-card back"><span>${n != null ? n : ''}</span></div>`; }
// Ordena la mano: primero lo ligado (por combinación) y luego lo suelto
function arrangeHand(ids) {
  const bm = bestMelds(ids), meldOf = {};
  bm.melds.forEach((m, i) => m.forEach(id => (meldOf[id] = i)));
  const key = id => { const c = card(id); return (meldOf[id] != null ? meldOf[id] * 1000 : 9000) + SUITS.indexOf(c.s) * 20 + RANK_IDX[c.r]; };
  return { ids: ids.slice().sort((a, b) => key(a) - key(b)), meldOf, bm };
}

/* ---------- Mesa ---------- */
let playTimer = null, playSel = null;
function me(g) { return g.players.find(p => !isBot(g, p.id)).id; }
function renderTable(g, R) {
  clearTimeout(playTimer);
  if (!g.play.hand) { dealHand(g); save(); }
  const h = g.play.hand, my = me(g), myOut = !h.order.includes(my);
  $('#subtitle').textContent = 'Mano ' + (R.hand + 1) + ' · contra la máquina';
  const top = h.discard[h.discard.length - 1];
  const myTurn = h.turn === my && h.phase !== 'over';
  const arr = h.hands[my] ? arrangeHand(h.hands[my]) : null;
  let selDead = null;
  if (arr && myTurn && h.phase === 'discard' && playSel && h.hands[my].includes(playSel)) selDead = bestMelds(h.hands[my].filter(x => x !== playSel));
  const canClose = selDead && selDead.dead <= CLOSE_MAX;
  const opp = g.players.filter(p => h.order.includes(p.id) && p.id !== my);
  let hint = '';
  if (myOut) hint = 'Estás eliminado en esta partida.';
  else if (!myTurn) hint = h.phase === 'over' ? '' : 'Juega ' + pname(g, h.turn) + '…';
  else if (h.phase === 'draw') hint = 'Tu turno: roba del <b>mazo</b> o coge la carta del <b>descarte</b>.';
  else hint = playSel ? (canClose ? 'Puedes <b>tirar</b> esta carta o <b>cerrar</b> la mano.' : 'Toca <b>Tirar</b> para descartar esta carta.') : 'Elige la carta que quieres tirar.';
  $('#app').innerHTML = `
    <div class="pt-opps">${opp.map(p => `<div class="pt-opp ${h.turn === p.id && h.phase !== 'over' ? 'turn' : ''}">
        <div class="pt-on">${esc(p.name)}</div><div class="pt-ot">${R.st[p.id].total} pts</div>
        <div class="pt-ob">${'<i></i>'.repeat(Math.min(8, (h.hands[p.id] || []).length))}</div></div>`).join('')}</div>
    <div class="pt-mid">
      <div class="pt-pile"><button class="pt-btn" id="pDeck" ${myTurn && h.phase === 'draw' ? '' : 'disabled'}>${backHtml(h.deck.length)}</button><small>Mazo</small></div>
      <div class="pt-pile"><button class="pt-btn" id="pDisc" ${myTurn && h.phase === 'draw' && top ? '' : 'disabled'}>${top ? cardHtml(top) : cardHtml(null)}</button><small>Descarte</small></div>
    </div>
    <div class="pt-log">${esc(h.log || '')}</div>
    <div class="pt-hint">${hint}</div>
    ${arr ? `<div class="pt-hand">${arr.ids.map(id => cardHtml(id, { sel: id === playSel, meld: arr.meldOf[id], isNew: myTurn && h.phase === 'discard' && id === h.fresh, data: `data-card="${id}"` })).join('')}</div>
    <div class="pt-info">Sin ligar: <b>${arr.bm.dead}</b> pts · Llevas <b>${R.st[my].total}</b> · ${h.deck.length} en el mazo</div>
    <div class="pt-acts">
      <button class="btn-ghost" id="pScore">📋 Puntos</button>
      <button class="btn-gold" id="pDrop" ${myTurn && h.phase === 'discard' && playSel ? '' : 'disabled'}>Tirar</button>
      <button class="btn-red" id="pClose" ${canClose ? '' : 'disabled'}>Cerrar${selDead ? ' (' + (isChinchon(h.hands[my].filter(x => x !== playSel)) ? '★' : selDead.dead === 0 ? g.cfg.closeBonus : selDead.dead) + ')' : ''}</button>
    </div>` : `<div class="pt-acts"><button class="btn-ghost" id="pScore">📋 Puntos</button></div>`}`;
  const deckB = $('#pDeck'), discB = $('#pDisc');
  if (deckB) deckB.onclick = () => humanDraw(g, 'deck');
  if (discB) discB.onclick = () => humanDraw(g, 'discard');
  document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => { if (!myTurn || h.phase !== 'discard') return; playSel = playSel === b.dataset.card ? null : b.dataset.card; vibrate(8); render(); });
  const drop = $('#pDrop'); if (drop) drop.onclick = () => humanDiscard(g, false);
  const cl = $('#pClose'); if (cl) cl.onclick = () => confirmBox('Cerrar la mano', `Tiras el ${cardName(card(playSel))} y enseñas tus cartas.`, 'Cerrar', () => humanDiscard(g, true));
  $('#pScore').onclick = () => { openModal(`<h3>📋 Puntuaciones</h3>${historyTable(g, compute(g), false)}<div class="acts"><button class="btn-gold" id="psOk">Volver a la mesa</button></div>`); $('#psOk').onclick = closeModal; };
  if (h.phase === 'over') { showHandResult(g); return; }
  if (myOut) { runBotsInstant(g); save(); render(); return; }
  if (isBot(g, h.turn)) playTimer = setTimeout(() => { if (S.game !== g) return; botStep(g); save(); render(); }, 750);
}
function humanDraw(g, src) {
  const h = g.play.hand, my = me(g);
  if (h.turn !== my || h.phase !== 'draw') return;
  const got = drawFrom(h, src);
  h.hands[my].push(got); h.phase = 'discard'; playSel = null; h.fresh = got;
  h.log = 'Has ' + (src === 'discard' ? 'cogido el ' : 'robado el ') + cardName(card(got)) + '.';
  vibrate(15); save(); render();
}
function humanDiscard(g, close) {
  const h = g.play.hand, my = me(g);
  if (h.turn !== my || h.phase !== 'discard' || !playSel) return;
  const d = playSel; playSel = null;
  h.hands[my] = h.hands[my].filter(x => x !== d);
  if (close) { if (bestMelds(h.hands[my]).dead > CLOSE_MAX) { h.hands[my].push(d); toast('Para cerrar necesitas ' + CLOSE_MAX + ' o menos sin ligar'); return; } closeHand(g, my, d); h.log = 'Has cerrado.'; }
  else { h.discard.push(d); h.log = 'Has tirado el ' + cardName(card(d)) + '.'; nextTurn(h); }
  vibrate(20); save(); render();
}
function showHandResult(g) {
  const h = g.play.hand, res = h.result, R = compute(g), my = me(g);
  const rows = h.order.map(pid => {
    const arr = arrangeHand(h.hands[pid]);
    const pts = res.scores[pid];
    return `<div class="hrow"><div class="top"><div class="n">${res.closer === pid ? (res.kind === 'chinchon' ? '★ ' : '✓ ') : ''}${esc(pname(g, pid))}<small>${res.closer === pid ? (res.kind === 'chinchon' ? '¡Chinchón!' : res.kind === 'bonus' ? 'Cerró con todo ligado' : 'Cerró') : arr.bm.dead + ' sin ligar'} · total ${R.st[pid].total}${R.st[pid].out ? ' · eliminado' : ''}</small></div>
      <b style="color:${pts < 0 ? 'var(--ok)' : 'var(--gold)'};font-size:calc(20px * var(--fs, 1))">${pts > 0 ? '+' + pts : pts}</b></div>
      <div class="pt-hand mini">${arr.ids.map(id => cardHtml(id, { small: true, meld: arr.meldOf[id] })).join('')}</div></div>`;
  }).join('');
  const myOut = R.st[my].out, rebuy = !R.ended && myOut && canRebuy(g, R, my);
  openModal(`<h3>${res.closer ? (res.closer === my ? '¡Has cerrado!' : esc(pname(g, res.closer)) + ' ha cerrado') : 'Mano terminada'}</h3>
    <div class="sub">${R.ended ? '🏆 ' + esc(pname(g, R.ended.winner)) + ' gana la partida.' : myOut ? 'Has quedado eliminado.' : 'Mano ' + R.hand + ' anotada.'}</div>
    ${rows}
    <div class="acts">${rebuy ? `<button class="btn-ghost" id="prRebuy">Reenganchar (${rebuyScore(g, R)})</button>` : ''}
      <button class="btn-gold" id="prNext">${R.ended ? 'Ver resultado' : myOut && !rebuy ? 'Ver cómo acaba' : 'Siguiente mano'}</button></div>`);
  const next = () => {
    closeModal();
    let R2 = compute(g);
    if (R2.ended) { g.play.hand = null; save(); render(); return; }
    if (R2.st[my].out) {                                        // sin la persona: la máquina juega el resto al momento
      let guard = 0;
      while (!R2.ended && guard++ < 200) { dealHand(g); runBotsInstant(g); R2 = compute(g); }
      g.play.hand = null; save(); render(); return;
    }
    dealHand(g); save(); render();
  };
  $('#prNext').onclick = next;
  const rb = $('#prRebuy'); if (rb) rb.onclick = () => { g.events.push({ t: 'rebuy', p: my, score: rebuyScore(g, compute(g)), at: Date.now() }); toast('Te reenganchas'); next(); };
}

/* ---------- Preparar una partida contra la máquina ---------- */
function renderPlaySetup() {
  $('#subtitle').textContent = 'Jugar contra la máquina';
  const d = S.draft;
  d.play = Object.assign({ name: (S.roster && S.roster[0]) || '', bots: 2, level: 'normal' }, d.play || {});
  $('#app').innerHTML = `
    ${modeToggleHtml()}
    <div class="sec">
      <h2>Tu partida</h2>
      <label class="f"><span>Tu nombre</span><input type="text" id="plName" maxlength="18" value="${esc(d.play.name)}" placeholder="Tu nombre" list="rosterList" style="width:55%"></label>
      <datalist id="rosterList">${(S.roster || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="f"><span>Rivales</span><span class="kinds" style="flex:none;width:55%;margin:0">${[1, 2, 3].map(n => `<button data-bots="${n}" class="${d.play.bots === n ? 'on' : ''}">${n}</button>`).join('')}</span></label>
      <label class="f"><span>Dificultad</span><span class="kinds" style="flex:none;width:55%;margin:0">${[['facil', 'Fácil'], ['normal', 'Normal']].map(([k, l]) => `<button data-level="${k}" class="${d.play.level === k ? 'on' : ''}">${l}</button>`).join('')}</span></label>
      <div class="mut" style="margin-top:8px;line-height:1.45">Baraja española de 40 cartas, 7 por jugador. Se cierra con ${CLOSE_MAX} o menos sin ligar; con todo ligado, ${d.cfg.closeBonus}; la escalera de 7 del mismo palo es chinchón.</div>
    </div>
    <div class="sec"><h2>Reglas</h2>${cfgFields(d.cfg, 's_')}</div>
    <div class="copy">© 2026 IT Canarias</div>
    <button class="btn-gold fab" id="plStart">🃏 Empezar a jugar</button>`;
  bindCfg('s_');
  bindModeToggle();
  const sync = () => { d.play.name = $('#plName').value; d.cfg = readCfg('s_'); save(); };
  $('#plName').oninput = sync;
  document.querySelectorAll('.sec input, .sec select').forEach(el => el.addEventListener('change', sync));
  document.querySelectorAll('[data-bots]').forEach(b => b.onclick = () => { sync(); d.play.bots = +b.dataset.bots; render(); });
  document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { sync(); d.play.level = b.dataset.level; render(); });
  $('#plStart').onclick = () => {
    sync();
    const myName = (d.play.name || '').trim() || 'Yo';
    const meP = { id: uid(), name: (S.roster || []).find(x => nkey(x) === nkey(myName)) || myName };
    const bots = BOTS.slice(0, d.play.bots).map(n => ({ id: uid(), name: '🤖 ' + n }));
    const players = [meP, ...bots];
    S.game = { id: uid(), created: Date.now(), cfg: Object.assign({}, d.cfg), players, firstDealer: players[players.length - 1].id, events: [], play: { level: d.play.level, bots: bots.map(b => b.id), hand: null } };
    if (!/^Jugador \d+$/.test(meP.name) && !S.roster.some(x => nkey(x) === nkey(meP.name))) S.roster.push(meP.name);
    S.lastCfg = Object.assign({}, d.cfg);
    playSel = null; keepAwake(); render();
  };
}
function modeToggleHtml() {
  const m = S.draft.mode || 'score';
  return `<div class="kinds" style="margin:0 0 12px">
    <button data-mode="score" class="${m === 'score' ? 'on' : ''}">📝 Llevar los puntos</button>
    <button data-mode="play" class="${m === 'play' ? 'on' : ''}">🃏 Jugar contra la máquina</button></div>`;
}
function bindModeToggle() { document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.draft.mode = b.dataset.mode; save(); render(); }); }
