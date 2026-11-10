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

  // animated block tower (original drawing: isometric cubes placed one by one)
  const cv = document.getElementById('stack'); if (!cv) return;
  const ctx = cv.getContext('2d'); const countEl = document.getElementById('count');
  const S = 640; const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = S * dpr; cv.height = S * dpr; ctx.scale(dpr, dpr);
  const W = 76, H = 42, Z = 48, ox = S / 2, oy = 300; // cube width, half-diamond height, cube height
  const pal = [['#ffb59d', '#ff6a3d', '#d8512b'], ['#9ff0d3', '#2fcf9b', '#1ba579'], ['#ffe59a', '#ffc233', '#d99f14'], ['#a9d4ff', '#4da3ff', '#2f7fd6']];
  const plan = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[-1,0,0],[0,-1,0],[1,-1,0],[0,0,1],[1,0,1],[0,1,1],[0,0,2],[1,1,1],[-1,0,1],[0,0,3]];
  const iso = (x, y, z) => [ox + (x - y) * W / 2 * 1.0, oy + (x + y) * H / 2 * 1.0 - z * Z];
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const cube = (b, c, drop = 0) => {
    const [x, y, z] = b; const [tx, ty] = iso(x, y, z); const yy = ty - drop; const w = W / 2, h = H / 2;
    poly([[tx, yy - Z], [tx + w, yy - Z + h], [tx, yy - Z + 2 * h], [tx - w, yy - Z + h]], c[0]);
    poly([[tx - w, yy - Z + h], [tx, yy - Z + 2 * h], [tx, yy + 2 * h], [tx - w, yy + h]], c[1]);
    poly([[tx, yy - Z + 2 * h], [tx + w, yy - Z + h], [tx + w, yy + h], [tx, yy + 2 * h]], c[2]);
  };
  const base = () => {
    for (let x = -3; x <= 4; x++) for (let y = -3; y <= 4; y++) {
      const [tx, ty] = iso(x, y, 0); const w = W / 2, h = H / 2; const dark = (x + y) % 2 === 0;
      poly([[tx, ty], [tx + w, ty + h], [tx, ty + 2 * h], [tx - w, ty + h]], dark ? '#cfdcd5' : '#dbe6df');
    }
  };
  const order = [...plan].sort((a, b) => a[2] - b[2] || (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
  const draw = (n, t) => {
    ctx.clearRect(0, 0, S, S); base();
    order.slice(0, n).forEach((b, i) => cube(b, pal[i % pal.length], i === n - 1 ? Math.max(0, 1 - t) * 90 : 0));
    if (countEl) countEl.textContent = String(n);
  };
  if (reduce) { draw(order.length, 1); return; }
  let n = 0, t = 0, last = performance.now(), hold = 0;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (hold > 0) { hold -= dt; if (hold <= 0) { n = 0; t = 0; } }
    else { t += dt * 3.2; if (t >= 1) { t = 0; if (n < order.length) n++; else hold = 1.6; } }
    draw(hold > 0 ? order.length : Math.max(n, 0), hold > 0 ? 1 : t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
