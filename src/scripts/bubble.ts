// Hero bubble: the duck bounces around inside the glass and spins on impact. It squashes on wall
// contact and stretches when fast, breathes, blinks and startles when the glass is tapped; each wall
// hit sends a ripple across the glass. Every so often it grins: the beak opens to show its teeth, one
// eye winks and a tooth sparkles. Everything is drawn with transform and opacity only.
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

  // Grin (not in calm mode). Lengths are in the duck image's 600×600 pixels; times in seconds from the start.
  grinEvery: [8, 15], // random interval between grins (s)
  grinOnTap: true, // a tap on the glass also sets off a grin once the startle is over, if none is running
  grinDrop: 11.4, // how far the lower beak drops (px): 12% of the beak's 95 px height
  grinJawScale: 0.97, // lower beak scale when fully open
  grinOvershoot: 1.2, // back-ease constant for the opening; 1.2 overshoots by about 5%
  grinOpenTime: 0.25,
  grinSquint: 0.15, // the eyes flatten by this share while smiling
  winkAt: 0.3, // one eye closes to a happy arc, at the peak
  winkTime: 0.25,
  sparkleTime: 0.4, // the star on a tooth grows, turns 45° and shrinks; it starts as the wink ends
  twinkleStagger: 0.08, // the dots near it follow one after another
  twinkleTime: 0.24,
  grinCloseAt: 1.45, // the mouth shuts with a small bounce; the grin ends at grinCloseAt + grinCloseTime
  grinCloseTime: 0.35,
  grinCloseBounce: 0.15, // share of the full drop the mouth springs back open
  grinShutOmega: 15, // after pause: how fast an open mouth shuts (rad/s, critically damped)

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
  const all = (sel: string) => Array.from(eyes?.querySelectorAll<SVGElement>(sel) ?? []);
  const grinBox = eyes?.querySelector<SVGGElement>('[data-grin]');
  const jaw = eyes?.querySelector<SVGGElement>('[data-jaw]');
  const glow = eyes?.querySelector<SVGElement>('[data-glow]');
  const spark = eyes?.querySelector<SVGElement>('[data-spark]');
  const eyeEls = all('[data-eye]'), winkEls = all('[data-wink]'), twinkles = all('[data-twinkle]');
  const teeth = all('[data-tooth]').map((el) => (el.dataset.tooth ?? '').split(' ').map(Number));
  const canGrin = !calm && !!(grinBox && jaw && glow && spark) && eyeEls.length === 2 && winkEls.length === 2 && teeth.length > 2;
  const twinkleAt = [[-32, -16], [28, -26], [24, 20]]; // dot offsets from the sparkle (px)
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
  const grinEnd = T.grinCloseAt + T.grinCloseTime;
  let grinT = -1; // seconds into the grin, -1 when none is running
  let nextGrin = T.grinEvery[0] + Math.random() * (T.grinEvery[1] - T.grinEvery[0]);
  let grinQueued = false; // a tap asked for a grin after its startle
  let gOpen = 0, gOpenV = 0, gSq = 0, gSqV = 0; // mouth opening (1 = full drop) and squint
  let winkEye = 0, sparkTooth = 0, grinShown = false;
  let hold: number | null = null; // dev only: freeze the duck at this point of the grin

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
  const scheduleGrin = () => { nextGrin = clock + rand(T.grinEvery[0], T.grinEvery[1]); };

  const startGrin = () => {
    grinT = 0;
    grinQueued = false;
    winkEye = Math.random() < 0.5 ? 0 : 1;
    sparkTooth = 1 + Math.floor(Math.random() * (teeth.length - 2)); // not an end tooth
  };

  // The grin's pose at time t: opens with a small overshoot while the eyes squint, holds, then shuts
  // with a small bounce.
  const grinPose = (t: number) => {
    const smooth = (u: number) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    if (t < T.grinOpenTime) {
      const u = t / T.grinOpenTime - 1, c = T.grinOvershoot;
      gOpen = 1 + (c + 1) * u * u * u + c * u * u;
    } else if (t < T.grinCloseAt) {
      gOpen = 1;
    } else {
      const v = (t - T.grinCloseAt) / T.grinCloseTime;
      gOpen = v < 0.55 ? Math.cos((v / 0.55) * (Math.PI / 2)) : T.grinCloseBounce * Math.sin((Math.PI * (v - 0.55)) / 0.45);
    }
    gSq = smooth(t / T.grinOpenTime) * (1 - smooth((t - T.grinCloseAt) / (T.grinCloseTime * 0.6)));
    gOpenV = gSqV = 0;
  };

  // Grin timeline while running: start one when it is due and nothing else is going on.
  const grinStep = (rdt: number) => {
    if (grinT < 0 && canGrin && (clock >= nextGrin || grinQueued) && startle < 0 && blinkEnd < 0 && gOpen === 0) startGrin();
    if (grinT < 0) return shutGrin(rdt);
    grinT += rdt;
    if (grinT >= grinEnd) {
      grinT = -1;
      gOpen = gSq = 0;
      scheduleGrin();
      scheduleBlink();
    } else {
      grinPose(grinT);
    }
  };

  // After a pause mid-grin: the sparkle and wink go at once and the mouth shuts quickly.
  const shutGrin = (rdt: number) => {
    grinT = -1;
    if (gOpen === 0 && gSq === 0) return;
    const om = T.grinShutOmega;
    gOpenV += (-om * om * gOpen - 2 * om * gOpenV) * rdt; gOpen += gOpenV * rdt;
    gSqV += (-om * om * gSq - 2 * om * gSqV) * rdt; gSq += gSqV * rdt;
    if (Math.abs(gOpen) < 0.005 && Math.abs(gSq) < 0.005) gOpen = gOpenV = gSq = gSqV = 0;
  };

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
      if (td < 1.1 && grinT < 0 && gOpen === 0) {
        const nx = td > 0.001 ? tx / td : 1, ny = td > 0.001 ? ty / td : 0;
        sv += T.tapGlassSquash;
        ang = Math.atan2(ny, nx);
        vx -= nx * T.tapKnock;
        vy -= ny * T.tapKnock;
        w = clamp(w + (Math.random() < 0.5 ? -1 : 1) * rand(T.tapSpin[0], T.tapSpin[1]), -T.spinCap, T.spinCap);
        startle = 0;
        if (T.grinOnTap) grinQueued = canGrin;
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

    // Blink every few seconds, but not while grinning.
    if (clock >= nextBlink && grinT < 0) {
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
    shutGrin(rdt);
    settleT += rdt;

    // How far from the calm pose it still is, in screen pixels.
    const duckR = (duck.offsetWidth || R * 0.88) / 2;
    const off = Math.max(
      Math.hypot(x, y) * R, // position
      Math.abs(th - thTarget) * duckR, // rotation, at the duck's edge
      env * T.breathAmplitude * duckR, // breathing
      Math.abs(s) * R, // glass shape
      Math.max(Math.abs(ds) * T.duckSquash, st * T.stretch) * duckR, // duck squash and stretch
      Math.max(Math.abs(gOpen) * T.grinDrop, gSq * 40) * (duckR / 300), // mouth and squint (image px → screen)
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
      gOpen = gOpenV = gSq = gSqV = 0;
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
    if (canGrin) renderGrin();
  };

  // The grin overlay; untouched while no grin is showing.
  const renderGrin = () => {
    const on = grinT >= 0 || gOpen !== 0 || gSq !== 0;
    if (!on && !grinShown) return;
    grinShown = on;
    grinBox!.style.opacity = on ? '1' : '0';
    jaw!.style.transform = `translate(0px, ${(gOpen * T.grinDrop).toFixed(2)}px) scale(${(1 - (1 - T.grinJawScale) * gOpen).toFixed(4)})`;
    const winking = grinT >= T.winkAt && grinT < T.winkAt + T.winkTime;
    for (let i = 0; i < 2; i++) {
      const wink = winking && i === winkEye;
      eyeEls[i].style.transform = gSq > 0.001 ? `scale(1, ${(1 - T.grinSquint * gSq).toFixed(4)})` : '';
      eyeEls[i].style.opacity = wink ? '0' : '';
      winkEls[i].style.opacity = wink ? '1' : '';
    }
    // Sparkle: a star that grows, turns 45° and shrinks, with a glow and a few dots after it.
    const [tx, ty] = teeth[sparkTooth];
    const at = (u: number) => (grinT >= 0 && u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0);
    const u = (grinT - T.winkAt - T.winkTime) / T.sparkleTime;
    const k = at(u);
    spark!.style.transform = `translate(${tx}px, ${ty}px) rotate(${(45 * clamp(u, 0, 1)).toFixed(2)}deg) scale(${k.toFixed(3)})`;
    spark!.style.opacity = k > 0 ? '1' : '0';
    glow!.style.transform = `translate(${tx}px, ${ty}px) scale(${k.toFixed(3)})`;
    glow!.style.opacity = k.toFixed(3);
    for (let i = 0; i < twinkles.length; i++) {
      const kd = at((grinT - T.winkAt - T.winkTime - (i + 1) * T.twinkleStagger) / T.twinkleTime);
      const [ox, oy] = twinkleAt[i % twinkleAt.length];
      twinkles[i].style.transform = `translate(${tx + ox}px, ${ty + oy}px) scale(${kd.toFixed(3)})`;
      twinkles[i].style.opacity = kd > 0 ? '1' : '0';
    }
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    clock += rdt;
    const R = bubble.clientWidth / 2;
    if (R <= 0) return;

    if (hold !== null) {
      grinT = hold;
      grinPose(hold);
    } else if (phase === 'run') {
      physics(rdt * speed, rdt, R);
      grinStep(rdt);
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
      grinQueued = false;
    } else {
      phase = 'run';
      const a = Math.random() * TAU;
      vx += Math.cos(a) * T.resumeSpeed;
      vy += Math.sin(a) * T.resumeSpeed;
      scheduleBlink();
      scheduleGrin();
      start();
    }
  });

  // Dev only: window.__duckGrin() plays a grin now; __duckGrin(t, turn) freezes the duck at t seconds
  // into a grin, centred and turned by `turn` radians, for screenshots. __duckGrin() again lets go.
  if (import.meta.env.DEV && canGrin) {
    (window as unknown as { __duckGrin: (t?: number, turn?: number) => void }).__duckGrin = (t, turn = 0) => {
      if (grinT < 0) startGrin();
      hold = t ?? null;
      if (hold !== null) {
        winkEye = 0;
        x = y = vx = vy = w = ds = dsv = st = s = sv = 0;
        th = turn;
        startle = -1;
        setBlink(false);
      } else {
        vx = vy = T.cruiseSpeed / Math.SQRT2;
      }
      start();
    };
  }

  start();
}
