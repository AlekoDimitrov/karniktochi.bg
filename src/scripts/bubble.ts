// Hero bubble: the duck floats around inside the glass like a bubble in water, turns gently when it
// brushes the wall, and reacts to the cursor. It squashes on contact, stretches when fast, breathes,
// bobs, blinks, watches the cursor and startles when tapped; each wall contact sends a ripple across
// the glass. Every reaction goes through a spring or a low-pass filter, so neither the duck's velocity
// nor the glass's shape ever jumps. Everything is drawn with transform and opacity only.
// Units: positions and velocities are in bubble radii (R = 1), so it scales with any screen size.

// All the numbers that shape the feel. Rates are per second; "R" is the bubble radius.
const TUNING = {
  // Drift
  cruiseSpeed: 0.25, // speed the duck returns to when left alone (R/s)
  speedCap: 0.45, // the duck never moves faster than this (R/s)
  cruiseRelax: 1, // time constant for returning to cruising speed (s); ~95% there after 3×
  bobAmplitude: 0.015, // idle up-and-down bob (R)
  bobHz: 0.15, // bob frequency (Hz)
  calmSpeed: 0.35, // speed multiplier with prefers-reduced-motion

  // Walls: a soft spring zone instead of an instant reflection, so contacts are gentle.
  collisionRadius: 0.4, // duck radius (R); its centre stays within 1 − this of the bubble centre
  wallSoftness: 0.08, // depth of the soft zone in front of the wall (R)
  wallStiffness: 40, // push of the soft zone (1/s²); a contact lasts about π/√this s
  wallJitter: 0.25, // random sideways nudge per contact, as a fraction of speed, so paths don't repeat

  // Cursor
  cursorRange: 1.4, // a pointer within this distance (R) of the centre attracts the duck
  cursorPull: 0.7, // spring pull toward the pointer (1/s²)
  cursorDamping: 1.8, // velocity damping while following the pointer (1/s); higher = lazier
  pointerSmoothing: 3, // low-pass rate for the pointer position, so jumps are glided over (1/s)
  pointerEnter: 2, // how fast the cursor's influence fades in (1/s)
  pointerLeave: 1, // and fades out when it leaves (1/s); ~95% gone after 3 s

  // Kicks (tap, contact spin, resume) are fed in gradually, never in one frame.
  kickRate: 5, // share of a pending kick applied per second (1/s); ~0.6 s to apply 95%
  tapKnock: 0.35, // velocity away from the tap point (R/s)
  tapSpin: [0.8, 1.5], // spin kick range on tap (rad/s), random direction
  resumeSpeed: 0.08, // random velocity when play is pressed (R/s)

  // Spin
  spinFactor: 0.9, // spin from a wall contact: tangential speed / collision radius × this
  spinCap: 1.8, // max spin either way (rad/s)
  spinDecay: 0.6, // (1/s)

  // Squash springs: the duck on wall contact, the glass on tap.
  squashStiffness: 80, // (1/s²)
  squashDamping: 10, // (1/s)
  squashImpulse: 0.6, // spring velocity added by a full-strength contact (cruising speed head-on) or tap
  duckSquashMax: 0.12, // max compression of the duck along the impact
  duckWiden: 0.08 / 0.12, // sideways widening per unit of compression (8% at 12%)
  glassSquashMax: 0.06, // max compression of the glass on tap
  stretchMax: 0.04, // duck stretch along its velocity at speedCap (starts above cruiseSpeed)

  // Glass reacting to the cursor
  glassStretch: 0.04, // stretch toward a cursor near the rim
  glassSqueeze: 0.7, // narrowing across, as a share of the stretch
  glassStretchSmoothing: 2.5, // low-pass rate (1/s)
  glassLean: 0.025, // shift toward the cursor at full stretch (R)

  // Ripples
  rippleMax: 1, // rings on screen at once; further contacts wait
  rippleDuration: 0.9, // (s)
  rippleMinSpeed: 0.1, // contacts slower than this (R/s, toward the wall) make no ripple
  rippleStartScale: 0.2, // ring size when it appears, as a share of its final size

  // Character
  breathAmplitude: 0.02, // scale ± (half of this with reduced motion)
  breathHz: 0.8,
  blinkEvery: [3, 6], // random interval between blinks (s)
  blinkDuration: 0.12, // (s)
  eyeReach: 0.04, // how far the eyes look toward the pointer, as a share of the duck's width
  eyeSmoothing: 6, // low-pass rate for the eyes (1/s)
  startleScale: 1.12, // peak scale when tapped
  startleDuration: 0.15, // (s)

  // Pause: glide to a calm pose with a critically damped spring, blink once, then stop.
  settleOmega: 5, // natural frequency of the settle spring (rad/s); looks settled in ~1.2 s, still in ~1.6 s
  settleBlinkPx: 2, // looks settled (final blink) once everything is within this many screen pixels
  settleSnapPx: 0.5, // the loop stops once everything is within this many pixels (and the blink is over)
  settleMaxTime: 4, // stop settling after this long whatever is left (s)
} as const;

const TAU = Math.PI * 2;
const IMAGE_WIDTH = 600; // the eye overlay is drawn in the duck image's pixel space

export function initBubble(bubble: HTMLElement, duck: HTMLElement, toggle?: HTMLButtonElement | null) {
  const T = TUNING;
  // If the visitor's system asks for reduced motion, run a calm version (slow drift, blinking and
  // half-strength breathing only: no spin, squash, bob, ripples or cursor reactions).
  // Everyone gets a pause button (WCAG 2.2.2); once the duck has settled, nothing moves or blinks.
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = calm ? T.calmSpeed : 1;

  const eyes = duck.querySelector<SVGSVGElement>('[data-eyes]');
  const look = duck.querySelector<SVGGElement>('[data-look]');
  const ringBox = bubble.querySelector<HTMLElement>('[data-ripples]');
  const rings = Array.from({ length: ringBox ? T.rippleMax : 0 }, () => {
    const el = document.createElement('span');
    el.className = 'bubble__ripple';
    ringBox!.appendChild(el);
    return el;
  });

  const rr = T.collisionRadius;
  const lim = 1 - rr; // how far the duck's centre may travel
  const soft = lim - T.wallSoftness; // where the soft wall zone starts
  let x = 0.2, y = -0.15, vx = 0.15, vy = 0.12;
  let kvx = 0, kvy = 0, kw = 0; // kicks waiting to be fed into the velocity and spin
  let th = 0, w = 0.3; // duck rotation and spin
  let inWall = false;
  let s = 0, sv = 0, ang = 0; // glass squash (tap): amount, velocity, direction
  let q = 0, qv = 0, dang = 0; // duck squash (contact): amount, velocity, direction
  let k = 0, kv = 0, ap = 0; // glass stretch toward the cursor: amount, velocity (settle only), direction
  let spx = 0, spy = 0, pw = 0; // smoothed pointer position and influence (0..1)
  let env = 1, envV = 0; // strength of breathing and bob: 1 while running, eases to 0 on pause
  let ex = 0, ey = 0; // eye offset, in image pixels
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
  const ptr = { on: false, cx: 0, cy: 0 };
  let tap: { cx: number; cy: number } | null = null;

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  // Low-pass step: move a share of the way toward the target, based on a rate per second.
  const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
  // Add an impulse to a squash spring along angle a. If it is already squashed along another axis,
  // project onto that axis instead of turning it, so the shape never jumps.
  const squashKick = (amt: number, cur: number, curAng: number, a: number): [number, number] =>
    Math.abs(cur) < 0.002 ? [amt, a] : [amt * Math.cos(2 * (a - curAng)), curAng];

  const onMove = (e: PointerEvent) => {
    if (calm) return;
    ptr.on = e.pointerType !== 'touch' || e.buttons > 0;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
  };
  const onDown = (e: PointerEvent) => {
    if (calm || phase !== 'run' || (e.target as Element | null)?.closest?.('[data-bubble-toggle]')) return;
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

  const setBlink = (on: boolean) => {
    blinkEnd = on ? clock + T.blinkDuration : -1;
    eyes?.toggleAttribute('data-blink', on);
  };
  const scheduleBlink = () => { nextBlink = clock + rand(T.blinkEvery[0], T.blinkEvery[1]); };

  // Start a ripple where the duck meets the wall (unit normal nx, ny); skipped while all rings are busy.
  const ripple = (nx: number, ny: number, R: number) => {
    const i = ringT.indexOf(-1);
    if (i < 0) return;
    ringT[i] = 0;
    ringX[i] = R + nx * R;
    ringY[i] = R + ny * R;
  };

  // One step of the physics while running. dt is scaled for calm mode; rdt is real time.
  const physics = (dt: number, rdt: number, R: number, ccx: number, ccy: number) => {
    // Pointer: smoothed position and an influence that fades in and out.
    let present = false;
    if (ptr.on) {
      const px = (ptr.cx - ccx) / R, py = (ptr.cy - ccy) / R;
      if (pw < 0.01) { spx = px; spy = py; } // appearing from nothing: start where it is (influence is 0)
      const f = ease(T.pointerSmoothing, rdt);
      spx += (px - spx) * f;
      spy += (py - spy) * f;
      present = true;
    }
    pw += ((present ? 1 : 0) - pw) * ease(present ? T.pointerEnter : T.pointerLeave, rdt);
    const pd = Math.hypot(spx, spy);

    // Tap on the glass: squash the glass from that side, knock the duck away, spin it and startle it.
    if (tap) {
      const tx = (tap.cx - ccx) / R, ty = (tap.cy - ccy) / R;
      const td = Math.hypot(tx, ty);
      tap = null;
      if (td < 1.1) {
        const nx = td > 0.001 ? tx / td : 1, ny = td > 0.001 ? ty / td : 0;
        let imp: number;
        [imp, ang] = squashKick(T.squashImpulse, s, ang, Math.atan2(ny, nx));
        sv += imp;
        kvx -= nx * T.tapKnock;
        kvy -= ny * T.tapKnock;
        kw += (Math.random() < 0.5 ? -1 : 1) * rand(T.tapSpin[0], T.tapSpin[1]);
        startle = 0;
      }
    }

    // Feed pending kicks in gradually.
    const kf = ease(T.kickRate, dt);
    vx += kvx * kf; kvx -= kvx * kf;
    vy += kvy * kf; kvy -= kvy * kf;
    w += kw * kf; kw -= kw * kf;

    // Curious duck: lazily follows the cursor (but stays trapped). Blended with cruising by the
    // cursor's influence, so arriving and leaving are gradual.
    const near = pw * clamp((T.cursorRange - pd) / 0.2, 0, 1);
    if (near > 0) {
      const sc = pd > lim ? lim / pd : 1;
      vx += near * ((spx * sc - x) * T.cursorPull - vx * T.cursorDamping) * dt;
      vy += near * ((spy * sc - y) * T.cursorPull - vy * T.cursorDamping) * dt;
    }
    if (near < 1) {
      // Relax back to cruising speed.
      const spd = Math.hypot(vx, vy);
      if (spd > 0.001) {
        const f = 1 + (T.cruiseSpeed / spd - 1) * (1 - near) * Math.min(1, dt / T.cruiseRelax);
        vx *= f;
        vy *= f;
      } else {
        vx += T.cruiseSpeed * dt; // from a standstill, drift off
      }
    }

    // Soft wall: a spring pushes the duck back once it enters the zone in front of the glass.
    const d = Math.hypot(x, y);
    if (d > soft) {
      const nx = x / d, ny = y / d;
      const vn = vx * nx + vy * ny;
      vx -= nx * T.wallStiffness * (d - soft) * dt;
      vy -= ny * T.wallStiffness * (d - soft) * dt;
      if (!inWall && vn > 0) {
        // First touch: the duck turns from the brush with the wall, squashes and sends a ripple.
        const vt = vx * -ny + vy * nx;
        kw += clamp(w * 0.4 + (T.spinFactor * vt) / rr, -T.spinCap, T.spinCap) - w;
        const j = (Math.random() - 0.5) * 2 * T.wallJitter * Math.hypot(vx, vy);
        kvx += -ny * j;
        kvy += nx * j;
        if (!calm) {
          let imp: number;
          [imp, dang] = squashKick(T.squashImpulse * Math.min(1, vn / T.cruiseSpeed), q, dang, Math.atan2(ny, nx));
          qv += imp;
          if (vn > T.rippleMinSpeed) ripple(nx, ny, R);
        }
      }
      inWall = true;
    } else {
      inWall = false;
    }

    const spd = Math.hypot(vx, vy);
    if (spd > T.speedCap) { vx *= T.speedCap / spd; vy *= T.speedCap / spd; }
    x += vx * dt;
    y += vy * dt;
    // Safety net: the spring keeps it inside, but never let it through the glass.
    const d2 = Math.hypot(x, y);
    if (d2 > lim) {
      const nx = x / d2, ny = y / d2;
      const vn = vx * nx + vy * ny;
      if (vn > 0) { vx -= vn * nx; vy -= vn * ny; }
      x = nx * lim;
      y = ny * lim;
    }

    if (calm) { w = 0; kw = 0; }
    w = clamp(w * Math.exp(-T.spinDecay * dt), -T.spinCap, T.spinCap);
    th += w * dt;

    // Glass stretches and leans toward the cursor, strongest near its rim.
    const prox = T.glassStretch * Math.exp(-Math.pow((pd - 1.05) / 0.75, 2)) * pw;
    k += (prox - k) * ease(T.glassStretchSmoothing, rdt);
    if (pd > 0.01 && pw > 0.001) ap = Math.atan2(spy, spx);

    // Eyes look toward the pointer, in the duck's rotated frame.
    let gx = 0, gy = 0;
    if (pw > 0.001) {
      const rx = spx - x, ry = spy - y;
      const c = Math.cos(th), sn = Math.sin(th);
      const lx = rx * c + ry * sn, ly = -rx * sn + ry * c;
      const ld = Math.hypot(lx, ly);
      if (ld > 0.001) {
        const reach = (T.eyeReach * IMAGE_WIDTH * pw * Math.min(1, ld / 0.5)) / ld;
        gx = lx * reach;
        gy = ly * reach;
      }
    }
    const ef = ease(T.eyeSmoothing, rdt);
    ex += (gx - ex) * ef;
    ey += (gy - ey) * ef;

    // Breathing and bob come back gently after a pause.
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
    kv = cd(k, kv, 0); k += kv * rdt;
    sv = cd(s, sv, 0); s += sv * rdt;
    qv = cd(q, qv, 0); q += qv * rdt;
    envV = cd(env, envV, 0); env += envV * rdt;
    pw *= 1 - ease(om, rdt);
    const ef = ease(om, rdt);
    ex -= ex * ef;
    ey -= ey * ef;
    settleT += rdt;

    // How far from the calm pose it still is, in screen pixels.
    const duckR = (duck.offsetWidth || R * 0.88) / 2;
    const off = Math.max(
      Math.hypot(x, y) * R, // position
      Math.abs(th - thTarget) * duckR, // rotation, at the duck's edge
      env * Math.max(T.breathAmplitude * duckR, T.bobAmplitude * R), // breathing and bob
      Math.max(Math.abs(k), Math.abs(s)) * R, // glass shape
      Math.abs(q) * duckR, // duck squash
      Math.hypot(ex, ey) * (duckR * 2) / IMAGE_WIDTH, // eyes
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
      x = y = vx = vy = w = k = kv = s = sv = q = qv = env = envV = ex = ey = 0;
      th = 0;
      for (let i = 0; i < rings.length; i++) { ringT[i] = -1; rings[i].style.opacity = '0'; }
      return true;
    }
    return false;
  };

  const render = (R: number) => {
    // Breathing, bob and the startle pop.
    let sc = 1 + env * (calm ? T.breathAmplitude / 2 : T.breathAmplitude) * Math.sin(TAU * T.breathHz * clock);
    if (startle >= 0) sc *= 1 + (T.startleScale - 1) * Math.sin((Math.PI * startle) / T.startleDuration) ** 2;
    const bob = calm ? 0 : env * T.bobAmplitude * Math.sin(TAU * T.bobHz * clock);

    let squash = '';
    if (Math.abs(q) > 0.0005) {
      const cq = clamp(q, -T.duckSquashMax, T.duckSquashMax);
      squash = ` rotate(${dang.toFixed(4)}rad) scale(${(1 - cq).toFixed(4)}, ${(1 + cq * T.duckWiden).toFixed(4)}) rotate(${(-dang).toFixed(4)}rad)`;
    }
    const spd = Math.hypot(vx, vy);
    const st = calm ? 0 : clamp((spd - T.cruiseSpeed) / (T.speedCap - T.cruiseSpeed), 0, 1);
    if (st > 0.001) {
      const va = Math.atan2(vy, vx);
      squash += ` rotate(${va.toFixed(4)}rad) scale(${(1 + T.stretchMax * st).toFixed(4)}, 1) rotate(${(-va).toFixed(4)}rad)`;
    }
    duck.style.transform =
      `translate(calc(-50% + ${(x * R).toFixed(2)}px), calc(-50% + ${((y + bob) * R).toFixed(2)}px))${squash}` +
      ` rotate(${th.toFixed(4)}rad) scale(${sc.toFixed(4)})`;

    if (look) look.style.transform = `translate(${ex.toFixed(2)}px, ${ey.toFixed(2)}px)`;

    const lean = (k / T.glassStretch) * T.glassLean * R;
    const cs = clamp(s, -T.glassSquashMax, T.glassSquashMax);
    bubble.style.transform =
      `translate(${(Math.cos(ap) * lean).toFixed(2)}px, ${(Math.sin(ap) * lean).toFixed(2)}px)` +
      ` rotate(${ap.toFixed(4)}rad) scale(${(1 + k).toFixed(4)}, ${(1 - T.glassSqueeze * k).toFixed(4)}) rotate(${(-ap).toFixed(4)}rad)` +
      ` rotate(${ang.toFixed(4)}rad) scale(${(1 - cs).toFixed(4)}, ${(1 + cs).toFixed(4)}) rotate(${(-ang).toFixed(4)}rad)`;
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    clock += rdt;
    const R = bubble.clientWidth / 2;
    if (R <= 0) return;

    if (phase === 'run') {
      const rect = bubble.getBoundingClientRect();
      physics(rdt * speed, rdt, R, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (settle(rdt, R)) {
      render(R); // the calm pose, drawn once; nothing moves or blinks until play
      phase = 'stopped';
      stop();
      return;
    }

    // Spring the squashes back (the settle drives them itself).
    if (phase === 'run') {
      sv += (-T.squashStiffness * s - T.squashDamping * sv) * rdt;
      s += sv * rdt;
      qv += (-T.squashStiffness * q - T.squashDamping * qv) * rdt;
      q += qv * rdt;
      if (calm) { q = qv = s = sv = 0; }
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
      kvx = kvy = kw = 0;
      tap = null;
    } else {
      phase = 'run';
      const a = Math.random() * TAU;
      kvx += Math.cos(a) * T.resumeSpeed;
      kvy += Math.sin(a) * T.resumeSpeed;
      scheduleBlink();
      start();
    }
  });

  start();
}
