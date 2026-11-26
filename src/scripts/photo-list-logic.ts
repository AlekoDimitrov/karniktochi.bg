// The parts of the admin photo list (src/scripts/admin-photo-list.ts) that don't need a browser, so they are
// unit-tested: the pending-removal queue behind "Undo", and the maths of moving a row. See docs/slice-4-plan.md,
// items 2 and 3.

export type SendResult = { ok: true; removed: string[] } | { ok: false; error: string };
/** Sends the real delete for these photo ids; `keepalive` when the page is being left. */
export type SendRemoval = (ids: string[], keepalive: boolean) => Promise<SendResult>;
export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

export type PendingRemovalOptions = {
  send: SendRemoval;
  delayMs: number;
  timers?: Timers;
  /** The request for these ids is going out: their Undo is no longer possible. */
  onSent?(ids: string[]): void;
  /** The server removed them (or they were already gone). */
  onDone?(ids: string[]): void;
  /** The request failed: nothing was removed, the photos are still there. */
  onFailed?(ids: string[], error: string): void;
};

const browserTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as number) };

/**
 * Photos removed in the page but not yet on the server. Each waits `delayMs` and can be undone meanwhile; then
 * its delete is sent. flush() sends every waiting one at once (before any other photo change) and waits for
 * every delete in flight; leave() does the same with keepalive when the page is left, without waiting.
 */
export class PendingRemovals {
  private waiting = new Map<string, unknown>();
  private inFlight = new Set<Promise<boolean>>();
  private readonly timers: Timers;

  constructor(private readonly opts: PendingRemovalOptions) {
    this.timers = opts.timers ?? browserTimers;
  }

  get size() {
    return this.waiting.size;
  }

  has(id: string) {
    return this.waiting.has(id);
  }

  /** Starts the wait for one photo. Adding one already waiting changes nothing. */
  add(id: string) {
    if (this.waiting.has(id)) return;
    this.waiting.set(id, this.timers.set(() => void this.send([id], false), this.opts.delayMs));
  }

  /** Cancels a waiting removal. False if it is no longer waiting (already sent, or unknown). */
  undo(id: string): boolean {
    if (!this.waiting.has(id)) return false;
    this.timers.clear(this.waiting.get(id));
    this.waiting.delete(id);
    return true;
  }

  /** Sends all waiting removals in one request and waits for every delete in flight. True if all succeeded. */
  async flush(): Promise<boolean> {
    const ids = [...this.waiting.keys()];
    if (ids.length) void this.send(ids, false);
    const results = await Promise.all([...this.inFlight]);
    return results.every(Boolean);
  }

  /**
   * The page is being left: send everything waiting, with keepalive, in one request. Returns the ids sent, so
   * the next load of the page can hide them even if it is rendered before this delete has finished.
   */
  leave(): string[] {
    const ids = [...this.waiting.keys()];
    if (ids.length) void this.send(ids, true);
    return ids;
  }

  /** Sends the delete for these ids now, without a wait or Undo (ids sent when the page was last left). */
  removeNow(ids: string[]): Promise<boolean> {
    for (const id of ids) this.undo(id);
    return ids.length ? this.send(ids, false) : Promise.resolve(true);
  }

  private send(ids: string[], keepalive: boolean): Promise<boolean> {
    for (const id of ids) {
      this.timers.clear(this.waiting.get(id));
      this.waiting.delete(id);
    }
    this.opts.onSent?.(ids);
    const request = this.opts
      .send(ids, keepalive)
      .catch((): SendResult => ({ ok: false, error: 'No connection to the server.' }))
      .then((r) => {
        if (r.ok) this.opts.onDone?.(ids);
        else this.opts.onFailed?.(ids, r.error);
        return r.ok;
      });
    this.inFlight.add(request);
    void request.finally(() => this.inFlight.delete(request));
    return request;
  }
}

/** A copy of `list` with the item at `from` moved to index `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/**
 * Where a dragged row lands among the other rows: the number of other rows whose vertical middle is above the
 * pointer (`y`). `middles` are the other rows' middles, top to bottom.
 */
export const landingIndex = (middles: readonly number[], y: number) => middles.filter((m) => m < y).length;

/** Whether two id lists are the same order. */
export const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
