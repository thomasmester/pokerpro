'use strict';

const $ = id => document.getElementById(id);

let config = { buyIn: 0, chipRate: 0, playerCount: 0 };
let players = [];

// ── Setup ──────────────────────────────────────────────────────────────────

$('setup-btn').addEventListener('click', () => {
  const buyIn = parseFloat($('buy-in').value);
  const chipRate = parseFloat($('chip-rate').value);
  const count = parseInt($('player-count').value);

  if (!buyIn || buyIn <= 0) return alert('Ingresa un buy-in valido.');
  if (!chipRate || chipRate <= 0) return alert('Ingresa una tasa valida.');
  if (!count || count < 2) return alert('Minimo 2 jugadores.');

  config = { buyIn, chipRate, playerCount: count };
  players = [];

  buildPlayerList(count);
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
      <label>Fichas finales</label>
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
  const diff = Math.abs(totalCashOut - totalBuyIn);
  if (diff > 0.01 * players.length) {
    const ok = confirm(
      `Atencion: el total de fichas (${fmt(totalCashOut)}) no coincide con el total de buy-ins (${fmt(totalBuyIn)}).\n` +
      `Diferencia: ${fmt(totalCashOut - totalBuyIn)}.\n¿Continuar igual?`
    );
    if (!ok) return;
  }

  const transfers = minimizeTransfers(players.map(p => ({ name: p.name, balance: p.net })));
  renderResults(players, transfers);

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

function renderResults(players, transfers) {
  // Balances table
  const container = $('balances-table');
  const tableRows = players.map(p => {
    const cls = p.net > 0.005 ? 'balance-pos' : p.net < -0.005 ? 'balance-neg' : 'balance-zero';
    const sign = p.net > 0.005 ? '+' : '';
    const rebuyLabel = p.rebuyAmount > 0 ? `<span class="summary-chip">+${fmt(p.rebuyAmount)}</span>` : '';
    return `
      <tr>
        <td>${p.name}</td>
        <td>${p.chips.toLocaleString()} fichas</td>
        <td>${fmt(p.totalInvested)}${rebuyLabel}</td>
        <td>${fmt(p.cashOut)}</td>
        <td class="${cls}">${sign}${fmt(p.net)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="balance-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Fichas</th>
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

function resetAll() {
  $('buy-in').value = '';
  $('chip-rate').value = '';
  $('player-count').value = '';
  $('results-section').classList.add('hidden');
  $('players-section').classList.add('hidden');
  $('setup-section').classList.remove('hidden');
}
