/* ============================================================
   TopTravel — comparador con redirección
   No hay precios inventados: cada búsqueda abre la web del
   proveedor con los datos ya rellenados.
   ============================================================ */

/* Edades que se envían al proveedor (se pueden corregir en su web). */
const CHILD_AGE = 8;
const INFANT_AGE = 1;

const PLACES = [
  ['MAD', 'Madrid', 'España', 'Barajas'],
  ['BCN', 'Barcelona', 'España', 'El Prat'],
  ['AGP', 'Málaga', 'España', 'Costa del Sol'],
  ['SVQ', 'Sevilla', 'España', 'San Pablo'],
  ['VLC', 'Valencia', 'España', 'Manises'],
  ['BIO', 'Bilbao', 'España', 'Loiu'],
  ['PMI', 'Palma de Mallorca', 'España', 'Son Sant Joan'],
  ['IBZ', 'Ibiza', 'España', 'Es Codolar'],
  ['TFS', 'Tenerife', 'España', 'Tenerife Sur'],
  ['LPA', 'Gran Canaria', 'España', 'Gando'],
  ['LIS', 'Lisboa', 'Portugal', 'Humberto Delgado'],
  ['OPO', 'Oporto', 'Portugal', 'Francisco Sá Carneiro'],
  ['CDG', 'París', 'Francia', 'Charles de Gaulle'],
  ['LHR', 'Londres', 'Reino Unido', 'Heathrow'],
  ['DUB', 'Dublín', 'Irlanda', 'Dublín'],
  ['FCO', 'Roma', 'Italia', 'Fiumicino'],
  ['MXP', 'Milán', 'Italia', 'Malpensa'],
  ['AMS', 'Ámsterdam', 'Países Bajos', 'Schiphol'],
  ['BRU', 'Bruselas', 'Bélgica', 'Zaventem'],
  ['BER', 'Berlín', 'Alemania', 'Brandeburgo'],
  ['MUC', 'Múnich', 'Alemania', 'Franz Josef Strauss'],
  ['VIE', 'Viena', 'Austria', 'Schwechat'],
  ['PRG', 'Praga', 'República Checa', 'Václav Havel'],
  ['ATH', 'Atenas', 'Grecia', 'Eleftherios Venizelos'],
  ['IST', 'Estambul', 'Turquía', 'Estambul'],
  ['JFK', 'Nueva York', 'Estados Unidos', 'John F. Kennedy'],
  ['MIA', 'Miami', 'Estados Unidos', 'Miami'],
  ['CUN', 'Cancún', 'México', 'Cancún'],
  ['MEX', 'Ciudad de México', 'México', 'Benito Juárez'],
  ['BOG', 'Bogotá', 'Colombia', 'El Dorado'],
  ['EZE', 'Buenos Aires', 'Argentina', 'Ezeiza'],
  ['DXB', 'Dubái', 'Emiratos Árabes Unidos', 'Dubái'],
  ['BKK', 'Bangkok', 'Tailandia', 'Suvarnabhumi'],
  ['NRT', 'Tokio', 'Japón', 'Narita'],
].map(([code, city, country, airport]) => ({ code, city, country, airport }));

const IDEAS = ['CDG', 'FCO', 'LIS', 'LHR', 'JFK', 'NRT', 'CUN', 'AMS'];
// Subirlo al cambiar las fotos: así el navegador no enseña las antiguas.
const PHOTOS_VERSION = 2;
const PHOTOS = {
  CDG: 'paris',
  FCO: 'roma',
  LIS: 'lisboa',
  LHR: 'londres',
  JFK: 'nuevayork',
  NRT: 'tokio',
  CUN: 'cancun',
  AMS: 'amsterdam',
};

const CABINS = [
  { id: 'economy', label: 'Turista' },
  { id: 'premium', label: 'Turista superior' },
  { id: 'business', label: 'Business' },
  { id: 'first', label: 'Primera' },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: sigue funcionando */ }
  },
};

const state = {
  mode: 'flights',
  origin: null,
  dest: null,
  start: null,
  end: null,
  calField: 'start',
  calMonth: null,
  pax: { adults: 1, children: 0, infants: 0, rooms: 1, cabin: 'economy' },
  prices: {},
  favs: store.get('tt.favs', []),
  recent: store.get('tt.recent', []),
};

const isOneWay = () => state.mode === 'flights' && $('tripType').value === 'oneway';

/* ---------- Fechas (siempre en hora local) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => toIso(new Date());
// Se busca hasta unos 8 meses vista: hasta el final del octavo mes a partir del actual.
const MONTHS_AHEAD = 8;
const maxIso = () => { const d = new Date(); return toIso(new Date(d.getFullYear(), d.getMonth() + MONTHS_AHEAD + 1, 0)); };
const fmtDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const showDate = (s) => fmtDay.format(fromIso(s));
const nights = () => Math.round((fromIso(state.end) - fromIso(state.start)) / 864e5);

/* ---------- Enlaces a proveedores ---------- */
function childAges(pax) {
  return [...Array(pax.children).fill(CHILD_AGE), ...Array(pax.infants).fill(INFANT_AGE)];
}

function linkBooking(s) {
  const q = new URLSearchParams({
    ss: s.dest.country ? `${s.dest.city}, ${s.dest.country}` : s.dest.city,
    checkin: s.start,
    checkout: s.end,
    group_adults: s.pax.adults,
    group_children: s.pax.children + s.pax.infants,
    no_rooms: s.pax.rooms,
    lang: 'es',
    selected_currency: 'EUR',
  });
  childAges(s.pax).forEach((age) => q.append('age', age));
  return `https://www.booking.com/searchresults.es.html?${q}`;
}

/* ---------- Destinos y sugerencias ---------- */
function searchPlaces(text) {
  const t = norm(text);
  if (!t) return [];
  const score = (p) => {
    if (norm(p.code) === t) return 0;
    if (norm(p.city).startsWith(t)) return 1;
    if (norm(p.country).startsWith(t) || norm(p.airport).startsWith(t)) return 2;
    return [p.city, p.country, p.code, p.airport].some((v) => norm(v).includes(t)) ? 3 : null;
  };
  return PLACES
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.p);
}

const customCode = (text) => ({ code: text.trim().toUpperCase(), city: text.trim().toUpperCase(), country: '', airport: '' });
const isCode = (text) => /^[a-z]{3}$/i.test(text.trim());

function placeLabel(p) {
  if (!p) return '';
  if (state.mode === 'stays') return p.city;
  return p.city === p.code ? p.code : `${p.city} (${p.code})`;
}

function setupCombo(key, input, list, seg) {
  let items = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const paint = () => {
    [...list.querySelectorAll('[role=option]')].forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === active));
      if (i === active) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const open = () => {
    const text = input.value;
    const typed = norm(text) !== '' && norm(text) !== norm(placeLabel(state[key]));
    items = typed ? searchPlaces(text) : PLACES.slice(0, 6);
    if (typed && !items.length && state.mode === 'flights' && isCode(text)) items = [customCode(text)];
    active = -1;

    let html = typed ? '' : '<li class="sug__head" role="presentation">Populares</li>';
    html += items.map((p, i) => `
      <li id="${key}-opt-${i}" role="option" aria-selected="false" data-i="${i}">
        <span class="sug__ic"><svg class="ic" aria-hidden="true"><use href="#${state.mode === 'stays' ? 'i-bed' : 'i-plane'}"/></svg></span>
        <span><span class="sug__t">${esc(p.city)}</span><span class="sug__s">${esc(p.country ? `${p.airport ? `${p.airport} · ` : ''}${p.country}` : 'Código de aeropuerto')}</span></span>
        ${state.mode === 'flights' ? `<span class="sug__code">${esc(p.code)}</span>` : ''}
      </li>`).join('');
    if (!items.length) {
      html = state.mode === 'stays'
        ? `<li class="sug__empty" role="presentation">Se buscará «${esc(text)}» tal como está escrito.</li>`
        : '<li class="sug__empty" role="presentation">Sin resultados. También se puede escribir el código de 3 letras del aeropuerto.</li>';
    }
    list.innerHTML = html;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const pick = (p) => {
    state[key] = p;
    input.value = placeLabel(p);
    seg.classList.remove('is-invalid');
    hideError();
    close();
    if (key === 'origin') loadExplore();
    // Lleva al siguiente paso para no tener que pulsar cada campo.
    if (key === 'origin' && !state.dest) {
      $('dest').focus();
    } else if (!state.start) {
      input.blur();
      openCal('start');
    }
  };

  input.addEventListener('focus', () => { closePops(); open(); });
  input.addEventListener('input', () => { state[key] = null; open(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      if (!items.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter' && !list.hidden && items.length && (active >= 0 || !state[key])) {
      // Sin elegir con las flechas, vale la primera sugerencia.
      e.preventDefault();
      pick(items[Math.max(active, 0)]);
    }
  });
  // mousedown evita que el campo pierda el foco antes de elegir.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[role=option]');
    if (li) pick(items[Number(li.dataset.i)]);
  });
}

/* Convierte lo escrito en un destino válido al pulsar Buscar. */
function resolvePlace(key, input) {
  if (state[key]) return state[key];
  const text = input.value.trim();
  if (!text) return null;
  if (state.mode === 'stays') {
    const exact = PLACES.find((p) => norm(p.city) === norm(text));
    return exact || { city: text, country: '', code: '', airport: '' };
  }
  const found = searchPlaces(text);
  const exact = found.find((p) => norm(p.city) === norm(text) || norm(p.code) === norm(text));
  if (exact) return exact;
  if (found.length === 1) return found[0];
  if (!found.length && isCode(text)) return customCode(text);
  // Varias coincidencias: solo se acepta si una empieza por lo escrito y es la única.
  const starts = found.filter((p) => norm(p.city).startsWith(norm(text)));
  if (starts.length === 1) return starts[0];
  return null;
}

/* ---------- Precios por día ---------- */
const money = (n) => `${Math.round(n)} €`;

/* El calendario muestra el precio del tramo que se está eligiendo. */
function calRoute() {
  if (state.mode !== 'flights' || !state.origin || !state.dest) return null;
  const back = !isOneWay() && state.calField === 'end' && state.start;
  return back
    ? { from: state.dest, to: state.origin, back: true }
    : { from: state.origin, to: state.dest, back: false };
}

function priceKey(route, month) {
  return [route.from.code, route.to.code, month, $('optDirect').checked ? 1 : 0].join('|');
}

function loadMonth(route, month) {
  const key = priceKey(route, month);
  if (state.prices[key]) return;
  state.prices[key] = { status: 'loading', days: {} };
  const q = new URLSearchParams({ origin: route.from.code, dest: route.to.code, month, direct: $('optDirect').checked ? 1 : 0 });
  fetch(`/api/calendar?${q}`)
    .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      state.prices[key] = ok ? { status: 'ok', days: body.days || {} } : { status: 'off', days: {} };
    })
    .catch(() => { state.prices[key] = { status: 'off', days: {} }; })
    .finally(() => { if (!$('calPop').hidden) renderCal(); });
}

function priceNote(route, months) {
  if (state.mode !== 'flights') return '';
  if (!route) return 'Hay que elegir origen y destino para ver el precio de cada día.';
  const entries = months.map((m) => state.prices[priceKey(route, m)]).filter(Boolean);
  if (entries.some((e) => e.status === 'loading')) return 'Buscando precios…';
  if (entries.some((e) => e.status === 'off')) return 'Los precios por día no están disponibles ahora mismo.';
  const leg = `${route.from.city} → ${route.to.city}`;
  if (!entries.some((e) => Object.keys(e.days).length)) return `No hay precios recientes para ${leg} en estos meses.`;
  return `${leg}: precio orientativo por adulto, solo este tramo, encontrado recientemente. El definitivo se confirma en la web de venta.`;
}

/* ---------- Calendario ---------- */
function monthHtml(first, route) {
  const month = toIso(first).slice(0, 7);
  const days = route ? (state.prices[priceKey(route, month)]?.days || {}) : {};
  const lowest = Object.keys(days).length ? Math.min(...Object.values(days)) : null;
  const today = todayIso();
  const max = maxIso();
  const hasRange = state.start && state.end && state.start !== state.end;
  const blanks = (first.getDay() + 6) % 7;
  const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal__dow">${d}</span>`).join('');
  cells += '<span></span>'.repeat(blanks);
  for (let day = 1; day <= total; day += 1) {
    const iso = toIso(new Date(first.getFullYear(), first.getMonth(), day));
    const cls = ['day'];
    if (iso === today) cls.push('is-today');
    if (iso === state.start) cls.push('is-start');
    if (iso === state.end) cls.push('is-end');
    if (hasRange && (iso === state.start || iso === state.end)) cls.push('has-range');
    if (hasRange && iso > state.start && iso < state.end) cls.push('is-range');
    const off = iso < today || iso > max;
    const price = off ? undefined : days[iso];
    if (price !== undefined && price === lowest) cls.push('low');
    const label = price !== undefined ? `${showDate(iso)}, desde ${money(price)}` : showDate(iso);
    cells += `<button type="button" class="${cls.join(' ')}" data-d="${iso}" aria-label="${esc(label)}"${off ? ' disabled' : ''}>${day}${price !== undefined ? `<small>${esc(money(price))}</small>` : ''}</button>`;
  }
  return `<div class="cal__month"><h3>${esc(fmtMonth.format(first))}</h3><div class="cal__grid">${cells}</div></div>`;
}

function calHint() {
  if (!state.start) return state.mode === 'stays' ? 'Falta la fecha de llegada' : 'Falta la fecha de ida';
  if (isOneWay()) return showDate(state.start);
  if (!state.end) return state.mode === 'stays' ? 'Falta la fecha de salida' : 'Falta la fecha de vuelta';
  return `${showDate(state.start)} – ${showDate(state.end)}`;
}

function renderCal() {
  const pop = $('calPop');
  const m = state.calMonth;
  const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  const now = new Date();
  const atStart = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
  const atEnd = toIso(new Date(m.getFullYear(), m.getMonth() + 2, 1)) > maxIso();
  const route = calRoute();
  const months = [toIso(m).slice(0, 7), toIso(next).slice(0, 7)];
  if (route) months.forEach((month) => loadMonth(route, month));
  const note = priceNote(route, months);
  pop.innerHTML = `
    <div class="cal__nav">
      <button type="button" data-nav="-1" aria-label="Mes anterior"${atStart ? ' disabled' : ''}><svg class="ic" aria-hidden="true"><use href="#i-left"/></svg></button>
      <button type="button" data-nav="1" aria-label="Mes siguiente"${atEnd ? ' disabled' : ''}><svg class="ic" aria-hidden="true"><use href="#i-right"/></svg></button>
    </div>
    <div class="cal__months">${monthHtml(m, route)}${monthHtml(next, route)}</div>
    ${note ? `<p class="cal__note">${esc(note)}</p>` : ''}
    <p class="cal__note">Se puede buscar hasta ${esc(fmtMonth.format(fromIso(maxIso())))}, unos 8 meses vista.</p>
    <div class="cal__foot">
      <span class="cal__hint">${esc(calHint())}</span>
      <span>
        <button type="button" class="linkbtn" data-clear>Borrar</button>
        <button type="button" class="btn" data-done>Listo</button>
      </span>
    </div>`;
}

function pickDay(iso) {
  if (isOneWay()) {
    state.start = iso;
    state.end = null;
    renderDates();
    closePops();
    return;
  }
  const wantsEnd = state.calField === 'end' || (state.start && !state.end);
  const minNights = state.mode === 'stays' ? 1 : 0;
  const validEnd = state.start && (fromIso(iso) - fromIso(state.start)) / 864e5 >= minNights;
  if (wantsEnd && validEnd) {
    state.end = iso;
    state.calField = 'start';
    renderDates();
    closePops();
    return;
  }
  if (wantsEnd && state.start && iso === state.start) return; // alojamiento: mínimo una noche
  state.start = iso;
  state.end = null;
  state.calField = 'end';
  renderDates();
  renderCal();
}

function renderDates() {
  const setVal = (el, iso) => {
    el.textContent = iso ? showDate(iso) : 'Añadir fecha';
    el.classList.toggle('is-set', Boolean(iso));
  };
  setVal($('startVal'), state.start);
  setVal($('endVal'), state.end);
  if (state.start) $('segStart').classList.remove('is-invalid');
  if (state.end) $('segEnd').classList.remove('is-invalid');
  const oneWay = isOneWay();
  $('segEnd').disabled = oneWay;
  $('segEnd').classList.toggle('is-disabled', oneWay);
  if (oneWay) $('endVal').textContent = 'Solo ida';
}

/* ---------- Viajeros ---------- */
const paxTotal = () => state.pax.adults + state.pax.children + state.pax.infants;

function paxRules() {
  const p = state.pax;
  const flights = state.mode === 'flights';
  const roomLeft = !flights || paxTotal() < 9;
  return {
    adults: { min: 1, canAdd: flights ? roomLeft : p.adults < 30 },
    children: { min: 0, canAdd: flights ? roomLeft : p.children < 10 },
    infants: { min: 0, canAdd: p.infants < p.adults && (flights ? roomLeft : true) },
    rooms: { min: 1, canAdd: p.rooms < 30 && p.rooms < p.adults },
  };
}

function renderPax() {
  const flights = state.mode === 'flights';
  const rules = paxRules();
  const rows = [
    ['adults', 'Adultos', '12 años o más'],
    ['children', 'Niños', '2 a 11 años'],
    ['infants', 'Bebés', 'Menos de 2 años'],
  ];
  rows.push(['rooms', 'Habitaciones', '']);
  const rowHtml = rows.map(([k, label, sub]) => `
    <div class="row">
      <div><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div>
      <div class="step">
        <button type="button" data-k="${k}" data-step="-1" aria-label="Quitar: ${label}"${state.pax[k] <= rules[k].min ? ' disabled' : ''}>−</button>
        <output>${state.pax[k]}</output>
        <button type="button" data-k="${k}" data-step="1" aria-label="Añadir: ${label}"${rules[k].canAdd ? '' : ' disabled'}>+</button>
      </div>
    </div>`).join('');
  const cabin = flights ? `
    <div class="pax__cabin">
      <label for="cabinSel">Cabina</label>
      <select id="cabinSel">${CABINS.map((c) => `<option value="${c.id}"${c.id === state.pax.cabin ? ' selected' : ''}>${c.label}</option>`).join('')}</select>
    </div>` : '';
  $('paxPop').innerHTML = `${rowHtml}${cabin}
    <p class="pax__note">Al vendedor se le envían ${CHILD_AGE} años por niño y ${INFANT_AGE} año por bebé. La edad se puede corregir en su web.</p>
    <button type="button" class="btn btn--block" data-done>Listo</button>`;
}

function paxSummary() {
  const p = state.pax;
  const people = plural(p.adults, 'adulto', 'adultos')
    + (p.children ? ` · ${plural(p.children, 'niño', 'niños')}` : '')
    + (p.infants ? ` · ${plural(p.infants, 'bebé', 'bebés')}` : '');
  if (state.mode === 'flights') return `${people} · ${p.rooms} hab. · ${CABINS.find((c) => c.id === p.cabin).label}`;
  return `${people} · ${plural(p.rooms, 'habitación', 'habitaciones')}`;
}

function renderPaxVal() {
  $('paxVal').textContent = paxSummary();
  $('paxVal').classList.add('is-set');
}

/* ---------- Ventanas emergentes ---------- */
function placePop(pop, anchor) {
  const form = $('searchForm').getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  pop.style.top = `${bar.bottom - form.top + 10}px`;
  pop.style.left = `${Math.max(0, Math.min(a.left - form.left, form.width - pop.offsetWidth))}px`;
}

function closePops() {
  $('calPop').hidden = true;
  $('paxPop').hidden = true;
  ['segStart', 'segEnd', 'segPax'].forEach((id) => {
    $(id).classList.remove('is-open');
    $(id).setAttribute('aria-expanded', 'false');
  });
}

function openCal(field) {
  closePops();
  state.calField = field;
  if (state.mode === 'flights') {
    state.origin = resolvePlace('origin', $('origin'));
    state.dest = resolvePlace('dest', $('dest'));
  }
  const base = fromIso((field === 'end' && state.end) || state.start || todayIso());
  state.calMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  renderCal();
  $('calPop').hidden = false;
  const anchor = field === 'end' ? $('segEnd') : $('segStart');
  anchor.classList.add('is-open');
  anchor.setAttribute('aria-expanded', 'true');
  placePop($('calPop'), $('segStart'));
}

function openPax() {
  closePops();
  renderPax();
  $('paxPop').hidden = false;
  $('segPax').classList.add('is-open');
  $('segPax').setAttribute('aria-expanded', 'true');
  placePop($('paxPop'), $('segPax'));
}

/* ---------- Modo vuelos / alojamientos ---------- */
function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  const flights = mode === 'flights';
  $('optNoFlight').checked = !flights;
  $('destLabel').textContent = flights ? 'A' : 'Destino';
  $('dest').placeholder = flights ? 'País, ciudad o aeropuerto' : 'Ciudad, zona o alojamiento';
  $('startLabel').textContent = flights ? 'Ida' : 'Llegada';
  $('endLabel').textContent = flights ? 'Vuelta' : 'Salida';
  $('paxLabel').textContent = flights ? 'Viajeros y habitaciones' : 'Huéspedes y habitaciones';
  if (state.pax.rooms > state.pax.adults) state.pax.rooms = state.pax.adults;
  if (state.start && state.end && state.start === state.end && !flights) state.end = null;
  $('origin').value = placeLabel(state.origin);
  if (state.dest) $('dest').value = placeLabel(state.dest);
  clearInvalid();
  hideError();
  closePops();
  renderDates();
  renderPaxVal();
  renderIdeas();
  refreshMaps();
}

/* ---------- Búsqueda ---------- */
function hideError() { $('formErr').hidden = true; }
function clearInvalid() {
  ['segOrigin', 'segDest', 'segStart', 'segEnd'].forEach((id) => $(id).classList.remove('is-invalid'));
}

function fail(segId, message) {
  $(segId).classList.add('is-invalid');
  $('formErr').textContent = message;
  $('formErr').hidden = false;
}

function validate() {
  clearInvalid();
  hideError();
  const flights = state.mode === 'flights';
  if (flights) {
    state.origin = resolvePlace('origin', $('origin'));
    if (!state.origin) {
      fail('segOrigin', $('origin').value.trim() ? 'Hay que elegir el origen de la lista o escribir el código de 3 letras del aeropuerto.' : 'Falta el origen.');
      return false;
    }
    $('origin').value = placeLabel(state.origin);
  }
  state.dest = resolvePlace('dest', $('dest'));
  if (!state.dest) {
    fail('segDest', flights && $('dest').value.trim() ? 'Hay que elegir el destino de la lista o escribir el código de 3 letras del aeropuerto.' : 'Falta el destino.');
    return false;
  }
  $('dest').value = placeLabel(state.dest);
  if (flights && state.origin.code === state.dest.code) {
    fail('segDest', 'El origen y el destino no pueden ser el mismo.');
    return false;
  }
  if (!state.start) {
    fail('segStart', flights ? 'Falta la fecha de ida.' : 'Falta la fecha de llegada.');
    return false;
  }
  if (!isOneWay() && !state.end) {
    fail('segEnd', flights ? 'Falta la fecha de vuelta. También se puede cambiar a «Solo ida».' : 'Falta la fecha de salida.');
    return false;
  }
  return true;
}

function snapshot() {
  return {
    mode: state.mode,
    origin: state.mode === 'flights' ? state.origin : null,
    dest: state.dest,
    start: state.start,
    end: isOneWay() ? null : state.end,
    direct: state.mode === 'flights' && $('optDirect').checked,
    pax: { ...state.pax },
  };
}

/* ---------- Vuelos con precio ---------- */
const hhmm = (at) => (at ? at.slice(11, 16) : '');
const duration = (mins) => (mins ? `${Math.floor(mins / 60)} h ${pad(mins % 60)} min` : '');
const stopsText = (n) => (n === 0 ? 'Directo' : (n > 0 ? plural(n, 'escala', 'escalas') : ''));

function legHtml(o, at, from, to, mins, stops) {
  const hue = 15 + [...String(o.airline)].reduce((sum, c) => sum + c.charCodeAt(0) * 37, 0) % 30;
  const track = [duration(mins), stopsText(stops)].filter(Boolean).join(' · ');
  return `
    <div class="leg">
      <div class="air"><i style="background:hsl(${hue} 55% 38%)" aria-hidden="true">${esc(o.airline)}${/^[A-Z0-9]{2}$/.test(o.airline) ? `<img class="air__logo" src="logos/${o.airline}.png" alt="" loading="lazy" decoding="async" width="40" height="40">` : ''}</i><span>${esc(o.airlineName || o.airline)}</span></div>
      <div class="times">
        <div><strong>${esc(hhmm(at))}</strong><small>${esc(from)} · ${esc(at ? showDate(at.slice(0, 10)) : '')}</small></div>
        <div class="track ${stops === 0 ? 'direct' : 'stop'}">${esc(track)}</div>
        <div><strong>${esc(to)}</strong></div>
      </div>
    </div>`;
}

function offerHtml(o, cheapest) {
  const legs = legHtml(o, o.departureAt, o.origin, o.destination, o.durationTo, o.transfers)
    + (o.returnAt ? legHtml(o, o.returnAt, o.destination, o.origin, o.durationBack, o.returnTransfers) : '');
  const buy = o.url
    ? `<a class="btn" href="${esc(o.url)}" target="_blank" rel="noopener" style="text-align:center">Web de ${esc(o.airlineName || o.airline)}<span class="sr"> (se abre en una pestaña nueva)</span></a>`
    : `<small class="pcard__note">Se compra en la web de ${esc(o.airlineName || o.airline)}.</small>`;
  return `
    <article class="card flight">
      <div class="flight__legs">${legs}</div>
      <div class="flight__buy">
        ${cheapest ? '<span class="badge-low">El más barato</span>' : ''}
        <div class="price">${esc(money(o.price))}<small>por adulto, orientativo</small></div>
        ${buy}
      </div>
    </article>`;
}

function fetchDay(params) {
  return fetch(`/api/day?${new URLSearchParams(params)}`).then((r) => r.json().then((body) => {
    if (!r.ok) throw new Error(body.error || 'error');
    return body;
  }));
}

/* ---------- Filtros y orden ---------- */
const optHtml = (type, name, value, label, count, checked) => `
  <label class="opt"><input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span>${count === undefined ? '' : `<em>${count}</em>`}</label>`;

function filtersHtml(fieldsets) {
  return `
    <details class="filters"${window.innerWidth > 1100 ? ' open' : ''}>
      <summary>Filtros</summary>
      <form>
        ${fieldsets}
        <button type="reset" class="linkbtn">Quitar filtros</button>
      </form>
    </details>`;
}

const fieldsetHtml = (legend, options) => `<fieldset><legend>${esc(legend)}</legend>${options}</fieldset>`;

function sortbarHtml(options) {
  return `<div class="sortbar" role="group" aria-label="Ordenar resultados">${options.map((o, i) => `
    <button type="button" data-sort="${o.id}" class="${i === 0 ? 'is-on' : ''}" aria-pressed="${i === 0}"><b>${esc(o.label)}</b><span data-hint="${o.id}"></span></button>`).join('')}</div>`;
}

/* Conecta el panel y la barra de orden con una función de pintado. */
function wireControls(root, state, draw) {
  const form = root.querySelector('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => { state.limit = state.step; draw(); });
  form.addEventListener('reset', () => setTimeout(() => { state.limit = state.step; draw(); }));
  root.querySelector('.sortbar')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    state.sort = b.dataset.sort;
    state.limit = state.step;
    root.querySelectorAll('[data-sort]').forEach((x) => {
      x.classList.toggle('is-on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    draw();
  });
  root.querySelector('.more').addEventListener('click', () => { state.limit += state.step; draw(); });
  root.addEventListener('click', (e) => { if (e.target.closest('[data-clear-filters]')) form.reset(); });
}

const noMatchHtml = '<div class="empty"><b>Ningún resultado con estos filtros</b><button type="button" class="linkbtn" data-clear-filters>Quitar filtros</button></div>';

/* lists: un viaje completo, o ida y vuelta por separado. */
function renderFlightResults(el, lists) {
  const all = lists.flatMap((l) => l.offers);
  const stops = (o) => Math.max(o.transfers || 0, o.returnTransfers || 0);
  const mins = (o) => ((o.durationTo || 0) + (o.durationBack || 0)) || Infinity;
  const slot = (o) => {
    const h = Number(hhmm(o.departureAt).slice(0, 2));
    if (h >= 6 && h < 12) return 'morning';
    return h >= 12 && h < 20 ? 'afternoon' : 'night';
  };
  const count = (fn) => all.filter(fn).length;
  const airlines = [...new Map(all.map((o) => [o.airline, o.airlineName || o.airline])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));

  el.innerHTML = `
    <div class="layout">
      ${filtersHtml(
        fieldsetHtml('Escalas', optHtml('radio', 'f_stops', 'any', 'Cualquiera', all.length, true)
          + optHtml('radio', 'f_stops', 'direct', 'Solo directos', count((o) => stops(o) === 0))
          + optHtml('radio', 'f_stops', 'one', 'Hasta 1 escala', count((o) => stops(o) <= 1)))
        + fieldsetHtml('Salida de la ida', optHtml('radio', 'f_time', 'any', 'Cualquier hora', all.length, true)
          + optHtml('radio', 'f_time', 'morning', 'Mañana (6:00–12:00)', count((o) => slot(o) === 'morning'))
          + optHtml('radio', 'f_time', 'afternoon', 'Tarde (12:00–20:00)', count((o) => slot(o) === 'afternoon'))
          + optHtml('radio', 'f_time', 'night', 'Noche (20:00–6:00)', count((o) => slot(o) === 'night')))
        + fieldsetHtml('Aerolíneas', airlines.map(([code, name]) => optHtml('checkbox', 'f_air', code, name, count((o) => o.airline === code), true)).join('')),
      )}
      <div class="layout__main">
        ${sortbarHtml([{ id: 'price', label: 'Más barato' }, { id: 'time', label: 'Más rápido' }, { id: 'early', label: 'Sale antes' }])}
        <p class="count" data-count></p>
        <div data-results></div>
        <button type="button" class="btn btn--out btn--block more">Ver más vuelos</button>
        <p class="count">Precios encontrados recientemente. Pueden haber cambiado: el precio final se confirma en la web de la aerolínea, donde se compra.</p>
      </div>
    </div>`;

  const state = { sort: 'price', step: 10, limit: 10 };
  const sorters = {
    price: (a, b) => a.price - b.price,
    time: (a, b) => mins(a) - mins(b) || a.price - b.price,
    early: (a, b) => hhmm(a.departureAt).localeCompare(hhmm(b.departureAt)) || a.price - b.price,
  };

  const draw = () => {
    const form = el.querySelector('form');
    const stopsValue = form.elements.f_stops.value;
    const timeValue = form.elements.f_time.value;
    const chosen = new Set([...form.querySelectorAll('[name=f_air]:checked')].map((i) => i.value));
    const keep = (o) => chosen.has(o.airline)
      && (stopsValue === 'any' || (stopsValue === 'direct' ? stops(o) === 0 : stops(o) <= 1))
      && (timeValue === 'any' || slot(o) === timeValue);

    const visible = lists.map((l) => ({ ...l, cheapest: l.offers[0], rows: l.offers.filter(keep).sort(sorters[state.sort]) }));
    const rows = visible.flatMap((l) => l.rows);
    const best = (fn, sorter) => { const o = [...rows].sort(sorter)[0]; return o ? fn(o) : '—'; };
    el.querySelector('[data-hint=price]').textContent = best((o) => `desde ${money(o.price)}`, sorters.price);
    el.querySelector('[data-hint=time]').textContent = best((o) => (mins(o) === Infinity ? '—' : duration(mins(o))), sorters.time);
    el.querySelector('[data-hint=early]').textContent = best((o) => hhmm(o.departureAt), sorters.early);
    el.querySelector('[data-count]').textContent = `${rows.length} de ${all.length} vuelos`;

    el.querySelector('[data-results]').innerHTML = rows.length
      ? visible.filter((l) => l.rows.length).map((l) => `
          ${l.title ? `<h3 class="offers__leg">${esc(l.title)}</h3>` : ''}
          <div class="list">${l.rows.slice(0, state.limit).map((o) => offerHtml(o, o === l.cheapest)).join('')}</div>`).join('')
      : noMatchHtml;
    el.querySelector('.more').hidden = !visible.some((l) => l.rows.length > state.limit);
  };

  wireControls(el, state, draw);
  draw();
}

function renderHotelResults(el, hotels, s, center) {
  if (center && hasMaps()) {
    const from = L.latLng(center.lat, center.lon);
    hotels.forEach((h) => {
      if (typeof h.lat === 'number' && typeof h.lon === 'number') h.km = from.distanceTo([h.lat, h.lon]) / 1000;
    });
  }
  const kinds = [...new Set(hotels.map((h) => h.kind || 'Alojamiento'))].sort((a, b) => a.localeCompare(b, 'es'));
  const count = (fn) => hotels.filter(fn).length;

  el.innerHTML = `
    <div class="layout">
      ${filtersHtml(
        fieldsetHtml('Tipo', kinds.map((k) => optHtml('checkbox', 'h_kind', k, k, count((h) => (h.kind || 'Alojamiento') === k), true)).join(''))
        + fieldsetHtml('Estrellas', optHtml('radio', 'h_stars', '0', 'Cualquiera', hotels.length, true)
          + [3, 4, 5].map((n) => optHtml('radio', 'h_stars', n, n === 5 ? '5 estrellas' : `${n} o más`, count((h) => h.stars >= n))).join(''))
        + fieldsetHtml('Precio', optHtml('checkbox', 'h_price', '1', 'Solo con precio', count((h) => h.key))),
      )}
      <div class="layout__main">
        <div class="maptabs" role="group" aria-label="Elegir mapa">
          <button type="button" class="is-on" data-map-mode="prices" aria-pressed="true">Precios</button>
          <button type="button" data-map-mode="monuments" aria-pressed="false">Monumentos</button>
          <button type="button" data-map-mode="transit" aria-pressed="false">Transporte</button>
        </div>
        <div class="map map--city" data-map role="region" aria-label="Mapa de la ciudad"></div>
        <div class="transit-kinds" data-transit-kinds hidden>
          <label><input type="checkbox" data-kind="metro" checked> Metro</label>
          <label><input type="checkbox" data-kind="tram" checked> Tranvía</label>
          <label><input type="checkbox" data-kind="bus" checked> Autobús</label>
        </div>
        <p class="map__note" data-map-note role="status"></p>
        ${center ? `<p class="zones" aria-label="Distancia al centro">
          <span class="zones__i zones__i--near">Cerca: hasta 1 km</span>
          <span class="zones__i zones__i--mid">Media: hasta 3 km</span>
          <span class="zones__i zones__i--far">Lejos: más de 3 km</span>
        </p>` : ''}
        <p class="count" data-count></p>
        <p class="count">Precio orientativo por noche y por persona: el precio de la habitación según Xotelo, dividido entre los viajeros. Puede no incluir impuestos, por lo que el total se debe confirmar antes de reservar.</p>
        <div class="list" data-results></div>
        <button type="button" class="btn btn--out btn--block more">Ver más alojamientos</button>
        <p class="legal">Datos de alojamientos: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>. Precios: <a href="https://xotelo.com" target="_blank" rel="noopener">Xotelo</a>.</p>
      </div>
    </div>`;

  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  const order = (a, b) => Boolean(b.key) - Boolean(a.key) || b.stars - a.stars || byName(a, b);
  const state = { step: HOTELS_STEP, limit: HOTELS_STEP };

  const draw = () => {
    const form = el.querySelector('form');
    const chosen = new Set([...form.querySelectorAll('[name=h_kind]:checked')].map((i) => i.value));
    const minStars = Number(form.elements.h_stars.value);
    const needsPrice = form.elements.h_price.checked;
    const rows = hotels
      .filter((h) => chosen.has(h.kind || 'Alojamiento') && h.stars >= minStars && (!needsPrice || h.key))
      .sort(order);
    el.querySelector('[data-count]').textContent = `${rows.length} de ${hotels.length} alojamientos`;
    el.querySelector('[data-results]').innerHTML = rows.length
      ? rows.slice(0, state.limit).map((h) => hotelHtml(h, s)).join('')
      : noMatchHtml;
    el.querySelector('.more').hidden = rows.length <= state.limit;
    drawHotelMap(el, rows, s, center, hotels);
    loadVisibleRates(el, s, rows);
  };

  wireControls(el, state, draw);
  el.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-map-mode]');
    if (tab) setMapMode(el, tab.dataset.mapMode);
    const b = e.target.closest('[data-save-stay]');
    if (!b) return;
    const hotel = hotels.find((h) => h.name === b.dataset.saveStay);
    if (hotel) toggleStay(hotel, s, b);
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-kind]')) showTransitKinds(el);
  });
  draw();
}

/* ---------- Cuentas, guardados y avisos ---------- */
const account = { user: null, unread: 0, saved: [], afterLogin: null, insights: false };

async function api(path, body) {
  const options = body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(path, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'No se ha podido completar.'), { status: r.status });
  return data;
}

function placeOut(p) {
  return { code: p.code, city: p.city, country: p.country || '', airport: p.airport || '' };
}

function tripPayload(s) {
  return { origin: placeOut(s.origin), dest: placeOut(s.dest), start: s.start, end: s.end || null, direct: Boolean(s.direct), pax: s.pax };
}

function findTrip(s) {
  return account.saved.find((x) => x.kind === 'flight'
    && x.data.origin.code === s.origin.code && x.data.dest.code === s.dest.code
    && x.data.start === s.start && (x.data.end || null) === (s.end || null) && x.data.direct === Boolean(s.direct));
}

function findStay(h, s) {
  return account.saved.find((x) => x.kind === 'stay' && x.data.name === h.name
    && x.data.dest.city === s.dest.city && x.data.start === s.start && x.data.end === s.end);
}
const stayIsSaved = (h, s) => Boolean(findStay(h, s));

function requireLogin(next) {
  if (account.user) return true;
  account.afterLogin = next;
  renderAuth('login', 'Hay que iniciar sesión para guardar y recibir avisos.');
  if (!$('dlg').open) $('dlg').showModal();
  return false;
}

function paintSaveTrip(s) {
  const b = $('saveTrip');
  if (b) b.textContent = findTrip(s) ? 'Guardado ✓' : 'Guardar y recibir avisos';
}

async function toggleTrip(s) {
  if (!requireLogin(() => toggleTrip(s))) return;
  const current = findTrip(s);
  try {
    if (current) {
      await api('/api/saved/delete', { id: current.id });
      account.saved = account.saved.filter((x) => x !== current);
      toast('Viaje quitado de guardados.');
    } else {
      const { item } = await api('/api/saved', { kind: 'flight', data: tripPayload(s) });
      account.saved.unshift(item);
      toast(item.lastPrice === null ? 'Guardado. Aún no hay precio con el que comparar.' : `Guardado. Se enviará un aviso si cambia desde ${money(item.lastPrice)}.`);
    }
    paintSaveTrip(s);
  } catch (error) {
    toast(error.message);
  }
}

function wireSaveTrip(s) {
  paintSaveTrip(s);
  $('saveTrip').addEventListener('click', () => toggleTrip(s));
}

async function toggleStay(h, s, button) {
  if (!requireLogin(() => toggleStay(h, s, button))) return;
  const current = findStay(h, s);
  try {
    if (current) {
      await api('/api/saved/delete', { id: current.id });
      account.saved = account.saved.filter((x) => x !== current);
    } else {
      const data = { name: h.name, key: h.key || '', lodging: h.kind || 'Alojamiento', stars: h.stars, address: h.address, website: h.website, dest: placeOut({ ...s.dest, code: s.dest.code || '' }), start: s.start, end: s.end, pax: s.pax };
      const { item } = await api('/api/saved', { kind: 'stay', data });
      account.saved.unshift(item);
      toast('Alojamiento guardado.');
    }
    button.textContent = findStay(h, s) ? 'Guardado ✓' : 'Guardar';
  } catch (error) {
    toast(error.message);
  }
}

function paintAccount() {
  $('accountLabel').textContent = account.user ? 'Cuenta' : 'Entrar';
  $('accountBtn').setAttribute('aria-label', account.user ? 'Cuenta' : 'Iniciar sesión');
  $('alertCount').textContent = account.unread;
  $('alertCount').hidden = !account.unread;
  paintSavedCount();
  document.querySelectorAll('[data-insights]').forEach((el) => { el.hidden = !account.insights; });
}

async function refreshAccount() {
  try {
    const me = await api('/api/me');
    account.user = me.user;
    account.unread = me.unread;
    account.insights = Boolean(me.insights);
    account.saved = me.user ? (await api('/api/saved')).saved : [];
  } catch {
    // Sin servidor de cuentas la web sigue funcionando para buscar.
  }
  paintAccount();
}

function renderAuth(mode, notice = '') {
  const login = mode === 'login';
  $('dlg').innerHTML = `
    <h3>${login ? 'Iniciar sesión' : 'Crear cuenta'}</h3>
    ${notice ? `<p class="muted">${esc(notice)}</p>` : ''}
    <form class="authform" data-auth="${login ? 'login' : 'register'}" novalidate>
      <label>Correo electrónico<input type="email" name="email" autocomplete="email" required></label>
      <label>Contraseña<input type="password" name="password" autocomplete="${login ? 'current-password' : 'new-password'}" minlength="8" required></label>
      ${login ? '' : '<p class="muted authform__note">Mínimo 8 caracteres. Crear la cuenta supone aceptar la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>. La cuenta se puede borrar en cualquier momento.</p>'}
      <p class="search__err" data-error role="alert" hidden></p>
      <button type="submit" class="btn btn--block">${login ? 'Entrar' : 'Crear cuenta'}</button>
    </form>
    <div class="dlg__actions authform__switch">
      <button type="button" class="linkbtn" data-auth-switch="${login ? 'register' : 'login'}">${login ? 'Crear una cuenta nueva' : 'Entrar con una cuenta existente'}</button>
      ${login ? '<button type="button" class="linkbtn" data-auth-recover>Contraseña olvidada</button>' : ''}
      <button type="button" class="linkbtn" data-close>Cerrar</button>
    </div>`;
}

function renderRecover() {
  $('dlg').innerHTML = `
    <h3>Recuperar la contraseña</h3>
    <p class="muted">Se necesita el código de recuperación que se mostró al crear la cuenta.</p>
    <form class="authform" data-recover novalidate>
      <label>Correo electrónico<input type="email" name="email" autocomplete="email" required></label>
      <label>Código de recuperación<input type="text" name="code" autocomplete="off" spellcheck="false" required></label>
      <label>Contraseña nueva<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
      <p class="search__err" data-error role="alert" hidden></p>
      <button type="submit" class="btn btn--block">Cambiar la contraseña</button>
    </form>
    <div class="dlg__actions authform__switch">
      <button type="button" class="linkbtn" data-auth-switch="login">Volver</button>
      <button type="button" class="linkbtn" data-close>Cerrar</button>
    </div>`;
}

function renderRecoveryCode(code, title = 'Código de recuperación: hay que guardarlo') {
  $('dlg').innerHTML = `
    <h3>${esc(title)}</h3>
    <p class="muted">Si se olvida la contraseña, este código es la única forma de recuperar la cuenta. No se volverá a mostrar.</p>
    <p class="recovery__code" data-recovery-code>${esc(code)}</p>
    <div class="dlg__actions authform__switch">
      <button type="button" class="btn btn--out" data-copy-code>Copiar</button>
      <button type="button" class="btn" data-recovery-done>Código guardado</button>
    </div>`;
}

function renderAccount() {
  $('dlg').innerHTML = `
    <h3>Cuenta</h3>
    <p class="muted">${esc(account.user.email)}</p>
    ${account.user.mailReady ? `<label class="account__mail"><input type="checkbox" data-email-alerts ${account.user.emailAlerts ? 'checked' : ''}> Avisos por correo si cambia el precio de un vuelo guardado</label>` : ''}
    <div class="dlg__actions authform__switch">
      <button type="button" class="btn btn--out" data-logout>Cerrar sesión</button>
      <button type="button" class="btn" data-close>Cerrar</button>
    </div>
    <details class="account__danger account__code">
      <summary>Crear un código de recuperación nuevo</summary>
      <form class="authform" data-new-code novalidate>
        <p class="muted authform__note">El código anterior dejará de funcionar.</p>
        <label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
        <p class="search__err" data-error role="alert" hidden></p>
        <button type="submit" class="btn btn--out btn--block">Crear código</button>
      </form>
    </details>
    <details class="account__danger">
      <summary>Borrar la cuenta</summary>
      <form class="authform" data-delete-account novalidate>
        <p class="muted authform__note">Se borrarán la cuenta, los guardados y los avisos. No se puede deshacer.</p>
        <label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
        <p class="search__err" data-error role="alert" hidden></p>
        <button type="submit" class="btn btn--out btn--block">Borrar definitivamente</button>
      </form>
    </details>`;
}

const ADVICE_MARK = { buy: 'advice--buy', wait: 'advice--wait', collect: 'advice--collect' };

function priceChart(points) {
  const W = 520, H = 150, PAD = 12;
  const prices = points.map((p) => p[1]);
  const low = Math.min(...prices), high = Math.max(...prices);
  const range = high - low || 1;
  const times = points.map((p) => fromIso(p[0]).getTime());
  const span = times[times.length - 1] - times[0] || 1;
  const x = (i) => PAD + ((times[i] - times[0]) / span) * (W - PAD * 2);
  const y = (price) => PAD + (1 - (price - low) / range) * (H - PAD * 2);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const end = points.length - 1;
  return `<svg class="pricechart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del precio, de ${esc(money(prices[0]))} a ${esc(money(prices[end]))}">
    <polygon class="pricechart__area" points="${x(0).toFixed(1)},${H} ${line} ${x(end).toFixed(1)},${H}"/>
    <polyline class="pricechart__line" points="${line}"/>
    <circle class="pricechart__now" cx="${x(end).toFixed(1)}" cy="${y(prices[end]).toFixed(1)}" r="4"/>
  </svg>
  <div class="pricechart__axis"><span>${esc(showDate(points[0][0]))}</span><span>${esc(showDate(points[end][0]))}</span></div>`;
}

function historyHtml(data) {
  if (!data.hasSource) return '<p class="muted authform__note">No hay precios disponibles para este alojamiento, así que no se puede seguir su evolución.</p>';
  const stats = data.stats;
  const signed = (n) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')} %`;
  const facts = stats ? `<ul class="pricefacts">
      <li><small>Ahora</small><b>${esc(money(stats.last))}</b></li>
      <li><small>Mínimo</small><b>${esc(money(stats.low))}</b></li>
      <li><small>Máximo</small><b>${esc(money(stats.high))}</b></li>
      <li><small>Desde que se guardó</small><b>${esc(signed(stats.totalChange))}</b></li>
    </ul>` : '';
  const chart = data.points.length > 1 ? priceChart(data.points) : '';
  const until = data.advice.until ? ` Conviene volver a mirarlo antes del ${esc(showDate(data.advice.until))}.` : '';
  const cheaper = data.cheaperDay && stats ? `<p class="muted authform__note">El día más barato del mes para la ida es el ${esc(showDate(data.cheaperDay.day))}, desde ${esc(money(data.cheaperDay.price))}.</p>` : '';
  return `${chart}${facts}
    <div class="advice ${ADVICE_MARK[data.advice.kind] || ''}"><b>${esc(data.advice.title)}</b><span>${esc(data.advice.reason)}${until}</span></div>
    ${cheaper}
    <p class="muted authform__note">Es una orientación basada en los precios vistos, no una garantía.</p>`;
}

async function toggleHistory(button) {
  const box = button.closest('li').querySelector('[data-history-box]');
  if (!box.hidden) {
    box.hidden = true;
    button.textContent = 'Evolución';
    return;
  }
  box.hidden = false;
  button.textContent = 'Ocultar';
  box.innerHTML = '<p class="muted authform__note">Cargando…</p>';
  try {
    box.innerHTML = historyHtml(await api(`/api/saved/history?id=${Number(button.dataset.history)}`));
  } catch (error) {
    box.innerHTML = `<p class="muted authform__note">${esc(error.message)}</p>`;
  }
}

function datesText(start, end) {
  return end ? `${showDate(start)} – ${showDate(end)}` : `${showDate(start)} · solo ida`;
}

function paintSavedCount() {
  const total = state.favs.length + account.saved.length;
  $('savedCount').textContent = total;
  $('savedCount').hidden = !total;
}

function renderSaved() {
  const places = state.favs.map((code) => PLACES.find((p) => p.code === code)).filter(Boolean);
  const placeRows = places.map((p) => `
    <li>
      <span>${esc(p.city)}<small>${esc(p.country)}</small></span>
      <span class="saved__acts"><button type="button" class="btn btn--out" data-pick="${p.code}">Buscar</button><button type="button" class="linkbtn" data-unfav="${p.code}">Quitar</button></span>
    </li>`).join('');
  const flights = account.saved.filter((x) => x.kind === 'flight');
  const stays = account.saved.filter((x) => x.kind === 'stay');
  const flightRows = flights.map((x) => `
    <li>
      <span>${esc(x.data.origin.city)} → ${esc(x.data.dest.city)}<small>${esc(datesText(x.data.start, x.data.end))} · ${x.lastPrice === null ? 'sin precio aún' : `último precio ${esc(money(x.lastPrice))}`}</small></span>
      <span class="saved__acts">${account.insights ? `<button type="button" class="btn btn--out" data-history="${x.id}">Evolución</button>` : ''}<button type="button" class="btn btn--out" data-open-saved="${x.id}">Ver</button><button type="button" class="linkbtn" data-remove-saved="${x.id}">Quitar</button></span>
      <div class="history" data-history-box hidden></div>
    </li>`).join('');
  const stayRows = stays.map((x) => `
    <li>
      <span>${esc(x.data.name)}<small>${esc(x.data.dest.city)} · ${esc(datesText(x.data.start, x.data.end))}</small></span>
      <span class="saved__acts">${account.insights ? `<button type="button" class="btn btn--out" data-history="${x.id}">Evolución</button>` : ''}<button type="button" class="btn btn--out" data-open-saved="${x.id}">Ver</button><button type="button" class="linkbtn" data-remove-saved="${x.id}">Quitar</button></span>
      <div class="history" data-history-box hidden></div>
    </li>`).join('');
  $('dlg').innerHTML = `
    <h3>Guardados</h3>
    ${account.insights ? '<p class="muted authform__note">Cada vuelo y alojamiento guardado tiene un gráfico con la evolución de su precio y una recomendación de cuándo comprar.</p>' : ''}
    ${places.length ? `<h4 class="dlg__sub">Destinos</h4><ul class="favs">${placeRows}</ul>` : ''}
    ${flights.length ? `<h4 class="dlg__sub">Vuelos</h4><ul class="favs">${flightRows}</ul>` : ''}
    ${stays.length ? `<h4 class="dlg__sub">Alojamientos</h4><ul class="favs">${stayRows}</ul>` : ''}
    ${places.length || account.saved.length ? '' : '<p class="muted">Aún no hay nada guardado. Los destinos se guardan con el corazón de su foto, y los vuelos y alojamientos desde los resultados de búsqueda.</p>'}
    ${account.user ? '' : '<p class="muted authform__note" style="margin-top:12px">Con una cuenta también se guardan vuelos y alojamientos, y llegan avisos de precio. <button type="button" class="linkbtn" data-auth-switch="login">Iniciar sesión</button></p>'}
    <div class="dlg__actions" style="margin-top:16px"><button type="button" class="btn" data-close>Cerrar</button></div>`;
}

async function openSaved(id) {
  const item = account.saved.find((x) => x.id === id);
  if (!item) return;
  $('dlg').close();
  const d = item.data;
  if (item.kind === 'flight') {
    restore({ mode: 'flights', origin: d.origin, dest: d.dest, start: d.start, end: d.end, direct: d.direct, pax: d.pax });
  } else {
    restore({ mode: 'stays', origin: null, dest: d.dest, start: d.start, end: d.end, direct: false, pax: d.pax });
  }
}

async function renderAlerts() {
  $('dlg').innerHTML = '<h3>Avisos de precio</h3><p class="muted">Cargando…</p>';
  try {
    const { alerts } = await api('/api/alerts');
    const rows = alerts.map((a) => {
      const up = a.newPrice > a.oldPrice;
      return `<li class="${a.read ? '' : 'alert--new'}">
        <span>${esc(a.title)}<small>${esc(datesText(a.start, a.end))} · ${esc(new Date(a.createdAt * 1000).toLocaleDateString('es-ES'))}</small></span>
        <span class="alert__price">${up ? 'Sube' : 'Baja'} de ${esc(money(a.oldPrice))} a <b>${esc(money(a.newPrice))}</b></span>
      </li>`;
    }).join('');
    $('dlg').innerHTML = `
      <h3>Avisos de precio</h3>
      ${rows ? `<ul class="favs">${rows}</ul>` : '<p class="muted">Sin avisos todavía. Aquí aparecerá un aviso si cambia el precio de un vuelo guardado.</p>'}
      <div class="dlg__actions" style="margin-top:16px"><button type="button" class="btn" data-close>Cerrar</button></div>`;
    if (account.unread) {
      await api('/api/alerts/read', {});
      account.unread = 0;
      paintAccount();
    }
  } catch (error) {
    $('dlg').innerHTML = `<h3>Avisos de precio</h3><p class="muted">${esc(error.message)}</p><div class="dlg__actions"><button type="button" class="btn" data-close>Cerrar</button></div>`;
  }
}

function afterAccountChange() {
  paintAccount();
  if (!$('results').hidden) {
    document.querySelectorAll('[data-save-stay]').forEach((b) => { b.textContent = 'Guardar'; });
    const save = $('saveTrip');
    if (save) save.textContent = 'Guardar y recibir avisos';
  }
}

function initAccount() {
  const dlg = $('dlg');
  $('accountBtn').addEventListener('click', () => {
    if (account.user) renderAccount();
    else renderAuth('login');
    dlg.showModal();
  });
  $('savedBtn').addEventListener('click', () => {
    renderSaved();
    dlg.showModal();
  });
  $('alertsBtn').addEventListener('click', () => {
    if (!requireLogin(() => { $('dlg').showModal(); renderAlerts(); })) return;
    dlg.showModal();
    renderAlerts();
  });

  dlg.addEventListener('click', async (e) => {
    const change = e.target.closest('[data-auth-switch]');
    const open = e.target.closest('[data-open-saved]');
    const remove = e.target.closest('[data-remove-saved]');
    if (change) renderAuth(change.dataset.authSwitch);
    if (e.target.closest('[data-auth-recover]')) renderRecover();
    const history = e.target.closest('[data-history]');
    if (history) toggleHistory(history);
    if (e.target.closest('[data-copy-code]')) {
      const text = dlg.querySelector('[data-recovery-code]').textContent;
      navigator.clipboard?.writeText(text).then(() => toast('Código copiado.')).catch(() => toast('No se ha podido copiar. Hay que copiarlo a mano.'));
    }
    if (e.target.closest('[data-recovery-done]')) {
      dlg.close();
      const next = account.afterLogin;
      account.afterLogin = null;
      if (next) next();
    }
    if (open) openSaved(Number(open.dataset.openSaved));
    if (remove) {
      const id = Number(remove.dataset.removeSaved);
      try {
        await api('/api/saved/delete', { id });
        account.saved = account.saved.filter((x) => x.id !== id);
        renderSaved();
      } catch (error) {
        toast(error.message);
      }
    }
    if (e.target.closest('[data-logout]')) {
      await api('/api/logout', {}).catch(() => {});
      account.user = null;
      account.saved = [];
      account.unread = 0;
      dlg.close();
      afterAccountChange();
      toast('Sesión cerrada.');
    }
  });

  dlg.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-email-alerts]')) return;
    try {
      const { emailAlerts } = await api('/api/account/email-alerts', { enabled: e.target.checked });
      account.user.emailAlerts = emailAlerts;
      toast(emailAlerts ? 'Los avisos también se enviarán por correo.' : 'Los avisos ya no se enviarán por correo.');
    } catch (error) {
      e.target.checked = !e.target.checked;
      toast(error.message);
    }
  });

  dlg.addEventListener('submit', async (e) => {
    const form = e.target;
    e.preventDefault();
    const error = form.querySelector('[data-error]');
    const submit = form.querySelector('[type=submit]');
    error.hidden = true;
    submit.disabled = true;
    try {
      if (form.dataset.auth) {
        const body = { email: form.elements.email.value, password: form.elements.password.value };
        const result = await api(`/api/${form.dataset.auth}`, body);
        await refreshAccount();
        if (result.recoveryCode) {
          renderRecoveryCode(result.recoveryCode);
          toast('Cuenta creada.');
          return;
        }
        dlg.close();
        const next = account.afterLogin;
        account.afterLogin = null;
        toast('Sesión iniciada.');
        if (next) next();
      } else if ('recover' in form.dataset) {
        const body = { email: form.elements.email.value, code: form.elements.code.value, password: form.elements.password.value };
        const result = await api('/api/recover', body);
        await refreshAccount();
        renderRecoveryCode(result.recoveryCode, 'Contraseña cambiada. Hay que guardar el código nuevo');
      } else if ('newCode' in form.dataset) {
        const result = await api('/api/account/recovery-code', { password: form.elements.password.value });
        renderRecoveryCode(result.recoveryCode, 'Código de recuperación nuevo');
      } else if ('deleteAccount' in form.dataset) {
        await api('/api/account/delete', { password: form.elements.password.value });
        account.user = null;
        account.saved = [];
        account.unread = 0;
        dlg.close();
        afterAccountChange();
        toast('Cuenta borrada.');
      }
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      submit.disabled = false;
    }
  });

  refreshAccount().then(() => {
    const opener = { '#guardados': 'savedBtn', '#avisos': 'alertsBtn', '#cuenta': 'accountBtn' }[location.hash];
    if (!opener) return;
    history.replaceState(null, '', location.pathname);
    $(opener).click();
  });
  setInterval(refreshAccount, 5 * 60 * 1000);
}

/* ---------- Mapas ---------- */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const landStyle = () => ({ color: cssVar('--map-border'), weight: 0.6, fillColor: cssVar('--map-land'), fillOpacity: 1 });
let exploreLand = null;
document.addEventListener('toptravel:tema', () => { if (exploreLand) exploreLand.setStyle(landStyle()); });
const hasMaps = () => typeof L !== 'undefined';

function newMap(el, options = {}, tiles = true) {
  const map = L.map(el, { scrollWheelZoom: false, ...options });
  map.attributionControl.setPrefix(false);
  map.on('click', () => map.scrollWheelZoom.enable());
  if (!tiles) return map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

const cityMap = { map: null, el: null, center: null, s: null, mode: 'prices', prices: null, monuments: null, transit: null, markers: new Map(), monumentsData: null, transitData: null, run: 0, framed: false };

function peopleIn(s) {
  return Math.max(1, s.pax.adults + s.pax.children);
}

const perPerson = (rate, s) => Math.round(rate / peopleIn(s));

function hotelPopup(h, s, rates) {
  const booking = linkBooking({ ...s, dest: { city: `${h.name}, ${s.dest.city}`, country: '' } });
  const stars = h.stars ? ' · ' + '★'.repeat(h.stars) : '';
  return `<b class="map__title">${esc(h.name)}</b><span class="map__sub">${esc(h.kind || 'Alojamiento')}${stars}</span>
    ${kmHtml(h)}
    ${rates && rates.length ? `<div class="rates">${ratesHtml(rates, s)}</div>` : ''}
    ${h.website ? `<a class="btn" href="${esc(h.website)}" target="_blank" rel="noopener nofollow">Web oficial</a>` : ''}
    <a class="btn btn--out" href="${esc(booking)}" target="_blank" rel="noopener">Ver precio en Booking</a>`;
}

/* Circunferencia de radio km alrededor del centro. */
function circlePoints(center, km) {
  const lat = center.lat;
  const stepLat = km / 110.574;
  const stepLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  return Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [lat + stepLat * Math.sin(a), center.lon + stepLon * Math.cos(a)];
  });
}

function addZones(map, center, furthest) {
  const band = (from, to, color) => {
    const shape = from > 0 ? [circlePoints(center, to), circlePoints(center, from)] : circlePoints(center, to);
    L.polygon(shape, { color, weight: 1, opacity: 0.8, fillColor: color, fillOpacity: 0.14, interactive: false }).addTo(map);
  };
  band(ZONES.near.from, ZONES.near.to, ZONES.near.color);
  band(ZONES.mid.from, ZONES.mid.to, ZONES.mid.color);
  band(3, Math.max(7.5, furthest + 0.5), FAR_COLOR);
  L.circleMarker([center.lat, center.lon], { radius: 4, color: '#fff', weight: 2, fillColor: '#3a2314', fillOpacity: 1, interactive: false }).addTo(map);
}

/* Cuenta atrás orientativa: si se agota, lo dice en vez de quedarse en cero. */
function countdown(seconds, paint) {
  let left = seconds;
  const tick = () => {
    paint(left > 0 ? `quedan unos ${left} s` : 'está tardando un poco más de lo normal');
    left -= 1;
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

function mapNote(root, text) {
  const note = root.querySelector('[data-map-note]');
  if (note) note.textContent = text;
}

function priceIcon(text, km) {
  const zone = typeof km === 'number' ? zoneOf(km) : 'none';
  return L.divIcon({ className: `pricepin pricepin--${zone}`, html: `<span>${esc(text)}</span>`, iconSize: [48, 22], iconAnchor: [24, 11] });
}

function paintPriceMarker(key, rates) {
  const item = cityMap.markers.get(key);
  if (!item) return;
  if (!rates || !rates.length) {
    cityMap.prices.removeLayer(item.marker);
    return;
  }
  item.marker.setIcon(priceIcon(money(perPerson(rates[0].rate, cityMap.s)), item.hotel.km));
  item.marker.setPopupContent(hotelPopup(item.hotel, cityMap.s, rates));
  if (!cityMap.prices.hasLayer(item.marker)) cityMap.prices.addLayer(item.marker);
}

function drawHotelMap(root, rows, s, center, hotels) {
  const el = root.querySelector('[data-map]');
  if (!hasMaps() || !el) return;
  if (cityMap.el !== el) {
    if (cityMap.map) cityMap.map.remove();
    Object.assign(cityMap, { map: newMap(el), el, center, s, mode: 'prices', monumentsData: null, transitData: null, framed: false, markers: new Map(), run: cityMap.run + 1 });
    if (center) addZones(cityMap.map, center, Math.max(0, ...hotels.map((h) => h.km || 0)));
    cityMap.transit = {
      bus: L.layerGroup(),
      tram: L.layerGroup(),
      metro: L.layerGroup(),
    };
    cityMap.monuments = L.layerGroup();
    cityMap.prices = L.layerGroup().addTo(cityMap.map);
  }
  cityMap.map.invalidateSize();
  cityMap.prices.clearLayers();
  cityMap.markers = new Map();
  const points = rows.filter((h) => h.key && typeof h.lat === 'number' && typeof h.lon === 'number');
  points.forEach((h) => {
    const marker = L.marker([h.lat, h.lon], { icon: priceIcon('…', h.km), title: h.name, alt: h.name }).bindPopup(hotelPopup(h, s), { maxWidth: 280 });
    cityMap.markers.set(h.key, { marker, hotel: h });
    marker.addTo(cityMap.prices);
    const known = rateCache.get(rateId(h.key, s));
    if (known) paintPriceMarker(h.key, known);
  });
  if (!cityMap.framed) {
    const bounds = points.length ? L.latLngBounds(points.map((h) => [h.lat, h.lon])) : L.latLngBounds([]);
    if (center) bounds.extend(L.latLngBounds(circlePoints(center, 3.2)));
    if (bounds.isValid()) cityMap.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    cityMap.framed = true;
  }
  if (cityMap.mode === 'prices') {
    const missing = rows.filter((h) => h.key).length - points.length;
    mapNote(root, points.length
      ? `${plural(points.length, 'alojamiento', 'alojamientos')} con precio en el mapa, por noche y por persona.${missing > 0 ? ` ${plural(missing, 'otro', 'otros')} con precio solo en la lista: falta su ubicación.` : ''}`
      : 'Todavía no hay alojamientos con precio en el mapa de esta ciudad. Los mapas de monumentos y transporte sí están disponibles.');
  }
}

function monumentPopup(m) {
  // Wikidata guarda muchos nombres en minúscula ("basílica de…").
  const name = m.name.charAt(0).toUpperCase() + m.name.slice(1);
  return `<b class="map__title">${esc(name)}</b>${kmHtml(m)}
    <img class="map__photo" src="${esc(m.image)}" alt="${esc(name)}" width="240" height="160" loading="lazy">
    <a class="map__credit" href="${esc(m.credit)}" target="_blank" rel="noopener">Foto y licencia: Wikimedia Commons</a>`;
}

// Tiempos habituales la primera vez en una ciudad. Las ciudades preparadas salen al momento.
const WAIT_SECONDS = { hotels: 30, monuments: 20, rail: 35, bus: 70 };

async function loadMonuments(root) {
  const { center, run } = cityMap;
  if (cityMap.monumentsData || !center) return;
  const q = new URLSearchParams({ lat: center.lat, lon: center.lon });
  const stop = countdown(WAIT_SECONDS.monuments, (left) => {
    if (run === cityMap.run && cityMap.mode === 'monuments') mapNote(root, `Buscando monumentos: ${left}.`);
  });
  try {
    const r = await fetch(`/api/monuments?${q}`);
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    if (run !== cityMap.run) return;
    cityMap.monumentsData = body.monuments;
    const from = L.latLng(center.lat, center.lon);
    body.monuments.forEach((m) => {
      m.km = from.distanceTo([m.lat, m.lon]) / 1000;
      const icon = L.divIcon({ className: `pin pin--monument pin--${zoneOf(m.km)}`, iconSize: [16, 16], iconAnchor: [8, 8] });
      L.marker([m.lat, m.lon], { icon, title: m.name, alt: m.name }).bindPopup(monumentPopup(m), { maxWidth: 270, minWidth: 250 }).addTo(cityMap.monuments);
    });
  } catch {
    if (run === cityMap.run && cityMap.mode !== 'prices') mapNote(root, 'No se han podido cargar los monumentos. Se puede volver a intentar en un momento.');
  } finally {
    stop();
  }
}

const TRANSIT_LOOK = {
  metro: { label: 'Metro', weight: 4.5, opacity: 0.95, fallback: '#7a3e9d' },
  tram: { label: 'Tranvía', weight: 3, opacity: 0.9, fallback: '#c2410c' },
  bus: { label: 'Autobús', weight: 1.3, opacity: 0.45, fallback: '#3a5a8c' },
};

function drawTransitLines(lines) {
  cityMap.transitRenderer = cityMap.transitRenderer || L.canvas({ tolerance: 6 });
  ['bus', 'tram', 'metro'].forEach((kind) => {
    const look = TRANSIT_LOOK[kind];
    lines.filter((l) => l.kind === kind).forEach((line) => {
      L.polyline(line.paths, { renderer: cityMap.transitRenderer, color: line.color || look.fallback, weight: look.weight, opacity: look.opacity })
        .bindPopup(`<b class="map__title">${esc(look.label)} ${esc(line.ref)}</b>${line.name ? `<span class="map__sub">${esc(line.name)}</span>` : ''}`)
        .addTo(cityMap.transit[kind]);
    });
  });
}

async function fetchTransit(q, part) {
  const r = await fetch(`/api/transit?${q}&part=${part}`);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error);
  return body;
}

async function loadTransit(root) {
  const { center, run } = cityMap;
  if (cityMap.transitData || cityMap.transitLoading || !center) return;
  cityMap.transitLoading = true;
  const q = new URLSearchParams({ lat: center.lat, lon: center.lon });
  const current = () => run === cityMap.run;
  let stop = countdown(WAIT_SECONDS.rail, (left) => {
    if (current() && cityMap.mode === 'transit') mapNote(root, `Buscando metro y tranvía: ${left}.`);
  });
  try {
    // Primero lo rápido: así hay líneas en el mapa en segundos.
    const rail = await fetchTransit(q, 'rail');
    stop();
    if (!current()) return;
    cityMap.transitData = rail.lines;
    cityMap.transitPartial = Boolean(rail.partial);
    drawTransitLines(rail.lines);
    if (rail.lines.some((l) => l.kind === 'bus')) {
      showTransitKinds(root);
      return;
    }
    cityMap.busLoading = true;
    showTransitKinds(root);
    stop = countdown(WAIT_SECONDS.bus, (left) => {
      if (current() && cityMap.mode === 'transit') mapNote(root, `${transitSummary(cityMap.transitData)} Buscando autobuses: ${left}.`);
    });
    try {
      const bus = await fetchTransit(q, 'bus');
      if (!current()) return;
      const lines = bus.lines.filter((l) => l.kind === 'bus');
      cityMap.transitData = [...cityMap.transitData, ...lines];
      cityMap.transitPartial = Boolean(bus.partial);
      drawTransitLines(lines);
    } catch {
      if (current()) cityMap.transitPartial = true;
    }
    if (current()) {
      cityMap.busLoading = false;
      stop();
      showTransitKinds(root);
    }
  } catch {
    if (current() && cityMap.mode === 'transit') mapNote(root, 'No se ha podido cargar el transporte. El servicio de mapas puede estar saturado. Se puede volver a intentar en un momento.');
  } finally {
    stop();
    if (current()) cityMap.transitLoading = false;
  }
}

function transitSummary(lines) {
  const n = (kind) => lines.filter((l) => l.kind === kind).length;
  return `${n('metro')} de metro, ${n('tram')} de tranvía y ${n('bus')} de autobús en unos 7 km alrededor del centro. Al pulsar una línea se ve su nombre.`;
}

function showTransitKinds(root) {
  if (cityMap.mode !== 'transit') return;
  const lines = cityMap.transitData;
  root.querySelectorAll('[data-kind]').forEach((box) => {
    const group = cityMap.transit[box.dataset.kind];
    if (box.checked) group.addTo(cityMap.map);
    else cityMap.map.removeLayer(group);
  });
  if (!lines) return;
  if (cityMap.busLoading) return; // la cuenta atrás de los autobuses ya escribe la nota
  mapNote(root, lines.length
    ? `${transitSummary(lines)}${cityMap.transitPartial ? ' Los autobuses no han cargado: el servicio de mapas está saturado.' : ''}`
    : 'No se han encontrado líneas de transporte en esta zona.');
}

async function setMapMode(root, mode) {
  if (!cityMap.map) return;
  cityMap.mode = mode;
  root.querySelectorAll('[data-map-mode]').forEach((b) => {
    const on = b.dataset.mapMode === mode;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const { map, prices, monuments, transit } = cityMap;
  map.closePopup();
  [prices, monuments, transit.bus, transit.tram, transit.metro].forEach((layer) => map.removeLayer(layer));
  root.querySelector('[data-transit-kinds]').hidden = mode !== 'transit';
  if (mode === 'prices') {
    prices.addTo(map);
    mapNote(root, `${plural(cityMap.markers.size, 'alojamiento', 'alojamientos')} con precio en el mapa, por noche y por persona.`);
    return;
  }
  monuments.addTo(map);
  if (mode === 'transit') {
    showTransitKinds(root);
    loadMonuments(root);
    await loadTransit(root);
    return;
  }
  await loadMonuments(root);
  if (cityMap.mode === 'monuments' && cityMap.monumentsData) {
    mapNote(root, cityMap.monumentsData.length
      ? `${plural(cityMap.monumentsData.length, 'lugar destacado', 'lugares destacados')}. Al pulsar un punto se ven su nombre y su foto.`
      : 'No se han encontrado monumentos con foto en esta zona.');
  }
}

let exploreMap = null;
let exploreLayer = null;
let exploreItems = [];
let exploreRun = 0;
let exploreFrom = null;
let mapLabelLayer = null;
let mapCountries = [];
let mapCapitals = [];

/* Colocan nombres y precios sin que se pisen: primero los países grandes,
   luego los precios (del más barato al más caro) y después el resto. */
function declutterPrices() {
  if (!exploreMap) return;
  const zoom = exploreMap.getZoom();
  const placed = [];
  const fits = (b) => !placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
  const show = (layer, marker, box, wanted) => {
    const ok = wanted && fits(box);
    if (ok) {
      placed.push(box);
      if (!layer.hasLayer(marker)) layer.addLayer(marker);
    } else if (layer.hasLayer(marker)) {
      layer.removeLayer(marker);
    }
  };
  const point = (m) => exploreMap.latLngToContainerPoint(m.getLatLng());
  const countryBox = (item) => {
    const p = point(item.marker);
    return { x0: p.x - item.w / 2, x1: p.x + item.w / 2, y0: p.y - 7, y1: p.y + 7 };
  };

  mapCountries.forEach((item) => { show(mapLabelLayer, item.marker, countryBox(item), item.r <= zoom - 0.5); });
  const drawPrices = () => exploreItems.forEach((item) => {
    const p = point(item.marker);
    show(exploreLayer, item.marker, { x0: p.x - 24, x1: p.x + 24, y0: p.y - 11, y1: p.y + 11 }, true);
  });
  const drawCapitals = () => mapCapitals.forEach((item) => {
    const p = point(item.marker);
    show(mapLabelLayer, item.marker, { x0: p.x + 4, x1: p.x + 6 + item.w, y0: p.y - 7, y1: p.y + 7 }, zoom >= 3);
  });
  // De lejos mandan los precios; al acercar, los nombres de las capitales.
  if (zoom >= 5) {
    drawCapitals();
    drawPrices();
  } else {
    drawPrices();
    drawCapitals();
  }
  mapCountries.forEach((item) => {
    if (item.r > zoom - 0.5) show(mapLabelLayer, item.marker, countryBox(item), item.r <= zoom + 1);
  });
}

function addMapLabels(labels) {
  L.layerGroup(labels.capitals.map((c) => L.circleMarker([c.lat, c.lon], {
    radius: 2, stroke: false, fillColor: cssVar('--map-dot'), fillOpacity: 1, interactive: false,
  }))).addTo(exploreMap);
  mapLabelLayer = L.layerGroup().addTo(exploreMap);
  const label = (cls, text, lat, lon, w, anchorX) => L.marker([lat, lon], {
    icon: L.divIcon({ className: `maplabel ${cls}`, html: `<span>${esc(text)}</span>`, iconSize: [w, 14], iconAnchor: [anchorX, 7] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: -1000,
  });
  mapCountries = labels.countries.map((c) => {
    const w = c.n.length * 7 + 6;
    return { r: c.r, w, marker: label('maplabel--country', c.n, c.lat, c.lon, w, w / 2) };
  });
  mapCapitals = labels.capitals.map((c) => {
    const w = c.n.length * 5.6 + 4;
    return { w, marker: label('maplabel--capital', c.n, c.lat, c.lon, w, -5) };
  });
  declutterPrices();
}

function explorePopup(d, oneWay) {
  const when = d.returnDate && !oneWay ? `${showDate(d.date)} – ${showDate(d.returnDate)}` : showDate(d.date);
  return `<b class="map__title">${esc(d.city)}</b><span class="map__sub">${esc(d.country)}</span>
    <span class="map__price">${esc(money(d.price))} <small>${oneWay ? 'solo ida' : 'ida y vuelta'}, orientativo</small></span>
    <span class="map__sub">${esc(when)}${d.airline ? ` · ${esc(d.airline)}` : ''}</span>
    <button type="button" class="btn" data-explore="${esc(d.code)}">Ver vuelos</button>`;
}

async function loadExplore() {
  if (!hasMaps() || !$('exploreMap')) return;
  const run = ++exploreRun;
  const month = $('exploreMonth').value;
  exploreFrom = state.origin || PLACES.find((p) => p.code === 'MAD');
  $('exploreSub').textContent = `Desde ${exploreFrom.city}. La ciudad se cambia en el campo «Desde» del buscador.`;
  $('exploreNote').textContent = 'Buscando precios…';
  if (!exploreMap) {
    exploreMap = newMap($('exploreMap'), {
      minZoom: 2,
      maxZoom: 8,
      preferCanvas: true,
      maxBounds: [[-62, -200], [85, 200]],
      maxBoundsViscosity: 1,
    }, false);
    exploreMap.setView([30, 8], 3);
    exploreMap.attributionControl.addAttribution('Leaflet · Natural Earth');
    fetch('vendor/world.json').then((r) => r.json()).then((world) => {
      exploreLand = L.geoJSON(world, { interactive: false, style: landStyle }).addTo(exploreMap);
    }).catch(() => {});
    exploreLayer = L.layerGroup().addTo(exploreMap);
    fetch('vendor/labels.json').then((r) => r.json()).then(addMapLabels).catch(() => {});
    exploreMap.on('zoomend', declutterPrices);
  }
  try {
    const r = await fetch(`/api/explore?${new URLSearchParams({ origin: exploreFrom.code, month })}`);
    const body = await r.json();
    if (run !== exploreRun) return;
    if (!r.ok) throw new Error(body.error || 'error');
    exploreLayer.clearLayers();
    const oneWay = Boolean(month);
    exploreItems = body.destinations.map((d) => {
      const icon = L.divIcon({ className: 'pricepin', html: `<span>${esc(money(d.price))}</span>`, iconSize: [48, 22], iconAnchor: [24, 11] });
      const marker = L.marker([d.lat, d.lon], { icon, title: d.city, alt: `${d.city}, ${money(d.price)}` }).bindPopup(explorePopup(d, oneWay));
      return { d, marker, oneWay };
    });
    if (body.origin) {
      L.circleMarker([body.origin.lat, body.origin.lon], { radius: 6, color: '#3a2314', weight: 2, fillColor: '#f0b000', fillOpacity: 1, interactive: false }).addTo(exploreLayer);
    }
    exploreItems.forEach((item) => item.marker.addTo(exploreLayer));
    declutterPrices();
    if (!exploreItems.length) {
      $('exploreNote').textContent = 'No hay precios recientes desde esta ciudad para esas fechas. Otras fechas pueden tener resultados.';
      return;
    }
    $('exploreNote').textContent = `${plural(exploreItems.length, 'destino', 'destinos')} · precio reciente por adulto, ${oneWay ? 'solo ida' : 'ida y vuelta'}. Al acercar el mapa se ven más.`;
  } catch {
    if (run === exploreRun) $('exploreNote').textContent = 'Los precios del mapa no están disponibles ahora mismo.';
  }
}

function exploreSearch(code) {
  const item = exploreItems.find((x) => x.d.code === code);
  if (!item) return;
  const { d, oneWay } = item;
  state.origin = exploreFrom;
  state.dest = { code: d.code, city: d.city, country: d.country, airport: '' };
  const single = oneWay || !d.returnDate;
  $('tripType').value = single ? 'oneway' : 'round';
  state.start = d.date;
  state.end = single ? null : d.returnDate;
  $('origin').value = placeLabel(state.origin);
  $('dest').value = placeLabel(state.dest);
  exploreMap.closePopup();
  renderDates();
  $('searchForm').requestSubmit();
}

function initExplore() {
  const select = $('exploreMonth');
  if (!select) return;
  const now = new Date();
  const months = Array.from({ length: MONTHS_AHEAD + 1 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
  select.innerHTML = '<option value="">Cualquier fecha · ida y vuelta</option>'
    + months.map((m) => `<option value="${toIso(m).slice(0, 7)}">${esc(fmtMonth.format(m))} · solo ida</option>`).join('');
  select.addEventListener('change', loadExplore);
  $('exploreMap').addEventListener('click', (e) => {
    const b = e.target.closest('[data-explore]');
    if (b) exploreSearch(b.dataset.explore);
  });
  loadExplore();
}

function refreshMaps() {
  if (!exploreMap) return;
  setTimeout(() => { exploreMap.invalidateSize(); declutterPrices(); });
}

/* ---------- Hoteles (OpenStreetMap: gratis, pero sin precios) ---------- */
const HOTELS_STEP = 12;

const ZONES = {
  near: { color: '#2e9e4f', from: 0, to: 1 },
  mid: { color: '#f2c200', from: 1, to: 3 },
};
const FAR_COLOR = '#d93a2b';
const zoneOf = (km) => (km <= 1 ? 'near' : (km <= 3 ? 'mid' : 'far'));
const kmText = (km) => `${km.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 })} km del centro`;
const kmHtml = (h) => (typeof h.km === 'number' ? `<span class="km km--${zoneOf(h.km)}">${esc(kmText(h.km))}</span>` : '');

/* Precios por agencia: se piden de pocos en pocos porque cada uno tarda segundos. */
const rateCache = new Map();
let ratesRun = 0;

function ratesHtml(rates, s) {
  if (!rates) return 'Precios no disponibles ahora mismo.';
  if (!rates.length) return 'Sin precio disponible para estas fechas.';
  const [best, ...rest] = rates;
  return `<b class="rates__best">Desde ${esc(money(perPerson(best.rate, s)))} <small>por noche y persona en ${esc(best.name)}</small></b>
    ${rest.length ? `<span class="rates__rest">${rest.map((r) => `${esc(r.name)}: ${esc(money(perPerson(r.rate, s)))}`).join(' · ')}</span>` : ''}`;
}

const rateId = (key, s) => [key, s.start, s.end, s.pax.adults, s.pax.rooms].join('|');
const MAX_RATE_REQUESTS = 40;

async function loadVisibleRates(root, s, rows = []) {
  const run = ++ratesRun;
  const visible = [...root.querySelectorAll('[data-rates]')].map((el) => el.dataset.rates);
  const onMap = rows.filter((h) => h.key && typeof h.lat === 'number').map((h) => h.key);
  const pending = [...new Set([...visible, ...onMap])].slice(0, MAX_RATE_REQUESTS);
  const paint = (key, rates) => {
    root.querySelectorAll(`[data-rates="${key}"]`).forEach((el) => { el.innerHTML = ratesHtml(rates, s); });
    if (rates && rates.length) {
      const night = perPerson(rates[0].rate, s);
      tripTotal.night = tripTotal.night === null ? night : Math.min(tripTotal.night, night);
      paintTripTotal(s);
    }
    paintPriceMarker(key, rates);
  };
  const next = async () => {
    while (pending.length && run === ratesRun) {
      const key = pending.shift();
      const id = rateId(key, s);
      if (!rateCache.has(id)) {
        const q = new URLSearchParams({ key, in: s.start, out: s.end, adults: s.pax.adults, rooms: s.pax.rooms });
        const rates = await fetch(`/api/rates?${q}`).then((r) => (r.ok ? r.json() : null)).then((b) => (b ? b.rates : null)).catch(() => null);
        if (rates) rateCache.set(id, rates);
        if (run === ratesRun) paint(key, rates);
      } else {
        paint(key, rateCache.get(id));
      }
    }
  };
  await Promise.all([next(), next(), next(), next(), next()]);
}

function hotelHtml(h, s) {
  const stars = h.stars ? ' · ' + '★'.repeat(h.stars) : '';
  const booking = linkBooking({ ...s, dest: { city: `${h.name}, ${s.dest.city}`, country: '' } });
  return `
    <article class="card hotel">
      <div class="hotel__body">
        <span class="stay__type">${esc(h.kind || 'Alojamiento')}${stars}</span>
        <h3 class="stay__name">${esc(h.name)}</h3>
        ${h.address ? `<span class="stay__loc"><span>${esc(h.address)}</span></span>` : ''}
        ${kmHtml(h)}
        ${h.key ? `<div class="rates" data-rates="${esc(h.key)}">Buscando precios…</div>` : '<div class="rates rates--none">Sin precio disponible para este alojamiento.</div>'}
      </div>
      <div class="hotel__buy">
        ${h.website ? `<a class="btn" href="${esc(h.website)}" target="_blank" rel="noopener nofollow">Web oficial<span class="sr"> (se abre en una pestaña nueva)</span></a>` : ''}
        <a class="btn ${h.website ? 'btn--out' : ''}" href="${esc(booking)}" target="_blank" rel="noopener">Ver precio en Booking<span class="sr"> (se abre en una pestaña nueva)</span></a>
        <button type="button" class="linkbtn" data-save-stay="${esc(h.name)}">${stayIsSaved(h, s) ? 'Guardado ✓' : 'Guardar'}</button>
      </div>
    </article>`;
}

let hotelsRun = 0;
async function loadHotels(s) {
  const el = $('hotels');
  if (!el) return;
  const run = ++hotelsRun;
  const place = s.dest.country ? `${s.dest.city}, ${s.dest.country}` : s.dest.city;
  el.innerHTML = '<p class="count"><span data-wait></span></p><div class="list"><div class="skel"></div><div class="skel"></div></div>';
  const stop = countdown(WAIT_SECONDS.hotels, (left) => {
    const wait = el.querySelector('[data-wait]');
    if (wait) wait.textContent = `Buscando alojamientos: ${left}.`;
  });
  try {
    const r = await fetch(`/api/hotels?${new URLSearchParams({ place })}`);
    const body = await r.json();
    if (run !== hotelsRun) return;
    if (!r.ok) throw new Error(body.error || 'error');
    if (!body.hotels.length) {
      el.innerHTML = '<div class="empty"><b>No se han encontrado alojamientos en esa zona</b>La búsqueda funciona mejor con el nombre de la ciudad.</div>';
      return;
    }
    renderHotelResults(el, body.hotels, s, body.center);
  } catch {
    if (run === hotelsRun) el.innerHTML = '<div class="empty"><b>No se han podido cargar los alojamientos</b>Se puede volver a intentar en un momento.</div>';
  } finally {
    stop();
  }
}

/* ---------- Total del viaje ---------- */
const tripTotal = { flight: null, night: null };

function paintTripTotal(s) {
  const el = $('tripTotal');
  if (!el) return;
  const { flight, night } = tripTotal;
  const stay = night !== null && s.end ? Math.round((fromIso(s.end) - fromIso(s.start)) / 864e5) : 0;
  if (flight === null && !stay) { el.hidden = true; return; }
  const parts = [];
  if (flight !== null) parts.push(`vuelo desde ${money(flight)}`);
  if (stay) parts.push(`alojamiento desde ${money(night)} la noche × ${plural(stay, 'noche', 'noches')}`);
  const both = flight !== null && stay;
  el.innerHTML = `<b>${both ? `Viaje completo desde ${esc(money(flight + night * stay))} por persona` : 'Precio orientativo por persona'}</b>
    <span>${esc(parts.join(' + '))}. Sale del vuelo más barato y del alojamiento más barato de los consultados hasta ahora.</span>`;
  el.hidden = false;
}

/* ---------- Planes: qué hacer en el destino ---------- */
const PLAN_KINDS = {
  bar: 'Bares', discoteca: 'Discotecas', restaurante: 'Restaurantes', cafeteria: 'Cafeterías', museo: 'Museos', monumento: 'Monumentos',
  sitio: 'Sitios que ver', mirador: 'Miradores', arte: 'Arte en la calle', naturaleza: 'Parques y naturaleza', playa: 'Playas',
  espectaculo: 'Teatro y cine', cultura: 'Cultura', ocio: 'Ocio', familiar: 'Zoos y parques', mercado: 'Mercados',
};
const PLAN_KIND_ONE = {
  bar: 'Bar', discoteca: 'Discoteca', restaurante: 'Restaurante', cafeteria: 'Cafetería', museo: 'Museo', monumento: 'Monumento',
  sitio: 'Sitio que ver', mirador: 'Mirador', arte: 'Arte en la calle', naturaleza: 'Parque o naturaleza', playa: 'Playa',
  espectaculo: 'Teatro o cine', cultura: 'Cultura', ocio: 'Ocio', familiar: 'Zoo o parque', mercado: 'Mercado',
};
const PLANS_STEP = 12;
const STOP_NEAR_M = 500;

function reviewLinks(a, city) {
  const q = `${a.name}, ${city}`;
  const google = `https://www.google.com/maps/search/?${new URLSearchParams({ api: 1, query: q })}`;
  const tripadvisor = `https://www.tripadvisor.es/Search?${new URLSearchParams({ q })}`;
  return { google, tripadvisor };
}

function planHtml(a, city) {
  const links = reviewLinks(a, city);
  const chips = [];
  if (a.free === true) chips.push('<span class="ok">Gratis</span>');
  else if (a.free === false) chips.push('<span>De pago</span>');
  else chips.push('<span>Precio sin confirmar</span>');
  chips.push(`<span>Presupuesto ${esc(a.budget)}</span>`);
  if (typeof a.km === 'number') chips.push(`<span>${esc(String(a.km).replace('.', ','))} km del centro</span>`);
  if (typeof a.stop_m === 'number' && a.stop_m <= STOP_NEAR_M) chips.push(`<span>Parada a ${esc(String(a.stop_m))} m</span>`);
  if (a.capacity) chips.push(`<span>Aforo: ${esc(String(a.capacity))}</span>`);
  if (a.wheelchair === 'yes') chips.push('<span>Accesible en silla de ruedas</span>');
  if (a.gem) chips.push('<span class="ok">Poco conocido</span>');
  return `
    <article class="card plan">
      ${a.image ? `<img class="plan__img" src="${esc(a.image)}" alt="" loading="lazy" width="160" height="120">` : ''}
      <div class="hotel__body">
        <span class="stay__type">${esc(PLAN_KIND_ONE[a.kind] || 'Plan')}${a.cuisine ? ` · ${esc(a.cuisine.replaceAll(';', ', ').replaceAll('_', ' '))}` : ''}</span>
        <h3 class="stay__name">${esc(a.name)}</h3>
        <div class="chips">${chips.join('')}</div>
        ${a.opening_hours ? `<span class="stay__loc"><span>Horario: ${esc(a.opening_hours)}</span></span>` : ''}
        ${a.credit ? `<a class="plan__credit" href="${esc(a.credit)}" target="_blank" rel="noopener">Foto y licencia: Wikimedia Commons</a>` : ''}
      </div>
      <div class="hotel__buy">
        <a class="btn btn--out" href="${esc(links.google)}" target="_blank" rel="noopener">Reseñas en Google<span class="sr"> (se abre en una pestaña nueva)</span></a>
        <a class="btn btn--out" href="${esc(links.tripadvisor)}" target="_blank" rel="noopener">Reseñas en TripAdvisor<span class="sr"> (se abre en una pestaña nueva)</span></a>
        ${a.website ? `<a class="linkbtn" href="${esc(a.website)}" target="_blank" rel="noopener nofollow">Web oficial<span class="sr"> (se abre en una pestaña nueva)</span></a>` : ''}
      </div>
    </article>`;
}

function renderPlans(el, items, city) {
  const count = (fn) => items.filter(fn).length;
  const kinds = Object.keys(PLAN_KINDS).filter((k) => items.some((a) => a.kind === k));
  const radios = (name, options) => options.map(([value, label, fn], i) => optHtml('radio', name, value, label, fn ? count(fn) : items.length, i === 0)).join('');
  el.innerHTML = `
    <div class="layout">
      ${filtersHtml(
        fieldsetHtml('Qué hacer', kinds.map((k) => optHtml('checkbox', 'p_kind', k, PLAN_KINDS[k], count((a) => a.kind === k), true)).join(''))
        + fieldsetHtml('Precio', radios('p_free', [['any', 'Cualquiera'], ['yes', 'Gratis', (a) => a.free === true], ['no', 'De pago', (a) => a.free === false]]))
        + fieldsetHtml('Tipo de plan', radios('p_plan', [['any', 'Cualquiera'], ['pareja', 'En pareja', (a) => a.plans.includes('pareja')], ['amigos', 'Con amigos', (a) => a.plans.includes('amigos')], ['familia', 'En familia', (a) => a.plans.includes('familia')]]))
        + fieldsetHtml('Presupuesto', radios('p_budget', [['any', 'Cualquiera'], ['bajo', 'Bajo', (a) => a.budget === 'bajo'], ['medio', 'Medio', (a) => a.budget === 'medio'], ['alto', 'Alto', (a) => a.budget === 'alto']]))
        + fieldsetHtml('Distancia al centro', radios('p_km', [['any', 'Cualquiera'], ['1', 'Hasta 1 km', (a) => a.km <= 1], ['3', 'Hasta 3 km', (a) => a.km <= 3], ['5', 'Hasta 5 km', (a) => a.km <= 5]]))
        + fieldsetHtml('Transporte público', optHtml('checkbox', 'p_stop', '1', `Parada a menos de ${STOP_NEAR_M} m`, count((a) => typeof a.stop_m === 'number' && a.stop_m <= STOP_NEAR_M)))
        + fieldsetHtml('Personas', '<label class="opt plan__people"><span>Máximo de personas</span><input type="number" name="p_people" min="1" max="500" inputmode="numeric"></label><p class="plan__hint">Se quitan los sitios cuyo aforo conocido es menor. Pocos sitios indican su aforo.</p>')
        + fieldsetHtml('Sitios poco conocidos', optHtml('checkbox', 'p_gem', '1', 'Solo poco conocidos', count((a) => a.gem))),
      )}
      <div class="layout__main">
        ${sortbarHtml([{ id: 'near', label: 'Más cerca' }, { id: 'known', label: 'Más conocidos' }])}
        <p class="count" data-count></p>
        <div class="list" data-results></div>
        <button type="button" class="btn btn--out btn--block more">Ver más planes</button>
        <p class="count">El precio, el presupuesto y el tipo de plan son orientativos: si el sitio no lo indica, se deducen de su tipo. «Poco conocido» significa que no tiene ficha en Wikipedia ni en Wikidata. Conviene confirmar los horarios antes de ir.</p>
        <p class="legal">Datos: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a> y <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a>. Las reseñas son de Google y TripAdvisor y se leen en sus webs.</p>
      </div>
    </div>`;

  const view = { sort: 'near', step: PLANS_STEP, limit: PLANS_STEP };
  const nearest = (a, b) => (a.km ?? 99) - (b.km ?? 99);
  const sorters = { near: nearest, known: (a, b) => Number(b.known) - Number(a.known) || Boolean(b.image) - Boolean(a.image) || nearest(a, b) };

  const draw = () => {
    const form = el.querySelector('form');
    const chosen = new Set([...form.querySelectorAll('[name=p_kind]:checked')].map((i) => i.value));
    const free = form.elements.p_free.value;
    const plan = form.elements.p_plan.value;
    const budget = form.elements.p_budget.value;
    const km = form.elements.p_km.value;
    const stop = form.elements.p_stop.checked;
    const people = Number(form.elements.p_people.value) || 0;
    const gem = form.elements.p_gem.checked;
    const rows = items.filter((a) => chosen.has(a.kind)
      && (free === 'any' || a.free === (free === 'yes'))
      && (plan === 'any' || a.plans.includes(plan))
      && (budget === 'any' || a.budget === budget)
      && (km === 'any' || a.km <= Number(km))
      && (!stop || (typeof a.stop_m === 'number' && a.stop_m <= STOP_NEAR_M))
      && (!people || !a.capacity || a.capacity >= people)
      && (!gem || a.gem)).sort(sorters[view.sort]);
    el.querySelector('[data-count]').textContent = `${rows.length} de ${items.length} planes`;
    el.querySelector('[data-results]').innerHTML = rows.length
      ? rows.slice(0, view.limit).map((a) => planHtml(a, city)).join('')
      : noMatchHtml;
    el.querySelector('.more').hidden = rows.length <= view.limit;
  };

  wireControls(el, view, draw);
  draw();
}

let plansRun = 0;
async function loadPlans(s) {
  const el = $('plans');
  if (!el) return;
  const run = ++plansRun;
  const place = s.dest.country ? `${s.dest.city}, ${s.dest.country}` : s.dest.city;
  el.innerHTML = '<div class="list"><div class="skel"></div><div class="skel"></div></div>';
  try {
    const r = await fetch(`/api/activities?${new URLSearchParams({ place })}`);
    const body = await r.json();
    if (run !== plansRun) return;
    if (!r.ok) throw new Error(body.error || 'error');
    if (!body.activities.length) {
      el.innerHTML = '<div class="empty"><b>Todavía no hay planes de esta ciudad</b>Se van añadiendo más ciudades poco a poco.</div>';
      return;
    }
    renderPlans(el, body.activities, s.dest.city);
  } catch {
    if (run === plansRun) el.innerHTML = '<div class="empty"><b>No se han podido cargar los planes</b>Se puede volver a intentar en un momento.</div>';
  }
}

let offersRun = 0;
async function loadOffers(s) {
  const el = $('offers');
  const run = ++offersRun;
  const stale = () => run !== offersRun;
  const direct = s.direct ? 1 : 0;
  const message = (title, text) => `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;

  if (s.pax.cabin !== 'economy') {
    el.innerHTML = message('Precios solo en clase turista', 'Por ahora solo se muestran precios de clase turista.');
    return;
  }
  el.innerHTML = '<div class="list"><div class="skel"></div><div class="skel"></div></div>';

  const base = { origin: s.origin.code, dest: s.dest.code, direct };
  try {
    const trip = await fetchDay({ ...base, depart: s.start, ...(s.end ? { return: s.end } : {}) });
    if (stale()) return;
    let lists = [];
    if (trip.offers.length) {
      lists = [{ title: '', offers: trip.offers }];
    } else if (s.end) {
      // Sin precio del viaje completo: se muestra cada tramo por separado.
      const [out, back] = await Promise.all([
        fetchDay({ ...base, depart: s.start }),
        fetchDay({ origin: s.dest.code, dest: s.origin.code, direct, depart: s.end }),
      ]);
      if (stale()) return;
      lists = [
        { title: 'Ida (se compra aparte)', offers: out.offers },
        { title: 'Vuelta (se compra aparte)', offers: back.offers },
      ].filter((l) => l.offers.length);
    }
    if (lists.length) {
      tripTotal.flight = lists.reduce((sum, l) => sum + Math.min(...l.offers.map((o) => o.price)), 0);
      paintTripTotal(s);
      renderFlightResults(el, lists);
    }
    else el.innerHTML = message('Sin precios recientes para estas fechas', 'En el calendario aparecen marcados los días con precio.');
  } catch {
    if (!stale()) el.innerHTML = message('Precios no disponibles ahora mismo', 'Se puede volver a intentar en un momento.');
  }
}

function renderResults(s) {
  const flights = s.mode === 'flights';
  const title = flights ? `${s.origin.city} → ${s.dest.city}` : `Alojamiento en ${s.dest.city}`;
  const dates = s.end ? `${showDate(s.start)} – ${showDate(s.end)}` : `${showDate(s.start)} · solo ida`;
  const extra = !flights ? ` · ${plural(nights(), 'noche', 'noches')}` : (s.direct ? ' · vuelos directos' : '');

  const withHotels = !flights || (s.end && s.end !== s.start && s.dest.city !== s.dest.code);
  const hotelsTitle = `Hoteles y apartamentos en ${s.dest.city}`;
  const hotelsHtml = withHotels
    ? `<section class="offers" id="sectionStays" aria-labelledby="hotelsTitle"><div class="block__head"><h2 id="hotelsTitle">${esc(hotelsTitle)}</h2></div><div id="hotels"></div></section>`
    : (flights && !s.end ? '<p class="savehint">Para ver alojamientos hace falta una fecha de vuelta.</p>' : '');
  const withPlans = s.dest.city !== s.dest.code;
  const plansHtml = withPlans
    ? `<section class="offers" id="sectionPlans" aria-labelledby="plansTitle"><div class="block__head"><h2 id="plansTitle">${esc(`Planes en ${s.dest.city}`)}</h2></div><div id="plans"></div></section>`
    : '';
  const jumps = [flights && ['sectionFlights', 'Vuelos'], withHotels && ['sectionStays', 'Alojamiento'], withPlans && ['sectionPlans', 'Planes']].filter(Boolean);
  tripTotal.flight = null;
  tripTotal.night = null;

  const res = $('results');
  res.innerHTML = `
    <div class="summary">
      <div><h2>${esc(title)}</h2><p>${esc(dates + extra)} · ${esc(paxSummary())}</p></div>
      <span class="summary__actions">
        ${flights ? '<button type="button" class="btn" id="saveTrip"></button>' : ''}
        <button type="button" class="btn btn--out" id="newSearch">Nueva búsqueda</button>
      </span>
    </div>
    <p class="trip-total" id="tripTotal" role="status" hidden></p>
    ${jumps.length > 1 ? `<nav class="jumps" aria-label="Partes del viaje">${jumps.map(([id, label]) => `<button type="button" class="pilltab" data-jump="${id}">${esc(label)}</button>`).join('')}</nav>` : ''}
    ${account.insights ? `<p class="savehint">Al guardar ${flights ? 'este vuelo' : 'un alojamiento'} se ve en Guardados un gráfico con la evolución de su precio y una recomendación de cuándo comprar.</p>` : ''}
    ${flights ? '<section class="offers" id="sectionFlights" aria-labelledby="flightsTitle"><div class="block__head"><h2 id="flightsTitle">Vuelos</h2></div><div id="offers"></div></section>' : hotelsHtml}
    ${flights ? hotelsHtml : ''}
    ${plansHtml}
    <p class="legal" id="legal">TopTravel no vende billetes ni alojamientos y no procesa pagos: la reserva y el pago se hacen en la web del vendedor.</p>`;
  res.hidden = false;
  $('home').hidden = true;
  $('newSearch').addEventListener('click', goHome);
  res.querySelector('.jumps')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (b) $(b.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if (flights) wireSaveTrip(s);
  if (flights) loadOffers(s);
  if (withHotels) loadHotels(s);
  if (withPlans) loadPlans(s);
  res.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goHome() {
  $('results').hidden = true;
  $('home').hidden = false;
  refreshMaps();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveRecent(s) {
  const key = (r) => JSON.stringify([r.mode, r.origin?.code, r.dest.city, r.start, r.end]);
  state.recent = [s, ...state.recent.filter((r) => key(r) !== key(s))].slice(0, 6);
  store.set('tt.recent', state.recent);
  renderRecent();
}

function renderRecent() {
  const valid = state.recent.filter((r) => r && r.dest && r.pax);
  $('recentBlock').hidden = !valid.length;
  $('recent').innerHTML = valid.map((r, i) => {
    const label = r.mode === 'flights' ? `${r.origin.city} → ${r.dest.city}` : r.dest.city;
    const when = r.start >= todayIso() ? showDate(r.start) : 'fecha pasada';
    return `<button type="button" data-i="${i}">${esc(label)}<small>${esc(when)}</small></button>`;
  }).join('');
}

function restore(r) {
  state.origin = r.origin;
  state.dest = r.dest;
  state.pax = { ...r.pax };
  $('tripType').value = r.mode === 'flights' && !r.end ? 'oneway' : 'round';
  $('optDirect').checked = Boolean(r.direct);
  const expired = r.start < todayIso();
  state.start = expired ? null : r.start;
  state.end = expired ? null : r.end;
  setMode(r.mode);
  if (expired) {
    toast('Esa fecha ya ha pasado. Hay que elegir otra.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    openCal('start');
    return;
  }
  if (validate()) renderResults(snapshot());
}

/* ---------- Ideas de destino y favoritos ---------- */
function heartHtml(code, city) {
  const on = state.favs.includes(code);
  return `<button type="button" class="heart" data-fav="${code}" aria-pressed="${on}" aria-label="Guardar ${esc(city)} en favoritos"><svg class="ic" aria-hidden="true"><use href="#i-heart"/></svg></button>`;
}

/* Galería: al pasar el ratón, cambia de foto cada 2 segundos. */
const GALLERY_MS = 2000;
let galleryTimer = null;
let galleryWrap = null;

function showPhoto(wrap, index) {
  wrap.querySelectorAll('.dest__img img').forEach((img, i) => img.classList.toggle('is-on', i === index));
  wrap.querySelectorAll('.dest__dots i').forEach((dot, i) => dot.classList.toggle('is-on', i === index));
}

function stopGallery() {
  clearInterval(galleryTimer);
  galleryTimer = null;
  if (galleryWrap) showPhoto(galleryWrap, 0);
  galleryWrap = null;
}

function startGallery(wrap) {
  if (galleryWrap === wrap) return;
  stopGallery();
  galleryWrap = wrap;
  const images = [...wrap.querySelectorAll('.dest__img img')];
  images.forEach((img) => { if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src; });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let index = 0;
  galleryTimer = setInterval(() => {
    // Si la siguiente foto aún no ha cargado, se salta para no dejar un hueco.
    for (let step = 1; step < images.length; step += 1) {
      const next = (index + step) % images.length;
      if (images[next].complete && images[next].naturalWidth > 0) {
        index = next;
        showPhoto(wrap, index);
        return;
      }
    }
  }, GALLERY_MS);
}

function initGallery() {
  const grid = $('trending');
  const hasMouse = window.matchMedia('(hover: hover)').matches;
  if (hasMouse) {
    grid.addEventListener('mouseover', (e) => {
      const wrap = e.target.closest('.dest-wrap');
      if (wrap) startGallery(wrap);
    });
    grid.addEventListener('mouseout', (e) => {
      const wrap = e.target.closest('.dest-wrap');
      if (wrap && !wrap.contains(e.relatedTarget)) stopGallery();
    });
  }
  // En pantallas táctiles, las fotos se pasan deslizando el dedo.
  let touch = null;
  let swiped = false;
  grid.addEventListener('touchstart', (e) => {
    const area = e.target.closest('.dest__img');
    if (!area || e.touches.length !== 1) { touch = null; return; }
    area.querySelectorAll('img[data-src]').forEach((img) => { if (!img.getAttribute('src')) img.src = img.dataset.src; });
    touch = { wrap: area.closest('.dest-wrap'), x: e.touches[0].clientX, y: e.touches[0].clientY };
    swiped = false;
  }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (!touch) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - touch.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(end.clientY - touch.y)) {
      const images = [...touch.wrap.querySelectorAll('.dest__img img')];
      const current = images.findIndex((img) => img.classList.contains('is-on'));
      showPhoto(touch.wrap, (current + (dx < 0 ? 1 : -1) + images.length) % images.length);
      swiped = true;
    }
    touch = null;
  }, { passive: true });
  // Deslizar no debe contar como elegir la ciudad.
  grid.addEventListener('click', (e) => {
    if (swiped) {
      swiped = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  grid.addEventListener('focusin', (e) => {
    const wrap = e.target.closest('.dest-wrap');
    if (wrap && e.target.matches(':focus-visible')) startGallery(wrap);
  });
  grid.addEventListener('focusout', (e) => {
    const wrap = e.target.closest('.dest-wrap');
    if (wrap && !wrap.contains(e.relatedTarget)) stopGallery();
  });
}

function renderIdeas() {
  stopGallery();
  $('trendTitle').textContent = 'Ideas de destino';
  $('trendSub').textContent = 'Al pulsar uno, empieza la búsqueda.';
  $('trending').innerHTML = IDEAS.map((code) => {
    const p = PLACES.find((x) => x.code === code);
    return `
      <div class="dest-wrap">
        ${heartHtml(code, p.city)}
        <button type="button" class="dest" data-code="${code}">
          <span class="dest__img" style="display:block">
            <img class="is-on" src="assets/${PHOTOS[code]}.jpg?v=${PHOTOS_VERSION}" alt="" width="640" height="640" loading="lazy" decoding="async">
            ${[2, 3, 4].map((n) => `<img data-src="assets/${PHOTOS[code]}${n}.jpg?v=${PHOTOS_VERSION}" alt="" width="640" height="640" decoding="async">`).join('')}
            <span class="dest__dots" aria-hidden="true"><i class="is-on"></i><i></i><i></i><i></i></span>
          </span>
          <span class="dest__t">${esc(p.city)}</span>
          <span class="dest__s">${esc(p.country)}</span>
        </button>
      </div>`;
  }).join('');
  paintSavedCount();
}

function chooseDestination(code) {
  state.dest = PLACES.find((p) => p.code === code);
  $('dest').value = placeLabel(state.dest);
  $('segDest').classList.remove('is-invalid');
  hideError();
  if ($('dlg').open) $('dlg').close();
  goHome();
  if (state.mode === 'flights' && !state.origin) $('origin').focus();
  else if (!state.start) openCal('start');
}

function toggleFav(code) {
  const i = state.favs.indexOf(code);
  if (i >= 0) state.favs.splice(i, 1);
  else state.favs.push(code);
  store.set('tt.favs', state.favs);
  // Sin volver a dibujar: la foto no salta al guardar en favoritos.
  const on = state.favs.includes(code);
  document.querySelectorAll(`[data-fav="${code}"]`).forEach((b) => b.setAttribute('aria-pressed', String(on)));
  paintSavedCount();
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- Eventos ---------- */
// Si no hay logo de una aerolínea, queda su código sobre el círculo de color.
document.addEventListener('error', (e) => {
  if (e.target.classList?.contains('air__logo') || e.target.classList?.contains('plan__img')) e.target.remove();
}, true);

function init() {
  setupCombo('origin', $('origin'), $('originList'), $('segOrigin'));
  setupCombo('dest', $('dest'), $('destList'), $('segDest'));

  $('optNoFlight').addEventListener('change', (e) => {
    setMode(e.target.checked ? 'stays' : 'flights');
    goHome();
  });

  $('tripType').addEventListener('change', () => {
    if (isOneWay()) state.end = null;
    renderDates();
  });

  $('swapBtn').addEventListener('click', () => {
    const origin = state.origin ?? resolvePlace('origin', $('origin'));
    const dest = state.dest ?? resolvePlace('dest', $('dest'));
    state.origin = dest;
    state.dest = origin;
    $('origin').value = placeLabel(state.origin);
    $('dest').value = placeLabel(state.dest);
  });

  $('segStart').addEventListener('click', () => openCal('start'));
  $('segEnd').addEventListener('click', () => openCal(state.start ? 'end' : 'start'));
  $('segPax').addEventListener('click', openPax);

  $('calPop').addEventListener('click', (e) => {
    e.stopPropagation();
    const day = e.target.closest('[data-d]');
    const nav = e.target.closest('[data-nav]');
    if (day && !day.disabled) {
      pickDay(day.dataset.d);
    } else if (nav && !nav.disabled) {
      const m = state.calMonth;
      state.calMonth = new Date(m.getFullYear(), m.getMonth() + Number(nav.dataset.nav), 1);
      renderCal();
    } else if (e.target.closest('[data-clear]')) {
      state.start = null;
      state.end = null;
      state.calField = 'start';
      renderDates();
      renderCal();
    } else if (e.target.closest('[data-done]')) {
      closePops();
    }
  });

  // Vista previa del rango al pasar el ratón.
  $('calPop').addEventListener('mouseover', (e) => {
    const day = e.target.closest('[data-d]');
    if (!day || !state.start || state.end || isOneWay()) return;
    $('calPop').querySelectorAll('[data-d]').forEach((b) => {
      b.classList.toggle('is-hover', b.dataset.d > state.start && b.dataset.d <= day.dataset.d);
    });
  });

  $('paxPop').addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-step]');
    if (btn && !btn.disabled) {
      const { k, step } = btn.dataset;
      state.pax[k] += Number(step);
      // Cada bebé viaja con un adulto y cada habitación necesita uno.
      state.pax.infants = Math.min(state.pax.infants, state.pax.adults);
      state.pax.rooms = Math.min(state.pax.rooms, state.pax.adults);
      renderPax();
      renderPaxVal();
      const again = $('paxPop').querySelector(`[data-k="${k}"][data-step="${step}"]`);
      (again && !again.disabled ? again : $('paxPop').querySelector('[data-done]')).focus();
    } else if (e.target.closest('[data-done]')) {
      closePops();
      $('segPax').focus();
    }
  });
  $('paxPop').addEventListener('change', (e) => {
    if (e.target.id === 'cabinSel') {
      state.pax.cabin = e.target.value;
      renderPaxVal();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#segStart, #segEnd, #segPax')) closePops();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePops();
  });

  $('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    closePops();
    if (!validate()) return;
    const s = snapshot();
    saveRecent(s);
    renderResults(s);
  });

  $('trending').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      toggleFav(fav.dataset.fav);
      return;
    }
    const dest = e.target.closest('[data-code]');
    if (dest) {
      e.stopPropagation();
      chooseDestination(dest.dataset.code);
    }
  });

  $('recent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) {
      e.stopPropagation();
      restore(state.recent.filter((r) => r && r.dest && r.pax)[Number(b.dataset.i)]);
    }
  });

  $('dlg').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    const unfav = e.target.closest('[data-unfav]');
    if (pick) {
      e.stopPropagation();
      chooseDestination(pick.dataset.pick);
    } else if (unfav) {
      toggleFav(unfav.dataset.unfav);
      renderSaved();
    } else if (e.target.closest('[data-close]') || (e.target === $('dlg') && !$('dlg').querySelector('[data-recovery-code]'))) {
      $('dlg').close();
    }
  });

  setMode('flights');
  renderRecent();
  initGallery();
  initExplore();
  initAccount();
}

init();
