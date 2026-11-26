import { describe, expect, it, vi } from 'vitest';
import { PendingRemovals, landingIndex, moveItem, sameOrder, type SendResult } from '../src/scripts/photo-list-logic';

/** Timers driven by the test: run(ms) fires every timer due by then. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const h = next++;
        due.set(h, { at: now + ms, fn });
        return h;
      },
      clear: (h: unknown) => void due.delete(h as number),
    },
    run(ms: number) {
      now += ms;
      for (const [h, t] of [...due]) if (t.at <= now) (due.delete(h), t.fn());
    },
    get pending() {
      return due.size;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(answer: (ids: string[]) => SendResult | Promise<SendResult> = (ids) => ({ ok: true, removed: ids })) {
  const clock = fakeTimers();
  const send = vi.fn(async (ids: string[], _keepalive: boolean) => answer(ids));
  const events: string[] = [];
  const queue = new PendingRemovals({
    send,
    delayMs: 10_000,
    timers: clock.timers,
    onSent: (ids) => events.push(`sent ${ids.join(',')}`),
    onDone: (ids) => events.push(`done ${ids.join(',')}`),
    onFailed: (ids, e) => events.push(`failed ${ids.join(',')}: ${e}`),
  });
  return { clock, send, events, queue };
}

describe('pending photo removals', () => {
  it('sends nothing before 10 seconds, then the one delete', async () => {
    const { clock, send, events, queue } = setup();
    queue.add('a');
    clock.run(9_999);
    expect(send).not.toHaveBeenCalled();
    clock.run(1);
    await tick();
    expect(send).toHaveBeenCalledWith(['a'], false);
    expect(events).toEqual(['sent a', 'done a']);
    expect(queue.size).toBe(0);
  });

  it('undo within the time sends nothing, ever', async () => {
    const { clock, send, queue } = setup();
    queue.add('a');
    clock.run(5_000);
    expect(queue.undo('a')).toBe(true);
    clock.run(60_000);
    await queue.flush();
    queue.leave();
    expect(send).not.toHaveBeenCalled();
    expect(clock.pending).toBe(0);
  });

  it('each removal has its own timer', async () => {
    const { clock, send, queue } = setup();
    queue.add('a');
    clock.run(4_000);
    queue.add('b');
    clock.run(6_000);
    await tick();
    expect(send.mock.calls).toEqual([[['a'], false]]);
    expect(queue.has('b')).toBe(true);
    clock.run(4_000);
    await tick();
    expect(send.mock.calls).toEqual([[['a'], false], [['b'], false]]);
  });

  it('undo is impossible once the delete is sent', async () => {
    const { clock, queue } = setup();
    queue.add('a');
    clock.run(10_000);
    expect(queue.undo('a')).toBe(false);
  });

  it('flush sends every waiting removal in one request and waits for it, and for deletes already in flight', async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { clock, send, events, queue } = setup(async (ids) => {
      if (ids[0] === 'a') await slow;
      return { ok: true, removed: ids };
    });
    queue.add('a');
    clock.run(10_000); // 'a' is in flight, slowly
    queue.add('b');
    queue.add('c');
    let flushed = false;
    const done = queue.flush().then((ok) => (flushed = ok));
    await tick();
    expect(send.mock.calls.map((c) => c[0])).toEqual([['a'], ['b', 'c']]);
    expect(flushed).toBe(false);
    release();
    await done;
    expect(flushed).toBe(true);
    expect(events).toContain('done a');
    expect(events).toContain('done b,c');
    expect(clock.pending).toBe(0);
  });

  it('flush with nothing waiting resolves true at once', async () => {
    const { send, queue } = setup();
    expect(await queue.flush()).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('leaving the page sends everything waiting at once, with keepalive', () => {
    const { clock, send, queue } = setup();
    queue.add('a');
    queue.add('b');
    queue.leave();
    expect(send).toHaveBeenCalledWith(['a', 'b'], true);
    expect(clock.pending).toBe(0);
    expect(queue.size).toBe(0);
  });

  it('a refused or failed delete is reported, and flush says so', async () => {
    const { queue, events } = setup(() => ({ ok: false, error: 'This product no longer exists.' }));
    queue.add('a');
    expect(await queue.flush()).toBe(false);
    expect(events).toEqual(['sent a', 'failed a: This product no longer exists.']);

    const offline = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    offline.queue.add('b');
    expect(await offline.queue.flush()).toBe(false);
    expect(offline.events).toEqual(['sent b', 'failed b: No connection to the server.']);
  });
});

describe('moving rows', () => {
  it('moveItem moves one item and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });

  it('landingIndex counts the other rows whose middle is above the pointer', () => {
    const middles = [100, 300, 500];
    expect(landingIndex(middles, 50)).toBe(0);
    expect(landingIndex(middles, 101)).toBe(1);
    expect(landingIndex(middles, 499)).toBe(2);
    expect(landingIndex(middles, 900)).toBe(3);
    expect(landingIndex([], 10)).toBe(0);
  });

  it('sameOrder', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('pending photo removals, leaving and coming back', () => {
  it('leave() returns the ids it sent; removeNow sends at once, cancelling their wait', async () => {
    const { clock, send, queue } = setup();
    queue.add('a');
    expect(queue.leave()).toEqual(['a']);
    expect(queue.leave()).toEqual([]);
    queue.add('b');
    expect(await queue.removeNow(['b', 'c'])).toBe(true);
    expect(send.mock.calls).toEqual([[['a'], true], [['b', 'c'], false]]);
    expect(clock.pending).toBe(0);
    expect(await queue.removeNow([])).toBe(true);
  });
});
