// Hero bubble: the duck bounces around inside the glass, spins on impact, and reacts to the cursor.
// Units: positions and velocities are in bubble radii (R = 1), so it scales with any screen size.

export function initBubble(bubble: HTMLElement, duck: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rr = 0.4; // duck collision radius
  const lim = 1 - rr; // how far the duck's centre may travel
  let x = 0.2, y = -0.15, vx = 0.42, vy = 0.34;
  let th = 0, w = 0.8; // duck rotation and spin
  let s = 0, sv = 0, ang = 0; // impact squash: amount, velocity, direction
  let k = 0, ap = 0; // cursor stretch: amount, direction
  let last = 0, raf = 0, visible = true;
  const ptr = { on: false, cx: 0, cy: 0 };
  let tap: { cx: number; cy: number } | null = null;

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const onMove = (e: PointerEvent) => {
    ptr.on = e.pointerType !== 'touch' || e.buttons > 0;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
  };
  const onDown = (e: PointerEvent) => {
    ptr.on = true;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
    tap = { cx: e.clientX, cy: e.clientY };
  };
  const onUp = (e: PointerEvent) => { if (e.pointerType === 'touch') ptr.on = false; };
  const onLeave = () => { ptr.on = false; };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    const R = bubble.clientWidth / 2;
    if (R <= 0) return;
    const rect = bubble.getBoundingClientRect();
    const ccx = rect.left + rect.width / 2;
    const ccy = rect.top + rect.height / 2;

    let px = 0, py = 0, pd = 99;
    if (ptr.on) {
      px = (ptr.cx - ccx) / R;
      py = (ptr.cy - ccy) / R;
      pd = Math.hypot(px, py);
    }

    // Tap on the glass: squash from that side, knock the duck away and set it spinning.
    if (tap) {
      const tx = (tap.cx - ccx) / R, ty = (tap.cy - ccy) / R;
      const td = Math.hypot(tx, ty);
      tap = null;
      if (td < 1.1) {
        const nx = td > 0.001 ? tx / td : 1, ny = td > 0.001 ? ty / td : 0;
        sv += 1.4;
        ang = Math.atan2(ny, nx);
        vx -= nx * 0.9;
        vy -= ny * 0.9;
        w = clamp(w + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2), -5, 5);
      }
    }

    if (pd < 1.4) {
      // Curious duck: drifts toward the cursor, but stays trapped.
      const gd = Math.hypot(px, py) || 1;
      const sc = gd > lim ? lim / gd : 1;
      vx += (px * sc - x) * 1.8 * dt;
      vy += (py * sc - y) * 1.8 * dt;
      const damp = Math.exp(-0.9 * dt);
      vx *= damp;
      vy *= damp;
      const spd = Math.hypot(vx, vy);
      if (spd > 0.9) { vx *= 0.9 / spd; vy *= 0.9 / spd; }
    } else {
      // Relax back to a calm cruising speed.
      const spd = Math.hypot(vx, vy) || 1;
      const f = 1 + (0.55 / spd - 1) * Math.min(1, 0.8 * dt);
      vx *= f;
      vy *= f;
    }

    x += vx * dt;
    y += vy * dt;
    const d = Math.hypot(x, y);
    if (d >= lim) {
      const nx = x / d, ny = y / d;
      const vn = vx * nx + vy * ny;
      if (vn > 0) {
        const vt = vx * -ny + vy * nx;
        vx -= 2 * vn * nx;
        vy -= 2 * vn * ny;
        if (vn > 0.15) {
          const j = (Math.random() - 0.5) * 0.3;
          const c = Math.cos(j), sn = Math.sin(j);
          const rx = vx * c - vy * sn;
          vy = vx * sn + vy * c;
          vx = rx;
        }
        if (pd >= 1.4) {
          const sp = Math.hypot(vx, vy) || 1;
          const target = 0.5 + Math.random() * 0.15;
          vx *= target / sp;
          vy *= target / sp;
        }
        w = clamp(w * 0.4 + (2.4 * vt) / rr, -5, 5);
        sv += Math.min(0.8, vn) * 1.5;
        ang = Math.atan2(ny, nx);
      }
      x = nx * lim;
      y = ny * lim;
    }

    w *= Math.exp(-0.35 * dt);
    th += w * dt;
    sv += (-180 * s - 12 * sv) * dt;
    s = clamp(s + sv * dt, -0.09, 0.09);

    // Bubble stretches and leans toward the cursor, strongest near its edge.
    const prox = pd < 99 ? 0.075 * Math.exp(-Math.pow((pd - 1.05) / 0.75, 2)) : 0;
    k += (prox - k) * Math.min(1, 7 * dt);
    const hasPtr = pd < 99 && pd > 0.01;
    if (hasPtr) ap = Math.atan2(py, px);
    const lean = k / 0.075;
    const lx = hasPtr ? (px / pd) * lean * 0.05 * R : 0;
    const ly = hasPtr ? (py / pd) * lean * 0.05 * R : 0;

    duck.style.transform = `translate(calc(-50% + ${(x * R).toFixed(2)}px), calc(-50% + ${(y * R).toFixed(2)}px)) rotate(${th.toFixed(4)}rad)`;
    bubble.style.transform =
      `translate(${lx.toFixed(2)}px, ${ly.toFixed(2)}px) rotate(${ap.toFixed(4)}rad) scale(${(1 + k).toFixed(4)}, ${(1 - 0.7 * k).toFixed(4)}) rotate(${(-ap).toFixed(4)}rad)` +
      ` rotate(${ang.toFixed(4)}rad) scale(${(1 - s).toFixed(4)}, ${(1 + s).toFixed(4)}) rotate(${(-ang).toFixed(4)}rad)`;
  };

  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  // Do not burn battery while the hero is scrolled out of view.
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    visible ? start() : stop();
  });
  io.observe(bubble);
  start();
}
