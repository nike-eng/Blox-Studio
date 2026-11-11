(() => {
  // shrinking pill nav
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll(); addEventListener('scroll', onScroll, { passive: true });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // rotating word in the headline
  const word = document.querySelector('.rotor-word');
  const words = ['thumbs', 'friends', 'ideas', 'iPad'];
  let wi = 0;
  if (word && !reduce) setInterval(() => {
    word.classList.add('out');
    setTimeout(() => { wi = (wi + 1) % words.length; word.textContent = words[wi]; word.classList.remove('out'); }, 350);
  }, 2600);

  // scroll reveal
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
    items.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
  } else items.forEach((el) => el.classList.add('in'));

  // hero art: a spinning globe and a spinning pyramid drawn out of text characters (original code)
  const cv = document.getElementById('shapes'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const RAMP = ['░', '▒', '▓', '█']; // light -> solid blocks
  const ALPHA = [0.28, 0.5, 0.75, 1];
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  let pal = [], W = 560, fs = 12, cw = 7.2, ch = 12.6, cols = 0, rows = 0, zbuf, glyph, hue, tone;
  let tiltTarget = 0, tilt = 0;
  const readPalette = () => { pal = [css('--ink'), css('--accent'), '#ffb21f', '#ff6a3d', css('--muted')]; };
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(220, cv.getBoundingClientRect().width || 560);
    cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fs = Math.max(8, Math.min(12, W / 50)); cw = fs * 0.6; ch = fs * 1.05;
    cols = Math.floor(W / cw); rows = Math.floor(W / ch);
    zbuf = new Float32Array(cols * rows); glyph = new Array(cols * rows); hue = new Uint8Array(cols * rows); tone = new Uint8Array(cols * rows);
    readPalette();
  };
  const put = (px, py, z, g, h, t) => {
    const c = Math.floor(px / cw), r = Math.floor(py / ch);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    if (z > zbuf[i]) { zbuf[i] = z; glyph[i] = g; hue[i] = h; tone[i] = t; }
  };
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const D = 180 / Math.PI;

  // the globe: every text cell on the disc is turned back onto a sphere, so the pattern really rotates
  const globe = (t) => {
    const R = W * 0.31, cx = W * 0.4, cy = W * 0.4;
    const spin = t * 0.55, tl = 0.38 + tilt;
    const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tl), st = Math.sin(tl);
    const r0 = Math.max(0, Math.floor((cy - R) / ch)), r1 = Math.min(rows - 1, Math.ceil((cy + R) / ch));
    const c0 = Math.max(0, Math.floor((cx - R) / cw)), c1 = Math.min(cols - 1, Math.ceil((cx + R) / cw));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const dx = ((c + 0.5) * cw - cx) / R, dy = (cy - (r + 0.5) * ch) / R, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const dz = Math.sqrt(1 - d2);
      const light = Math.max(0, -0.45 * dx + 0.55 * dy + 0.7 * dz);
      const y1 = dy * ct + dz * st, z1 = -dy * st + dz * ct;
      const x2 = dx * cs - z1 * sn, z2 = dx * sn + z1 * cs;
      const lon = Math.atan2(x2, z2) * D, lat = Math.asin(Math.max(-1, Math.min(1, y1))) * D;
      let tn = Math.min(3, Math.floor(light * 4)); if (d2 > 0.8) tn = Math.max(0, tn - 1);
      const m = Math.abs(((lon % 30) + 30) % 30), p = Math.abs(((lat % 30) + 30) % 30);
      const onM = Math.min(m, 30 - m) < 2.4, onP = Math.min(p, 30 - p) < 2.4;
      let g, h = 0;
      if (onM || onP) { g = onM && onP ? '┼' : onM ? '│' : '─'; h = 1; tn = Math.max(1, tn); }
      else {
        const v = 0.6 * hash(Math.floor((lon + 360) / 15), Math.floor((lat + 90) / 15)) + 0.4 * hash(Math.floor((lon + 360) / 40) + 7, Math.floor((lat + 90) / 40) + 3);
        if (v > 0.52) g = RAMP[Math.min(2, Math.floor(light * 3.2))]; else { g = light > 0.55 ? ':' : '·'; h = 4; }
      }
      put((c + 0.5) * cw, (r + 0.5) * ch, dz, g, h, tn);
    }
  };

  // the pyramid: four faces filled with points, six edges drawn on top, spinning around its tip
  const TOP = [0, 1, 0], B = [[0.9428, -0.3333, 0], [-0.4714, -0.3333, 0.8165], [-0.4714, -0.3333, -0.8165]];
  const BASE = [TOP, ...B];
  const FACES = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
  const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]];
  const pyramid = (t) => {
    const cx = W * 0.73, cy = W * 0.74, R = W * 0.2;
    const a = -t * 0.9, tl = 0.5 + tilt * 0.6 + Math.sin(t * 0.5) * 0.12;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tl), st = Math.sin(tl);
    const V = BASE.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * ct - z1 * st, y * st + z1 * ct]; });
    const proj = (p) => { const s = 1 / (1 - p[2] * 0.2); return [cx + p[0] * R * s, cy - p[1] * R * s]; };
    const vis = FACES.map((f) => {
      const [A, Bv, C] = f.map((i) => V[i]);
      const u = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const mid = [(A[0] + Bv[0] + C[0]) / 3, (A[1] + Bv[1] + C[1]) / 3, (A[2] + Bv[2] + C[2]) / 3];
      if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / len, n[1] / len, n[2] / len];
      return { n, show: n[2] > 0.02, light: Math.max(0, -0.45 * n[0] + 0.55 * n[1] + 0.7 * n[2]) * 0.8 + 0.2 };
    });
    const N = 34;
    FACES.forEach((f, fi) => {
      if (!vis[fi].show) return;
      const [A, Bv, C] = f.map((i) => V[i]); const tn = Math.min(3, Math.floor(vis[fi].light * 4));
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
        const u = i / N, v = j / N, w = 1 - u - v;
        const p = [A[0] * u + Bv[0] * v + C[0] * w, A[1] * u + Bv[1] * v + C[1] * w, A[2] * u + Bv[2] * v + C[2] * w];
        const [sx, sy] = proj(p); put(sx, sy, 2 + p[2], RAMP[tn], 2, tn);
      }
    });
    EDGES.forEach(([i, j]) => {
      const seen = FACES.some((f, fi) => f.includes(i) && f.includes(j) && vis[fi].show); if (!seen) return;
      for (let k = 0; k <= 56; k++) {
        const u = k / 56, p = [V[i][0] + (V[j][0] - V[i][0]) * u, V[i][1] + (V[j][1] - V[i][1]) * u, V[i][2] + (V[j][2] - V[i][2]) * u];
        const [sx, sy] = proj(p); put(sx, sy, 2.05 + p[2], '█', 3, 3);
      }
    });
  };

  const draw = (t) => {
    zbuf.fill(-1e9); glyph.fill(undefined);
    globe(t); pyramid(t);
    ctx.clearRect(0, 0, W, W);
    ctx.font = fs + 'px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const buckets = Array.from({ length: pal.length * 4 }, () => []);
    for (let i = 0; i < glyph.length; i++) if (glyph[i]) buckets[hue[i] * 4 + tone[i]].push(i);
    buckets.forEach((cells, k) => {
      if (!cells.length) return;
      ctx.fillStyle = pal[k >> 2]; ctx.globalAlpha = ALPHA[k & 3];
      cells.forEach((i) => ctx.fillText(glyph[i], ((i % cols) + 0.5) * cw, (Math.floor(i / cols) + 0.5) * ch));
    });
    ctx.globalAlpha = 1;
  };

  fit();
  let t = 1.3, raf = 0, acc = 0, last = performance.now(), onScreen = true;
  new ResizeObserver(() => { fit(); draw(t); }).observe(cv);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readPalette(); draw(t); });
  if (reduce) { draw(t); return; }
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); tiltTarget = ((e.clientY - r.top) / r.height - 0.5) * 0.7; }, { passive: true });
  cv.addEventListener('pointerleave', () => { tiltTarget = 0; });
  const loop = (now) => {
    raf = 0; if (!onScreen || document.hidden) return;
    raf = requestAnimationFrame(loop);
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    if (acc < 1 / 40) return; // about 40 frames a second keeps phones cool
    t += acc; acc = 0; tilt += (tiltTarget - tilt) * 0.1; draw(t);
  };
  const kick = () => { if (!raf && onScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; kick(); }, { threshold: 0.05 }).observe(cv);
  document.addEventListener('visibilitychange', kick);
  kick();
})();
