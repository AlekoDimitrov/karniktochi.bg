// Hero bubble: the duck bounces around inside the glass and spins on impact. It squashes on wall
// contact and stretches when fast, breathes, blinks and startles when the glass is tapped; each wall
// hit sends a ripple across the glass. Everything is drawn with transform and opacity only.
// Units: positions and velocities are in bubble radii (R = 1), so it scales with any screen size.

// All the numbers that shape the feel. Rates are per second; "R" is the bubble radius.
const TUNING = {
  // Motion
  cruiseSpeed: 0.55, // speed the duck relaxes back to (R/s)
  cruiseRelax: 0.8, // how fast it gets back to cruising speed (1/s)
  bounceSpeed: [0.5, 0.65], // random speed after a wall bounce (R/s)
  bounceJitter: 0.3, // random turn of the bounce direction (rad, total range)
  calmSpeed: 0.35, // speed multiplier with prefers-reduced-motion
  collisionRadius: 0.4, // duck radius (R); its centre stays within 1 − this of the bubble centre

  // Spin
  spinFromWall: 2.4, // spin from a wall hit: tangential speed / collision radius × this
  spinCap: 5, // max spin either way (rad/s)
  spinDecay: 0.35, // (1/s)

  // Tap on the glass
  tapKnock: 0.9, // velocity away from the tap point (R/s)
  tapSpin: [2, 4], // spin kick range (rad/s), random direction
  tapGlassSquash: 1.4, // glass squash spring velocity added by a tap
  startleScale: 1.12, // peak duck scale
  startleDuration: 0.15, // (s)

  // Glass squash on wall hits and taps (spring)
  glassStiffness: 180, // (1/s²)
  glassDamping: 12, // (1/s)
  glassFromWall: 1.5, // squash velocity per unit of speed toward the wall (capped at 0.8 R/s)
  glassSquashMax: 0.09,

  // Duck squash on wall contact (spring) and stretch when fast
  duckSquash: 0.12, // compression along the impact at full strength
  duckWiden: 0.08, // widening across at full strength
  duckFullAt: 0.7, // speed toward the wall that gives full strength (R/s)
  duckStiffness: 400, // (1/s²); springs back in about 250 ms
  duckDamping: 28, // (1/s)
  stretch: 0.04, // stretch along the velocity at full speed
  stretchFrom: 0.7, // speed where stretching starts (R/s)
  stretchRange: 0.5, // extra speed over which it reaches full stretch (R/s)

  // Ripples
  rippleMax: 2, // rings on screen at once; a new hit reuses the oldest
  rippleDuration: 0.4, // (s)
  rippleMinSpeed: 0.12, // hits slower than this (R/s, toward the wall) make no ripple
  rippleStartScale: 0.2, // ring size when it appears, as a share of its final size

  // Character
  breathAmplitude: 0.02, // scale ± (half of this with reduced motion)
  breathHz: 0.8,
  blinkEvery: [3, 6], // random interval between blinks (s)
  blinkDuration: 0.12, // (s)

  // Pause: glide to a calm pose with a critically damped spring, blink once, then stop.
  settleOmega: 5, // natural frequency of the settle spring (rad/s); looks settled in ~1.2 s
  settleBlinkPx: 2, // looks settled (final blink) once everything is within this many screen pixels
  settleSnapPx: 0.5, // the loop stops once everything is within this many pixels (and the blink is over)
  settleMaxTime: 4, // stop settling after this long whatever is left (s)
  resumeSpeed: 0.1, // random velocity when play is pressed (R/s); it picks up to cruising speed from there
} as const;

const TAU = Math.PI * 2;

export function initBubble(bubble: HTMLElement, duck: HTMLElement, toggle?: HTMLButtonElement | null) {
  const T = TUNING;
  // If the visitor's system asks for reduced motion, run a calm version (slow drift, blinking and
  // half-strength breathing only: no spin, squash, ripples or tap reactions).
  // Everyone gets a pause button (WCAG 2.2.2); once the duck has settled, nothing moves or blinks.
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = calm ? T.calmSpeed : 1;

  const eyes = duck.querySelector<SVGSVGElement>('[data-eyes]');
  const ringBox = bubble.querySelector<HTMLElement>('[data-ripples]');
  const rings = Array.from({ length: ringBox ? T.rippleMax : 0 }, () => {
    const el = document.createElement('span');
    el.className = 'bubble__ripple';
    ringBox!.appendChild(el);
    return el;
  });

  const rr = T.collisionRadius;
  const lim = 1 - rr; // how far the duck's centre may travel
  let x = 0.2, y = -0.15, vx = 0.42, vy = 0.34;
  let th = 0, w = 0.8; // duck rotation and spin
  let s = 0, sv = 0, ang = 0; // glass squash: amount, velocity, direction
  let ds = 0, dsv = 0, dang = 0; // duck squash: amount (1 = full), velocity, direction
  let st = 0; // stretch along the velocity (1 = full)
  let env = 1, envV = 0; // strength of breathing: 1 while running, eases to 0 on pause
  let startle = -1; // seconds since a tap startled the duck, -1 when not startled
  let clock = 0; // seconds of animation; only advances while the loop runs
  let blinkEnd = -1;
  let nextBlink = T.blinkEvery[0] + Math.random() * (T.blinkEvery[1] - T.blinkEvery[0]);
  const ringT = rings.map(() => -1); // ripple ages in seconds, -1 when idle
  const ringX = rings.map(() => 0), ringY = rings.map(() => 0);

  // run: physics. settle: gliding to the calm pose after pause, with the final blink. stopped: loop off.
  let phase: 'run' | 'settle' | 'stopped' = 'run';
  let settleT = 0, thTarget = 0, finalBlink = false;
  let last = 0, raf = 0, visible = true;
  let tap: { cx: number; cy: number } | null = null;

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const onDown = (e: PointerEvent) => {
    if (calm || phase !== 'run' || (e.target as Element | null)?.closest?.('[data-bubble-toggle]')) return;
    tap = { cx: e.clientX, cy: e.clientY };
  };
  window.addEventListener('pointerdown', onDown, { passive: true });

  const setBlink = (on: boolean) => {
    blinkEnd = on ? clock + T.blinkDuration : -1;
    eyes?.toggleAttribute('data-blink', on);
  };
  const scheduleBlink = () => { nextBlink = clock + rand(T.blinkEvery[0], T.blinkEvery[1]); };

  // Start a ripple at a point on the wall (unit normal nx, ny); reuses the oldest ring if all are busy.
  const ripple = (nx: number, ny: number, R: number) => {
    let i = ringT.indexOf(-1);
    if (i < 0) i = ringT.indexOf(Math.max(...ringT));
    if (i < 0) return;
    ringT[i] = 0;
    ringX[i] = R + nx * R;
    ringY[i] = R + ny * R;
  };

  // One step of the physics while running. dt is scaled for calm mode; rdt is real time.
  const physics = (dt: number, rdt: number, R: number) => {
    // Tap on the glass: squash from that side, knock the duck away, set it spinning and startle it.
    if (tap) {
      const rect = bubble.getBoundingClientRect();
      const tx = (tap.cx - rect.left - rect.width / 2) / R, ty = (tap.cy - rect.top - rect.height / 2) / R;
      const td = Math.hypot(tx, ty);
      tap = null;
      if (td < 1.1) {
        const nx = td > 0.001 ? tx / td : 1, ny = td > 0.001 ? ty / td : 0;
        sv += T.tapGlassSquash;
        ang = Math.atan2(ny, nx);
        vx -= nx * T.tapKnock;
        vy -= ny * T.tapKnock;
        w = clamp(w + (Math.random() < 0.5 ? -1 : 1) * rand(T.tapSpin[0], T.tapSpin[1]), -T.spinCap, T.spinCap);
        startle = 0;
      }
    }

    // Relax back to a calm cruising speed.
    const spd0 = Math.hypot(vx, vy) || 1;
    const f = 1 + (T.cruiseSpeed / spd0 - 1) * Math.min(1, T.cruiseRelax * dt);
    vx *= f;
    vy *= f;

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
          const j = (Math.random() - 0.5) * T.bounceJitter;
          const c = Math.cos(j), sn = Math.sin(j);
          const rx = vx * c - vy * sn;
          vy = vx * sn + vy * c;
          vx = rx;
        }
        const sp = Math.hypot(vx, vy) || 1;
        const target = rand(T.bounceSpeed[0], T.bounceSpeed[1]);
        vx *= target / sp;
        vy *= target / sp;
        w = clamp(w * 0.4 + (T.spinFromWall * vt) / rr, -T.spinCap, T.spinCap);
        sv += Math.min(0.8, vn) * T.glassFromWall;
        ang = Math.atan2(ny, nx);
        if (!calm) {
          const a = Math.min(1, vn / T.duckFullAt);
          if (a > ds) { ds = a; dsv = 0; dang = ang; }
          if (vn > T.rippleMinSpeed) ripple(nx, ny, R);
        }
      }
      x = nx * lim;
      y = ny * lim;
    }

    if (calm) { w = 0; sv = 0; s = 0; }
    w *= Math.exp(-T.spinDecay * dt);
    th += w * dt;
    sv += (-T.glassStiffness * s - T.glassDamping * sv) * dt;
    s = clamp(s + sv * dt, -T.glassSquashMax, T.glassSquashMax);

    dsv += (-T.duckStiffness * ds - T.duckDamping * dsv) * rdt;
    ds = clamp(ds + dsv * rdt, -0.3, 1);
    const spd = Math.hypot(vx, vy);
    st += ((calm ? 0 : clamp((spd - T.stretchFrom) / T.stretchRange, 0, 1)) - st) * Math.min(1, 10 * rdt);

    // Breathing comes back gently after a pause.
    envV += (-(T.settleOmega ** 2) * (env - 1) - 2 * T.settleOmega * envV) * rdt;
    env += envV * rdt;

    // Blink every few seconds.
    if (clock >= nextBlink) {
      setBlink(true);
      scheduleBlink();
    }
  };

  // One step of the settle after pause: every quantity is a critically damped spring toward the calm
  // pose, starting from its current value and velocity, so the glide begins without a jolt.
  const settle = (rdt: number, R: number): boolean => {
    const om = T.settleOmega;
    const cd = (v: number, vel: number, target: number) => vel + (-om * om * (v - target) - 2 * om * vel) * rdt;
    vx = cd(x, vx, 0); x += vx * rdt;
    vy = cd(y, vy, 0); y += vy * rdt;
    w = cd(th, w, thTarget); th += w * rdt;
    sv = cd(s, sv, 0); s += sv * rdt;
    dsv = cd(ds, dsv, 0); ds += dsv * rdt;
    envV = cd(env, envV, 0); env += envV * rdt;
    st -= st * Math.min(1, om * rdt);
    settleT += rdt;

    // How far from the calm pose it still is, in screen pixels.
    const duckR = (duck.offsetWidth || R * 0.88) / 2;
    const off = Math.max(
      Math.hypot(x, y) * R, // position
      Math.abs(th - thTarget) * duckR, // rotation, at the duck's edge
      env * T.breathAmplitude * duckR, // breathing
      Math.abs(s) * R, // glass shape
      Math.max(Math.abs(ds) * T.duckSquash, st * T.stretch) * duckR, // duck squash and stretch
    );
    const slow = Math.hypot(vx, vy) * R < 5 && Math.abs(w) * duckR < 5; // px/s

    // Looks settled: blink once (after any blink or startle already under way).
    const overdue = settleT > T.settleMaxTime;
    if (!finalBlink && blinkEnd < 0 && startle < 0 && ((off < T.settleBlinkPx && slow) || overdue)) {
      finalBlink = true;
      setBlink(true);
    }
    // The last sub-pixel glide finishes during the blink; then land exactly on the calm pose.
    if (finalBlink && blinkEnd < 0 && ((off < T.settleSnapPx && ringT.every((t) => t < 0)) || overdue)) {
      x = y = vx = vy = w = s = sv = ds = dsv = st = env = envV = 0;
      th = 0;
      for (let i = 0; i < rings.length; i++) { ringT[i] = -1; rings[i].style.opacity = '0'; }
      return true;
    }
    return false;
  };

  const render = (R: number) => {
    // Breathing and the startle pop.
    let sc = 1 + env * (calm ? T.breathAmplitude / 2 : T.breathAmplitude) * Math.sin(TAU * T.breathHz * clock);
    if (startle >= 0) sc *= 1 + (T.startleScale - 1) * clamp(Math.min(startle, T.startleDuration - startle) / 0.04, 0, 1);

    let squash = '';
    if (Math.abs(ds) > 0.001) {
      squash = ` rotate(${dang.toFixed(4)}rad) scale(${(1 - T.duckSquash * ds).toFixed(4)}, ${(1 + T.duckWiden * ds).toFixed(4)}) rotate(${(-dang).toFixed(4)}rad)`;
    }
    if (st > 0.001) {
      const va = Math.atan2(vy, vx);
      squash += ` rotate(${va.toFixed(4)}rad) scale(${(1 + T.stretch * st).toFixed(4)}, 1) rotate(${(-va).toFixed(4)}rad)`;
    }
    duck.style.transform =
      `translate(calc(-50% + ${(x * R).toFixed(2)}px), calc(-50% + ${(y * R).toFixed(2)}px))${squash}` +
      ` rotate(${th.toFixed(4)}rad) scale(${sc.toFixed(4)})`;
    bubble.style.transform =
      `rotate(${ang.toFixed(4)}rad) scale(${(1 - s).toFixed(4)}, ${(1 + s).toFixed(4)}) rotate(${(-ang).toFixed(4)}rad)`;
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    clock += rdt;
    const R = bubble.clientWidth / 2;
    if (R <= 0) return;

    if (phase === 'run') {
      physics(rdt * speed, rdt, R);
    } else if (settle(rdt, R)) {
      render(R); // the calm pose, drawn once; nothing moves or blinks until play
      phase = 'stopped';
      stop();
      return;
    }

    if (startle >= 0) {
      startle += rdt;
      if (startle >= T.startleDuration) startle = -1;
    }
    if (blinkEnd >= 0 && clock >= blinkEnd) setBlink(false);

    // Ripples: a ring grows from the contact point and fades.
    for (let i = 0; i < rings.length; i++) {
      if (ringT[i] < 0) continue;
      ringT[i] += rdt;
      const p = ringT[i] / T.rippleDuration;
      if (p >= 1) {
        ringT[i] = -1;
        rings[i].style.opacity = '0';
        continue;
      }
      const grow = T.rippleStartScale + (1 - T.rippleStartScale) * (1 - (1 - p) * (1 - p));
      rings[i].style.transform = `translate(${ringX[i].toFixed(1)}px, ${ringY[i].toFixed(1)}px) scale(${grow.toFixed(3)})`;
      rings[i].style.opacity = (1 - p).toFixed(3);
    }

    render(R);
  };

  const start = () => { if (!raf && visible && phase !== 'stopped') { last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  // Do not burn battery while the hero is scrolled out of view.
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    visible ? start() : stop();
  });
  io.observe(bubble);

  // Pause / play button. Pause glides to the calm pose, blinks once and stops; play picks up from
  // wherever the duck is (calm pose or mid-glide) with a small random push.
  toggle?.addEventListener('click', () => {
    const pausing = phase === 'run';
    toggle.setAttribute('aria-pressed', String(pausing));
    toggle.dataset.paused = String(pausing);
    toggle.setAttribute('aria-label', pausing ? (toggle.dataset.labelPlay ?? '') : (toggle.dataset.labelPause ?? ''));
    if (pausing) {
      phase = 'settle';
      settleT = 0;
      finalBlink = false;
      thTarget = Math.round(th / TAU) * TAU; // nearest upright turn, shortest way round
      tap = null;
    } else {
      phase = 'run';
      const a = Math.random() * TAU;
      vx += Math.cos(a) * T.resumeSpeed;
      vy += Math.sin(a) * T.resumeSpeed;
      scheduleBlink();
      start();
    }
  });

  start();
}
