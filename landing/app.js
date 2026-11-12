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

  // The spinning circle (AnimatedSphere) and triangle (AnimatedTetrahedron) are the ones from the Optimus template:
  // same maths, same constants, same characters. Only change: the ink turns light in dark mode so they stay visible.
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const ink = () => (dark.matches ? '243, 239, 230' : '0, 0, 0');

  const animatedSphere = (canvas) => {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const chars = '░▒▓█▀▄▌▐│─┤├┴┬╭╮╰╯';
    let time = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', () => { resize(); if (reduce) render(); });
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.525;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const points = [];
      // Generate sphere points
      for (let phi = 0; phi < Math.PI * 2; phi += 0.15) {
        for (let theta = 0; theta < Math.PI; theta += 0.15) {
          const x = Math.sin(theta) * Math.cos(phi + time * 0.5);
          const y = Math.sin(theta) * Math.sin(phi + time * 0.5);
          const z = Math.cos(theta);
          // Rotate around Y axis
          const angleY = time * 0.3;
          const rotX = x * Math.cos(angleY) - z * Math.sin(angleY);
          const rotZ = x * Math.sin(angleY) + z * Math.cos(angleY);
          // Rotate around X axis
          const angleX = time * 0.2;
          const rotY = y * Math.cos(angleX) - rotZ * Math.sin(angleX);
          const finalZ = y * Math.sin(angleX) + rotZ * Math.cos(angleX);
          const charIndex = Math.floor(((finalZ + 1) / 2) * (chars.length - 1));
          points.push({ x: centerX + rotX * radius, y: centerY + rotY * radius, z: finalZ, char: chars[charIndex] });
        }
      }
      points.sort((a, b) => a.z - b.z);
      points.forEach((p) => {
        const opacity = 0.2 + (p.z + 1) * 0.4;
        ctx.fillStyle = `rgba(${ink()}, ${opacity})`;
        ctx.fillText(p.char, p.x, p.y);
      });
      time += 0.02;
      if (!reduce) requestAnimationFrame(render);
    };
    render();
  };

  const animatedTetrahedron = (canvas) => {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const chars = '░▒▓█▀▄▌▐│─┤├┴┬╭╮╰╯';
    let time = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', () => { resize(); if (reduce) render(); });
    // Tetrahedron vertices
    const vertices = [
      { x: 0, y: 1, z: 0 },              // Top
      { x: -0.943, y: -0.333, z: -0.5 }, // Bottom left back
      { x: 0.943, y: -0.333, z: -0.5 },  // Bottom right back
      { x: 0, y: -0.333, z: 1 },         // Bottom front
    ];
    // Edges connecting vertices
    const edges = [
      [0, 1], [0, 2], [0, 3], // Top to bottom vertices
      [1, 2], [2, 3], [3, 1], // Bottom triangle
    ];
    // Faces for filling with points
    const faces = [
      [0, 1, 2], // Back face
      [0, 2, 3], // Right face
      [0, 3, 1], // Left face
      [1, 3, 2], // Bottom face
    ];
    const rotateY = (point, angle) => ({ x: point.x * Math.cos(angle) - point.z * Math.sin(angle), y: point.y, z: point.x * Math.sin(angle) + point.z * Math.cos(angle) });
    const rotateX = (point, angle) => ({ x: point.x, y: point.y * Math.cos(angle) - point.z * Math.sin(angle), z: point.y * Math.sin(angle) + point.z * Math.cos(angle) });
    const rotateZ = (point, angle) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle), z: point.z });
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.7;
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const points = [];
      // Draw edges
      edges.forEach(([i, j]) => {
        const v1 = vertices[i];
        const v2 = vertices[j];
        for (let t = 0; t <= 1; t += 0.05) {
          let point = { x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t, z: v1.z + (v2.z - v1.z) * t };
          point = rotateY(point, time * 0.4);
          point = rotateX(point, time * 0.3);
          point = rotateZ(point, time * 0.2);
          const charIndex = Math.floor(((point.z + 1.5) / 3) * (chars.length - 1));
          points.push({ x: centerX + point.x * radius, y: centerY - point.y * radius, z: point.z, char: chars[Math.min(charIndex, chars.length - 1)] });
        }
      });
      // Fill faces with points
      faces.forEach(([a, b, c]) => {
        const v1 = vertices[a];
        const v2 = vertices[b];
        const v3 = vertices[c];
        for (let u = 0; u <= 1; u += 0.12) {
          for (let v = 0; v <= 1 - u; v += 0.12) {
            const w = 1 - u - v;
            let point = { x: v1.x * u + v2.x * v + v3.x * w, y: v1.y * u + v2.y * v + v3.y * w, z: v1.z * u + v2.z * v + v3.z * w };
            point = rotateY(point, time * 0.4);
            point = rotateX(point, time * 0.3);
            point = rotateZ(point, time * 0.2);
            const charIndex = Math.floor(((point.z + 1.5) / 3) * (chars.length - 1));
            points.push({ x: centerX + point.x * radius, y: centerY - point.y * radius, z: point.z, char: chars[Math.min(charIndex, chars.length - 1)] });
          }
        }
      });
      points.sort((a, b) => a.z - b.z);
      points.forEach((p) => {
        const opacity = 0.15 + (p.z + 1.5) * 0.25;
        ctx.fillStyle = `rgba(${ink()}, ${Math.min(opacity, 0.9)})`;
        ctx.fillText(p.char, p.x, p.y);
      });
      time += 0.015;
      if (!reduce) requestAnimationFrame(render);
    };
    render();
  };

  const sphere = document.getElementById('optimus-sphere'); if (sphere) animatedSphere(sphere);
  const tetra = document.getElementById('optimus-tetra'); if (tetra) animatedTetrahedron(tetra);

  // Keep both canvases sharp and the right shape: re-measure whenever their box changes (rotating the iPad, zoom,
  // coming back to the tab, browser quirks). A stale size is what makes the characters look stretched and blurry.
  let refitQueued = false;
  const refit = () => { if (refitQueued) return; refitQueued = true; requestAnimationFrame(() => { refitQueued = false; window.dispatchEvent(new Event('resize')); }); };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(refit); [sphere, tetra].forEach((c) => c && ro.observe(c)); }
  window.addEventListener('pageshow', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
})();
