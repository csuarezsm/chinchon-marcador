'use strict';
/* =====================================================================
   Chinchón · Jugar en línea
   Salas con código en el servidor de IT Canarias (juegos.itcanarias.com).
   El servidor reparte y comprueba las jugadas; aquí solo se dibuja la mesa.
   © 2026 IT Canarias
   ===================================================================== */
const ONLINE_URL = () => window.ONLINE_URL || 'wss://juegos.itcanarias.com/ws';
const ON = { ws: null, estado: 'desconectado', sala: null, sel: null, quiere: false, intentos: 0, timer: null, ping: null, ultimoTurno: null };

function onToken() {
  S.online = S.online || {};
  if (!S.online.token) {
    const a = new Uint8Array(18); crypto.getRandomValues(a);
    S.online.token = Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
    save();
  }
  return S.online.token;
}
const onNombre = () => (S.online && S.online.nombre) || '';

/* ---------- Conexión (se reconecta sola) ---------- */
function onConectar() {
  ON.quiere = true;
  if (ON.ws && (ON.ws.readyState === 0 || ON.ws.readyState === 1)) return;
  clearTimeout(ON.timer);
  onSetEstado('conectando');
  let ws;
  try { ws = new WebSocket(ONLINE_URL()); } catch (e) { onReintentar(); return; }
  ON.ws = ws;
  ws.onopen = () => {
    ON.intentos = 0; onSetEstado('conectado');
    ws.send(JSON.stringify({ t: 'hola', token: onToken(), nombre: onNombre() }));
    clearInterval(ON.ping); ON.ping = setInterval(() => onEnviar({ t: 'ping' }), 25000);
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'sala') onRecibirSala(m.sala);
    else if (m.t === 'error') toast(m.msg);
    else if (m.t === 'fuera') { toast(m.motivo || 'Has salido de la partida'); onRecibirSala(null); }
  };
  ws.onclose = () => { if (ON.ws !== ws) return; clearInterval(ON.ping); ON.ws = null; onSetEstado('desconectado'); if (ON.quiere) onReintentar(); };
  ws.onerror = () => {};
}
function onReintentar() {
  clearTimeout(ON.timer);
  const ms = Math.min(15000, 1000 * 2 ** ON.intentos++);
  ON.timer = setTimeout(onConectar, ms);
}
function onDesconectar() { ON.quiere = false; clearTimeout(ON.timer); clearInterval(ON.ping); if (ON.ws) { const w = ON.ws; ON.ws = null; w.close(); } onSetEstado('desconectado'); }
function onEnviar(m) {
  if (!ON.ws || ON.ws.readyState !== 1) { if (m.t !== 'ping') toast('Sin conexión con el servidor. Reintentando…'); onConectar(); return false; }
  ON.ws.send(JSON.stringify(m)); return true;
}
function onSetEstado(e) {
  ON.estado = e;
  const el = $('#onStatus'); if (el) el.innerHTML = onEstadoHtml();
  const bar = $('#onBar'); if (bar) bar.classList.toggle('off', e !== 'conectado');
}
const onEstadoHtml = () => ({ conectado: '🟢 Conectado', conectando: '🟡 Conectando…', desconectado: '🔴 Sin conexión · reintentando' })[ON.estado];
document.addEventListener('visibilitychange', () => { if (!document.hidden && ON.quiere && ON.estado !== 'conectado') { ON.intentos = 0; onConectar(); } });

function onRecibirSala(sala) {
  const antes = ON.sala;
  ON.sala = sala;
  S.online = S.online || {}; S.online.enSala = !!sala; save();
  if (sala && sala.partida) {
    const p = sala.partida;
    const miTurno = sala.estado === 'jugando' && p.turno === sala.yo && p.fase !== 'over';
    const clave = p.mano + '|' + p.turnos;
    if (miTurno && ON.ultimoTurno !== clave) { ON.ultimoTurno = clave; vibrate(30); }
    if (p.miMano && ON.sel && !p.miMano.includes(ON.sel)) ON.sel = null;
    if (p.fase !== 'discard' || p.turno !== sala.yo) ON.sel = null;
    if (sala.estado === 'fin') onArchivar(p);
  }
  if (!sala && !antes) return;
  if (!S.game) render();
}

/* ---------- Al terminar: la partida pasa al historial y al ranking ---------- */
function onArchivar(p) {
  if (!p.partida) return;
  const g = p.partida, id = 'on-' + g.id;
  if (S.archive.some(a => a.id === id)) return;
  const R = compute(g);
  S.archive.unshift({ id, created: g.created, cfg: g.cfg, players: g.players, firstDealer: g.firstDealer, events: g.events, online: true,
    finished: Date.now(), hands: R.hand, winnerName: R.ended ? pname(g, R.ended.winner) : '(sin terminar)' });
  if (S.archive.length > MAX_ARCHIVE) S.archive.length = MAX_ARCHIVE;
  save();
}

/* ---------- Pantallas ---------- */
function renderOnline() {
  S.online = S.online || {};
  if (S.draft.mode === 'online' || ON.sala) { if (!ON.quiere) onConectar(); }
  const s = ON.sala;
  if (!s) return onRenderInicio();
  if (s.estado === 'espera') return onRenderEspera(s);
  return onRenderMesa(s);
}

function onRenderInicio() {
  $('#subtitle').textContent = 'Jugar en línea';
  const o = Object.assign({ limite: 100, cerrarDesde: 2, comodines: 0, nivel: 'normal' }, (S.online && S.online.opciones) || {});
  const seg = (id, val, opts) => `<span class="kinds" data-on="${id}" style="flex:none;width:58%;margin:0">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${t}</button>`).join('')}</span>`;
  $('#app').innerHTML = `${modeToggleHtml()}
    <div class="sec"><h2>Tu nombre</h2>
      <input id="onName" maxlength="20" placeholder="Cómo te verán los demás" value="${esc(onNombre())}" autocomplete="off" style="width:100%">
    </div>
    <div class="sec"><h2>Unirse a una partida</h2>
      <div class="mut" style="margin-bottom:8px">Pide el código a quien la ha creado.</div>
      <div class="row" style="gap:8px"><input id="onCode" maxlength="4" placeholder="Código" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0;width:0;text-transform:uppercase;letter-spacing:4px;font-weight:700;text-align:center">
      <button class="btn-gold" id="onJoin" style="flex:1;min-width:0">Unirse</button></div>
    </div>
    <div class="sec"><h2>Crear una partida</h2>
      <label class="f"><span>Eliminado al pasar de</span><input type="number" inputmode="numeric" id="onLim" value="${o.limite}"></label>
      <label class="f"><span>Se puede cerrar desde</span>${seg('cerrarDesde', o.cerrarDesde, [[1, '1ª vuelta'], [2, '2ª vuelta'], [3, '3ª vuelta']])}</label>
      <label class="f"><span>Comodines</span>${seg('comodines', o.comodines, [[0, 'Sin'], [2, '2 comodines']])}</label>
      <label class="f"><span>Nivel de la máquina<em>Si rellenas sillas con la máquina</em></span>${seg('nivel', o.nivel, [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']])}</label>
      <button class="btn-gold" id="onCreate" style="width:100%;margin-top:8px">Crear partida</button>
    </div>
    <div class="mut" id="onStatus" style="text-align:center;margin:6px 0 20px">${onEstadoHtml()}</div>`;
  bindModeToggle();
  const nameOk = () => { const n = $('#onName').value.trim().slice(0, 20); if (!n) { toast('Escribe tu nombre'); $('#onName').focus(); return null; } S.online.nombre = n; save(); return n; };
  $('#onName').onchange = () => { S.online.nombre = $('#onName').value.trim().slice(0, 20); save(); };
  document.querySelectorAll('[data-on]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  }));
  const val = id => { const b = document.querySelector(`[data-on="${id}"] .on`); return b ? b.dataset.v : null; };
  $('#onCode').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('#onJoin').onclick = () => {
    const n = nameOk(); if (!n) return;
    const c = $('#onCode').value.trim().toUpperCase(); if (c.length !== 4) { toast('El código tiene 4 letras o números'); return; }
    onEnviar({ t: 'unirse', codigo: c, nombre: n });
  };
  $('#onCreate').onclick = () => {
    const n = nameOk(); if (!n) return;
    const opciones = { limite: Math.max(50, Math.min(500, parseInt($('#onLim').value, 10) || 100)), cerrarDesde: +val('cerrarDesde'), comodines: +val('comodines'), nivel: val('nivel') };
    S.online.opciones = opciones; save();
    onEnviar({ t: 'crear', juego: 'chinchon', opciones, nombre: n });
  };
}

function onRenderEspera(s) {
  $('#subtitle').textContent = 'Partida en línea · esperando';
  const host = s.asientos.find(a => a.anfitrion);
  $('#app').innerHTML = `
    <div class="sec" style="text-align:center"><div class="mut">Código de la partida</div>
      <div class="on-code" id="onCodeBig">${esc(s.codigo)}</div>
      <button class="btn-gold" id="onInvite" style="width:100%">📲 Invitar (WhatsApp…)</button>
      <div class="mut" style="margin-top:8px">Los demás abren la app → <b>Jugar en línea</b> → <b>Unirse</b> y ponen el código.</div></div>
    <div class="sec"><h2>Jugadores (${s.asientos.length}/${s.max})</h2>
      ${s.asientos.map(a => `<div class="on-seat"><span class="on-dot ${a.conectado ? 'ok' : ''}"></span><span class="n">${esc(a.nombre)}${a.id === s.yo ? ' <small>(tú)</small>' : ''}${a.anfitrion ? ' 👑' : ''}</span>
        ${s.anfitrion && a.id !== s.yo ? `<button class="btn-ghost sm" data-quitar="${a.id}">✕</button>` : ''}</div>`).join('')}
      ${s.anfitrion && s.asientos.length < s.max ? '<button class="btn-ghost" id="onBot" style="width:100%;margin-top:8px">🤖 Añadir a la máquina</button>' : ''}
    </div>
    ${s.anfitrion
      ? `<button class="btn-gold" id="onStart" style="width:100%" ${s.asientos.length >= s.min ? '' : 'disabled'}>Empezar la partida</button>
         <div class="mut" style="text-align:center;margin-top:6px">${s.asientos.length < s.min ? 'Espera a que entre alguien o añade a la máquina.' : 'Cuando estéis todos, pulsa Empezar.'}</div>`
      : `<div class="sec" style="text-align:center">⏳ Esperando a que ${esc(host ? host.nombre : 'el anfitrión')} empiece la partida…</div>`}
    <button class="btn-ghost" id="onLeave" style="width:100%;margin-top:12px">Salir</button>
    <div class="mut" id="onStatus" style="text-align:center;margin:10px 0 20px">${onEstadoHtml()}</div>`;
  $('#onInvite').onclick = () => onInvitar(s.codigo);
  const b = $('#onBot'); if (b) b.onclick = () => onEnviar({ t: 'bot' });
  const st = $('#onStart'); if (st) st.onclick = () => onEnviar({ t: 'empezar' });
  document.querySelectorAll('[data-quitar]').forEach(x => x.onclick = () => onEnviar({ t: 'quitar', asiento: x.dataset.quitar }));
  $('#onLeave').onclick = () => confirmBox('Salir', 'Saldrás de esta partida.', 'Salir', () => { onEnviar({ t: 'salir' }); });
}

async function onInvitar(codigo) {
  const enlace = (typeof isPlay === 'function' && isPlay()) ? PLAY_URL : APK_URL;
  const text = `🃏 ¡Juega al chinchón conmigo!\n\nAbre la app Chinchón → Jugar en línea → Unirse y pon el código:\n\n*${codigo}*\n\n¿No tienes la app? Descárgala aquí:\n${enlace}`;
  try {
    if (isNative()) { await window.Capacitor.Plugins.Share.share({ title: 'Partida de chinchón', text, dialogTitle: 'Invitar' }); return; }
    if (navigator.share) { await navigator.share({ title: 'Partida de chinchón', text }); return; }
    await navigator.clipboard.writeText(text); toast('Invitación copiada');
  } catch (e) { if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) toast('No se pudo compartir'); }
}

function onRenderMesa(s) {
  const p = s.partida, yo = s.yo;
  const nombre = id => { const j = p.jugadores.find(x => x.id === id); return j ? j.nombre : '?'; };
  const asiento = id => s.asientos.find(a => a.id === id) || {};
  $('#subtitle').textContent = s.estado === 'fin' ? 'Partida en línea · terminada' : 'Mano ' + p.mano + ' · en línea · ' + s.codigo;
  const cs = CARD_SIZES.find(x => x[0] === String(S.cardScale || '1')) || CARD_SIZES[0];
  const over = p.fase === 'over';
  const miTurno = s.estado === 'jugando' && p.turno === yo && !over;
  const arr = p.miMano ? arrangeHand(p.miMano) : null;
  let selDead = null;
  if (arr && miTurno && p.fase === 'discard' && ON.sel && p.miMano.includes(ON.sel)) selDead = bestMelds(p.miMano.filter(x => x !== ON.sel));
  const puedeCerrar = selDead && selDead.dead <= CLOSE_MAX && p.ronda >= p.cerrarDesde;
  const rivales = p.jugadores.filter(j => j.id !== yo);
  const yoJ = p.jugadores.find(j => j.id === yo);

  let centro = '';
  if (s.estado === 'fin') centro = onFinHtml(s, p, nombre);
  else if (over) centro = onResultadoHtml(s, p, nombre);

  let hint = '';
  if (!p.miMano) hint = 'Estás eliminado: mirando la partida.';
  else if (over) hint = '';
  else if (!miTurno) hint = 'Juega ' + esc(nombre(p.turno)) + (asiento(p.turno).conectado === false ? ' (sin conexión: si tarda, juega la máquina por él)' : '') + '…';
  else if (p.fase === 'draw') hint = 'Tu turno: roba del <b>mazo</b> o coge la carta del <b>descarte</b>.';
  else hint = ON.sel ? (puedeCerrar ? 'Puedes <b>tirar</b> esta carta o <b>cerrar</b> la mano.' : 'Toca <b>Tirar</b> para descartar esta carta.') : 'Elige la carta que quieres tirar.';

  $('#app').innerHTML = `<div class="on-bar" id="onBar"><span>Partida <b>${esc(s.codigo)}</b></span><span id="onStatus">${onEstadoHtml()}</span></div>
    ${centro || `<div class="pt-table" style="--cs:${cs[0]}"><div class="pt-l">
    <div class="pt-opps">${rivales.map(j => `<div class="pt-opp ${p.turno === j.id && !over ? 'turn' : ''}">
        <div class="pt-on">${asiento(j.id).conectado === false ? '📵 ' : ''}${esc(j.nombre)}</div><div class="pt-ot">${j.fuera ? 'eliminado' : j.total + ' pts'}</div>
        <div class="pt-ob">${'<i></i>'.repeat(Math.min(8, j.cartas))}</div></div>`).join('')}</div>
    <div class="pt-mid">
      <div class="pt-pile"><button class="pt-btn" id="pDeck" ${miTurno && p.fase === 'draw' ? '' : 'disabled'}>${backHtml(p.mazo)}</button><small>Mazo</small></div>
      <div class="pt-pile"><button class="pt-btn" id="pDisc" ${miTurno && p.fase === 'draw' && p.descarte ? '' : 'disabled'}>${p.descarte ? cardHtml(p.descarte) : cardHtml(null)}</button><small>Descarte</small></div>
    </div>
    <div class="pt-log">${esc(p.log || '')}</div></div><div class="pt-r">
    <div class="pt-hint">${hint}</div>
    ${arr ? `<div class="pt-hand ${cs[0] !== '1' ? 'big' : ''}">${arr.ids.map(id => cardHtml(id, { sel: id === ON.sel, isNew: miTurno && p.fase === 'discard' && id === p.nueva, data: `data-card="${id}"` })).join('')}</div>
    <div class="pt-info">${p.ronda < p.cerrarDesde ? `<span class="pt-early">🔒 Se puede cerrar desde la ${p.cerrarDesde}ª vuelta (vais por la ${p.ronda}ª)</span><br>` : ''}Llevas <b>${yoJ ? yoJ.total : 0}</b> · ${p.mazo} en el mazo · <button class="pt-learn" id="pSize">🔍 Cartas: ${cs[1]}</button></div>
    <div class="pt-acts">
      <button class="btn-ghost" id="pScore">📋 Puntos</button>
      <button class="btn-gold" id="pDrop" ${miTurno && p.fase === 'discard' && ON.sel ? '' : 'disabled'}>Tirar</button>
      <button class="btn-red" id="pClose" ${puedeCerrar ? '' : 'disabled'}>Cerrar${selDead ? ' (' + (isChinchon(p.miMano.filter(x => x !== ON.sel)) ? '★' : selDead.loose.length === 0 ? '−10' : selDead.dead) + ')' : ''}</button>
    </div>` : `<div class="pt-acts"><button class="btn-ghost" id="pScore">📋 Puntos</button><button class="btn-ghost" id="onLeave2">Salir</button></div>`}</div></div>`}`;

  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('pDeck', () => onEnviar({ t: 'jugada', a: { tipo: 'robar', de: 'mazo' } }));
  on('pDisc', () => onEnviar({ t: 'jugada', a: { tipo: 'robar', de: 'descarte' } }));
  document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => { if (!miTurno || p.fase !== 'discard') return; ON.sel = ON.sel === b.dataset.card ? null : b.dataset.card; vibrate(8); render(); });
  on('pDrop', () => { const c = ON.sel; ON.sel = null; onEnviar({ t: 'jugada', a: { tipo: 'tirar', carta: c } }); });
  on('pClose', () => { const c = ON.sel; confirmBox('Cerrar la mano', `Tiras ${theCard(card(c))} y enseñas tus cartas.`, 'Cerrar', () => { ON.sel = null; onEnviar({ t: 'jugada', a: { tipo: 'tirar', carta: c, cerrar: true } }); }); });
  on('pSize', () => { const i = CARD_SIZES.indexOf(cs); S.cardScale = CARD_SIZES[(i + 1) % CARD_SIZES.length][0]; save(); render(); });
  on('pScore', () => onPuntos(p, nombre));
  on('prNext', () => onEnviar({ t: 'jugada', a: { tipo: 'listo' } }));
  on('prRebuy', () => onEnviar({ t: 'jugada', a: { tipo: 'reenganche' } }));
  on('onLeave2', () => confirmBox('Salir', 'Saldrás de la partida en línea.', 'Salir', () => onEnviar({ t: 'salir' })));
  on('onLeave3', () => confirmBox('Salir de la partida', 'Tu silla la ocupará la máquina hasta el final.', 'Salir', () => onEnviar({ t: 'salir' })));
  on('onAgain', () => { onEnviar({ t: 'salir' }); S.draft.mode = 'online'; save(); });
}

function onResultadoHtml(s, p, nombre) {
  const r = p.resultado, yo = s.yo;
  const titulo = r.cierra ? (r.cierra === yo ? '¡Has cerrado!' : esc(nombre(r.cierra)) + ' ha cerrado') : 'Mano terminada';
  const rows = Object.keys(r.manos).map(pid => {
    const arr = arrangeHand(r.manos[pid]), pts = r.puntos[pid], j = p.jugadores.find(x => x.id === pid);
    return `<div class="hrow"><div class="top"><div class="n">${r.cierra === pid ? (r.tipo === 'chinchon' ? '★ ' : '✓ ') : ''}${esc(nombre(pid))}<small>${r.cierra === pid ? (r.tipo === 'chinchon' ? '¡Chinchón!' : r.tipo === 'bonus' ? 'Cerró con todo ligado' : 'Cerró') : arr.bm.dead + ' sin ligar'} · total ${j.total}${j.fuera ? ' · eliminado' : ''}</small></div>
      <b style="color:${pts < 0 ? 'var(--ok)' : 'var(--gold)'};font-size:calc(20px * var(--fs, 1))">${pts > 0 ? '+' + pts : pts}</b></div>
      <div class="pt-hand mini">${arr.ids.map(id => cardHtml(id, { small: true, meld: arr.meldOf[id] })).join('')}</div></div>`;
  }).join('');
  const listo = p.listos.includes(yo);
  const humanos = s.asientos.filter(a => !a.bot && a.conectado);
  const faltan = humanos.filter(a => !p.listos.includes(a.id)).map(a => a.nombre);
  return `<div class="sec"><h2 style="margin-bottom:4px">${titulo}</h2><div class="mut" style="margin-bottom:10px">Mano ${p.mano} anotada.</div>${rows}
    <div class="on-acts">${p.puedeReenganchar ? `<button class="btn-ghost" id="prRebuy">Reenganchar (${p.puntosReenganche})</button>` : ''}
      ${listo ? `<div class="mut" style="flex:1;text-align:center">⏳ Esperando a ${esc(faltan.join(', ') || 'los demás')}…</div>` : '<button class="btn-gold" id="prNext">Seguir</button>'}</div></div>`;
}

function onFinHtml(s, p, nombre) {
  const orden = p.jugadores.slice().sort((a, b) => (a.fuera - b.fuera) || (a.total - b.total));
  return `<div class="sec" style="text-align:center"><div style="font-size:48px">🏆</div><h2>${p.fin.ganador === s.yo ? '¡Has ganado!' : esc(nombre(p.fin.ganador)) + ' gana la partida'}</h2>
    <div class="mut">${p.fin.por === 'chinchon' ? 'Con chinchón.' : p.mano + ' manos jugadas.'} Guardada en tu historial y en el ranking.</div></div>
    <div class="sec">${orden.map(j => `<div class="top" style="padding:6px 0"><div class="n">${j.id === p.fin.ganador ? '🏆 ' : ''}${esc(j.nombre)}${j.reenganches ? ' <small style="display:inline">↻' + j.reenganches + '</small>' : ''}</div><b style="${j.fuera ? 'color:var(--red)' : ''}">${j.total}</b></div>`).join('')}</div>
    <button class="btn-gold" id="onAgain" style="width:100%">Otra partida en línea</button>`;
}

function onPuntos(p, nombre) {
  const ids = p.jugadores.map(j => j.id);
  openModal(`<h3>📋 Puntuaciones</h3><div class="tbl-wrap"><table><thead><tr><th>#</th>${ids.map(id => `<th>${esc(nombre(id))}</th>`).join('')}</tr></thead><tbody>
    ${p.historial.map(h => `<tr><td>${h.n}</td>${ids.map(id => `<td>${h.puntos[id] == null ? '' : (h.cierra === id ? '✓' : '') + h.puntos[id]}</td>`).join('')}</tr>`).join('')}
    <tr><td><b>Σ</b></td>${p.jugadores.map(j => `<td><b>${j.total}</b></td>`).join('')}</tr></tbody></table></div>
    <div class="mut" style="margin-top:6px">Límite: ${p.limite} puntos.</div>
    <div class="acts">${ON.sala && ON.sala.estado === 'jugando' ? '<button class="btn-ghost" id="onLeave3">Abandonar</button>' : ''}<button class="btn-gold" id="psOk">Volver a la mesa</button></div>`);
  $('#psOk').onclick = closeModal;
  const l = $('#onLeave3'); if (l) l.onclick = () => { closeModal(); confirmBox('Abandonar la partida', 'Tu silla la ocupará la máquina hasta el final.', 'Abandonar', () => onEnviar({ t: 'salir' })); };
}

// Al abrir la app: si estabas en una partida en línea, vuelve a ella
document.addEventListener('DOMContentLoaded', () => { try { if (S.online && S.online.enSala) onConectar(); } catch (e) {} });
