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
const PHOTOS_VERSION = 3;
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
  stops: [],
};

const isOneWay = () => state.mode === 'flights' && $('tripType').value === 'oneway';
const isMulti = () => state.mode === 'flights' && $('tripType').value === 'multi';

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

/* Los más buscados van escritos arriba; el resto de aeropuertos del mundo se carga aparte. */
fetch('vendor/aeropuertos.json').then((r) => (r.ok ? r.json() : [])).then((rows) => {
  const known = new Set(PLACES.map((p) => p.code));
  rows.forEach(([code, city, country, airport]) => {
    if (!known.has(code)) PLACES.push({ code, city, country, airport });
  });
}).catch(() => {});

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
    items = typed ? searchPlaces(text).slice(0, 30) : PLACES.slice(0, 6);
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
  document.querySelectorAll('.multi .is-invalid').forEach((el) => el.classList.remove('is-invalid'));
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
  return !isMulti() || validateStops();
}

function validateStops() {
  let previousPlace = state.dest;
  let previousDate = state.start;
  for (const stop of state.stops) {
    const row = $(`row-${stop.key}`);
    const input = row.querySelector('input[type=text]');
    state[stop.key] = resolvePlace(stop.key, input);
    if (!state[stop.key]) {
      fail(`seg-${stop.key}`, input.value.trim() ? 'Hay que elegir cada destino de la lista.' : 'Falta uno de los destinos. Se puede quitar con la X.');
      return false;
    }
    input.value = placeLabel(state[stop.key]);
    if (state[stop.key].code === previousPlace.code) {
      fail(`seg-${stop.key}`, 'Dos destinos seguidos no pueden ser el mismo.');
      return false;
    }
    if (!stop.date || stop.date <= previousDate) {
      fail(`seg-${stop.key}`, `Falta la fecha de ${state[stop.key].city}, que debe ser posterior a la del destino anterior.`);
      return false;
    }
    if (stop.date >= state.end) {
      fail('segEnd', 'La vuelta debe ser posterior a la llegada al último destino.');
      return false;
    }
    previousPlace = state[stop.key];
    previousDate = stop.date;
  }
  return true;
}

/* ---------- Varios destinos: filas del buscador ---------- */
const MAX_EXTRA_STOPS = 4;
let stopCounter = 0;

function addStopRow() {
  if (state.stops.length >= MAX_EXTRA_STOPS) return;
  stopCounter += 1;
  const key = `stop${stopCounter}`;
  const row = document.createElement('div');
  row.className = 'multi__row';
  row.id = `row-${key}`;
  row.innerHTML = `
    <div class="seg seg--text" id="seg-${key}">
      <label class="seg__l" for="${key}">Siguiente destino</label>
      <input id="${key}" class="seg__in" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${key}List" placeholder="País, ciudad o aeropuerto">
      <ul id="${key}List" class="sug" role="listbox" hidden></ul>
    </div>
    <div class="seg">
      <label class="seg__l" for="${key}Date">Fecha del vuelo</label>
      <input id="${key}Date" class="seg__in" type="date" min="${todayIso()}" max="${maxIso()}">
    </div>
    <button type="button" class="multi__del" aria-label="Quitar este destino">×</button>`;
  $('multiRows').append(row);
  const stop = { key, date: null };
  state[key] = null;
  state.stops.push(stop);
  setupCombo(key, row.querySelector(`#${key}`), row.querySelector(`#${key}List`), row.querySelector(`#seg-${key}`));
  row.querySelector(`#${key}Date`).addEventListener('change', (e) => { stop.date = e.target.value || null; hideError(); });
  row.querySelector('.multi__del').addEventListener('click', () => {
    row.remove();
    state.stops = state.stops.filter((x) => x !== stop);
    delete state[key];
    if (!state.stops.length) { $('tripType').value = 'round'; syncMulti(); }
    paintMultiAdd();
  });
  paintMultiAdd();
}

function paintMultiAdd() {
  $('multiAdd').hidden = state.stops.length >= MAX_EXTRA_STOPS;
}

function syncMulti() {
  const on = $('tripType').value === 'multi';
  $('multiBox').hidden = !on;
  if (on && !state.stops.length) addStopRow();
}

function snapshot() {
  return {
    ...(isMulti() ? { stops: state.stops.map((stop) => ({ place: state[stop.key], date: stop.date })) } : {}),
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
        ${compareOfferButton(o)}
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
        + fieldsetHtml('Nota de viajeros', optHtml('radio', 'h_rate', '0', 'Cualquiera', hotels.length, true)
          + [4, 4.5].map((n) => optHtml('radio', 'h_rate', n, `${String(n).replace('.', ',')} o más`, count((h) => h.rating >= n))).join(''))
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
          <span class="transit-favs" data-transit-favs></span>
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
        <p class="legal">Datos de alojamientos: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>. Precios y notas: <a href="https://xotelo.com" target="_blank" rel="noopener">Xotelo</a>, con datos de TripAdvisor.</p>
      </div>
    </div>`;

  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  // Pocas opiniones pesan menos: un 5 con 20 opiniones no debe ganar a un 4,8 con 5.000.
  const trust = (h) => (h.rating ? (h.rating * (h.reviews || 0) + 3.8 * 100) / ((h.reviews || 0) + 100) : 0);
  const order = (a, b) => Boolean(b.key) - Boolean(a.key) || trust(b) - trust(a) || b.stars - a.stars || byName(a, b);
  const state = { step: HOTELS_STEP, limit: HOTELS_STEP };

  const draw = () => {
    const form = el.querySelector('form');
    const chosen = new Set([...form.querySelectorAll('[name=h_kind]:checked')].map((i) => i.value));
    const minStars = Number(form.elements.h_stars.value);
    const needsPrice = form.elements.h_price.checked;
    const minRate = Number(form.elements.h_rate.value);
    const rows = hotels
      .filter((h) => chosen.has(h.kind || 'Alojamiento') && h.stars >= minStars && (!needsPrice || h.key) && (!minRate || h.rating >= minRate))
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
    const compareButton = e.target.closest('[data-compare-stay]');
    if (compareButton) {
      const chosen = hotels.find((h) => h.name === compareButton.dataset.compareStay);
      if (chosen) toggleCompareStay(chosen, s, compareButton, center);
      return;
    }
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
const account = { user: null, unread: 0, saved: [], afterLogin: null, insights: false, guest: store.get('tt.guest', false) };

/* Invitado: lo guardado se queda en este navegador y nunca se envía al servidor. */
const guestItems = () => store.get('tt.guest.saved', []);
const setGuestItems = (items) => store.set('tt.guest.saved', items);

function startGuest() {
  account.guest = true;
  store.set('tt.guest', true);
  account.saved = guestItems();
  $('dlg').close();
  paintAccount();
  paintSavedMarks();
  toast('Modo invitado: lo guardado se queda solo en este dispositivo.');
  const next = account.afterLogin;
  account.afterLogin = null;
  if (next) next();
}

function stopGuest() {
  account.guest = false;
  store.set('tt.guest', false);
  account.saved = [];
}

/* Guarda o quita algo, en la cuenta o en el dispositivo según quién esté usando la web. */
async function addSaved(kind, data) {
  if (account.user) {
    const { item } = await api('/api/saved', { kind, data });
    account.saved.unshift(item);
    return item;
  }
  const item = { id: Date.now() + Math.floor(Math.random() * 1000), kind, data, lastPrice: null, checkedAt: null };
  account.saved.unshift(item);
  setGuestItems(account.saved);
  return item;
}

async function removeSaved(id) {
  if (account.user) await api('/api/saved/delete', { id });
  account.saved = account.saved.filter((x) => x.id !== id);
  if (!account.user) setGuestItems(account.saved);
}

/* Al entrar con una cuenta se ofrece mover lo guardado como invitado. */
function renderMoveGuest() {
  const count = guestItems().length;
  $('dlg').innerHTML = `
    <h3>Mover lo guardado a la cuenta</h3>
    <p class="muted">En este dispositivo hay ${esc(plural(count, 'elemento guardado', 'elementos guardados'))} como invitado. Se pueden mover a la cuenta para verlos en cualquier dispositivo y recibir avisos de precio.</p>
    <p class="search__err" data-error role="alert" hidden></p>
    <div class="dlg__actions authform__switch">
      <button type="button" class="btn" data-guest-move>Mover a la cuenta</button>
      <button type="button" class="btn btn--out" data-guest-keep>Dejarlos en este dispositivo</button>
    </div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

async function moveGuestItems() {
  const left = [];
  let moved = 0;
  let lastError = '';
  for (const item of guestItems()) {
    try {
      await api('/api/saved', { kind: item.kind, data: item.data });
      moved += 1;
    } catch (error) {
      left.push(item);
      lastError = error.message;
    }
  }
  // Solo se borra del dispositivo lo que la cuenta ya tiene.
  setGuestItems(left);
  await refreshAccount();
  paintSavedMarks();
  return { moved, left: left.length, lastError };
}

/* Tras entrar o crear una cuenta: primero mover lo de invitado y luego seguir con lo que se estaba haciendo. */
function afterSignIn() {
  account.guest = false;
  store.set('tt.guest', false);
  paintSavedMarks();
  if (guestItems().length) {
    renderMoveGuest();
    return;
  }
  $('dlg').close();
  const next = account.afterLogin;
  account.afterLogin = null;
  if (next) next();
}

function paintSavedMarks() {
  if ($('results').hidden) return;
  document.querySelectorAll('[data-save-stay]').forEach((b) => {
    const rows = cityMap.hotels || [];
    const hotel = rows.find((h) => h.name === b.dataset.saveStay);
    if (hotel && cityMap.s) b.textContent = stayIsSaved(hotel, cityMap.s) ? 'Guardado ✓' : 'Guardar';
  });
  document.querySelectorAll('[data-save-plan]').forEach((b) => {
    const city = planMap.trip?.dest.city;
    b.textContent = city && findActivity({ name: b.dataset.savePlan }, city) ? 'Guardado ✓' : 'Guardar';
  });
  if (saveTripCurrent) paintSaveTrip(saveTripCurrent);
  paintTransitFavorites();
}

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
const findActivity = (a, city) => account.saved.find((x) => x.kind === 'activity' && x.data.name === a.name && x.data.city === city);

async function toggleActivity(a, s, button) {
  if (!canSave(() => toggleActivity(a, s, button))) return;
  const city = s.dest.city;
  const current = findActivity(a, city);
  try {
    if (current) {
      await removeSaved(current.id);
    } else {
      const data = { name: a.name, type: a.kind, city, country: s.dest.country || '', lat: a.lat, lon: a.lon, website: a.website || '' };
      await addSaved('activity', data);
      toast(account.user ? 'Actividad guardada.' : 'Actividad guardada en este dispositivo.');
    }
    paintSavedCount();
    const label = findActivity(a, city) ? 'Guardado ✓' : 'Guardar';
    document.querySelectorAll('[data-save-plan]').forEach((b) => { if (b.dataset.savePlan === a.name) b.textContent = label; });
    if (button) button.textContent = label;
    paintTransitFavorites();
  } catch (error) {
    toast(error.message);
  }
}

function askLogin(next, notice, guestAllowed) {
  account.afterLogin = next;
  renderAuth('login', notice, guestAllowed);
  if (!$('dlg').open) $('dlg').showModal();
  return false;
}

/* Para lo que solo funciona con cuenta: los avisos de precio. */
const requireLogin = (next, notice = 'Hace falta una cuenta para esto.') => account.user || askLogin(next, notice, false);
/* Para guardar: vale con cuenta o como invitado. */
const canSave = (next) => account.user || account.guest || askLogin(next, 'Para guardar hay que entrar o continuar como invitado.', true);

function paintSaveTrip(s) {
  const b = $('saveTrip');
  if (b) b.textContent = findTrip(s) ? 'Guardado ✓' : (account.guest ? 'Guardar' : 'Guardar y recibir avisos');
}

async function toggleTrip(s) {
  if (!canSave(() => toggleTrip(s))) return;
  const current = findTrip(s);
  try {
    if (current) {
      await removeSaved(current.id);
      toast('Viaje quitado de guardados.');
    } else {
      const item = await addSaved('flight', tripPayload(s));
      if (!account.user) toast('Guardado en este dispositivo. Los avisos de precio necesitan una cuenta.');
      else toast(item.lastPrice === null ? 'Guardado. Aún no hay precio con el que comparar.' : `Guardado. Se enviará un aviso si cambia desde ${money(item.lastPrice)}.`);
    }
    paintSavedCount();
    paintSaveTrip(s);
  } catch (error) {
    toast(error.message);
  }
}

let saveTripCurrent = null;

function wireSaveTrip(s) {
  saveTripCurrent = s;
  paintSaveTrip(s);
  $('saveTrip').addEventListener('click', () => toggleTrip(s));
}

async function toggleStay(h, s, button) {
  if (!canSave(() => toggleStay(h, s, button))) return;
  const current = findStay(h, s);
  try {
    if (current) {
      await removeSaved(current.id);
    } else {
      const data = { name: h.name, key: h.key || '', lodging: h.kind || 'Alojamiento', stars: h.stars, address: h.address, website: h.website, lat: h.lat, lon: h.lon, dest: placeOut({ ...s.dest, code: s.dest.code || '' }), start: s.start, end: s.end, pax: s.pax };
      await addSaved('stay', data);
      toast(account.user ? 'Alojamiento guardado.' : 'Alojamiento guardado en este dispositivo.');
    }
    button.textContent = findStay(h, s) ? 'Guardado ✓' : 'Guardar';
    paintSavedCount();
    paintTransitFavorites();
  } catch (error) {
    toast(error.message);
  }
}

function paintAccount() {
  $('accountLabel').textContent = account.user ? 'Cuenta' : (account.guest ? 'Invitado' : 'Entrar');
  $('accountBtn').setAttribute('aria-label', account.user ? 'Cuenta' : (account.guest ? 'Modo invitado' : 'Iniciar sesión'));
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
    if (me.user) account.saved = (await api('/api/saved')).saved;
    else account.saved = account.guest ? guestItems() : [];
  } catch {
    // Sin servidor de cuentas la web sigue funcionando para buscar, y lo de invitado sigue aquí.
    if (!account.user && account.guest) account.saved = guestItems();
  }
  paintAccount();
}

function renderGuest() {
  const count = guestItems().length;
  $('dlg').innerHTML = `
    <h3>Modo invitado</h3>
    <p class="muted">Lo guardado se queda solo en este dispositivo y en este navegador: no se envía a TopTravel. Si se borran los datos del navegador, se pierde. Hay ${esc(plural(count, 'elemento guardado', 'elementos guardados'))}.</p>
    <p class="muted">Con una cuenta se puede ver desde cualquier dispositivo, recibir avisos de precio. Al entrar, se ofrece mover lo guardado a la cuenta.</p>
    <div class="dlg__actions authform__switch">
      <button type="button" class="btn" data-auth-switch="login">Iniciar sesión</button>
      <button type="button" class="btn btn--out" data-auth-switch="register">Crear cuenta</button>
      <button type="button" class="linkbtn" data-close>Cerrar</button>
    </div>
    <details class="account__danger">
      <summary>Salir del modo invitado y borrar lo guardado</summary>
      <p class="muted authform__note">Se borra lo guardado como invitado en este dispositivo. No se puede deshacer.</p>
      <button type="button" class="btn btn--out btn--block" data-guest-delete>Borrar y salir</button>
    </details>`;
}

function renderAuth(mode, notice = '', guestAllowed = true) {
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
    ${guestAllowed && !account.guest ? `<button type="button" class="btn btn--out btn--block authform__guest" data-guest-start>Continuar como invitado</button>
    <p class="muted authform__note">Sin cuenta: lo guardado se queda solo en este dispositivo.</p>` : ''}
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

let savedTab = 'flights';

function renderSaved() {
  const places = state.favs.map((code) => PLACES.find((p) => p.code === code)).filter(Boolean);
  const placeRows = places.map((p) => `
    <li>
      <span>${esc(p.city)}<small>${esc(p.country)}</small></span>
      <span class="saved__acts"><button type="button" class="btn btn--out" data-pick="${p.code}">Buscar</button><button type="button" class="linkbtn" data-unfav="${p.code}">Quitar</button></span>
    </li>`).join('');
  const flights = account.saved.filter((x) => x.kind === 'flight');
  const stays = account.saved.filter((x) => x.kind === 'stay');
  const activities = account.saved.filter((x) => x.kind === 'activity');
  const activityRows = activities.map((x) => `
    <li>
      <span>${esc(x.data.name)}<small>${esc(PLAN_KIND_ONE[x.data.type] || 'Actividad')} · ${esc(x.data.city)}</small></span>
      <span class="saved__acts"><a class="btn btn--out" href="${esc(googleLink(x.data, x.data.city))}" target="_blank" rel="noopener">Ver en Google</a>${x.data.website ? `<a class="btn btn--out" href="${esc(x.data.website)}" target="_blank" rel="noopener nofollow">Web</a>` : ''}<button type="button" class="linkbtn" data-remove-saved="${x.id}">Quitar</button></span>
    </li>`).join('');
  const flightRows = (list) => list.map((x) => `
    <li>
      <span>${esc(x.data.origin.city)} → ${esc(x.data.dest.city)}<small>${esc(datesText(x.data.start, x.data.end))} · ${x.lastPrice === null ? 'sin precio aún' : `último precio ${esc(money(x.lastPrice))}`}</small></span>
      <span class="saved__acts">${account.insights ? `<button type="button" class="btn btn--out" data-history="${x.id}">Evolución</button>` : ''}<button type="button" class="btn btn--out" data-open-saved="${x.id}">Ver</button><button type="button" class="linkbtn" data-remove-saved="${x.id}">Quitar</button></span>
      <div class="history" data-history-box hidden></div>
    </li>`).join('');
  const stayRows = (list) => list.map((x) => `
    <li>
      <span>${esc(x.data.name)}<small>${esc(x.data.dest.city)} · ${esc(datesText(x.data.start, x.data.end))}</small></span>
      <span class="saved__acts">${account.insights ? `<button type="button" class="btn btn--out" data-history="${x.id}">Evolución</button>` : ''}<button type="button" class="btn btn--out" data-open-saved="${x.id}">Ver</button><button type="button" class="linkbtn" data-remove-saved="${x.id}">Quitar</button></span>
      <div class="history" data-history-box hidden></div>
    </li>`).join('');
  const tabs = [
    ['flights', 'Vuelos', flights.length, flightRows(flights), 'Los vuelos se guardan desde los resultados de búsqueda.'],
    ['stays', 'Alojamiento', stays.length, stayRows(stays), 'Los alojamientos se guardan desde su tarjeta en los resultados.'],
    ['activities', 'Actividades', activities.length, activityRows, 'Las actividades se guardan desde el apartado de planes.'],
  ];
  $('dlg').innerHTML = `
    <h3>Guardados</h3>
    ${account.insights ? '<p class="muted authform__note">Cada vuelo y alojamiento guardado tiene un gráfico con la evolución de su precio y una recomendación de cuándo comprar.</p>' : ''}
    ${places.length ? `<h4 class="dlg__sub">Destinos</h4><ul class="favs">${placeRows}</ul>` : ''}
    <div class="savedtabs" role="tablist" aria-label="Apartados de guardados">
      ${tabs.map(([id, label, count]) => `<button type="button" role="tab" class="savedtab${id === savedTab ? ' is-on' : ''}" data-saved-tab="${id}" aria-selected="${id === savedTab}">${esc(label)} <em>${count}</em></button>`).join('')}
    </div>
    ${tabs.map(([id, , count, rows, empty]) => `<div data-saved-panel="${id}"${id === savedTab ? '' : ' hidden'}>${count ? `<ul class="favs">${rows}</ul>` : `<p class="muted">${esc(empty)}</p>`}</div>`).join('')}
    ${account.guest && !account.user ? '<p class="muted authform__note" style="margin-top:12px">Modo invitado: esto se guarda solo en este dispositivo.</p>' : ''}
    ${account.user || account.guest ? '' : '<p class="muted authform__note" style="margin-top:12px">Para guardar vuelos, alojamientos y actividades hay que entrar o continuar como invitado. <button type="button" class="linkbtn" data-auth-switch="login">Iniciar sesión</button></p>'}
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
    document.querySelectorAll('[data-save-stay], [data-save-plan]').forEach((b) => { b.textContent = 'Guardar'; });
    paintTransitFavorites();
    const save = $('saveTrip');
    if (save) save.textContent = 'Guardar y recibir avisos';
  }
}

function initAccount() {
  const dlg = $('dlg');
  $('accountBtn').addEventListener('click', () => {
    if (account.user) renderAccount();
    else if (account.guest) renderGuest();
    else renderAuth('login');
    dlg.showModal();
  });
  $('savedBtn').addEventListener('click', () => {
    renderSaved();
    dlg.showModal();
  });
  $('alertsBtn').addEventListener('click', () => {
    if (!requireLogin(() => { $('dlg').showModal(); renderAlerts(); }, 'Los avisos de precio necesitan una cuenta.')) return;
    dlg.showModal();
    renderAlerts();
  });

  dlg.addEventListener('click', async (e) => {
    const change = e.target.closest('[data-auth-switch]');
    const open = e.target.closest('[data-open-saved]');
    const remove = e.target.closest('[data-remove-saved]');
    if (change) renderAuth(change.dataset.authSwitch);
    if (e.target.closest('[data-guest-start]')) startGuest();
    if (e.target.closest('[data-guest-delete]')) {
      setGuestItems([]);
      stopGuest();
      dlg.close();
      paintAccount();
      paintSavedMarks();
      toast('Datos de invitado borrados.');
    }
    if (e.target.closest('[data-guest-keep]')) {
      dlg.close();
      toast('Se quedan en este dispositivo. Se volverá a preguntar al entrar.');
      const next = account.afterLogin;
      account.afterLogin = null;
      if (next) next();
    }
    if (e.target.closest('[data-guest-move]')) {
      const button = e.target.closest('[data-guest-move]');
      button.disabled = true;
      const { moved, left, lastError } = await moveGuestItems();
      if (left) {
        renderMoveGuest();
        const error = dlg.querySelector('[data-error]');
        error.textContent = `Se ${moved === 1 ? 'ha movido 1' : `han movido ${moved}`}, pero ${left === 1 ? 'queda 1' : `quedan ${left}`} en este dispositivo. ${lastError}`;
        error.hidden = false;
        return;
      }
      dlg.close();
      toast(`${plural(moved, 'elemento movido', 'elementos movidos')} a la cuenta.`);
      const next = account.afterLogin;
      account.afterLogin = null;
      if (next) next();
    }
    if (e.target.closest('[data-auth-recover]')) renderRecover();
    const history = e.target.closest('[data-history]');
    if (history) toggleHistory(history);
    if (e.target.closest('[data-copy-code]')) {
      const text = dlg.querySelector('[data-recovery-code]').textContent;
      navigator.clipboard?.writeText(text).then(() => toast('Código copiado.')).catch(() => toast('No se ha podido copiar. Hay que copiarlo a mano.'));
    }
    if (e.target.closest('[data-recovery-done]')) afterSignIn();
    if (open) openSaved(Number(open.dataset.openSaved));
    if (remove) {
      const id = Number(remove.dataset.removeSaved);
      try {
        await removeSaved(id);
        renderSaved();
        paintSavedMarks();
        paintTransitFavorites();
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
        toast('Sesión iniciada.');
        afterSignIn();
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
    const opener = { '#comparar': 'compareBtn', '#guardados': 'savedBtn', '#avisos': 'alertsBtn', '#cuenta': 'accountBtn' }[location.hash];
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
    ${hotelRating(h)}
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
    cityMap.favorites = L.layerGroup();
    cityMap.prices = L.layerGroup().addTo(cityMap.map);
  }
  cityMap.hotels = hotels;
  cityMap.s = s;
  cityMap.map.invalidateSize();
  cityMap.prices.clearLayers();
  cityMap.markers = new Map();
  // Cada precio es una consulta: el mapa enseña los mejor valorados, y el resto está en la lista.
  const points = rows.filter((h) => h.key && typeof h.lat === 'number' && typeof h.lon === 'number').slice(0, MAX_RATE_REQUESTS);
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
      ? `${plural(points.length, 'alojamiento', 'alojamientos')} con precio en el mapa, por noche y por persona.${missing > 0 ? ` ${plural(missing, 'otro', 'otros')} en la lista.` : ''}`
      : 'Todavía no hay alojamientos con precio en el mapa de esta ciudad. Los mapas de monumentos y transporte sí están disponibles.');
  }
}

/* En el mapa de transporte solo salen los alojamientos y actividades guardados de esta ciudad. */
function paintTransitFavorites() {
  const { favorites, s, map, el } = cityMap;
  if (!favorites || !map || !s) return;
  favorites.clearLayers();
  const city = s.dest.city;
  const known = cityMap.hotels || [];
  const rows = account.saved.flatMap((x) => {
    if (x.kind === 'activity' && x.data.city === city) return [{ name: x.data.name, sub: PLAN_KIND_ONE[x.data.type] || 'Actividad', lat: x.data.lat, lon: x.data.lon, web: x.data.website, type: 'activity' }];
    if (x.kind === 'stay' && x.data.dest.city === city) {
      const hotel = known.find((h) => h.name === x.data.name);
      return [{ name: x.data.name, sub: x.data.lodging || 'Alojamiento', lat: x.data.lat ?? hotel?.lat, lon: x.data.lon ?? hotel?.lon, web: x.data.website, type: 'stay' }];
    }
    return [];
  }).filter((f) => typeof f.lat === 'number' && typeof f.lon === 'number');
  rows.forEach((f) => {
    const icon = L.divIcon({ className: `pin-fav pin-fav--${f.type}`, html: '★', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([f.lat, f.lon], { icon, title: f.name, alt: f.name, zIndexOffset: 500 })
      .bindPopup(`<b class="map__title">${esc(f.name)}</b><span class="map__sub">${esc(f.sub)} · Guardado</span>${f.web ? `<a class="btn btn--out" href="${esc(f.web)}" target="_blank" rel="noopener nofollow">Web oficial</a>` : ''}`, { maxWidth: 270 })
      .addTo(favorites);
  });
  const note = el?.closest('.layout__main')?.querySelector('[data-transit-favs]');
  if (note) {
    note.textContent = rows.length
      ? `${plural(rows.length, 'guardado', 'guardados')} de ${city} en el mapa.`
      : `Aquí solo salen los alojamientos y actividades guardados de ${city}. Todavía no hay ninguno.`;
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
  [prices, monuments, cityMap.favorites, transit.bus, transit.tram, transit.metro].forEach((layer) => map.removeLayer(layer));
  root.querySelector('[data-transit-kinds]').hidden = mode !== 'transit';
  if (mode === 'prices') {
    prices.addTo(map);
    mapNote(root, `${plural(cityMap.markers.size, 'alojamiento', 'alojamientos')} con precio en el mapa, por noche y por persona.`);
    return;
  }
  if (mode === 'transit') {
    cityMap.favorites.addTo(map);
    paintTransitFavorites();
    showTransitKinds(root);
    await loadTransit(root);
    return;
  }
  monuments.addTo(map);
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
  syncMulti();
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

/* La nota media de viajeros que da Xotelo. Al pulsarla se abren las opiniones en TripAdvisor. */
function hotelRating(h) {
  if (!h.rating) return '';
  const text = `<b>${esc(String(h.rating).replace('.', ','))}/5</b>${h.reviews ? `<small>${esc(plural(h.reviews, 'opinión', 'opiniones').replace(/^(\d+)/, (n) => Number(n).toLocaleString('es-ES')))}</small>` : ''}`;
  return h.url
    ? `<a class="note" href="${esc(h.url)}" target="_blank" rel="noopener nofollow">${text}<span class="sr"> Ver las opiniones en TripAdvisor, en una pestaña nueva</span></a>`
    : `<span class="note">${text}</span>`;
}

function hotelHtml(h, s) {
  const stars = h.stars ? ' · ' + '★'.repeat(h.stars) : '';
  const booking = linkBooking({ ...s, dest: { city: `${h.name}, ${s.dest.city}`, country: '' } });
  return `
    <article class="card hotel">
      <div class="hotel__body">
        <span class="stay__type">${esc(h.kind || 'Alojamiento')}${stars}</span>
        <h3 class="stay__name">${esc(h.name)}</h3>
        ${hotelRating(h)}
        ${h.address ? `<span class="stay__loc"><span>${esc(h.address)}</span></span>` : ''}
        ${kmHtml(h)}
        ${h.key ? `<div class="rates" data-rates="${esc(h.key)}">Buscando precios…</div>` : '<div class="rates rates--none">Sin precio disponible para este alojamiento.</div>'}
      </div>
      <div class="hotel__buy">
        ${h.website ? `<a class="btn" href="${esc(h.website)}" target="_blank" rel="noopener nofollow">Web oficial<span class="sr"> (se abre en una pestaña nueva)</span></a>` : ''}
        <a class="btn ${h.website ? 'btn--out' : ''}" href="${esc(booking)}" target="_blank" rel="noopener">Ver precio en Booking<span class="sr"> (se abre en una pestaña nueva)</span></a>
        <button type="button" class="linkbtn" data-save-stay="${esc(h.name)}">${stayIsSaved(h, s) ? 'Guardado ✓' : 'Guardar'}</button>
        <button type="button" class="linkbtn" data-compare-stay="${esc(h.name)}" aria-pressed="${inCompare('stays', stayCompareId(h, s))}">${compareLabel('stays', stayCompareId(h, s))}</button>
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
    planMap.hotels = body.hotels;
    planMap.hotelsTrip = s;
    paintPlanHotels();
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
  el.innerHTML = `<b>${both ? `${s.leg ? 'Esta parada' : 'Viaje completo'} desde ${esc(money(flight + night * stay))} por persona` : 'Precio orientativo por persona'}</b>
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
// Grupos del mapa: cada uno enciende o apaga varios tipos de plan a la vez.
const PLAN_GROUPS = [
  { id: 'ver', label: 'Monumentos y museos', color: '#d35400', kinds: ['monumento', 'museo', 'sitio', 'cultura', 'arte', 'mirador'] },
  { id: 'salir', label: 'Bares y discotecas', color: '#8e3b8a', kinds: ['bar', 'discoteca'] },
  { id: 'comer', label: 'Restaurantes y cafeterías', color: '#b8860b', kinds: ['restaurante', 'cafeteria'] },
  { id: 'aire', label: 'Parques y playas', color: '#2e9e4f', kinds: ['naturaleza', 'playa'] },
  { id: 'ocio', label: 'Ocio y mercados', color: '#1f78b4', kinds: ['espectaculo', 'ocio', 'familiar', 'mercado'] },
];
const planColor = (kind) => (PLAN_GROUPS.find((g) => g.kinds.includes(kind)) || PLAN_GROUPS[0]).color;
const planMap = { map: null, plans: null, hotelsLayer: null, center: null, hotels: null, hotelsTrip: null, trip: null };

function planPopup(a, city) {
  const price = a.free === true ? 'Gratis' : (a.free === false ? 'De pago' : 'Precio sin confirmar');
  return `${a.image ? `<img class="map__photo" src="${esc(a.image)}" alt="" width="240" height="160" loading="lazy">` : ''}
    <b class="map__title">${esc(a.name)}</b>
    <span class="map__sub">${esc(PLAN_KIND_ONE[a.kind] || 'Plan')} · ${esc(price)}</span>
    <a class="btn btn--out" href="${esc(googleLink(a, city))}" target="_blank" rel="noopener">Ver en Google</a>
    ${kmHtml(a)}
    ${a.website ? `<a class="btn btn--out" href="${esc(a.website)}" target="_blank" rel="noopener nofollow">Web oficial</a>` : ''}
    <button type="button" class="btn" data-save-plan="${esc(a.name)}">${findActivity(a, city) ? 'Guardado ✓' : 'Guardar'}</button>`;
}

function paintPlanHotels() {
  const { hotelsLayer, hotels, hotelsTrip } = planMap;
  if (!hotelsLayer || !hotels) return;
  hotelsLayer.clearLayers();
  const from = planMap.center ? L.latLng(planMap.center.lat, planMap.center.lon) : null;
  hotels.filter((h) => typeof h.lat === 'number' && typeof h.lon === 'number').slice(0, 300).forEach((h) => {
    if (from) h.km = from.distanceTo([h.lat, h.lon]) / 1000;
    const icon = L.divIcon({ className: 'pin-hotel', iconSize: [9, 9], iconAnchor: [4, 4] });
    L.marker([h.lat, h.lon], { icon, title: h.name, alt: h.name })
      .bindPopup(() => hotelPopup(h, hotelsTrip, rateCache.get(rateId(h.key, hotelsTrip))), { maxWidth: 270, minWidth: 230 })
      .addTo(hotelsLayer);
  });
}

function drawPlanMap(rows, city, frame) {
  const { map, plans } = planMap;
  if (!map) return;
  plans.clearLayers();
  planMap.dots = planMap.dots || L.canvas({ tolerance: 5 });
  rows.forEach((a) => {
    L.circleMarker([a.lat, a.lon], { renderer: planMap.dots, radius: 6, color: '#fff', weight: 1.5, fillColor: planColor(a.kind), fillOpacity: 0.95 })
      .bindTooltip(a.name)
      .bindPopup(() => planPopup(a, city), { maxWidth: 270, minWidth: 230 })
      .on('popupopen', (e) => {
        // Leaflet no deja que los clics de un globo lleguen a la página: se atiende aquí.
        e.popup.getElement().querySelector('[data-save-plan]')?.addEventListener('click', (click) => toggleActivity(a, planMap.trip, click.currentTarget));
      })
      .addTo(plans);
  });
  if (frame && rows.length) map.fitBounds(L.latLngBounds(rows.map((a) => [a.lat, a.lon])), { padding: [24, 24], maxZoom: 15 });
}

function setupPlanMap(el, center) {
  const box = el.querySelector('[data-plan-map]');
  if (!center || !hasMaps()) {
    el.querySelector('[data-plan-map-block]').hidden = true;
    planMap.map = null;
    return;
  }
  if (planMap.map) planMap.map.remove();
  planMap.map = newMap(box);
  planMap.center = center;
  planMap.map.setView([center.lat, center.lon], 13);
  planMap.plans = L.layerGroup().addTo(planMap.map);
  planMap.hotelsLayer = L.layerGroup();
  planMap.dots = null;
  L.circleMarker([center.lat, center.lon], { radius: 4, color: '#fff', weight: 2, fillColor: '#3a2314', fillOpacity: 1, interactive: false }).addTo(planMap.map);
  paintPlanHotels();
}

const googleLink = (a, city) => `https://www.google.com/maps/search/?${new URLSearchParams({ api: 1, query: `${a.name}, ${city}` })}`;

function planHtml(a, city) {
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
        <a class="btn btn--out" href="${esc(googleLink(a, city))}" target="_blank" rel="noopener">Ver en Google<span class="sr"> (se abre en una pestaña nueva)</span></a>
        ${a.website ? `<a class="linkbtn" href="${esc(a.website)}" target="_blank" rel="noopener nofollow">Web oficial<span class="sr"> (se abre en una pestaña nueva)</span></a>` : ''}
        <button type="button" class="linkbtn" data-save-plan="${esc(a.name)}">${findActivity(a, city) ? 'Guardado ✓' : 'Guardar'}</button>
      </div>
    </article>`;
}

function renderPlans(el, items, city, center, s) {
  planMap.trip = s;
  const count = (fn) => items.filter(fn).length;
  const groups = PLAN_GROUPS.filter((g) => items.some((a) => g.kinds.includes(a.kind)));
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
        + fieldsetHtml('Accesibilidad', optHtml('checkbox', 'p_wheel', '1', 'Accesible en silla de ruedas', count((a) => a.wheelchair === 'yes')))
        + fieldsetHtml('Sitios poco conocidos', optHtml('checkbox', 'p_gem', '1', 'Solo poco conocidos', count((a) => a.gem))),
      )}
      <div class="layout__main">
        <div data-plan-map-block>
          <div class="plan-layers" role="group" aria-label="Qué ver en el mapa">
            ${groups.map((g) => `<label class="plan-layer"><input type="checkbox" data-group="${g.id}" checked><i style="background:${g.color}"></i>${esc(g.label)}</label>`).join('')}
            <label class="plan-layer"><input type="checkbox" data-overlay="hotels"><i class="plan-layer__hotel"></i>Alojamientos</label>
          </div>
          <div class="map map--city" data-plan-map role="region" aria-label="Mapa de planes"></div>
          <p class="map__note" data-plan-note role="status"></p>
          <p class="count">El mapa y la lista muestran lo mismo: los filtros cambian los dos.</p>
        </div>
        ${sortbarHtml([{ id: 'near', label: 'Más cerca' }, { id: 'known', label: 'Más conocidos' }])}
        <p class="count" data-count></p>
        <div class="list" data-results></div>
        <button type="button" class="btn btn--out btn--block more">Ver más planes</button>
        <p class="count">El precio, el presupuesto y el tipo de plan son orientativos: si el sitio no lo indica, se deducen de su tipo. «Poco conocido» significa que no tiene ficha en Wikipedia ni en Wikidata. Conviene confirmar los horarios antes de ir.</p>
        <p class="legal">Datos: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a> y <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a>.</p>
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
    const wheel = form.elements.p_wheel.checked;
    const rows = items.filter((a) => chosen.has(a.kind)
      && (free === 'any' || a.free === (free === 'yes'))
      && (plan === 'any' || a.plans.includes(plan))
      && (budget === 'any' || a.budget === budget)
      && (km === 'any' || a.km <= Number(km))
      && (!stop || (typeof a.stop_m === 'number' && a.stop_m <= STOP_NEAR_M))
      && (!people || !a.capacity || a.capacity >= people)
      && (!wheel || a.wheelchair === 'yes')
      && (!gem || a.gem)).sort(sorters[view.sort]);
    el.querySelectorAll('[data-group]').forEach((box) => {
      box.checked = PLAN_GROUPS.find((g) => g.id === box.dataset.group).kinds.every((k) => !kinds.includes(k) || chosen.has(k));
    });
    drawPlanMap(rows, city, !framed);
    framed = true;
    el.querySelector('[data-count]').textContent = `${rows.length} de ${items.length} planes`;
    el.querySelector('[data-results]').innerHTML = rows.length
      ? rows.slice(0, view.limit).map((a) => planHtml(a, city)).join('')
      : noMatchHtml;
    el.querySelector('.more').hidden = rows.length <= view.limit;
  };

  setupPlanMap(el, center);
  let framed = false;
  wireControls(el, view, draw);
  el.addEventListener('click', (e) => {
    const save = e.target.closest('.list [data-save-plan]');
    if (!save) return;
    const item = items.find((a) => a.name === save.dataset.savePlan);
    if (item) toggleActivity(item, s, save);
  });
  el.querySelector('.plan-layers')?.addEventListener('change', (e) => {
    const group = e.target.dataset.group;
    const overlay = e.target.dataset.overlay;
    if (group) {
      const { kinds: inGroup } = PLAN_GROUPS.find((g) => g.id === group);
      el.querySelectorAll('[name=p_kind]').forEach((box) => { if (inGroup.includes(box.value)) box.checked = e.target.checked; });
      view.limit = view.step;
      draw();
    } else if (overlay === 'hotels') {
      if (e.target.checked) {
        planMap.hotelsLayer.addTo(planMap.map);
        el.querySelector('[data-plan-note]').textContent = planMap.hotels ? '' : 'Los alojamientos salen al buscar con fecha de vuelta.';
      } else {
        planMap.map.removeLayer(planMap.hotelsLayer);
      }
    }
  });
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
    renderPlans(el, body.activities, s.dest.city, body.center, s);
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
    const trip = await fetchDay({ ...base, depart: s.start, ...(s.end && !s.leg ? { return: s.end } : {}) });
    if (stale()) return;
    let lists = [];
    if (trip.offers.length) {
      lists = [{ title: '', offers: trip.offers }];
    } else if (s.end && !s.leg) {
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

/* Un viaje con varios destinos se ve parada a parada, cada una con su vuelo, alojamiento y planes. */
function tripStages(s) {
  const places = [s.dest, ...s.stops.map((x) => x.place)];
  const dates = [s.start, ...s.stops.map((x) => x.date), s.end];
  const stages = places.map((place, i) => ({
    mode: 'flights', leg: true, direct: s.direct, pax: s.pax, origin: i ? places[i - 1] : s.origin, dest: place, start: dates[i], end: dates[i + 1],
  }));
  stages.push({ mode: 'flights', leg: true, back: true, direct: s.direct, pax: s.pax, origin: places[places.length - 1], dest: s.origin, start: s.end, end: null });
  return stages;
}

async function paintTripFlights(stages, run) {
  const el = $('tripFlights');
  const prices = await Promise.all(stages.map((stage) => fetchDay({ origin: stage.origin.code, dest: stage.dest.code, direct: stage.direct ? 1 : 0, depart: stage.start })
    .then((body) => (body.offers.length ? Math.min(...body.offers.map((o) => o.price)) : null))
    .catch(() => null)));
  if (run !== tripRun || !el.isConnected) return;
  const missing = prices.filter((p) => p === null).length;
  const sum = prices.reduce((total, p) => total + (p || 0), 0);
  el.innerHTML = missing === prices.length
    ? '<b>Sin precios recientes de vuelos para este viaje</b>'
    : `<b>${missing ? 'Vuelos con precio' : 'Todos los vuelos'} desde ${esc(money(sum))} por persona</b>
      <span>${missing ? `Faltan ${esc(plural(missing, 'tramo', 'tramos'))} sin precio reciente. ` : ''}Cada tramo se compra aparte. El alojamiento se ve en cada parada.</span>`;
  el.hidden = false;
  stages.forEach((stage, i) => {
    const tag = document.querySelector(`[data-stage="${i}"] small`);
    if (tag && prices[i] !== null) tag.textContent = `${showDate(stage.start)} · ${money(prices[i])}`;
  });
}

let tripRun = 0;
function renderTrip(s) {
  const stages = tripStages(s);
  const run = ++tripRun;
  const res = $('results');
  const names = [s.origin, s.dest, ...s.stops.map((x) => x.place), s.origin].map((p) => p.city).join(' → ');
  res.innerHTML = `
    <div class="summary">
      <div><h2>${esc(names)}</h2><p>${esc(`${showDate(s.start)} – ${showDate(s.end)}`)} · ${esc(paxSummary())}</p></div>
      <span class="summary__actions"><button type="button" class="btn btn--out" id="newSearch">Nueva búsqueda</button></span>
    </div>
    <p class="trip-total" id="tripFlights" role="status" hidden></p>
    <div class="stages" role="group" aria-label="Paradas del viaje">
      ${stages.map((stage, i) => `<button type="button" class="stage${i ? '' : ' is-on'}" data-stage="${i}" aria-pressed="${!i}"><b>${esc(stage.back ? `Vuelta a ${stage.dest.city}` : `${i + 1}. ${stage.dest.city}`)}</b><small>${esc(showDate(stage.start))}</small></button>`).join('')}
    </div>
    <div id="stage"></div>`;
  res.hidden = false;
  $('home').hidden = true;
  $('newSearch').addEventListener('click', goHome);
  const show = (i) => {
    res.querySelectorAll('[data-stage]').forEach((b) => {
      const on = Number(b.dataset.stage) === i;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    renderResults(stages[i], $('stage'));
  };
  res.querySelector('.stages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stage]');
    if (b) show(Number(b.dataset.stage));
  });
  show(0);
  paintTripFlights(stages, run);
  res.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResults(s, target = null) {
  if (s.stops?.length) { renderTrip(s); return; }
  planMap.hotels = null;
  planMap.hotelsTrip = null;
  const flights = s.mode === 'flights';
  const title = flights ? `${s.origin.city} → ${s.dest.city}` : `Alojamiento en ${s.dest.city}`;
  const dates = s.leg
    ? (s.end ? `Vuelo el ${showDate(s.start)} · estancia hasta el ${showDate(s.end)}` : `Vuelo el ${showDate(s.start)}`)
    : (s.end ? `${showDate(s.start)} – ${showDate(s.end)}` : `${showDate(s.start)} · solo ida`);
  const extra = !flights ? ` · ${plural(nights(), 'noche', 'noches')}` : (s.direct ? ' · vuelos directos' : '');

  const withHotels = !flights || (s.end && s.end !== s.start && s.dest.city !== s.dest.code);
  const hotelsTitle = `Hoteles y apartamentos en ${s.dest.city}`;
  const hotelsHtml = withHotels
    ? `<section class="offers" id="sectionStays" aria-labelledby="hotelsTitle"><div class="block__head"><h2 id="hotelsTitle">${esc(hotelsTitle)}</h2></div><div id="hotels"></div></section>`
    : (flights && !s.end && !s.leg ? '<p class="savehint">Para ver alojamientos hace falta una fecha de vuelta.</p>' : '');
  const withPlans = s.dest.city !== s.dest.code && !s.back;
  const plansHtml = withPlans
    ? `<section class="offers" id="sectionPlans" aria-labelledby="plansTitle"><div class="block__head"><h2 id="plansTitle">${esc(`Planes en ${s.dest.city}`)}</h2></div><div id="plans"></div></section>`
    : '';
  const jumps = [flights && ['sectionFlights', 'Vuelos'], withHotels && ['sectionStays', 'Alojamiento'], withPlans && ['sectionPlans', 'Planes']].filter(Boolean);
  tripTotal.flight = null;
  tripTotal.night = null;

  const res = target || $('results');
  res.innerHTML = `
    <div class="summary">
      <div><h2>${esc(title)}</h2><p>${esc(dates + extra)} · ${esc(paxSummary())}</p></div>
      ${s.leg ? '' : `<span class="summary__actions">
        ${flights ? '<button type="button" class="btn" id="saveTrip"></button>' : ''}
        ${flights && s.end ? `<button type="button" class="btn btn--out" id="compareTrip" aria-pressed="${inCompare('trips', tripCompareId(s))}">${compareTripLabel(s)}</button>` : ''}
        <button type="button" class="btn btn--out" id="newSearch">Nueva búsqueda</button>
      </span>`}
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
  if (!s.leg) $('newSearch').addEventListener('click', goHome);
  res.querySelector('.jumps')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (b) $(b.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if (flights && !s.leg) wireSaveTrip(s);
  if (flights && !s.leg && s.end) $('compareTrip').addEventListener('click', (e) => toggleCompareTrip(s, e.currentTarget));
  if (flights) loadOffers(s);
  if (withHotels) loadHotels(s);
  if (withPlans) loadPlans(s);
  if (!target) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  syncMulti();
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
  images.forEach(loadPhoto);
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
    area.querySelectorAll('img[data-src]').forEach(loadPhoto);
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

/* Cada foto existe en dos tamaños: el navegador baja la que necesita su pantalla. */
const PHOTO_WIDTH = 1400;
const PHOTO_SIZES = '(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw';
const photoSmall = (name) => `assets/${name}-m.jpg?v=${PHOTOS_VERSION}`;
const photoSet = (name) => `${photoSmall(name)} 700w, assets/${name}.jpg?v=${PHOTOS_VERSION} ${PHOTO_WIDTH}w`;

function loadPhoto(img) {
  if (img.dataset.src && !img.getAttribute('src')) {
    img.srcset = img.dataset.srcset || '';
    img.src = img.dataset.src;
  }
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
            <img class="is-on" src="${photoSmall(PHOTOS[code])}" srcset="${photoSet(PHOTOS[code])}" sizes="${PHOTO_SIZES}" alt="" width="${PHOTO_WIDTH}" height="${PHOTO_WIDTH}" loading="lazy" decoding="async">
            ${[2, 3, 4].map((n) => `<img data-src="${photoSmall(PHOTOS[code] + n)}" data-srcset="${photoSet(PHOTOS[code] + n)}" sizes="${PHOTO_SIZES}" alt="" width="${PHOTO_WIDTH}" height="${PHOTO_WIDTH}" decoding="async">`).join('')}
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

/* ---------- Comparar vuelos, alojamientos y viajes ---------- */
const MAX_COMPARE = 4;
const compareList = { flights: [], stays: [], trips: [], ...store.get('tt.compare', {}) };
const COMPARE_TABS = { flights: 'Vuelos', stays: 'Alojamientos', trips: 'Viajes' };
let compareTab = 'stays';
let compareRun = 0;
const offerIndex = new Map();

const inCompare = (tab, id) => compareList[tab].some((x) => x.id === id);
const compareLabel = (tab, id) => (inCompare(tab, id) ? 'En comparación ✓' : 'Comparar');
const offerCompareId = (o) => [o.airline, o.flightNumber, o.origin, o.destination, o.departureAt, o.returnAt].join('|');
const stayCompareId = (h, s) => [h.name, s.dest.city, s.start, s.end].join('|');
const tripCompareId = (s) => [s.origin.code, s.dest.code, s.start, s.end, s.direct ? 1 : 0].join('|');
const compareTripLabel = (s) => (inCompare('trips', tripCompareId(s)) ? 'En comparación ✓' : 'Comparar este viaje');

function paintCompareCount() {
  const total = Object.values(compareList).reduce((sum, list) => sum + list.length, 0);
  $('compareCount').textContent = total;
  $('compareCount').hidden = !total;
}

/* Devuelve true si ha quedado dentro de la lista. */
function toggleCompare(tab, item) {
  const list = compareList[tab];
  const at = list.findIndex((x) => x.id === item.id);
  if (at >= 0) {
    list.splice(at, 1);
  } else {
    if (list.length >= MAX_COMPARE) {
      toast(`Se pueden comparar hasta ${MAX_COMPARE} a la vez. Hay que quitar alguno antes.`);
      return false;
    }
    list.push(item);
    compareTab = tab;
    toast(list.length > 1 ? `${list.length} para comparar. Se ven en «Comparar».` : 'Añadido a «Comparar». Falta elegir otro.');
  }
  store.set('tt.compare', compareList);
  paintCompareCount();
  return at < 0;
}

function compareOfferButton(o) {
  const id = offerCompareId(o);
  offerIndex.set(id, o);
  return `<button type="button" class="linkbtn" data-compare-offer="${esc(id)}" aria-pressed="${inCompare('flights', id)}">${compareLabel('flights', id)}</button>`;
}

function toggleCompareStay(h, s, button, center) {
  const id = stayCompareId(h, s);
  const rates = h.key ? rateCache.get(rateId(h.key, s)) : null;
  toggleCompare('stays', {
    id, name: h.name, kind: h.kind || 'Alojamiento', stars: h.stars || 0, rating: h.rating || null, reviews: h.reviews || 0, url: h.url || '', key: h.key || '', lat: h.lat, lon: h.lon, km: h.km ?? null, website: h.website || '',
    city: s.dest.city, country: s.dest.country || '', center: center || null, start: s.start, end: s.end, pax: s.pax,
    night: rates && rates.length ? perPerson(rates[0].rate, s) : null,
  });
  button.textContent = compareLabel('stays', id);
  button.setAttribute('aria-pressed', String(inCompare('stays', id)));
}

function toggleCompareTrip(s, button) {
  const id = tripCompareId(s);
  toggleCompare('trips', { id, origin: s.origin, dest: s.dest, start: s.start, end: s.end, direct: Boolean(s.direct), pax: s.pax, flight: tripTotal.flight, night: tripTotal.night });
  button.textContent = compareTripLabel(s);
  button.setAttribute('aria-pressed', String(inCompare('trips', id)));
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-compare-offer]');
  if (!b) return;
  const o = offerIndex.get(b.dataset.compareOffer);
  if (!o) return;
  const id = b.dataset.compareOffer;
  const city = (code) => PLACES.find((p) => p.code === code)?.city || code;
  toggleCompare('flights', {
    id, price: o.price, airline: o.airlineName || o.airline, url: o.url || '', from: city(o.origin), to: city(o.destination),
    departureAt: o.departureAt, returnAt: o.returnAt || null, durationTo: o.durationTo || 0, durationBack: o.durationBack || 0, transfers: o.transfers ?? null, returnTransfers: o.returnTransfers ?? null,
  });
  b.textContent = compareLabel('flights', id);
  b.setAttribute('aria-pressed', String(inCompare('flights', id)));
});

/* --- Cálculos --- */
const distanceM = (a, b, c, d) => {
  const rad = Math.PI / 180;
  const x = (d - b) * rad * Math.cos(((a + c) / 2) * rad);
  return Math.hypot(x, (c - a) * rad) * 6371000;
};
const placeText = (x) => (x.country ? `${x.city}, ${x.country}` : x.city);
const kmShort = (km) => `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
const metres = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : kmShort(m / 1000));
const hoursText = (mins) => (mins ? `${Math.floor(mins / 60)} h ${pad(Math.round(mins % 60))} min` : 'Sin dato');
const nightsOf = (x) => Math.round((fromIso(x.end) - fromIso(x.start)) / 864e5);

const jsonCache = new Map();
function getJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((body) => {
      if (!body) jsonCache.delete(url);
      return body;
    }));
  }
  return jsonCache.get(url);
}
const cityInfo = (place) => getJson(`/api/city?${new URLSearchParams({ place })}`);
const cityPlans = (place) => getJson(`/api/activities?${new URLSearchParams({ place })}`);

/* Diferencia con UTC, en horas, de una zona horaria en una fecha. */
function zoneHours(zone, iso) {
  if (!zone) return null;
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${iso}T12:00:00Z`)).find((p) => p.type === 'timeZoneName').value;
    const match = part.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3]) / 60);
  } catch {
    return null;
  }
}

/* Salida y puesta de sol aproximadas (unos minutos de margen), en hora local. */
function sunTimes(lat, lon, iso, offset) {
  if (offset === null) return null;
  const date = fromIso(iso);
  const day = Math.round((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const rad = Math.PI / 180;
  const angle = (360 / 365) * (day - 81) * rad;
  const declination = 23.44 * Math.sin(angle) * rad;
  const equation = 9.87 * Math.sin(2 * angle) - 7.53 * Math.cos(angle) - 1.5 * Math.sin(angle);
  const cosHour = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(declination)) / (Math.cos(lat * rad) * Math.cos(declination));
  if (Math.abs(cosHour) > 1) return { polar: cosHour < 0 };
  const half = Math.acos(cosHour) / rad / 15;
  const noon = 12 - lon / 15 - equation / 60 + offset;
  const clock = (h) => `${pad(Math.floor((h + 24) % 24))}:${pad(Math.floor((((h + 24) % 24) % 1) * 60))}`;
  return { rise: clock(noon - half), set: clock(noon + half), hours: half * 2 };
}

const currencyName = (code) => {
  if (!code) return 'Sin dato';
  try {
    return new Intl.DisplayNames(['es'], { type: 'currency' }).of(code);
  } catch {
    return code;
  }
};
const FRIEND_KINDS = ['bar', 'discoteca', 'ocio'];
const FAMILY_KINDS = ['familiar', 'playa', 'naturaleza', 'museo'];
const sumKinds = (kinds, list) => list.reduce((sum, k) => sum + (kinds[k] || 0), 0);

/* --- Tabla y conclusión --- */
const LETTERS = 'ABCD';

function compareTable(items, rows) {
  const cells = (row) => {
    const values = items.map(row.value);
    const numbers = items.map((x) => (row.number ? row.number(x) : null));
    const usable = numbers.filter((n) => typeof n === 'number');
    const best = usable.length > 1 && new Set(usable).size > 1 ? (row.high ? Math.max(...usable) : Math.min(...usable)) : null;
    return values.map((value, i) => `<td${numbers[i] === best && best !== null ? ' class="is-best"' : ''}>${esc(value)}</td>`).join('');
  };
  return `<div class="cmp__scroll"><table class="cmp">
    <thead><tr><th scope="col"><span class="sr">Dato</span></th>${items.map((x, i) => `<th scope="col"><b>${LETTERS[i]}</b> ${esc(x.title)}<button type="button" class="linkbtn cmp__del" data-compare-del="${esc(x.id)}">Quitar</button></th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr><th scope="row">${esc(row.label)}</th>${cells(row)}</tr>`).join('')}</tbody>
  </table></div>`;
}

const bestOf = (items, fn, high = false) => {
  const usable = items.filter((x) => typeof fn(x) === 'number');
  if (usable.length < 2) return null;
  const values = usable.map(fn);
  if (new Set(values).size < 2) return null;
  const target = high ? Math.max(...values) : Math.min(...values);
  return usable.find((x) => fn(x) === target);
};
const worstOf = (items, fn) => bestOf(items, fn, true);
const nameOf = (items, x) => `${LETTERS[items.indexOf(x)]} (${x.title})`;

function conclusionHtml(points, summary) {
  return `<section class="cmp__end" aria-labelledby="cmpEnd">
    <h3 id="cmpEnd">Conclusión</h3>
    ${points.length ? `<ul>${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p>Con estos datos no hay diferencias claras entre las opciones.</p>'}
    ${summary.length ? `<p class="cmp__sum"><b>En resumen:</b> ${esc(summary.join(' '))}</p>` : ''}
  </section>`;
}

/* --- Vuelos --- */
function compareFlights(items) {
  items.forEach((x) => {
    x.title = `${x.from} → ${x.to}`;
    x.total = (x.durationTo + x.durationBack) || null;
    x.stops = Math.max(x.transfers ?? 0, x.returnTransfers ?? 0);
    x.hour = Number(hhmm(x.departureAt).slice(0, 2));
  });
  const when = (at) => (at ? `${showDate(at.slice(0, 10))}, ${hhmm(at)}` : 'Solo ida');
  const rows = [
    { label: 'Precio por adulto', value: (x) => money(x.price), number: (x) => x.price },
    { label: 'Aerolínea', value: (x) => x.airline },
    { label: 'Ida', value: (x) => when(x.departureAt) },
    { label: 'Vuelta', value: (x) => when(x.returnAt) },
    { label: 'Tiempo total de vuelo', value: (x) => hoursText(x.total), number: (x) => x.total },
    { label: 'Escalas', value: (x) => (x.stops ? String(x.stops) : 'Directo'), number: (x) => x.stops },
  ];
  const points = [];
  const summary = [];
  const cheap = bestOf(items, (x) => x.price);
  const fast = bestOf(items, (x) => x.total);
  const direct = bestOf(items, (x) => x.stops);
  if (cheap) {
    const most = worstOf(items, (x) => x.price);
    points.push(`${nameOf(items, cheap)} es el más barato: ${money(cheap.price)}, ${money(most.price - cheap.price)} menos que el más caro.`);
    summary.push(`Para gastar menos, ${LETTERS[items.indexOf(cheap)]}.`);
  }
  if (fast) {
    points.push(cheap && fast === cheap ? `Además, es el más rápido: ${hoursText(fast.total)}.` : `${nameOf(items, fast)} es el más rápido: ${hoursText(fast.total)}${cheap && cheap.total ? `, ${hoursText(cheap.total - fast.total)} menos que el más barato, a cambio de ${money(fast.price - cheap.price)} más` : ''}.`);
    if (fast !== cheap) summary.push(`Para llegar antes, ${LETTERS[items.indexOf(fast)]}.`);
  }
  if (direct && direct.stops === 0) points.push(`${nameOf(items, direct)} va directo${items.filter((x) => x.stops === 0).length > 1 ? ', igual que alguna otra opción' : ''}.`);
  items.forEach((x) => {
    if (x.hour < 7) points.push(`${nameOf(items, x)} sale muy temprano, a las ${hhmm(x.departureAt)}: conviene mirar cómo llegar al aeropuerto a esa hora.`);
    else if (x.hour >= 21) points.push(`${nameOf(items, x)} sale de noche, a las ${hhmm(x.departureAt)}.`);
  });
  return compareTable(items, rows) + conclusionHtml(points, summary);
}

/* --- Alojamientos --- */
async function enrichStay(x) {
  if (x.night === null && x.key) {
    const q = new URLSearchParams({ key: x.key, in: x.start, out: x.end, adults: x.pax.adults, rooms: x.pax.rooms });
    const body = await getJson(`/api/rates?${q}`);
    if (body?.rates?.length) x.night = Math.round(body.rates[0].rate / peopleIn(x));
  }
  const place = placeText(x);
  const [plans, info] = await Promise.all([cityPlans(place), cityInfo(place)]);
  const hasPoint = typeof x.lat === 'number' && typeof x.lon === 'number';
  x.nearPlans = null;
  x.line = null;
  if (hasPoint && plans?.activities?.length) {
    x.nearPlans = plans.activities.filter((a) => distanceM(x.lat, x.lon, a.lat, a.lon) <= 1000).length;
  }
  const center = x.center || (info?.known ? { lat: info.lat, lon: info.lon } : null);
  if (hasPoint && center) {
    if (x.km === null) x.km = distanceM(x.lat, x.lon, center.lat, center.lon) / 1000;
    const rail = await getJson(`/api/transit?${new URLSearchParams({ lat: center.lat, lon: center.lon, part: 'rail' })}`);
    let best = Infinity;
    (rail?.lines || []).forEach((line) => line.paths.forEach((path) => path.forEach(([lat, lon]) => {
      best = Math.min(best, distanceM(x.lat, x.lon, lat, lon));
    })));
    if (Number.isFinite(best)) x.line = best;
  }
  x.title = x.name;
  return x;
}

function compareStays(items) {
  const rows = [
    { label: 'Ciudad', value: (x) => x.city },
    { label: 'Fechas', value: (x) => `${showDate(x.start)} – ${showDate(x.end)}` },
    { label: 'Precio por noche y persona', value: (x) => (x.night === null ? 'Sin precio' : money(x.night)), number: (x) => x.night },
    { label: 'Distancia al centro', value: (x) => (typeof x.km === 'number' ? kmShort(x.km) : 'Sin dato'), number: (x) => x.km },
    { label: 'Metro o tranvía más cercano', value: (x) => (x.line === null ? 'Sin dato' : metres(x.line)), number: (x) => x.line },
    { label: 'Planes a menos de 1 km', value: (x) => (x.nearPlans === null ? 'Sin dato' : String(x.nearPlans)), number: (x) => x.nearPlans, high: true },
    { label: 'Nota de viajeros', value: (x) => (x.rating ? `${String(x.rating).replace('.', ',')}/5 (${x.reviews.toLocaleString('es-ES')})` : 'Sin dato'), number: (x) => x.rating, high: true },
    { label: 'Categoría', value: (x) => (x.stars ? '★'.repeat(x.stars) : 'Sin dato'), number: (x) => x.stars || null, high: true },
  ];
  const points = [];
  const summary = [];
  const cheap = bestOf(items, (x) => x.night);
  const near = bestOf(items, (x) => x.km);
  const metro = bestOf(items, (x) => x.line);
  const plans = bestOf(items, (x) => x.nearPlans, true);
  const stars = bestOf(items, (x) => x.stars || null, true);
  const rated = bestOf(items, (x) => x.rating, true);
  const far = worstOf(items, (x) => x.km);
  if (cheap) {
    points.push(`${nameOf(items, cheap)} es la opción más barata: ${money(cheap.night)} por noche y persona${typeof cheap.km === 'number' && far === cheap ? `, pero es la más lejana del centro (${kmShort(cheap.km)})` : ''}.`);
    summary.push(`Para gastar menos, ${LETTERS[items.indexOf(cheap)]}.`);
  }
  if (near && far && far.km - near.km >= 0.5) {
    const extra = cheap && near !== cheap && typeof near.night === 'number' ? `, y cuesta ${money(near.night - cheap.night)} más por noche que la más barata` : '';
    points.push(`${nameOf(items, near)} es la más céntrica: a ${kmShort(near.km)} del centro${extra}. Se tarda menos en ver las cosas.`);
    if (near !== cheap) summary.push(`Para ir andando a casi todo, ${LETTERS[items.indexOf(near)]}.`);
  }
  if (far && far !== near && typeof far.line === 'number' && far.km - near.km >= 1) {
    points.push(far.line <= 500
      ? `${nameOf(items, far)} es la más lejana (${kmShort(far.km)}), pero tiene metro o tranvía a ${metres(far.line)}: va bien con transporte público, aunque se tarda más en ver las cosas.`
      : `${nameOf(items, far)} es la más lejana (${kmShort(far.km)}) y el metro o tranvía más cercano está a ${metres(far.line)}: se depende más del autobús o del taxi.`);
  }
  if (metro && metro !== far) points.push(`${nameOf(items, metro)} es la mejor conectada: metro o tranvía a ${metres(metro.line)}.`);
  if (plans) points.push(`${nameOf(items, plans)} tiene más planes alrededor: ${plans.nearPlans} a menos de 1 km.`);
  if (rated) {
    points.push(`${nameOf(items, rated)} es la mejor valorada: ${String(rated.rating).replace('.', ',')}/5 con ${rated.reviews.toLocaleString('es-ES')} opiniones. Conviene si se va a pasar mucho tiempo en el alojamiento.`);
    if (rated !== cheap && rated !== near) summary.push(`Para pasar más tiempo en el alojamiento, ${LETTERS[items.indexOf(rated)]}.`);
  }
  if (stars) points.push(`${nameOf(items, stars)} tiene la mejor categoría (${'★'.repeat(stars.stars)}).`);
  const noPrice = items.filter((x) => x.night === null);
  if (noPrice.length) points.push(`De ${noPrice.map((x) => LETTERS[items.indexOf(x)]).join(' y ')} no hay precio para estas fechas, así que no entra en la comparación de precio.`);
  if (new Set(items.map((x) => x.city)).size > 1) points.push('Son ciudades distintas: para comparar también vuelos, moneda y horarios, está la pestaña «Viajes».');
  return compareTable(items, rows) + conclusionHtml(points, summary)
    + '<p class="count">La nota es la media de opiniones de TripAdvisor, según Xotelo. La categoría son las estrellas del alojamiento. La distancia al metro o tranvía se mide hasta la línea, en línea recta.</p>';
}

/* --- Viajes --- */
async function enrichTrip(x) {
  const place = placeText(x.dest);
  const direct = x.direct ? 1 : 0;
  if (x.flight === null) {
    const q = new URLSearchParams({ origin: x.origin.code, dest: x.dest.code, direct, depart: x.start, return: x.end });
    const body = await getJson(`/api/day?${q}`);
    if (body?.offers?.length) x.flight = Math.min(...body.offers.map((o) => o.price));
  }
  if (x.night === null) {
    const hotels = await getJson(`/api/hotels?${new URLSearchParams({ place })}`);
    const keys = (hotels?.hotels || []).filter((h) => h.key).slice(0, 6).map((h) => h.key);
    const prices = await Promise.all(keys.map((key) => getJson(`/api/rates?${new URLSearchParams({ key, in: x.start, out: x.end, adults: x.pax.adults, rooms: x.pax.rooms })}`)));
    const nights = prices.flatMap((b) => (b?.rates?.length ? [Math.round(b.rates[0].rate / peopleIn(x))] : []));
    if (nights.length) x.night = Math.min(...nights);
  }
  const [info, home] = await Promise.all([cityInfo(place), cityInfo(placeText(x.origin))]);
  x.info = info?.known ? info : null;
  x.home = home?.known ? home : null;
  x.nights = nightsOf(x);
  x.total = x.flight !== null && x.night !== null ? x.flight + x.night * x.nights : null;
  x.perDay = x.total === null ? null : Math.round(x.total / Math.max(1, x.nights));
  x.friends = x.info?.hasPlans ? sumKinds(x.info.kinds, FRIEND_KINDS) : null;
  x.family = x.info?.hasPlans ? sumKinds(x.info.kinds, FAMILY_KINDS) : null;
  const offset = x.info ? zoneHours(x.info.timezone, x.start) : null;
  const homeOffset = x.home ? zoneHours(x.home.timezone, x.start) : null;
  x.offset = offset;
  x.shift = offset !== null && homeOffset !== null ? offset - homeOffset : null;
  x.sun = x.info ? sunTimes(x.info.lat, x.info.lon, x.start, offset) : null;
  x.title = `${x.origin.city} → ${x.dest.city}`;
  return x;
}

const shiftText = (h) => {
  if (h === null) return 'Sin dato';
  if (!h) return 'La misma hora';
  const abs = Math.abs(h);
  return `${String(abs).replace('.', ',')} h ${h > 0 ? 'más' : 'menos'}`;
};
const lightText = (x) => {
  if (!x.sun) return 'Sin dato';
  if (x.sun.rise === undefined) return x.sun.polar ? 'Sol todo el día' : 'Sin sol ese día';
  return `${x.sun.rise} a ${x.sun.set} (${Math.round(x.sun.hours)} h)`;
};

function compareTrips(items) {
  const rows = [
    { label: 'Fechas', value: (x) => `${showDate(x.start)} – ${showDate(x.end)} (${plural(x.nights, 'noche', 'noches')})` },
    { label: 'Total por persona', value: (x) => (x.total === null ? 'Sin dato' : money(x.total)), number: (x) => x.total },
    { label: 'Total por día', value: (x) => (x.total === null ? 'Sin dato' : money(x.perDay)), number: (x) => x.perDay },
    { label: 'Vuelo', value: (x) => (x.flight === null ? 'Sin precio' : money(x.flight)), number: (x) => x.flight },
    { label: 'Alojamiento por noche', value: (x) => (x.night === null ? 'Sin precio' : money(x.night)), number: (x) => x.night },
    { label: 'Planes de amigos', value: (x) => (x.friends === null ? 'Sin dato' : String(x.friends)), number: (x) => x.friends, high: true },
    { label: 'Planes en familia', value: (x) => (x.family === null ? 'Sin dato' : String(x.family)), number: (x) => x.family, high: true },
    { label: 'Planes gratis', value: (x) => (x.info?.hasPlans ? String(x.info.free) : 'Sin dato'), number: (x) => (x.info?.hasPlans ? x.info.free : null), high: true },
    { label: 'Moneda', value: (x) => (x.info ? currencyName(x.info.currency) : 'Sin dato') },
    { label: 'Hora respecto al origen', value: (x) => shiftText(x.shift) },
    { label: 'Horas de luz', value: lightText, number: (x) => (x.sun?.hours ? Math.round(x.sun.hours) : null), high: true },
  ];
  const points = [];
  const summary = [];
  const cheap = bestOf(items, (x) => x.total);
  const dear = worstOf(items, (x) => x.total);
  const cheapStay = bestOf(items, (x) => x.night);
  const friends = bestOf(items, (x) => x.friends, true);
  const family = bestOf(items, (x) => x.family, true);
  const free = bestOf(items, (x) => (x.info?.hasPlans ? x.info.free : null), true);
  const light = bestOf(items, (x) => (x.sun?.hours ? Math.round(x.sun.hours) : null), true);
  if (cheap) {
    points.push(`${nameOf(items, cheap)} es el viaje más barato: ${money(cheap.total)} por persona, ${money(dear.total - cheap.total)} menos que el más caro.`);
    summary.push(`Para gastar menos, ${LETTERS[items.indexOf(cheap)]}.`);
  }
  if (new Set(items.map((x) => x.nights)).size > 1) {
    const daily = bestOf(items, (x) => x.perDay);
    if (daily) points.push(`Los viajes no duran lo mismo. Por día, el más barato es ${nameOf(items, daily)}: ${money(daily.perDay)}.`);
  }
  if (cheapStay) points.push(`El alojamiento más barato encontrado está en ${cheapStay.dest.city}: desde ${money(cheapStay.night)} por noche. Es solo una pista de qué ciudad es más económica: no incluye comida ni transporte.`);
  if (friends && friends === family) {
    points.push(`${friends.dest.city} tiene más oferta de todo tipo: ${friends.friends} bares, discotecas y sitios de ocio, y ${friends.family} museos, parques, playas y zoos.`);
    summary.push(`Con amigos o en familia, ${friends.dest.city}.`);
  } else {
    if (friends) {
      points.push(`${friends.dest.city} es más de amigos: ${friends.friends} bares, discotecas y sitios de ocio guardados.`);
      summary.push(`Con amigos, ${friends.dest.city}.`);
    }
    if (family) {
      points.push(`${family.dest.city} es más familiar: ${family.family} museos, parques, playas y zoos guardados.`);
      summary.push(`En familia, ${family.dest.city}.`);
    }
  }
  if (free) points.push(`${free.dest.city} tiene más planes gratis: ${free.info.free}.`);
  const known = items.filter((x) => x.info?.currency);
  const currencies = new Set(known.map((x) => x.info.currency));
  if (known.length > 1 && currencies.size === 1) points.push(`Todos los destinos usan la misma moneda: ${currencyName(known[0].info.currency)}.`);
  known.forEach((x) => {
    if (x.home?.currency && x.home.currency !== x.info.currency) points.push(`En ${x.dest.city} se paga en ${currencyName(x.info.currency)}, distinta de la de ${x.origin.city}: conviene mirar el cambio y las comisiones de la tarjeta.`);
  });
  items.forEach((x) => {
    if (x.shift !== null && Math.abs(x.shift) >= 3) points.push(`${x.dest.city} va con ${shiftText(x.shift)} que ${x.origin.city}: es posible notar el cambio de horario los primeros días.`);
  });
  if (light) points.push(`En ${light.dest.city} hay más horas de luz en esas fechas: ${lightText(light)}. Da más margen para ver cosas de día.`);
  const missing = items.filter((x) => x.total === null);
  if (missing.length) points.push(`De ${missing.map((x) => x.dest.city).join(' y ')} falta algún precio para estas fechas, así que no entra en el total.`);
  const noPlans = items.filter((x) => x.info && !x.info.hasPlans);
  if (noPlans.length) points.push(`De ${noPlans.map((x) => x.dest.city).join(' y ')} todavía no hay planes guardados.`);
  return compareTable(items, rows) + conclusionHtml(points, summary)
    + '<p class="count">Los precios son orientativos y salen de lo más barato encontrado. Los planes son los que hay guardados de cada ciudad, con un tope por tipo, así que sirven para orientarse. Las horas de sol son aproximadas y corresponden al primer día del viaje.</p>';
}

async function renderCompare() {
  const run = ++compareRun;
  const res = $('results');
  const items = compareList[compareTab].map((x) => ({ ...x }));
  res.innerHTML = `
    <div class="summary">
      <div><h2>Comparar</h2><p>Se eligen con el botón «Comparar» de cada vuelo, alojamiento o viaje. Se queda solo en este dispositivo.</p></div>
      <span class="summary__actions"><button type="button" class="btn btn--out" id="newSearch">Volver a buscar</button></span>
    </div>
    <div class="savedtabs" role="tablist" aria-label="Qué comparar">
      ${Object.entries(COMPARE_TABS).map(([id, label]) => `<button type="button" role="tab" class="savedtab${id === compareTab ? ' is-on' : ''}" data-compare-tab="${id}" aria-selected="${id === compareTab}">${esc(label)} <em>${compareList[id].length}</em></button>`).join('')}
    </div>
    <div id="compareBody"></div>`;
  res.hidden = false;
  $('home').hidden = true;
  $('newSearch').addEventListener('click', goHome);
  const body = $('compareBody');
  if (items.length < 2) {
    body.innerHTML = `<div class="empty"><b>${items.length ? 'Falta elegir otra opción' : 'Todavía no hay nada que comparar'}</b>Hay que pulsar «Comparar» en al menos dos ${{ flights: 'vuelos', stays: 'alojamientos', trips: 'viajes' }[compareTab]} de los resultados de búsqueda.${items.length ? `<br><button type="button" class="linkbtn" data-compare-del="${esc(items[0].id)}">Quitar el elegido</button>` : ''}</div>`;
  } else if (compareTab === 'flights') {
    body.innerHTML = compareFlights(items);
  } else {
    body.innerHTML = '<div class="list"><div class="skel"></div></div>';
    const ready = await Promise.all(items.map(compareTab === 'stays' ? enrichStay : enrichTrip));
    if (run !== compareRun || !$('compareBody')) return;
    body.innerHTML = compareTab === 'stays' ? compareStays(ready) : compareTrips(ready);
  }
  res.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initCompare() {
  $('compareBtn').addEventListener('click', () => {
    if (!compareList[compareTab].length) compareTab = Object.keys(COMPARE_TABS).find((id) => compareList[id].length) || compareTab;
    closePops();
    renderCompare();
  });
  $('results').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-compare-tab]');
    if (tab) {
      compareTab = tab.dataset.compareTab;
      renderCompare();
      return;
    }
    const del = e.target.closest('[data-compare-del]');
    if (del) {
      compareList[compareTab] = compareList[compareTab].filter((x) => x.id !== del.dataset.compareDel);
      store.set('tt.compare', compareList);
      paintCompareCount();
      renderCompare();
    }
  });
  paintCompareCount();
}

function init() {
  setupCombo('origin', $('origin'), $('originList'), $('segOrigin'));
  setupCombo('dest', $('dest'), $('destList'), $('segDest'));

  $('optNoFlight').addEventListener('change', (e) => {
    setMode(e.target.checked ? 'stays' : 'flights');
    goHome();
  });

  $('tripType').addEventListener('change', () => {
    if (isOneWay()) state.end = null;
    syncMulti();
    renderDates();
  });
  $('multiAdd').addEventListener('click', addStopRow);

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
    if (!s.stops) saveRecent(s);
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
    const tab = e.target.closest('[data-saved-tab]');
    if (tab) {
      savedTab = tab.dataset.savedTab;
      $('dlg').querySelectorAll('[data-saved-tab]').forEach((b) => {
        const on = b === tab;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      });
      $('dlg').querySelectorAll('[data-saved-panel]').forEach((panel) => { panel.hidden = panel.dataset.savedPanel !== savedTab; });
      return;
    }
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
  initCompare();
}

init();
