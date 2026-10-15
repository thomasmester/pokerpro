'use strict';

const $ = id => document.getElementById(id);

// Nada se guarda en el dispositivo: la partida vive solo en memoria.
let config = { buyIn: 0, initialPoints: 0, chipRate: 0, playerCount: 0 };
let players = [];
let lastMatch = null; // ultimo resultado calculado, listo para sumar a la liga

// ── Utilidades ─────────────────────────────────────────────────────────────

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(n) {
  if (n > 0.005) return '+' + fmt(n);
  if (n < -0.005) return '−' + fmt(n);
  return fmt(0);
}

function balanceClass(n) {
  return n > 0.005 ? 'balance-pos' : n < -0.005 ? 'balance-neg' : 'balance-zero';
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast-wrap').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

// ── Frases timberas ────────────────────────────────────────────────────────

const FRASES = [
  'La casa siempre gana. Acá la casa es el que trae las fichas.',
  'Si en 20 minutos no sabés quién es el pez de la mesa, el pez sos vos.',
  'Las deudas de juego son deudas de honor. Y de Mercado Pago.',
  '"Una mano más y me voy" — todos, a las 4 de la mañana.',
  'No es un vicio, es una liga con temporadas.',
  'Bluffear es mentir, pero con estilo.',
  'El que se va temprano paga igual.',
  'El poker es 90% suerte y 10% saber contar. Lo segundo lo hacemos nosotros.',
  'Acá no se fía. Bueno, sí se fía, para eso está la calculadora.',
  'Todo 7-2 es una mano ganadora si tenés fe suficiente.',
  'Recompra no es fracaso, es reinversión.',
];

(function rotateTagline() {
  const el = $('tagline');
  let i = Math.floor(Math.random() * FRASES.length);
  el.textContent = FRASES[i];
  setInterval(() => {
    el.classList.add('fade');
    setTimeout(() => {
      i = (i + 1) % FRASES.length;
      el.textContent = FRASES[i];
      el.classList.remove('fade');
    }, 350);
  }, 7000);
})();

// ── Tabs ───────────────────────────────────────────────────────────────────

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  $('tab-mesa').classList.toggle('hidden', name !== 'mesa');
  $('tab-liga').classList.toggle('hidden', name !== 'liga');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ── Setup ──────────────────────────────────────────────────────────────────

$('setup-btn').addEventListener('click', () => {
  const initialPoints = parseFloat($('initial-points').value);
  const chipRate = parseFloat($('chip-rate').value);
  const count = parseInt($('player-count').value);

  if (!initialPoints || initialPoints <= 0) return toast('Poné los puntos iniciales. Sin fichas no hay timba.');
  if (!chipRate || chipRate <= 0) return toast('La tasa tiene que ser mayor a 0. Jugar gratis es para cobardes.');
  if (!count || count < 2) return toast('Mínimo 2 jugadores. Solo es solitario, y eso es otro juego.');
  if (count > 20) return toast('Máximo 20. ¿Qué es esto, un casamiento?');

  const buyIn = initialPoints * chipRate;
  config = { buyIn, initialPoints, chipRate, playerCount: count };
  players = [];

  buildPlayerList(count);
  $('game-info').innerHTML = `
    <span class="info-chip">Buy-in <strong>${fmt(buyIn)}</strong></span>
    <span class="info-chip">Puntos <strong>${initialPoints.toLocaleString('es-AR')}</strong></span>
    <span class="info-chip">Tasa <strong>${fmt(chipRate)}/pto</strong></span>
  `;
  $('setup-section').classList.add('hidden');
  $('players-section').classList.remove('hidden');
  $('results-section').classList.add('hidden');
});

function buildPlayerList(count) {
  $('players-list').innerHTML = '';
  for (let i = 0; i < count; i++) addPlayerRow();
}

function renumberRows() {
  [...$('players-list').children].forEach((row, i) => {
    row.querySelector('.p-num').textContent = i + 1;
    row.querySelector('.p-name').placeholder = `Jugador ${i + 1}`;
  });
}

function addPlayerRow() {
  const div = document.createElement('div');
  div.className = 'player-row';
  div.innerHTML = `
    <span class="p-num"></span>
    <div class="form-row p-name-row">
      <label>Nombre</label>
      <input type="text" class="p-name" maxlength="30" />
    </div>
    <div class="form-row">
      <label>Puntos finales</label>
      <input type="number" class="p-chips" min="0" step="1" inputmode="numeric" placeholder="0" />
    </div>
    <div class="form-row">
      <label>Recompra</label>
      <select class="p-rebuy">
        <option value="0">Sin recompra</option>
        <option value="0.5">50% del buy-in</option>
        <option value="1">100% del buy-in</option>
      </select>
    </div>
    <button class="remove-btn" title="Eliminar" aria-label="Eliminar jugador">✕</button>
  `;
  div.querySelector('.remove-btn').addEventListener('click', () => {
    div.remove();
    renumberRows();
  });
  div.querySelector('.p-chips').addEventListener('input', e => e.target.classList.remove('invalid'));
  $('players-list').appendChild(div);
  renumberRows();
}

$('add-player-btn').addEventListener('click', () => addPlayerRow());

// ── Calcular ───────────────────────────────────────────────────────────────

$('calculate-btn').addEventListener('click', () => {
  const rows = [...$('players-list').children];
  if (rows.length < 2) return toast('Necesitás al menos 2 jugadores. No te podés ganar a vos mismo.');

  const parsed = [];
  for (const [i, row] of rows.entries()) {
    const name = row.querySelector('.p-name').value.trim() || `Jugador ${i + 1}`;
    const chipsInput = row.querySelector('.p-chips');
    const chips = parseFloat(chipsInput.value);
    if (isNaN(chips) || chips < 0) {
      chipsInput.classList.add('invalid');
      chipsInput.focus();
      return toast(`Faltan los puntos de ${name}. ¿Se fue sin contar las fichas?`);
    }
    const rebuyFactor = parseFloat(row.querySelector('.p-rebuy').value);
    const rebuyAmount = config.buyIn * rebuyFactor;
    const totalInvested = config.buyIn + rebuyAmount;
    const cashOut = chips * config.chipRate;
    parsed.push({ name, chips, cashOut, rebuyAmount, totalInvested, net: cashOut - totalInvested });
  }

  // El total de fichas deberia coincidir con lo invertido
  const totalBuyIn = parsed.reduce((s, p) => s + p.totalInvested, 0);
  const totalCashOut = parsed.reduce((s, p) => s + p.cashOut, 0);
  let rawDiff = totalCashOut - totalBuyIn; // positivo = fichas de mas, negativo = faltantes

  if (Math.abs(rawDiff) >= 0.01) {
    const ok = confirm(
      `Ojo: las fichas (${fmt(totalCashOut)}) no coinciden con lo invertido (${fmt(totalBuyIn)}).\n` +
      `Diferencia: ${fmtSigned(rawDiff)}.\n\n` +
      `La diferencia se reparte en partes iguales entre todos.\n¿Seguimos?`
    );
    if (!ok) return;
  } else {
    rawDiff = 0;
  }

  // Repartir la discrepancia en partes iguales para que la suma de nets sea 0
  const adjustPerPlayer = rawDiff / parsed.length;
  players = parsed.map(p => ({ ...p, net: p.net - adjustPerPlayer }));

  const transfers = minimizeTransfers(players.map(p => ({ name: p.name, balance: p.net })));
  renderResults(players, transfers, rawDiff);

  lastMatch = {
    tasa: config.chipRate,
    puntosIniciales: config.initialPoints,
    jugadores: players.map(p => ({
      nombre: p.name,
      puntos: p.chips,
      invertido: round2(p.totalInvested),
      resultado: round2(p.net),
    })),
  };
  resetLeagueAdd();

  $('players-section').classList.add('hidden');
  $('results-section').classList.remove('hidden');
  $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  chipRain();
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Minimizar transferencias (greedy) ─────────────────────────────────────

function minimizeTransfers(balances) {
  // Trabajar en centavos para evitar problemas de float
  const debtors = balances
    .filter(p => p.balance < -0.005)
    .map(p => ({ ...p, balance: Math.round(p.balance * 100) }))
    .sort((a, b) => a.balance - b.balance);

  const creditors = balances
    .filter(p => p.balance > 0.005)
    .map(p => ({ ...p, balance: Math.round(p.balance * 100) }))
    .sort((a, b) => b.balance - a.balance);

  const transfers = [];
  let d = 0, c = 0;

  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(-debtors[d].balance, creditors[c].balance);
    transfers.push({ from: debtors[d].name, to: creditors[c].name, amount: amount / 100 });
    debtors[d].balance += amount;
    creditors[c].balance -= amount;
    if (Math.abs(debtors[d].balance) < 1) d++;
    if (Math.abs(creditors[c].balance) < 1) c++;
  }

  return transfers;
}

// ── Resultados ─────────────────────────────────────────────────────────────

const TITULOS = {
  primero: ['El Lobo de Wall Street', 'Le dicen "el Banco"', 'Hoy se vuelve en taxi', 'Tiburón certificado'],
  ultimo: ['Sponsor oficial de la noche', 'Pez de la noche 🐟', 'Vuelve en colectivo', 'Gracias por tu aporte'],
  gano: ['Zafó con ganancia', 'Sacó para la birra', 'Cobró y calladito'],
  perdio: ['Aportó a la causa', 'Donación voluntaria', 'Mala racha (dice)'],
  empate: ['Ni fu ni fa', 'Vino a pasear', 'Suiza'],
};

function tituloPara(p, i, total) {
  if (p.net > 0.005 && i === 0) return pick(TITULOS.primero);
  if (p.net < -0.005 && i === total - 1) return pick(TITULOS.ultimo);
  if (p.net > 0.005) return pick(TITULOS.gano);
  if (p.net < -0.005) return pick(TITULOS.perdio);
  return pick(TITULOS.empate);
}

function renderResults(players, transfers, rawDiff = 0) {
  const sorted = [...players].sort((a, b) => b.net - a.net);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];

  let verdict = '';
  if (winner.net > 0.005) {
    verdict += `<p class="verdict-line win">👑 <strong>${esc(winner.name)}</strong> se llevó ${fmt(winner.net)}. Que invite la próxima.</p>`;
  }
  if (loser.net < -0.005) {
    verdict += `<p class="verdict-line lose">🐟 <strong>${esc(loser.name)}</strong> dejó ${fmt(loser.net)}. Gracias por tu aporte a la causa.</p>`;
  }
  $('verdict').innerHTML = verdict;

  let banner = '';
  if (Math.abs(rawDiff) >= 0.01) {
    const joke = rawDiff < 0 ? '¿Quién se guardó fichas en el bolsillo? 👀' : 'Aparecieron fichas de la nada. Milagro o trampa. 🤔';
    banner = `
      <div class="discrepancy-banner">
        Fichas ${rawDiff < 0 ? 'faltantes' : 'sobrantes'}: <strong>${fmtSigned(rawDiff)}</strong>
        — se reparten ${fmt(rawDiff / players.length)} por jugador.<br><span class="muted">${joke}</span>
      </div>`;
  }

  const cards = sorted.map((p, i) => {
    const rebuy = p.rebuyAmount > 0 ? `<span class="muted"> (incl. recompra ${fmt(p.rebuyAmount)})</span>` : '';
    const medal = i === 0 && p.net > 0.005 ? '🥇' : i === 1 && p.net > 0.005 ? '🥈' : i === 2 && p.net > 0.005 ? '🥉' : '';
    return `
      <div class="result-card ${balanceClass(p.net)}-card">
        <div class="result-head">
          <div>
            <div class="result-name">${medal} ${esc(p.name)}</div>
            <div class="result-title">${esc(tituloPara(p, i, sorted.length))}</div>
          </div>
          <div class="result-net ${balanceClass(p.net)}">${fmtSigned(p.net)}</div>
        </div>
        <div class="result-meta">
          <span>${p.chips.toLocaleString('es-AR')} pts</span>
          <span>Puso ${fmt(p.totalInvested)}${rebuy}</span>
          <span>Fichas ${fmt(p.cashOut)}</span>
        </div>
      </div>`;
  }).join('');

  $('balances-table').innerHTML = banner + `<div class="result-list">${cards}</div>`;

  const tContainer = $('transfers-list');
  if (transfers.length === 0) {
    tContainer.innerHTML = '<p class="no-transfers">Quedaron todos iguales. Partida aburridísima, pero nadie debe nada. 🤝</p>';
  } else {
    tContainer.innerHTML = transfers.map(t => `
      <div class="transfer-card">
        <span class="chip-icon" aria-hidden="true"></span>
        <div class="transfer-names">
          <span class="transfer-from">${esc(t.from)}</span>
          <span class="transfer-arrow">→</span>
          <span class="transfer-to">${esc(t.to)}</span>
        </div>
        <span class="transfer-amount">${fmt(t.amount)}</span>
      </div>
    `).join('');
  }
}

function chipRain() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const symbols = ['♠', '♥', '♦', '♣', '🪙', '🪙', '💵'];
  const layer = document.createElement('div');
  layer.className = 'chip-rain';
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = pick(symbols);
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * 0.8 + 's';
    s.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
    s.style.fontSize = 16 + Math.random() * 18 + 'px';
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3500);
}

// ── Sumar a la liga ────────────────────────────────────────────────────────

function resetLeagueAdd() {
  $('match-date').value = todayISO();
  $('match-note').value = '';
  $('add-to-league-btn').disabled = false;
  $('add-to-league-btn').textContent = 'Anotar en la temporada';
  $('league-export').classList.add('hidden');
}

$('add-to-league-btn').addEventListener('click', () => {
  if (!lastMatch) return;
  const fecha = $('match-date').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast('Poné una fecha. Las leyendas necesitan fecha.');
  const nota = $('match-note').value.trim();
  const partido = { fecha, ...(nota ? { nota } : {}), ...lastMatch };

  const temporada = Liga.agregarPendiente(partido);
  $('add-to-league-btn').disabled = true;
  $('add-to-league-btn').textContent = `✅ Anotado en la ${temporada}`;
  $('export-msg').innerHTML =
    'Quedó anotado <strong>sin guardar</strong> (si recargás, se pierde). Para que quede en la historia, ' +
    'copiá el <code>liga.json</code> y pegalo en GitHub reemplazando todo, o mandáselo a Claude.';
  $('export-json').value = Liga.exportarJSON();
  $('league-export').classList.remove('hidden');
  toast(`Anotado en la temporada ${temporada}. La historia te juzgará.`);
});

$('copy-json-btn').addEventListener('click', async () => {
  const ta = $('export-json');
  try {
    await navigator.clipboard.writeText(ta.value);
  } catch {
    ta.select();
    document.execCommand('copy');
  }
  toast('Copiado. Ahora pegalo en GitHub y commiteá como un campeón.');
});

// ── Navegacion ─────────────────────────────────────────────────────────────

$('back-btn').addEventListener('click', () => {
  $('results-section').classList.add('hidden');
  $('players-section').classList.remove('hidden');
});

$('reset-btn').addEventListener('click', () => {
  if (confirm('¿Reiniciar la mesa? Se pierden los datos cargados.')) resetAll();
});

$('new-game-btn').addEventListener('click', () => {
  if (confirm('¿Arrancamos otra? Dale que la noche es joven.')) resetAll();
});

function resetAll() {
  $('initial-points').value = '';
  $('chip-rate').value = '';
  $('player-count').value = '';
  lastMatch = null;
  $('results-section').classList.add('hidden');
  $('players-section').classList.add('hidden');
  $('setup-section').classList.remove('hidden');
}

// ── Galeria ────────────────────────────────────────────────────────────────

(function () {
  const track = $('gallery-track');
  const dots = [...document.querySelectorAll('.dot')];

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const i = parseInt(dot.dataset.i);
      track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
    });
  });

  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
  });

  // Avanza solo cada 4 segundos hasta que alguien la toque
  const timer = setInterval(() => {
    if (!track.clientWidth) return; // pestaña de liga abierta
    const i = Math.round(track.scrollLeft / track.clientWidth);
    track.scrollTo({ left: track.clientWidth * ((i + 1) % dots.length), behavior: 'smooth' });
  }, 4000);

  track.addEventListener('pointerdown', () => clearInterval(timer));
})();
