'use strict';

const $ = id => document.getElementById(id);

let config = { buyIn: 0, initialPoints: 0, chipRate: 0, playerCount: 0 };
let players = [];

// ── Setup ──────────────────────────────────────────────────────────────────

$('setup-btn').addEventListener('click', () => {
  const initialPoints = parseFloat($('initial-points').value);
  const chipRate = parseFloat($('chip-rate').value);
  const count = parseInt($('player-count').value);

  if (!initialPoints || initialPoints <= 0) return alert('Ingresa los puntos iniciales.');
  if (!chipRate || chipRate <= 0) return alert('Ingresa una tasa valida.');
  if (!count || count < 2) return alert('Minimo 2 jugadores.');

  const buyIn = initialPoints * chipRate;
  config = { buyIn, initialPoints, chipRate, playerCount: count };
  players = [];

  buildPlayerList(count);
  $('game-info').innerHTML = `
    <span class="info-chip">Buy-in: <strong>${fmt(buyIn)}</strong></span>
    <span class="info-chip">Puntos iniciales: <strong>${initialPoints.toLocaleString()}</strong></span>
    <span class="info-chip">Tasa: <strong>${fmt(chipRate)}/pto</strong></span>
  `;
  $('setup-section').classList.add('hidden');
  $('players-section').classList.remove('hidden');
  $('results-section').classList.add('hidden');
});

function buildPlayerList(count) {
  const list = $('players-list');
  list.innerHTML = '';
  for (let i = 0; i < count; i++) addPlayerRow(i + 1);
}

function addPlayerRow(num) {
  const list = $('players-list');
  const idx = list.children.length;
  const div = document.createElement('div');
  div.className = 'player-row';
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="form-row">
      <label>Nombre</label>
      <input type="text" class="p-name" placeholder="Jugador ${num}" />
    </div>
    <div class="form-row">
      <label>Puntos finales</label>
      <input type="number" class="p-chips" min="0" step="1" placeholder="0" />
    </div>
    <div class="form-row">
      <label>Recompra</label>
      <select class="p-rebuy">
        <option value="0">Sin recompra</option>
        <option value="0.5">50% del buy-in</option>
        <option value="1">100% del buy-in</option>
      </select>
    </div>
    <button class="remove-btn" title="Eliminar">✕</button>
  `;
  div.querySelector('.remove-btn').addEventListener('click', () => {
    div.remove();
  });
  list.appendChild(div);
}

$('add-player-btn').addEventListener('click', () => {
  const count = $('players-list').children.length + 1;
  addPlayerRow(count);
});

// ── Calculate ──────────────────────────────────────────────────────────────

$('calculate-btn').addEventListener('click', () => {
  const rows = [...$('players-list').children];
  if (rows.length < 2) return alert('Necesitas al menos 2 jugadores.');

  players = rows.map((row, i) => {
    const name = row.querySelector('.p-name').value.trim() || `Jugador ${i + 1}`;
    const chips = parseFloat(row.querySelector('.p-chips').value);
    if (isNaN(chips) || chips < 0) throw new Error(`Fichas invalidas para ${name}`);
    const rebuyFactor = parseFloat(row.querySelector('.p-rebuy').value);
    const rebuyAmount = config.buyIn * rebuyFactor;
    const totalInvested = config.buyIn + rebuyAmount;
    const cashOut = chips * config.chipRate;
    const net = cashOut - totalInvested;
    return { name, chips, cashOut, rebuyAmount, totalInvested, net };
  });

  // Validate: total cash-out should equal total buy-in (within rounding tolerance)
  const totalBuyIn = players.reduce((s, p) => s + p.totalInvested, 0);
  const totalCashOut = players.reduce((s, p) => s + p.cashOut, 0);
  const rawDiff = totalCashOut - totalBuyIn; // positive = fichas de mas, negative = fichas faltantes
  const absDiff = Math.abs(rawDiff);
  let discrepancy = 0;

  if (absDiff > 0.01 * players.length) {
    const ok = confirm(
      `Atencion: el total de fichas (${fmt(totalCashOut)}) no coincide con el total invertido (${fmt(totalBuyIn)}).\n` +
      `Diferencia: ${rawDiff < 0 ? '-' : '+'}${fmt(absDiff)}.\n\n` +
      `La diferencia se distribuira en partes iguales entre todos los jugadores.\n¿Continuar?`
    );
    if (!ok) return;
    discrepancy = rawDiff; // se absorbe proporcionalmente abajo
  }

  // Distribuir discrepancia en partes iguales para que la suma de nets sea siempre 0
  const adjustPerPlayer = discrepancy / players.length;
  players = players.map(p => ({ ...p, net: p.net - adjustPerPlayer }));

  const transfers = minimizeTransfers(players.map(p => ({ name: p.name, balance: p.net })));
  renderResults(players, transfers, rawDiff);

  $('players-section').classList.add('hidden');
  $('results-section').classList.remove('hidden');
});

// ── Debt minimization (greedy max-match) ──────────────────────────────────

function minimizeTransfers(balances) {
  // Round to cents to avoid float issues
  const debtors = balances
    .filter(p => p.balance < -0.005)
    .map(p => ({ ...p, balance: Math.round(p.balance * 100) }))
    .sort((a, b) => a.balance - b.balance); // most negative first

  const creditors = balances
    .filter(p => p.balance > 0.005)
    .map(p => ({ ...p, balance: Math.round(p.balance * 100) }))
    .sort((a, b) => b.balance - a.balance); // most positive first

  const transfers = [];
  let d = 0, c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debt = -debtors[d].balance;
    const credit = creditors[c].balance;
    const amount = Math.min(debt, credit);

    transfers.push({
      from: debtors[d].name,
      to: creditors[c].name,
      amount: amount / 100,
    });

    debtors[d].balance += amount;
    creditors[c].balance -= amount;

    if (Math.abs(debtors[d].balance) < 1) d++;
    if (Math.abs(creditors[c].balance) < 1) c++;
  }

  return transfers;
}

// ── Render results ─────────────────────────────────────────────────────────

function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderResults(players, transfers, rawDiff = 0) {
  const absDiff = Math.abs(rawDiff);
  const adjustPerPlayer = rawDiff / players.length;

  // Balances table
  const container = $('balances-table');

  const discrepancyBanner = absDiff > 0.01 ? `
    <div class="discrepancy-banner">
      Fichas ${rawDiff < 0 ? 'faltantes' : 'sobrantes'}: <strong>${rawDiff < 0 ? '-' : '+'}${fmt(absDiff)}</strong>
      — distribuido ${fmt(Math.abs(adjustPerPlayer))} por jugador
    </div>` : '';

  const tableRows = players.map(p => {
    const cls = p.net > 0.005 ? 'balance-pos' : p.net < -0.005 ? 'balance-neg' : 'balance-zero';
    const sign = p.net > 0.005 ? '+' : '';
    const rebuyLabel = p.rebuyAmount > 0 ? `<span class="summary-chip">+${fmt(p.rebuyAmount)}</span>` : '';
    return `
      <tr>
        <td>${p.name}</td>
        <td>${p.chips.toLocaleString()} pts</td>
        <td>${fmt(p.totalInvested)}${rebuyLabel}</td>
        <td>${fmt(p.cashOut)}</td>
        <td class="${cls}">${sign}${fmt(p.net)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    ${discrepancyBanner}
    <table class="balance-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Puntos</th>
          <th>Invertido</th>
          <th>Cash-out</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;

  // Transfers
  const tContainer = $('transfers-list');
  if (transfers.length === 0) {
    tContainer.innerHTML = '<p class="no-transfers">Todos quedaron iguales, no hay deudas.</p>';
  } else {
    tContainer.innerHTML = transfers.map(t => `
      <div class="transfer-card">
        <span class="chip-emoji">🪙</span>
        <div class="transfer-names">
          <span class="transfer-from">${t.from}</span>
          <span class="transfer-arrow">→</span>
          <span class="transfer-to">${t.to}</span>
        </div>
        <span class="transfer-amount">${fmt(t.amount)}</span>
      </div>
    `).join('');
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

$('back-btn').addEventListener('click', () => {
  $('results-section').classList.add('hidden');
  $('players-section').classList.remove('hidden');
});

$('reset-btn').addEventListener('click', () => {
  if (confirm('Reiniciar configuracion?')) resetAll();
});

$('new-game-btn').addEventListener('click', () => {
  if (confirm('Empezar nueva partida?')) resetAll();
});

// ── Gallery ────────────────────────────────────────────────────────────────

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

  // Auto-advance every 4 seconds
  let timer = setInterval(() => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    const next = (i + 1) % dots.length;
    track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' });
  }, 4000);

  track.addEventListener('pointerdown', () => clearInterval(timer));
})();

function resetAll() {
  $('initial-points').value = '';
  $('chip-rate').value = '';
  $('player-count').value = '';
  $('results-section').classList.add('hidden');
  $('players-section').classList.add('hidden');
  $('setup-section').classList.remove('hidden');
}
