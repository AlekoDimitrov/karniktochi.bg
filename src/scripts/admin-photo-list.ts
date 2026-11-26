// The admin photo list with JavaScript (rows from src/components/admin/PhotoItem.astro). Nothing here reloads
// the page, so unsaved typing in the product form is never lost. See docs/slice-4-plan.md, items 2 and 3.
//
// - Remove: the row is hidden at once, with "Photo 3 removed. Undo" for 10 seconds. The real delete
//   (POST …/photos/remove/: D1, then R2 best-effort) is sent when the time is up, when the page is left
//   (pagehide, with keepalive), or before any other photo change. Switching tabs doesn't send it early.
// - Order: drag a row (mouse: the handle or the photo; touch: the handle only, so the page still scrolls), or
//   Move up / Move down. Saved at once (POST …/photos/order/ with every id); if refused, the list goes back.
// - Alt text: POST …/photos/alt/.

import { PendingRemovals, landingIndex, sameOrder } from './photo-list-logic';
import type { PhotoFormat } from '../lib/photo-sizes';

export type NewPhoto = { id: string; key: string; format: PhotoFormat; sizes: number[]; width: number; height: number; alt?: string };
export type PhotoList = {
  /** Photos shown (removed-but-waiting ones don't count). */
  count(): number;
  /** Adds the row of a photo just uploaded, at the end. */
  add(photo: NewPhoto): void;
  /** Sends any waiting removals and waits for them: call before another photo change. */
  settle(): Promise<boolean>;
};

const UNDO_MS = 10_000;
type Answer = { ok: true; removed?: string[] } | { ok: false; error: string };

export function enhancePhotoList(section: HTMLElement, onCount: (n: number) => void): PhotoList | null {
  const list = section.querySelector<HTMLOListElement>('[data-photo-list]');
  const template = section.querySelector<HTMLTemplateElement>('template[data-photo-template]');
  const undoList = section.querySelector<HTMLUListElement>('[data-photo-undo]');
  const status = section.querySelector<HTMLElement>('[data-photo-status]');
  const errorEl = section.querySelector<HTMLElement>('[data-photo-error]');
  const heading = section.querySelector<HTMLElement>('#photos-title');
  if (!list || !template || !undoList || !status || !errorEl || !heading) return null;

  const productId = section.dataset.product!;
  const mediaBase = section.dataset.mediaBase!.replace(/\/+$/, '');
  const actionUrl = (action: string) => `/admin/products/${encodeURIComponent(productId)}/photos/${action}/`;

  async function post(action: 'remove' | 'order' | 'alt', body: unknown, keepalive = false): Promise<Answer> {
    try {
      const res = await fetch(actionUrl(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
        keepalive,
      });
      const answer = (await res.json().catch(() => null)) as Answer | null;
      if (answer && typeof answer === 'object' && 'ok' in answer) return answer;
      return { ok: false, error: `The server answered HTTP ${res.status}. Nothing was changed.` };
    } catch {
      // Also what a signed-out session looks like: Access redirects to its login on another site.
      return { ok: false, error: 'No connection to the server (or signed out). Nothing was changed. Reload the page.' };
    }
  }

  // ---- Rows, numbers, messages ------------------------------------------------------------------------

  const allRows = () => Array.from(list.querySelectorAll<HTMLLIElement>(':scope > li[data-photo]'));
  const rows = () => allRows().filter((li) => !li.hidden);
  const ids = (lis = rows()) => lis.map((li) => li.dataset.photo!);
  /** The order the server has. */
  let saved = ids();

  function renumber() {
    const shown = rows();
    shown.forEach((li, i) => {
      for (const el of li.querySelectorAll('[data-photo-n]')) el.textContent = String(i + 1);
      li.querySelector<HTMLElement>('[data-photo-main]')!.hidden = i !== 0;
      li.querySelector<HTMLElement>('[data-photo-move="up"]')!.hidden = i === 0;
      li.querySelector<HTMLElement>('[data-photo-move="down"]')!.hidden = i === shown.length - 1;
    });
    const warning = section.querySelector<HTMLElement>('[data-photo-warning]');
    if (warning) warning.hidden = shown.length > 0;
    onCount(shown.length);
  }

  /** A message in the status line; `quiet`: for screen readers only (the Undo line already shows it). */
  const say = (text: string, quiet = false) => {
    errorEl.hidden = true;
    status.hidden = false;
    status.classList.toggle('visually-hidden', quiet);
    status.textContent = text;
  };
  const fail = (text: string) => {
    status.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = text;
  };

  /** Puts the rows back in the saved order (after a refused save or a cancelled drag). */
  function restoreSaved() {
    const byId = new Map(allRows().map((li) => [li.dataset.photo!, li]));
    for (const id of saved) {
      const li = byId.get(id);
      if (li) list!.appendChild(li);
    }
    renumber();
  }

  /** Takes over one row's forms and links. */
  function enhanceRow(li: HTMLLIElement) {
    li.querySelector<HTMLElement>('[data-photo-handle]')!.hidden = false;
    const removeLink = li.querySelector<HTMLAnchorElement>('[data-photo-remove]');
    if (removeLink) {
      removeLink.querySelector('[data-photo-remove-label]')!.textContent = 'Remove';
      removeLink.addEventListener('click', (e) => {
        e.preventDefault();
        startRemoval(li);
      });
    }
    li.querySelector<HTMLFormElement>('[data-photo-alt]')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void saveAlt(li, e.currentTarget as HTMLFormElement);
    });
    for (const form of li.querySelectorAll<HTMLFormElement>('[data-photo-move]')) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void moveByButton(li, form.dataset.photoMove === 'up' ? -1 : 1);
      });
    }
  }

  // ---- Remove with Undo -------------------------------------------------------------------------------

  const undoRows = new Map<string, HTMLLIElement>();

  const pending = new PendingRemovals({
    delayMs: UNDO_MS,
    send: (photoIds, keepalive) =>
      post('remove', { photos: photoIds }, keepalive).then((a) => (a.ok ? { ok: true as const, removed: a.removed ?? [] } : a)),
    onSent(photoIds) {
      for (const id of photoIds) {
        const row = undoRows.get(id);
        if (!row) continue;
        if (row.contains(document.activeElement)) heading.focus();
        row.remove();
        undoRows.delete(id);
      }
    },
    onDone(photoIds) {
      for (const id of photoIds) list.querySelector(`:scope > li[data-photo="${CSS.escape(id)}"]`)?.remove();
      saved = saved.filter((id) => !photoIds.includes(id));
    },
    onFailed(photoIds, error) {
      for (const id of photoIds) {
        const li = list.querySelector<HTMLLIElement>(`:scope > li[data-photo="${CSS.escape(id)}"]`);
        if (li) li.hidden = false;
      }
      renumber();
      fail(`${photoIds.length === 1 ? 'The photo was' : 'The photos were'} not removed: ${error} ${photoIds.length === 1 ? 'It is' : 'They are'} back in the list.`);
    },
  });

  function startRemoval(li: HTMLLIElement) {
    const id = li.dataset.photo!;
    const n = rows().indexOf(li) + 1;
    li.hidden = true;
    renumber();
    const row = document.createElement('li');
    row.className = 'ph-undo__row';
    const text = document.createElement('span');
    text.textContent = `Photo ${n} removed.`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ph-undo__btn';
    button.innerHTML = 'Undo<span class="visually-hidden"></span>';
    button.querySelector('span')!.textContent = ` removing photo ${n}`;
    button.addEventListener('click', () => {
      if (!pending.undo(id)) return;
      row.remove();
      undoRows.delete(id);
      li.hidden = false;
      renumber();
      say(`Photo ${rows().indexOf(li) + 1} is back.`);
      li.querySelector<HTMLElement>('[data-photo-remove]')?.focus();
    });
    row.appendChild(text);
    row.appendChild(document.createTextNode(' '));
    row.appendChild(button);
    undoList!.appendChild(row);
    undoRows.set(id, row);
    pending.add(id);
    say(`Photo ${n} removed. Undo is possible for 10 seconds.`, true);
    button.focus();
  }

  // Leaving the page (link, reload, back, closing the tab) sends the waiting removals at once. Not on
  // visibilitychange: switching tabs or apps doesn't send them early (DECISIONS 2026-11-26).
  // The ids are also kept for this tab: a reload can render the page before that delete has finished, so the
  // next load hides those rows and sends the delete again (a repeat is harmless; an id already gone is fine).
  const leftKey = `photos-removed-on-leave:${productId}`;
  window.addEventListener('pagehide', () => {
    const sent = pending.leave();
    try {
      if (sent.length) sessionStorage.setItem(leftKey, JSON.stringify(sent));
    } catch {
      // Storage off or full: the next load may show the photo until it is reloaded again.
    }
  });
  // Back to this same page from the back/forward cache: it already shows the right state.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) sessionStorage.removeItem(leftKey);
  });

  // ---- Order ------------------------------------------------------------------------------------------

  // Saves run one after another, each after the waiting removals.
  let queue: Promise<unknown> = Promise.resolve();
  function saveOrder(message: string) {
    queue = queue.then(async () => {
      await pending.flush();
      const order = ids();
      if (sameOrder(order, saved)) return;
      const answer = await post('order', { photos: order });
      if (answer.ok) {
        saved = order;
        say(message);
      } else {
        restoreSaved();
        fail(`The order was not saved: ${answer.error}`);
      }
    });
  }

  async function moveByButton(li: HTMLLIElement, direction: -1 | 1) {
    const shown = rows();
    const i = shown.indexOf(li);
    const other = shown[i + direction];
    if (!other) return;
    if (direction === -1) list!.insertBefore(li, other);
    else list!.insertBefore(li, other.nextSibling);
    renumber();
    // Keep focus on the button pressed, or on the other one if this one is gone (now first or last).
    const same = li.querySelector<HTMLFormElement>(`[data-photo-move="${direction === -1 ? 'up' : 'down'}"]`)!;
    const opposite = li.querySelector<HTMLFormElement>(`[data-photo-move="${direction === -1 ? 'down' : 'up'}"]`)!;
    (same.hidden ? opposite : same).querySelector('button')!.focus();
    saveOrder(`Photo moved to position ${rows().indexOf(li) + 1}.`);
  }

  // Drag and drop with Pointer Events: one path for mouse, pen and touch.
  let drag: {
    li: HTMLLIElement;
    pointerId: number;
    startPageY: number;
    startOffset: number;
    lastClientY: number;
    started: boolean;
    before: string[];
    frame: number;
  } | null = null;

  function placeDragged() {
    if (!drag) return;
    const { li } = drag;
    const others = rows().filter((r) => r !== li);
    const middles = others.map((r) => {
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const target = others[landingIndex(middles, drag.lastClientY)] ?? null;
    if (target ? li.nextElementSibling !== target : list!.lastElementChild !== li) list!.insertBefore(li, target);
    const pageY = drag.lastClientY + window.scrollY;
    li.style.transform = `translateY(${pageY - drag.startPageY - (li.offsetTop - drag.startOffset)}px)`;
  }

  // Scrolls the page while the pointer is near the top or bottom edge during a drag.
  function autoScroll() {
    if (!drag?.started) return;
    const edge = 72;
    const y = drag.lastClientY;
    const speed = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
    if (speed) {
      window.scrollBy(0, speed);
      placeDragged();
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function endDrag(keep: boolean) {
    if (!drag) return;
    const { li, started, before, frame } = drag;
    cancelAnimationFrame(frame);
    drag = null;
    li.style.transform = '';
    li.classList.remove('ph-item--dragging');
    list!.classList.remove('ph-list--dragging');
    if (!started) return;
    if (!keep) {
      // Escape or a cancelled pointer: back to where it was.
      const byId = new Map(rows().map((r) => [r.dataset.photo!, r]));
      for (const id of before) list!.appendChild(byId.get(id)!);
      renumber();
      return;
    }
    renumber();
    if (!sameOrder(ids(), before)) saveOrder(`Photo moved to position ${rows().indexOf(li) + 1}.`);
  }

  list.addEventListener('pointerdown', (e) => {
    const grip = (e.target as Element).closest<HTMLElement>('[data-photo-handle], .ph-item__img');
    if (!grip || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // On touch screens only the handle drags, so swiping over a photo still scrolls the page.
    if (e.pointerType !== 'mouse' && !grip.matches('[data-photo-handle]')) return;
    const li = grip.closest<HTMLLIElement>('li[data-photo]');
    if (!li || li.hidden) return;
    e.preventDefault();
    // Captured by the list, which never moves: moving the row in the DOM would drop a capture held by the row.
    try {
      list.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (a synthetic event): the drag still works while the pointer stays over the list.
    }
    drag = {
      li,
      pointerId: e.pointerId,
      startPageY: e.clientY + window.scrollY,
      startOffset: li.offsetTop,
      lastClientY: e.clientY,
      started: false,
      before: ids(),
      frame: 0,
    };
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastClientY = e.clientY;
    if (!drag.started) {
      if (Math.abs(e.clientY + window.scrollY - drag.startPageY) < 5) return;
      drag.started = true;
      drag.li.classList.add('ph-item--dragging');
      list.classList.add('ph-list--dragging');
      // A waiting removal is sent now; the order is saved after it.
      void pending.flush();
      drag.frame = requestAnimationFrame(autoScroll);
    }
    placeDragged();
  });
  list.addEventListener('pointerup', (e) => drag && e.pointerId === drag.pointerId && endDrag(true));
  list.addEventListener('pointercancel', (e) => drag && e.pointerId === drag.pointerId && endDrag(false));
  list.addEventListener('lostpointercapture', (e) => drag && e.pointerId === drag.pointerId && endDrag(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag?.started) {
      e.preventDefault();
      endDrag(false);
    }
  });

  // ---- Alt text ---------------------------------------------------------------------------------------

  async function saveAlt(li: HTMLLIElement, form: HTMLFormElement) {
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const input = form.querySelector<HTMLInputElement>('input[name="alt"]')!;
    button.disabled = true;
    const answer = await post('alt', { photo: li.dataset.photo, alt: input.value });
    button.disabled = false;
    const n = rows().indexOf(li) + 1;
    if (answer.ok) say(`Alt text of photo ${n} saved.`);
    else fail(`Alt text of photo ${n} not saved: ${answer.error}`);
  }

  // ---- New uploads ------------------------------------------------------------------------------------

  function add(photo: NewPhoto) {
    const fragment = template!.content.cloneNode(true) as DocumentFragment;
    const li = fragment.querySelector<HTMLLIElement>('li[data-photo]')!;
    // The template's id placeholder, in every attribute that carries it.
    for (const el of [li, ...li.querySelectorAll('*')]) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.value.includes('__ID__')) attr.value = attr.value.replaceAll('__ID__', photo.id);
      }
    }
    const side = [...photo.sizes].reverse().find((s) => s <= 400) ?? photo.sizes[0];
    const scale = side / Math.max(photo.width, photo.height);
    const img = li.querySelector<HTMLImageElement>('.ph-item__img')!;
    img.src = `${mediaBase}/${photo.key}-${side}.${photo.format === 'webp' ? 'webp' : 'jpg'}`;
    img.width = Math.max(1, Math.round(photo.width * scale));
    img.height = Math.max(1, Math.round(photo.height * scale));
    li.querySelector('[data-photo-size]')!.textContent = `${photo.width} × ${photo.height}${photo.format === 'jpeg' ? ' · JPEG' : ''}`;
    li.querySelector<HTMLInputElement>('input[name="alt"]')!.value = photo.alt ?? '';
    list!.appendChild(li);
    enhanceRow(li);
    saved = [...saved, photo.id];
    renumber();
  }

  for (const li of allRows()) enhanceRow(li);

  let leftIds: string[] = [];
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(leftKey) ?? '[]');
    if (Array.isArray(raw)) leftIds = raw.filter((v): v is string => typeof v === 'string');
    sessionStorage.removeItem(leftKey);
  } catch {
    // Nothing kept.
  }
  const stale = allRows().filter((li) => leftIds.includes(li.dataset.photo!));
  for (const li of stale) li.hidden = true;
  renumber();
  if (stale.length) void pending.removeNow(stale.map((li) => li.dataset.photo!));

  return {
    count: () => rows().length,
    add,
    settle: () => pending.flush(),
  };
}

