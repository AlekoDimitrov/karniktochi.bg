// Hero bubble: the duck bounces around inside the glass, spins on impact, and reacts to the cursor.
// Units: positions and velocities are in bubble radii (R = 1), so it scales with any screen size.
// On top of the physics: the duck squashes on impact and stretches when fast, breathes, blinks,
// watches the cursor and startles when tapped; each wall hit sends a ripple across the glass.
// Everything is drawn with transform and opacity only.

export function initBubble(bubble: HTMLElement, duck: HTMLElement, toggle?: HTMLButtonElement | null) {
  // If the visitor's system asks for reduced motion, run a calm version (slow drift, blinking and
  // half-strength breathing only: no spin, squash, ripples or cursor reactions).
  // Everyone gets a pause button (WCAG 2.2.2), and it stops everything.
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = calm ? 0.35 : 1;
  let paused = false;

  const eyes = duck.querySelector<SVGSVGElement>('[data-eyes]');
  const look = duck.querySelector<SVGGElement>('[data-look]');
  const rings = Array.from(bubble.querySelectorAll<HTMLElement>('[data-ripple]'));

  const rr = 0.4; // duck collision radius
  const lim = 1 - rr; // how far the duck's centre may travel
  let x = 0.2, y = -0.15, vx = 0.42, vy = 0.34;
  let th = 0, w = 0.8; // duck rotation and spin
  let s = 0, sv = 0, ang = 0; // impact squash of the bubble: amount, velocity, direction
  let k = 0, ap = 0; // cursor stretch: amount, direction
  let last = 0, raf = 0, visible = true;
  const ptr = { on: false, cx: 0, cy: 0 };
  let tap: { cx: number; cy: number } | null = null;

  // The effects below run on real time (not slowed in calm mode) that only advances while animating.
  let clock = 0;
  let ds = 0, dsv = 0, dang = 0; // impact squash of the duck: amount (1 = full), velocity, direction
  let st = 0; // stretch along the velocity (1 = full)
  let startle = -1; // seconds since a tap startled the duck, -1 when not startled
  let blinkEnd = -1, nextBlink = 3 + Math.random() * 3;
  let ex = 0, ey = 0; // eye offset, in image pixels (the duck image is 600 wide)
  const ringT = rings.map(() => -1); // ripple ages in seconds, -1 when idle
  const ringX = rings.map(() => 0), ringY = rings.map(() => 0);

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const onMove = (e: PointerEvent) => {
    if (calm) return;
    ptr.on = e.pointerType !== 'touch' || e.buttons > 0;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
  };
  const onDown = (e: PointerEvent) => {
    if (calm || (e.target as Element | null)?.closest?.('[data-bubble-toggle]')) return;
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

  // Start a ripple at a point on the wall (unit normal nx, ny); reuses the oldest ring if all are busy.
  const ripple = (nx: number, ny: number, R: number) => {
    let i = ringT.indexOf(-1);
    if (i < 0) i = ringT.indexOf(Math.max(...ringT));
    if (i < 0) return;
    ringT[i] = 0;
    ringX[i] = R + nx * R;
    ringY[i] = R + ny * R;
  };

  const setBlink = (on: boolean) => {
    blinkEnd = on ? clock + 0.12 : -1;
    eyes?.toggleAttribute('data-blink', on);
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    const dt = rdt * speed;
    last = t;
    clock += rdt;
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

    // Tap on the glass: squash from that side, knock the duck away, set it spinning and startle it.
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
        startle = 0;
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
        if (!calm) {
          const a = Math.min(1, vn / 0.7);
          if (a > ds) { ds = a; dsv = 0; dang = ang; }
          // A duck resting against the wall (cursor pulling it) touches every frame: no ripple for those.
          if (vn > 0.12) ripple(nx, ny, R);
        }
      }
      x = nx * lim;
      y = ny * lim;
    }

    if (calm) { w = 0; sv = 0; s = 0; }
    w *= Math.exp(-0.35 * dt);
    th += w * dt;
    sv += (-180 * s - 12 * sv) * dt;
    s = clamp(s + sv * dt, -0.09, 0.09);

    // Duck squash springs back in about 250 ms; stretch follows speed above cruising.
    dsv += (-400 * ds - 28 * dsv) * rdt;
    ds = clamp(ds + dsv * rdt, -0.3, 1);
    const spd = Math.hypot(vx, vy);
    st += ((calm ? 0 : clamp((spd - 0.7) / 0.5, 0, 1)) - st) * Math.min(1, 10 * rdt);

    // Breathing (±2% at 0.8 Hz, half in calm mode) and the startle pop (1.12 for 150 ms).
    let sc = 1 + (calm ? 0.01 : 0.02) * Math.sin(2 * Math.PI * 0.8 * clock);
    if (startle >= 0) {
      startle += rdt;
      if (startle >= 0.15) startle = -1;
      else sc *= 1 + 0.12 * clamp(Math.min(startle, 0.15 - startle) / 0.04, 0, 1);
    }

    // Blink every 3–6 s for 120 ms.
    if (blinkEnd >= 0 && clock >= blinkEnd) setBlink(false);
    if (clock >= nextBlink) {
      setBlink(true);
      nextBlink = clock + 3 + Math.random() * 3;
    }

    // Eyes look toward the pointer, up to 4% of the duck's width, in the duck's rotated frame.
    let gx = 0, gy = 0;
    if (pd < 99) {
      const rx = px - x, ry = py - y;
      const c = Math.cos(th), sn = Math.sin(th);
      const lx = rx * c + ry * sn, ly = -rx * sn + ry * c;
      const ld = Math.hypot(lx, ly);
      if (ld > 0.001) {
        const reach = (24 * Math.min(1, ld / 0.5)) / ld;
        gx = lx * reach;
        gy = ly * reach;
      }
    }
    const eDx = (gx - ex) * Math.min(1, 12 * rdt), eDy = (gy - ey) * Math.min(1, 12 * rdt);
    if (Math.abs(eDx) + Math.abs(eDy) > 0.01) {
      ex += eDx;
      ey += eDy;
      if (look) look.style.transform = `translate(${ex.toFixed(2)}px, ${ey.toFixed(2)}px)`;
    }

    // Ripples: a ring grows from the contact point and fades over 400 ms.
    for (let i = 0; i < rings.length; i++) {
      if (ringT[i] < 0) continue;
      ringT[i] += rdt;
      const p = ringT[i] / 0.4;
      if (p >= 1) {
        ringT[i] = -1;
        rings[i].style.opacity = '0';
        continue;
      }
      const grow = 0.2 + 0.8 * (1 - (1 - p) * (1 - p));
      rings[i].style.transform = `translate(${ringX[i].toFixed(1)}px, ${ringY[i].toFixed(1)}px) scale(${grow.toFixed(3)})`;
      rings[i].style.opacity = (1 - p).toFixed(3);
    }

    let squash = '';
    if (Math.abs(ds) > 0.001) {
      squash = ` rotate(${dang.toFixed(4)}rad) scale(${(1 - 0.12 * ds).toFixed(4)}, ${(1 + 0.08 * ds).toFixed(4)}) rotate(${(-dang).toFixed(4)}rad)`;
    }
    if (st > 0.001) {
      const va = Math.atan2(vy, vx);
      squash += ` rotate(${va.toFixed(4)}rad) scale(${(1 + 0.04 * st).toFixed(4)}, 1) rotate(${(-va).toFixed(4)}rad)`;
    }
    duck.style.transform =
      `translate(calc(-50% + ${(x * R).toFixed(2)}px), calc(-50% + ${(y * R).toFixed(2)}px))${squash}` +
      ` rotate(${th.toFixed(4)}rad) scale(${sc.toFixed(4)})`;

    // Bubble stretches and leans toward the cursor, strongest near its edge.
    const prox = pd < 99 ? 0.075 * Math.exp(-Math.pow((pd - 1.05) / 0.75, 2)) : 0;
    k += (prox - k) * Math.min(1, 7 * dt);
    const hasPtr = pd < 99 && pd > 0.01;
    if (hasPtr) ap = Math.atan2(py, px);
    const lean = k / 0.075;
    const lx = hasPtr ? (px / pd) * lean * 0.05 * R : 0;
    const ly = hasPtr ? (py / pd) * lean * 0.05 * R : 0;
    bubble.style.transform =
      `translate(${lx.toFixed(2)}px, ${ly.toFixed(2)}px) rotate(${ap.toFixed(4)}rad) scale(${(1 + k).toFixed(4)}, ${(1 - 0.7 * k).toFixed(4)}) rotate(${(-ap).toFixed(4)}rad)` +
      ` rotate(${ang.toFixed(4)}rad) scale(${(1 - s).toFixed(4)}, ${(1 + s).toFixed(4)}) rotate(${(-ang).toFixed(4)}rad)`;
  };

  const start = () => { if (!raf && !paused && visible) { last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  // Do not burn battery while the hero is scrolled out of view.
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    visible ? start() : stop();
  });
  io.observe(bubble);

  // Pause / play button. A blink caught mid-way is ended so the paused duck has its eyes open.
  toggle?.addEventListener('click', () => {
    paused = !paused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.dataset.paused = String(paused);
    toggle.setAttribute('aria-label', paused ? (toggle.dataset.labelPlay ?? '') : (toggle.dataset.labelPause ?? ''));
    if (paused && blinkEnd >= 0) setBlink(false);
    paused ? stop() : start();
  });

  start();
}
