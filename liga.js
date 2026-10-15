'use strict';

// Liga y temporadas. Los partidos guardados viven en liga.json (en el repo);
// los que se anotan desde la mesa quedan solo en memoria hasta que se suben.
const Liga = (() => {
  const HISTORICO = 'historico';
  let nombreLiga = 'Liga PokerPro';
  let guardados = [];
  let pendientes = [];
  let seleccionada = null;
  let estado = 'cargando'; // cargando | ok | error

  // Temporada estilo futbol europeo: de julio a junio. Ej: 2026-10-14 -> "26/27"
  function temporadaDe(partido) {
    if (partido.temporada) return partido.temporada;
    const [y, m] = partido.fecha.split('-').map(Number);
    const start = m >= 7 ? y : y - 1;
    const yy = n => String(n % 100).padStart(2, '0');
    return `${yy(start)}/${yy(start + 1)}`;
  }

  const temporadaActual = () => temporadaDe({ fecha: todayISO() });
  const todos = () => [...guardados, ...pendientes];
  const clave = nombre => nombre.trim().toLowerCase();

  function fechaLinda(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function fechaCorta(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  async function cargar() {
    try {
      const r = await fetch('liga.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      nombreLiga = data.nombre || nombreLiga;
      guardados = (data.partidos || []).filter(p => p && p.fecha && Array.isArray(p.jugadores));
      estado = 'ok';
    } catch (e) {
      estado = 'error';
    }
    render();
  }

  function agregarPendiente(partido) {
    pendientes.push({ ...partido, _pendiente: true });
    seleccionada = temporadaDe(partido);
    render();
    return seleccionada;
  }

  function exportarJSON() {
    const partidos = todos()
      .map(({ _pendiente, ...p }) => p)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return JSON.stringify({ nombre: nombreLiga, partidos }, null, 2) + '\n';
  }

  // ── Estadisticas ─────────────────────────────────────────────────────────

  function partidosDe(temp) {
    const lista = temp === HISTORICO ? todos() : todos().filter(p => temporadaDe(p) === temp);
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  function tabla(partidos) {
    const map = new Map();
    for (const partido of partidos) {
      for (const j of partido.jugadores) {
        const k = clave(j.nombre);
        if (!map.has(k)) map.set(k, { nombre: j.nombre.trim(), pj: 0, ganados: 0, total: 0, mejor: -Infinity, peor: Infinity });
        const s = map.get(k);
        s.pj++;
        if (j.resultado > 0.005) s.ganados++;
        s.total += j.resultado;
        s.mejor = Math.max(s.mejor, j.resultado);
        s.peor = Math.min(s.peor, j.resultado);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total || b.ganados - a.ganados);
  }

  function premios(partidos, filas) {
    if (!partidos.length) return [];
    const out = [];
    const lider = filas[0];
    if (lider.total > 0.005) out.push({ icon: '👑', titulo: 'El Lobo', quien: lider.nombre, detalle: `${fmtSigned(lider.total)} en total` });

    const sponsor = filas[filas.length - 1];
    if (sponsor.total < -0.005) out.push({ icon: '🐟', titulo: 'Sponsor oficial', quien: sponsor.nombre, detalle: `${fmtSigned(sponsor.total)}. Gracias, crack` });

    let noche = null;
    for (const p of partidos) for (const j of p.jugadores) {
      if (!noche || j.resultado > noche.resultado) noche = { ...j, fecha: p.fecha };
    }
    if (noche && noche.resultado > 0.005) out.push({ icon: '🔥', titulo: 'Noche soñada', quien: noche.nombre, detalle: `${fmtSigned(noche.resultado)} el ${fechaCorta(noche.fecha)}` });

    const presente = [...filas].sort((a, b) => b.pj - a.pj)[0];
    out.push({ icon: '🪑', titulo: 'No falta nunca', quien: presente.nombre, detalle: `${presente.pj} ${presente.pj === 1 ? 'partido' : 'partidos'}` });

    const pozo = partidos.reduce((s, p) => s + p.jugadores.reduce((t, j) => t + (j.invertido || 0), 0), 0);
    if (pozo > 0) out.push({ icon: '💸', titulo: 'Plata que giró', quien: fmt(pozo), detalle: `en ${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'}` });
    return out;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function temporadasDisponibles() {
    const set = new Set(todos().map(temporadaDe));
    set.add(temporadaActual());
    return [...set].sort().reverse();
  }

  function render() {
    if (!seleccionada) seleccionada = temporadaActual();
    const temps = temporadasDisponibles();
    if (seleccionada !== HISTORICO && !temps.includes(seleccionada)) seleccionada = temps[0];

    $('season-chips').innerHTML = [...temps.map(t => [t, `Temp. ${t}`]), [HISTORICO, '📜 Histórico']]
      .map(([id, label]) => `<button class="season-chip${id === seleccionada ? ' active' : ''}" data-temp="${esc(id)}">${esc(label)}</button>`)
      .join('');
    $('season-chips').querySelectorAll('.season-chip').forEach(b =>
      b.addEventListener('click', () => { seleccionada = b.dataset.temp; render(); }));

    const badge = $('liga-badge');
    badge.textContent = pendientes.length;
    badge.classList.toggle('hidden', !pendientes.length);

    const partidos = partidosDe(seleccionada);
    const filas = tabla(partidos);
    const nombreTemp = seleccionada === HISTORICO ? 'todas las temporadas' : `la temporada ${seleccionada}`;

    let status = `<p class="hint">${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'} en ${esc(nombreTemp)}.</p>`;
    if (estado === 'cargando') status = '<p class="hint">Barajando la historia...</p>';
    if (estado === 'error') status = '<p class="hint warn">No pude leer <code>liga.json</code>. Mostrando solo lo de esta sesión.</p>';
    if (pendientes.length) status += `<p class="hint warn">⚠️ ${pendientes.length} ${pendientes.length === 1 ? 'partido sin guardar' : 'partidos sin guardar'}. Subí el <code>liga.json</code> o se pierden al recargar.</p>`;
    $('league-status').innerHTML = status;

    // Premios
    const ps = premios(partidos, filas);
    $('awards-card').classList.toggle('hidden', !ps.length);
    $('awards').innerHTML = ps.map(p => `
      <div class="award">
        <span class="award-icon">${p.icon}</span>
        <div>
          <div class="award-title">${esc(p.titulo)}</div>
          <div class="award-who">${esc(p.quien)}</div>
          <div class="award-detail">${esc(p.detalle)}</div>
        </div>
      </div>`).join('');

    // Tabla de posiciones
    if (!filas.length) {
      $('standings').innerHTML = `<p class="empty">Todavía no se jugó nada en ${esc(nombreTemp)}.<br>Las cartas están frías, la mesa está vacía y el pez todavía no sabe que es el pez. 🐟</p>`;
    } else {
      $('standings').innerHTML = `
        <div class="table-scroll">
          <table class="standings-table">
            <thead><tr><th>#</th><th>Jugador</th><th title="Partidos jugados">PJ</th><th title="Partidos ganados">G</th><th>Total</th><th>Mejor</th><th>Peor</th></tr></thead>
            <tbody>${filas.map((f, i) => `
              <tr>
                <td class="pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === filas.length - 1 && f.total < -0.005 ? '🐟' : i + 1}</td>
                <td class="name">${esc(f.nombre)}</td>
                <td>${f.pj}</td>
                <td>${f.ganados}</td>
                <td class="${balanceClass(f.total)}">${fmtSigned(f.total)}</td>
                <td class="${balanceClass(f.mejor)}">${fmtSigned(f.mejor)}</td>
                <td class="${balanceClass(f.peor)}">${fmtSigned(f.peor)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Partidos
    if (!partidos.length) {
      $('matches').innerHTML = '<p class="empty">Sin partidos. Andá a la pestaña <strong>Mesa</strong> y hacé historia.</p>';
    } else {
      $('matches').innerHTML = partidos.map(p => {
        const js = [...p.jugadores].sort((a, b) => b.resultado - a.resultado);
        const ganador = js[0];
        const pozo = js.reduce((s, j) => s + (j.invertido || 0), 0);
        return `
          <details class="match">
            <summary>
              <div class="match-main">
                <span class="match-date">${esc(fechaLinda(p.fecha))}</span>
                ${p.nota ? `<span class="match-note">${esc(p.nota)}</span>` : ''}
                ${p._pendiente ? '<span class="pending-tag">sin guardar</span>' : ''}
              </div>
              <div class="match-winner">👑 ${esc(ganador.nombre)} <span class="${balanceClass(ganador.resultado)}">${fmtSigned(ganador.resultado)}</span></div>
            </summary>
            <div class="match-body">
              <div class="match-info">
                ${seleccionada === HISTORICO ? `<span class="info-chip">Temp. <strong>${esc(temporadaDe(p))}</strong></span>` : ''}
                <span class="info-chip">${js.length} jugadores</span>
                ${pozo ? `<span class="info-chip">Pozo <strong>${fmt(pozo)}</strong></span>` : ''}
                ${p.tasa ? `<span class="info-chip">Tasa <strong>${fmt(p.tasa)}/pto</strong></span>` : ''}
              </div>
              ${js.map(j => `
                <div class="match-row">
                  <span>${esc(j.nombre)}</span>
                  <span class="${balanceClass(j.resultado)}">${fmtSigned(j.resultado)}</span>
                </div>`).join('')}
            </div>
          </details>`;
      }).join('');
    }
  }

  cargar();
  return { agregarPendiente, exportarJSON, temporadaDe };
})();
