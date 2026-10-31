'use strict';
/*
 * Carga el motor del juego de la app (www/marcador.js y www/juego.js) dentro de un
 * contexto aislado de Node. El servidor usa exactamente las mismas reglas que la app.
 * Barajar usa números aleatorios criptográficos.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WWW = process.env.WWW_DIR || path.join(__dirname, '..', '..', 'www');

function cargar(ficheros, exporta) {
  const MathSeguro = Object.create(Math);
  MathSeguro.random = () => crypto.randomInt(0, 2 ** 47) / 2 ** 47;
  const ctx = vm.createContext({ Math: MathSeguro, Date, JSON, Object, Array, Number, String, Set, Map, console });
  for (const f of ficheros) vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('globalThis.__E = {' + exporta.join(',') + '}', ctx);
  return ctx.__E;
}

const chinchon = cargar(['marcador.js', 'juego.js'], [
  'compute', 'dealHand', 'drawFrom', 'botStep', 'closeHand', 'nextTurn', 'bestMelds', 'bestDiscard',
  'canCloseNow', 'closeFrom', 'roundOf', 'CLOSE_MAX', 'DEF_CFG', 'pname', 'canRebuy', 'rebuyScore',
  'usePlayRules', 'theCard', 'card', 'isChinchon'
]);

module.exports = { chinchon };
