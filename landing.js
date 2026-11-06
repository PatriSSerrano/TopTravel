/* Portada: una sola escena en la que el scroll mueve la cámara, sin cortes.
   Avión → calendario → los precios vuelan al globo → zoom a Roma → anillos,
   hoteles, monumentos y transporte, todo en la misma proyección. */
(() => {
  document.documentElement.classList.add('lp-js');

  // Si ya hay sesión, la cabecera lo refleja.
  try {
    if (JSON.parse(localStorage.getItem('tt.guest'))) document.getElementById('lpAccountText').textContent = 'Invitado';
  } catch { /* sin almacenamiento: se queda «Entrar» */ }
  fetch('/api/me').then((r) => r.json()).then((me) => {
    if (!me.user) return;
    document.getElementById('lpAccountText').textContent = 'Cuenta';
    document.getElementById('lpAccount').setAttribute('aria-label', 'Cuenta');
    const unread = document.getElementById('lpUnread');
    unread.textContent = me.unread;
    unread.hidden = !me.unread;
  }).catch(() => {});

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('scene');
  const track = document.getElementById('track');
  const ctx = canvas.getContext('2d');
  const caps = [...document.querySelectorAll('[data-from]')];

  const EARTH_KM = 6371;
  const ROME = { lat: 41.8933, lon: 12.4829 };
  const MADRID = [40.42, -3.7];
  // Precios de ejemplo; se avisa en pantalla.
  const CITIES = [
    ['París', 48.86, 2.35, 43], ['Londres', 51.5, -0.12, 55], ['Roma', 41.89, 12.48, 41], ['Lisboa', 38.72, -9.14, 38],
    ['Berlín', 52.52, 13.4, 48], ['Atenas', 37.98, 23.73, 63], ['Estambul', 41.01, 28.98, 85], ['Marrakech', 31.63, -8, 31],
    ['El Cairo', 30.04, 31.24, 140], ['Reikiavik', 64.15, -21.94, 121], ['Dubái', 25.2, 55.27, 217], ['Nueva York', 40.71, -74, 407],
    ['Dakar', 14.69, -17.45, 238], ['Moscú', 55.75, 37.62, 299],
  ];
  const HOTEL_PRICES = [191, 519, 841, 76, 197, 100, 173, 142, 228];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (a, b, p) => { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rad = Math.PI / 180;

  let w = 0, h = 0, dpr = 1, m = 0;
  let progress = 0, target = 0, time = 0;
  let globe = null, city = null;
  const photos = {};
  let look = {};

  const PLANE = new Path2D('M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z');
  const BELL = new Path2D('M12 2.5a1.5 1.5 0 0 0-1.5 1.5v.7A6 6 0 0 0 6 10.5c0 4-1.2 5.6-2 6.5h16c-.8-.9-2-2.5-2-6.5a6 6 0 0 0-4.5-5.8V4A1.5 1.5 0 0 0 12 2.5zM10 19a2 2 0 0 0 4 0');

  function readLook() {
    const dark = document.documentElement.dataset.theme === 'dark';
    look = dark
      ? { bg: '#0f0a06', line: '247,233,211', accent: '#f0b000', accentRgb: '240,176,0', near: '#3ecf72', mid: '#f2c200', far: '#e8553f', pill: 'rgba(15,10,6,.86)', mix: 'lighter' }
      : { bg: '#fffaf2', line: '46,28,16', accent: '#c98a00', accentRgb: '201,138,0', near: '#1f9d55', mid: '#c99700', far: '#d13b28', pill: 'rgba(255,250,242,.9)', mix: 'source-over' };
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    m = Math.min(w, h);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  function readScroll() {
    const top = track.getBoundingClientRect().top;
    target = clamp(-top / (track.offsetHeight - innerHeight));
  }

  /* ---------- Cámara: el mismo movimiento para todo ---------- */
  function camera(p) {
    const heroR = Math.max(w, h) * 1.05;
    const heroCy = h + heroR * 0.8;
    const baseR = m * 0.34;
    const cityR = (m * 0.46) / (7 / EARTH_KM);
    const rise = seg(0.19, 0.27, p);
    const zoom = seg(0.38, 0.5, p);
    const away = seg(0.89, 0.99, p);
    let logR = lerp(Math.log(heroR), Math.log(baseR), rise);
    logR = lerp(logR, Math.log(cityR), zoom);
    logR = lerp(logR, Math.log(heroR), away);
    const cy = lerp(lerp(heroCy, w > h ? h * 0.52 : h * 0.6, rise), heroCy, away);
    const turn = seg(0.2, 0.43, p) * (1 - seg(0.9, 1, p));
    const R = Math.exp(logR);
    return {
      R,
      // En pantallas anchas el globo se aparta para dejar sitio al texto.
      cx: w > h ? lerp(w / 2, w * 0.64, seg(0.27, 0.31, p) * (1 - seg(0.38, 0.46, p))) : w / 2,
      cy,
      lon: lerp(-34, ROME.lon, turn),
      lat: lerp(18, ROME.lat, turn),
      city: seg(Math.log(cityR / 60), Math.log(cityR / 8), Math.log(R)),
    };
  }

  function project(cam, lat, lon) {
    const f = lat * rad;
    const d = (lon - cam.lon) * rad;
    const f0 = cam.lat * rad;
    const cosF = Math.cos(f);
    const cosD = Math.cos(d);
    return {
      x: cam.cx + cam.R * cosF * Math.sin(d),
      y: cam.cy - cam.R * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * cosF * cosD),
      z: Math.sin(f0) * Math.sin(f) + Math.cos(f0) * cosF * cosD,
    };
  }

  const line = (alpha) => `rgba(${look.line},${alpha})`;
  const glow = (alpha) => `rgba(${look.accentRgb},${alpha})`;

  /* ---------- Globo: solo líneas ---------- */
  function drawGlobe(cam) {
    const alpha = 1 - cam.city;
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    const halo = ctx.createRadialGradient(cam.cx, cam.cy, cam.R * 0.92, cam.cx, cam.cy, cam.R * 1.14);
    halo.addColorStop(0, glow(0));
    halo.addColorStop(0.42, glow(0.2));
    halo.addColorStop(1, glow(0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cam.cx, cam.cy, cam.R * 1.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = look.bg;
    ctx.beginPath();
    ctx.arc(cam.cx, cam.cy, cam.R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = glow(0.65);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Meridianos y paralelos muy tenues
    ctx.strokeStyle = line(0.06);
    ctx.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) traceCurve(cam, (t) => [lat, t * 360 - 180]);
    for (let lon = -180; lon < 180; lon += 30) traceCurve(cam, (t) => [t * 180 - 90, lon]);
    ctx.stroke();

    if (globe) {
      ctx.strokeStyle = line(0.62);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      globe.forEach((ring) => {
        let open = false;
        ring.forEach(([lon, lat]) => {
          const q = project(cam, lat, lon);
          if (q.z > 0) {
            if (open) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
            open = true;
          } else open = false;
        });
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function traceCurve(cam, at) {
    let open = false;
    for (let i = 0; i <= 48; i += 1) {
      const [lat, lon] = at(i / 48);
      const q = project(cam, lat, lon);
      if (q.z > 0) {
        if (open) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        open = true;
      } else open = false;
    }
  }

  /* ---------- Avión con estela ---------- */
  function drawPlane(t, y0, y1, scale) {
    const x = lerp(-w * 0.1, w * 1.12, t);
    const curve = (u) => lerp(y0, y1, u) - Math.sin(u * Math.PI) * h * 0.1;
    const y = curve(t);
    const trail = ctx.createLinearGradient(x - w * 0.5, 0, x, 0);
    trail.addColorStop(0, glow(0));
    trail.addColorStop(1, glow(0.9));
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let u = Math.max(0, t - 0.5); u <= t; u += 0.01) {
      const px = lerp(-w * 0.1, w * 1.12, u);
      if (u === Math.max(0, t - 0.5)) ctx.moveTo(px, curve(u)); else ctx.lineTo(px, curve(u));
    }
    ctx.stroke();

    const slope = (curve(Math.min(1, t + 0.01)) - y) / (w * 1.22 * 0.01);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2 + Math.atan(slope));
    ctx.scale(scale, scale);
    ctx.translate(-11.5, -12);
    ctx.fillStyle = `rgb(${look.line})`;
    ctx.fill(PLANE);
    ctx.restore();
  }

  /* ---------- Calendario: sus precios vuelan al globo ---------- */
  function drawCalendar(p, cam) {
    const show = seg(0.1, 0.135, p);
    const gone = seg(0.195, 0.27, p);
    if (show <= 0 || gone >= 1) return;
    const cols = 7, rows = 5;
    const cell = Math.min((w * 0.86) / cols, (h * 0.5) / rows);
    const left = w / 2 - (cell * cols) / 2;
    const top = h * 0.3;
    const cheapest = CITIES.reduce((best, item, i) => (item[3] < CITIES[best][3] ? i : best), 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < cols * rows; i += 1) {
      const price = i < CITIES.length ? CITIES[i][3] : 30 + ((i * 37) % 60);
      const x0 = left + (i % cols) * cell + cell / 2;
      const y0 = top + Math.floor(i / cols) * cell + cell / 2;
      const appear = seg(0.1 + i * 0.0008, 0.128 + i * 0.0008, p);
      let x = x0, y = y0, a = appear;
      if (i < CITIES.length) {
        const q = project(cam, CITIES[i][1], CITIES[i][2]);
        const fly = seg(0.195 + i * 0.002, 0.255 + i * 0.002, p);
        x = lerp(x0, q.x, fly);
        y = lerp(y0, q.y, fly);
        a *= 1 - seg(0.25, 0.28, p);
      } else a *= 1 - seg(0.195, 0.22, p);
      if (a <= 0.01) continue;
      const hot = i === cheapest && seg(0.15, 0.17, p);
      ctx.globalAlpha = a;
      const unit = cell / 56;
      if (gone < 0.05) {
        ctx.fillStyle = line(0.45);
        ctx.font = `400 ${11 * unit}px system-ui, sans-serif`;
        ctx.fillText(String(i + 1), x, y - 9 * unit);
      }
      if (hot) {
        ctx.strokeStyle = glow(hot);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = hot ? look.accent : `rgb(${look.line})`;
      ctx.font = `500 ${13 * unit}px system-ui, sans-serif`;
      ctx.fillText(`${price} €`, x, y + 8 * unit);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Precios sobre el globo ---------- */
  function drawTags(p, cam) {
    const a = seg(0.25, 0.29, p) * (1 - seg(0.39, 0.43, p));
    if (a <= 0) return;
    const home = project(cam, MADRID[0], MADRID[1]);
    ctx.textBaseline = 'middle';
    CITIES.forEach(([name, lat, lon, price], i) => {
      const q = project(cam, lat, lon);
      if (q.z < 0.12) return;
      const local = a * seg(0.25 + i * 0.003, 0.28 + i * 0.003, p);
      ctx.globalAlpha = local * clamp(q.z * 4);
      if (home.z > 0.05) {
        const c = { x: (home.x + q.x) / 2, y: (home.y + q.y) / 2 - Math.hypot(q.x - home.x, q.y - home.y) * 0.22 };
        ctx.strokeStyle = glow(0.5);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(home.x, home.y);
        ctx.quadraticCurveTo(c.x, c.y, q.x, q.y);
        ctx.stroke();
      }
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${look.line})`;
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${price} €`, q.x + 6, q.y);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- La ciudad, en kilómetros y en la misma cámara ---------- */
  function pathFromKm(paths) {
    const path = new Path2D();
    let length = 0;
    paths.forEach((points) => {
      points.forEach(([x, y], i) => {
        if (i) {
          path.lineTo(x, y);
          length += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
        } else path.moveTo(x, y);
      });
    });
    return { path, length };
  }

  function prepareCity(data) {
    data.streetsPath = pathFromKm(data.streets).path;
    data.rail.forEach((item) => { Object.assign(item, pathFromKm(item.paths)); });
    data.train = data.rail
      .filter((item) => item.kind === 'metro')
      .flatMap((item) => item.paths)
      .sort((a, b) => b.length - a.length)[0] || [];
    return data;
  }

  const kmScale = (cam) => cam.R / EARTH_KM;
  const toScreen = (cam, [x, y]) => {
    const q = project(cam, ROME.lat, ROME.lon);
    const s = kmScale(cam);
    return { x: q.x + x * s, y: q.y - y * s };
  };

  function drawCity(p, cam) {
    if (!city || cam.city <= 0) return;
    const s = kmScale(cam);
    const c = project(cam, ROME.lat, ROME.lon);
    ctx.save();
    ctx.globalAlpha = cam.city;
    ctx.setTransform(s * dpr, 0, 0, -s * dpr, c.x * dpr, c.y * dpr);

    const busy = seg(0.78, 0.82, p) * (1 - seg(0.89, 0.93, p));
    ctx.strokeStyle = line(0.09 + busy * 0.12);
    ctx.lineWidth = 0.7 / s;
    ctx.stroke(city.streetsPath);

    const rings = seg(0.44, 0.5, p);
    [[7, look.far], [3, look.mid], [1, look.near]].forEach(([km, color], i) => {
      const grow = seg(0.44 + i * 0.012, 0.49 + i * 0.012, p);
      if (grow <= 0) return;
      ctx.beginPath();
      ctx.arc(0, 0, km * grow, 0, Math.PI * 2);
      ctx.globalAlpha = cam.city * 0.05;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = cam.city * 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / s;
      ctx.stroke();
    });

    // Líneas de transporte que se dibujan solas
    const drawn = seg(0.76, 0.87, p);
    if (drawn > 0) {
      ctx.globalAlpha = cam.city;
      ctx.lineCap = 'round';
      city.rail.forEach((item) => {
        ctx.strokeStyle = item.color || look.accent;
        ctx.lineWidth = (item.kind === 'metro' ? 2.2 : 1.3) / s;
        ctx.setLineDash([item.length * drawn, item.length]);
        ctx.stroke(item.path);
      });
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.globalAlpha = cam.city;
    ctx.fillStyle = `rgb(${look.line})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    drawRingLabels(cam, rings * (1 - seg(0.52, 0.56, p)));
    drawHotels(p, cam);
    drawMonuments(p, cam);
    drawTrain(p, cam);
    ctx.globalAlpha = 1;
  }

  function drawRingLabels(cam, a) {
    if (a <= 0) return;
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [[1, look.near, '1 km'], [3, look.mid, '3 km'], [7, look.far, '7 km']].forEach(([km, color, label]) => {
      const q = toScreen(cam, [0, -km]);
      if (q.y > h - 12) return;
      ctx.globalAlpha = a * cam.city;
      ctx.fillStyle = look.bg;
      ctx.fillRect(q.x - 20, q.y - 9, 40, 18);
      ctx.fillStyle = color;
      ctx.fillText(label, q.x, q.y);
    });
  }

  function zoneOf(km) {
    return km <= 1 ? look.near : km <= 3 ? look.mid : look.far;
  }

  function drawHotels(p, cam) {
    const fade = 1 - seg(0.64, 0.68, p) * 0.9;
    const a = seg(0.52, 0.56, p) * fade * (1 - seg(0.76, 0.8, p));
    if (a <= 0) return;
    let ringing = 0;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    city.hotels.forEach((km, i) => {
      const start = 0.53 + i * 0.009;
      const pop = seg(start, start + 0.012, p);
      if (pop <= 0) return;
      const q = toScreen(cam, km);
      // Cada hotel aparece con un pequeño eco, como un toque de campana.
      const echo = clamp((p - start) / 0.024);
      if (echo < 1) {
        ringing = Math.max(ringing, 1 - echo);
        ctx.globalAlpha = (1 - echo) * 0.7;
        ctx.strokeStyle = look.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 10 + echo * 42, 0, Math.PI * 2);
        ctx.stroke();
      }
      const label = `${HOTEL_PRICES[i % HOTEL_PRICES.length]} €`;
      const width = ctx.measureText(label).width + 16;
      const color = zoneOf(Math.hypot(km[0], km[1]));
      ctx.globalAlpha = a * pop;
      ctx.fillStyle = look.pill;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(q.x - width / 2, q.y - 11, width, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(${look.line})`;
      ctx.fillText(label, q.x, q.y + 0.5);
    });
    drawBell(p, ringing, a);
  }

  function drawBell(p, ringing, a) {
    const show = seg(0.52, 0.55, p) * (1 - seg(0.635, 0.66, p));
    if (show <= 0) return;
    const size = clamp(m * 0.09, 44, 76);
    const x = w - size * 1.1 - Math.min(w * 0.05, 60);
    const y = h * 0.2 + size * 0.3;
    ctx.globalAlpha = show * Math.min(1, a + 0.2);
    ctx.save();
    ctx.translate(x, y - size * 0.45);
    ctx.rotate(Math.sin(time * 16) * 0.26 * ringing);
    ctx.scale(size / 24, size / 24);
    ctx.translate(-12, -2.5);
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 1.05;
    ctx.lineJoin = 'round';
    ctx.stroke(BELL);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawMonuments(p, cam) {
    const a = seg(0.645, 0.68, p);
    const dim = 1 - seg(0.9, 0.94, p);
    if (a <= 0 || dim <= 0) return;
    const fade = lerp(1, 0.55, seg(0.76, 0.8, p));
    city.monuments.forEach((item, i) => {
      const pop = seg(0.645 + i * 0.0012, 0.665 + i * 0.0012, p);
      if (pop <= 0) return;
      const q = toScreen(cam, item.km);
      ctx.globalAlpha = pop * dim * fade;
      ctx.fillStyle = zoneOf(Math.hypot(item.km[0], item.km[1]));
      ctx.beginPath();
      ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Tres fotos que nacen de su punto y vuelven a él
    const cards = city.monuments.filter((item) => item.photo);
    const size = clamp(m * 0.25, 92, 200);
    const places = w > h
      ? [[w * 0.73, h * 0.56], [w * 0.1, h * 0.46], [w * 0.74, h * 0.2]]
      : [[w * 0.56, h * 0.74], [w * 0.04, h * 0.7], [w * 0.56, h * 0.27]];
    cards.forEach((item, i) => {
      const open = seg(0.665 + i * 0.012, 0.69 + i * 0.012, p) * (1 - seg(0.75, 0.775, p));
      const img = photos[item.photo];
      if (open <= 0 || !img || !img.complete || !img.naturalWidth) return;
      const from = toScreen(cam, item.km);
      const x = lerp(from.x, places[i][0], open);
      const y = lerp(from.y, places[i][1], open);
      const edge = size * open;
      ctx.globalAlpha = open;
      ctx.strokeStyle = line(0.3);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x + edge / 2, y + edge / 2);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, edge, edge, 10);
      ctx.clip();
      ctx.drawImage(img, x, y, edge, edge);
      ctx.restore();
      ctx.fillStyle = `rgb(${look.line})`;
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item.name, x, y + edge + 7);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- Un tren que recorre la línea ---------- */
  function drawTrain(p, cam) {
    const route = city.train;
    const a = seg(0.8, 0.82, p) * (1 - seg(0.885, 0.9, p));
    if (a <= 0 || route.length < 2) return;
    const lengths = [0];
    for (let i = 1; i < route.length; i += 1) {
      lengths[i] = lengths[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    }
    const total = lengths[lengths.length - 1];
    const at = seg(0.8, 0.89, p) * total;
    let i = 1;
    while (i < route.length - 1 && lengths[i] < at) i += 1;
    const t = clamp((at - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1));
    const km = [lerp(route[i - 1][0], route[i][0], t), lerp(route[i - 1][1], route[i][1], t)];
    const q = toScreen(cam, km);
    const angle = Math.atan2(-(route[i][1] - route[i - 1][1]), route[i][0] - route[i - 1][0]);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(angle);
    ctx.shadowColor = look.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.roundRect(-17, -4.5, 34, 9, 4.5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = look.bg;
    for (let n = -11; n <= 7; n += 6) ctx.fillRect(n, -1.8, 3.6, 3.2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- Textos: una frase a la vez ---------- */
  function drawCaptions(p) {
    caps.forEach((el) => {
      const from = Number(el.dataset.from);
      const to = Number(el.dataset.to);
      const span = 0.016;
      const a = seg(from - span, from + span * 0.5, p) * (1 - seg(to - span * 0.5, to + span, p));
      el.style.opacity = a.toFixed(3);
      if (el.classList.contains('sc-cap')) {
        const rise = (1 - seg(from - span, from + span * 0.5, p)) * 22 - seg(to - span * 0.5, to + span, p) * 22;
        el.style.transform = `translateY(${rise.toFixed(1)}px)`;
        el.classList.toggle('is-live', a > 0.6);
      }
    });
  }

  function render() {
    const p = progress;
    const cam = camera(p);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = look.bg;
    ctx.fillRect(0, 0, w, h);

    drawGlobe(cam);
    drawCity(p, cam);
    drawTags(p, cam);
    drawCalendar(p, cam);

    // El avión del principio, y el que se lleva la escena al final
    const first = lerp(0.22, 1.25, seg(0, 0.105, p));
    if (first < 1.2) drawPlane(first + Math.sin(time * 0.5) * 0.004, h * 0.62, h * 0.5, clamp(m / 500, 0.9, 1.5));
    const last = seg(0.9, 1, p);
    if (last > 0) drawPlane(lerp(-0.1, 0.72, last), h * 0.74, h * 0.62, clamp(m / 500, 0.9, 1.5));

    drawCaptions(p);
  }

  function frame(now) {
    time = now / 1000;
    progress += (target - progress) * 0.085;
    if (Math.abs(target - progress) < 0.00005) progress = target;
    render();
    requestAnimationFrame(frame);
  }

  readLook();
  resize();
  readScroll();
  progress = target;
  addEventListener('resize', () => { resize(); readScroll(); });
  addEventListener('scroll', readScroll, { passive: true });
  document.addEventListener('toptravel:tema', readLook);
  ['roma', 'roma2', 'roma3'].forEach((name) => {
    photos[name] = new Image();
    photos[name].src = `assets/${name}.jpg`;
  });
  fetch('vendor/globo.json').then((r) => r.json()).then((data) => { globe = data; }).catch(() => {});
  fetch('vendor/roma.json').then((r) => r.json()).then((data) => { city = prepareCity(data); }).catch(() => {});
  requestAnimationFrame(frame);
})();
