'use strict';

// Liga y temporadas. Los partidos guardados viven en liga.json (en el repo);
// los que se anotan desde la mesa quedan solo en memoria hasta que se suben.
// "resumenes" son totales historicos por temporada sin detalle partido a partido.
const Liga = (() => {
  const HISTORICO = 'historico';
  const ORDENES = {
    total: { label: '💰 Total', fn: f => f.total },
    promedio: { label: '📊 Promedio', fn: f => f.total / f.pj },
    pct: { label: '🎯 % ganadas', fn: f => f.ganados / f.pj },
  };
  let nombreLiga = 'Liga PokerPro';
  let guardados = [];
  let resumenes = [];
  let pendientes = [];
  let seleccionada = null;
  let orden = 'total';
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
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

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
      resumenes = (data.resumenes || []).filter(r => r && r.temporada && Array.isArray(r.jugadores));
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
    const data = { nombre: nombreLiga, ...(resumenes.length ? { resumenes } : {}), partidos };
    return JSON.stringify(data, null, 2) + '\n';
  }

  // ── Estadisticas ─────────────────────────────────────────────────────────

  function partidosDe(temp) {
    const lista = temp === HISTORICO ? todos() : todos().filter(p => temporadaDe(p) === temp);
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  function resumenesDe(temp) {
    return temp === HISTORICO ? resumenes : resumenes.filter(r => r.temporada === temp);
  }

  const cantidadPartidos = (partidos, res) => partidos.length + res.reduce((s, r) => s + (r.partidos || 0), 0);

  function tabla(partidos, res) {
    const map = new Map();
    const fila = nombre => {
      const k = clave(nombre);
      if (!map.has(k)) map.set(k, { nombre: nombre.trim(), pj: 0, ganados: 0, total: 0, mejor: null, peor: null });
      return map.get(k);
    };
    for (const partido of partidos) {
      for (const j of partido.jugadores) {
        const s = fila(j.nombre);
        s.pj++;
        if (j.resultado > 0.005) s.ganados++;
        s.total += j.resultado;
        s.mejor = s.mejor === null ? j.resultado : Math.max(s.mejor, j.resultado);
        s.peor = s.peor === null ? j.resultado : Math.min(s.peor, j.resultado);
      }
    }
    for (const r of res) {
      for (const j of r.jugadores) {
        const s = fila(j.nombre);
        s.pj += j.pj || 0;
        s.ganados += j.ganados || 0;
        s.total += j.total || 0;
      }
    }
    const fn = ORDENES[orden].fn;
    return [...map.values()]
      .filter(f => f.pj > 0)
      .sort((a, b) => fn(b) - fn(a) || b.pj - a.pj || b.total - a.total);
  }

  function premios(partidos, res, filas) {
    if (!filas.length) return [];
    const out = [];
    const add = (icon, titulo, quien, detalle) => out.push({ icon, titulo, quien, detalle });
    const pct = f => f.ganados / f.pj;
    const prom = f => f.total / f.pj;
    const pctTxt = f => `${f.ganados}/${f.pj} (${Math.round(100 * pct(f))}%)`;
    // El primero segun fn (mayor), desempatando por mas partidos jugados
    const top = (lista, fn) => lista.length ? [...lista].sort((a, b) => fn(b) - fn(a) || b.pj - a.pj)[0] : null;

    // Para los premios de promedio y % hace falta un minimo de partidos,
    // asi no gana el que vino una sola vez
    const minPj = Math.max(3, Math.ceil(Math.max(...filas.map(f => f.pj)) / 3));
    const regulares = filas.filter(f => f.pj >= minPj);

    // ── Plata
    const lobo = top(filas, f => f.total);
    if (lobo.total > 0.005) add('👑', 'El Lobo', lobo.nombre, `${fmtSigned(lobo.total)} en total`);

    const sponsor = top(filas, f => -f.total);
    if (sponsor.total < -0.005) add('🐟', 'Sponsor oficial', sponsor.nombre, `${fmtSigned(sponsor.total)}. Gracias, crack`);

    const rey = top(regulares, prom);
    if (rey && prom(rey) > 0.005) add('📈', 'Rey del promedio', rey.nombre, `${fmtSigned(prom(rey))} por partido`);

    const agujero = top(regulares, f => -prom(f));
    if (agujero && prom(agujero) < -0.005) add('🕳️', 'Agujero negro', agujero.nombre, `${fmtSigned(prom(agujero))} por partido`);

    const suiza = top(regulares, f => -Math.abs(f.total));
    if (suiza) add('🇨🇭', 'Suiza', suiza.nombre, `${fmtSigned(suiza.total)} en ${plural(suiza.pj, 'partido', 'partidos')}. Neutral como nadie`);

    // ── Porcentaje
    const fino = top(regulares, pct);
    if (fino) add('🎯', 'Francotirador', fino.nombre, `ganó ${pctTxt(fino)}`);

    const frio = top(regulares, f => -pct(f));
    if (frio && frio !== fino) add('🧊', 'Pecho frío', frio.nombre, `ganó ${pctTxt(frio)}`);

    const tiburon = top(regulares.filter(f => f.total > 0.005 && pct(f) < 0.5), f => -pct(f));
    if (tiburon) add('🦈', 'Pocas pero buenas', tiburon.nombre, `ganó ${pctTxt(tiburon)} y igual ${fmtSigned(tiburon.total)}`);

    const chiquito = top(regulares.filter(f => f.total < -0.005 && pct(f) >= 0.4), pct);
    if (chiquito) add('🤡', 'Gana chiquito, pierde grande', chiquito.nombre, `ganó ${pctTxt(chiquito)} y aun así ${fmtSigned(chiquito.total)}`);

    const sequia = top(filas.filter(f => f.ganados === 0 && f.pj >= 2), f => f.pj);
    if (sequia) add('🏜️', 'Sequía', sequia.nombre, `0 de ${sequia.pj}. Ni una, hermano`);

    // ── Asistencia
    const presente = top(filas, f => f.pj);
    add('🪑', 'No falta nunca', presente.nombre, plural(presente.pj, 'partido', 'partidos'));

    const principiante = top(filas.filter(f => f.pj === 1 && f.ganados === 1), f => f.total);
    if (principiante) add('🍀', 'Suerte de principiante', principiante.nombre, `vino una vez, ganó ${fmtSigned(principiante.total)} y no se lo vio más`);

    const turista = top(filas.filter(f => f.pj === 1 && f.total < -0.005), f => -f.total);
    if (turista) add('🧳', 'Turista', turista.nombre, `vino una vez, dejó ${fmt(turista.total)} y se volvió a su país`);

    // ── Noche a noche (solo con partidos cargados con detalle)
    let mejorNoche = null, peorNoche = null;
    for (const p of partidos) for (const j of p.jugadores) {
      if (!mejorNoche || j.resultado > mejorNoche.resultado) mejorNoche = { ...j, fecha: p.fecha };
      if (!peorNoche || j.resultado < peorNoche.resultado) peorNoche = { ...j, fecha: p.fecha };
    }
    if (mejorNoche && mejorNoche.resultado > 0.005) add('🔥', 'Noche soñada', mejorNoche.nombre, `${fmtSigned(mejorNoche.resultado)} el ${fechaCorta(mejorNoche.fecha)}`);
    if (peorNoche && peorNoche.resultado < -0.005) add('⛈️', 'Noche para el olvido', peorNoche.nombre, `${fmtSigned(peorNoche.resultado)} el ${fechaCorta(peorNoche.fecha)}`);

    // Racha: partidos ganados seguidos de los que jugo, en orden de fecha
    const rachas = new Map();
    for (const p of [...partidos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      for (const j of p.jugadores) {
        const r = rachas.get(clave(j.nombre)) || { nombre: j.nombre.trim(), actual: 0, max: 0 };
        r.actual = j.resultado > 0.005 ? r.actual + 1 : 0;
        r.max = Math.max(r.max, r.actual);
        rachas.set(clave(j.nombre), r);
      }
    }
    const racha = [...rachas.values()].sort((a, b) => b.max - a.max)[0];
    if (racha && racha.max >= 2) add('🚀', 'Racha imparable', racha.nombre, `${racha.max} partidos ganados seguidos`);

    // Recompras: puso mas que el que menos puso en esa mesa
    const recompras = new Map();
    for (const p of partidos) {
      const base = Math.min(...p.jugadores.map(j => j.invertido || 0));
      for (const j of p.jugadores) {
        if ((j.invertido || 0) > base + 0.005) {
          const k = clave(j.nombre);
          recompras.set(k, { nombre: j.nombre.trim(), n: (recompras.get(k)?.n || 0) + 1 });
        }
      }
    }
    const recompra = [...recompras.values()].sort((a, b) => b.n - a.n)[0];
    if (recompra) add('🔁', 'Cliente frecuente', recompra.nombre, `${plural(recompra.n, 'recompra', 'recompras')}. "Esta vez sí"`);

    const pozo = partidos.reduce((s, p) => s + p.jugadores.reduce((t, j) => t + (j.invertido || 0), 0), 0);
    if (pozo > 0) add('💸', 'Plata que giró', fmt(pozo), `en ${plural(partidos.length, 'partido', 'partidos')}`);
    return out;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function temporadasDisponibles() {
    const set = new Set([...todos().map(temporadaDe), ...resumenes.map(r => r.temporada)]);
    set.add(temporadaActual());
    return [...set].sort().reverse();
  }

  const tieneDatos = temp => partidosDe(temp).length > 0 || resumenesDe(temp).length > 0;

  function render() {
    const temps = temporadasDisponibles();
    if (!seleccionada || (seleccionada !== HISTORICO && !temps.includes(seleccionada))) {
      // Arranca en la temporada actual, o en la ultima con datos si la actual esta vacia
      seleccionada = tieneDatos(temporadaActual()) ? temporadaActual() : temps.find(tieneDatos) || temporadaActual();
    }

    $('season-chips').innerHTML = [...temps.map(t => [t, `Temp. ${t}`]), [HISTORICO, '📜 Histórico']]
      .map(([id, label]) => `<button class="season-chip${id === seleccionada ? ' active' : ''}" data-temp="${esc(id)}">${esc(label)}</button>`)
      .join('');
    $('season-chips').querySelectorAll('.season-chip').forEach(b =>
      b.addEventListener('click', () => { seleccionada = b.dataset.temp; render(); }));

    const badge = $('liga-badge');
    badge.textContent = pendientes.length;
    badge.classList.toggle('hidden', !pendientes.length);

    const partidos = partidosDe(seleccionada);
    const res = resumenesDe(seleccionada);
    const filas = tabla(partidos, res);
    const nombreTemp = seleccionada === HISTORICO ? 'todas las temporadas' : `la temporada ${seleccionada}`;

    let status = `<p class="hint">${plural(cantidadPartidos(partidos, res), 'partido', 'partidos')} en ${esc(nombreTemp)}.</p>`;
    if (estado === 'cargando') status = '<p class="hint">Barajando la historia...</p>';
    if (estado === 'error') status = '<p class="hint warn">No pude leer <code>liga.json</code>. Mostrando solo lo de esta sesión.</p>';
    if (pendientes.length) status += `<p class="hint warn">⚠️ ${plural(pendientes.length, 'partido sin guardar', 'partidos sin guardar')}. Subí el <code>liga.json</code> o se pierden al recargar.</p>`;
    $('league-status').innerHTML = status;

    // Premios
    const ps = premios(partidos, res, filas);
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
    const signed = n => n === null ? '<span class="balance-zero">—</span>' : `<span class="${balanceClass(n)}">${fmtSigned(n)}</span>`;
    if (!filas.length) {
      $('standings').innerHTML = `<p class="empty">Todavía no se jugó nada en ${esc(nombreTemp)}.<br>Las cartas están frías, la mesa está vacía y el pez todavía no sabe que es el pez. 🐟</p>`;
    } else {
      const sortChips = Object.entries(ORDENES)
        .map(([id, o]) => `<button class="season-chip small${id === orden ? ' active' : ''}" data-orden="${id}">${o.label}</button>`)
        .join('');
      $('standings').innerHTML = `
        <div class="season-chips sort-chips">${sortChips}</div>
        <div class="table-scroll">
          <table class="standings-table">
            <thead><tr><th>#</th><th>Jugador</th><th title="Partidos jugados">PJ</th><th title="Partidos ganados">G</th><th>%</th><th>Total</th><th>Prom.</th><th>Mejor</th><th>Peor</th></tr></thead>
            <tbody>${filas.map((f, i) => {
              const pct = Math.round(100 * f.ganados / f.pj);
              const sortCls = col => col === orden ? ' sorted' : '';
              return `
              <tr>
                <td class="pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === filas.length - 1 && f.total < -0.005 ? '🐟' : i + 1}</td>
                <td class="name">${esc(f.nombre)}</td>
                <td>${f.pj}</td>
                <td>${f.ganados}</td>
                <td class="${pct > 50 ? 'balance-pos' : pct < 50 ? 'balance-neg' : 'balance-zero'}${sortCls('pct')}">${pct}%</td>
                <td class="${sortCls('total')}">${signed(f.total)}</td>
                <td class="${sortCls('promedio')}">${signed(f.total / f.pj)}</td>
                <td>${signed(f.mejor)}</td>
                <td>${signed(f.peor)}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>`;
      $('standings').querySelectorAll('[data-orden]').forEach(b =>
        b.addEventListener('click', () => { orden = b.dataset.orden; render(); }));
    }

    // Partidos
    const resumenCards = res.map(r => `
      <div class="match resumen">
        <div class="match-summary">
          <div class="match-main">
            <span class="match-date">📼 Temporada ${esc(r.temporada)}: ${plural(r.partidos || 0, 'partido', 'partidos')} históricos</span>
          </div>
          <div class="match-note">${esc(r.nota || 'Solo totales, sin detalle partido a partido.')}</div>
        </div>
      </div>`).join('');

    if (!partidos.length && !res.length) {
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
      }).join('') + resumenCards;
    }
  }

  cargar();
  return { agregarPendiente, exportarJSON, temporadaDe };
})();
