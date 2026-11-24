// Adding photos in the admin Photos section (src/components/admin/PhotoManager.astro).
//
// For each picked or dropped file, one at a time and in order:
//   decode (createImageBitmap applies the EXIF rotation) → resize to 400 / 900 / 1800 px on the long side,
//   never upscaling → encode as WebP 0.82, or JPEG 0.85 where the browser can't encode WebP (Safari) →
//   upload the renditions and get the new photo back.
// The canvas holds only pixels, so EXIF data and GPS position never leave the browser.
// See docs/slice-3-plan.md, "Processing in the browser".

import {
  FORMAT_MIME,
  JPEG_QUALITY,
  MAX_PHOTOS,
  WEBP_QUALITY,
  renditionMaxBytes,
  renditionSides,
  scaledSize,
  type PhotoFormat,
} from '../lib/photo-sizes';

type UploadedPhoto = { id: string; key: string; format: PhotoFormat; sizes: number[]; width: number; height: number };
type UploadAnswer = { ok: true; photo: UploadedPhoto } | { ok: false; error: string };

class PhotoError extends Error {}

// Whether this browser's canvas encodes WebP; checked once, on the first photo.
let webpSupport: Promise<boolean> | null = null;
function canEncodeWebp(): Promise<boolean> {
  webpSupport ??= new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    c.toBlob((b) => resolve(b?.type === 'image/webp'), 'image/webp', WEBP_QUALITY);
  });
  return webpSupport;
}

function toBlob(canvas: HTMLCanvasElement, format: PhotoFormat): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new PhotoError('The browser couldn’t encode this photo.'))),
      FORMAT_MIME[format],
      format === 'webp' ? WEBP_QUALITY : JPEG_QUALITY,
    ),
  );
}

/** Draws `source` at `width` × `height`, halving step by step first, which stays sharper than one big step. */
function resize(source: CanvasImageSource & { width: number; height: number }, width: number, height: number, format: PhotoFormat) {
  let current: CanvasImageSource = source;
  let w = source.width;
  let h = source.height;
  while (w / 2 >= width && h / 2 >= height) {
    const step = document.createElement('canvas');
    step.width = Math.round(w / 2);
    step.height = Math.round(h / 2);
    const ctx = step.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, step.width, step.height);
    current = step;
    w = step.width;
    h = step.height;
  }
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  // JPEG has no transparency: transparent pixels would turn black, so they go on white.
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, width, height);
  return out;
}

/** The renditions of one photo, smallest first. */
async function process(file: File, setState: (s: string) => void): Promise<{ format: PhotoFormat; files: File[] }> {
  setState('Reading…');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('This browser can’t read this file (HEIC?). Open it in Safari, or export it as JPEG.');
  }
  try {
    const sides = renditionSides(Math.max(bitmap.width, bitmap.height));
    if (!sides) throw new PhotoError('Photo too small (at least 400 px on the long side).');
    setState('Resizing…');
    const format: PhotoFormat = (await canEncodeWebp()) ? 'webp' : 'jpeg';
    const files: File[] = [];
    for (const side of sides) {
      const size = scaledSize(bitmap.width, bitmap.height, side);
      const blob = await toBlob(resize(bitmap, size.width, size.height, format), format);
      if (blob.type !== FORMAT_MIME[format]) throw new PhotoError('The browser couldn’t encode this photo.');
      if (blob.size > renditionMaxBytes(side)) {
        throw new PhotoError(`The ${side} px version is ${Math.round(blob.size / 1024)} KB, over the ${renditionMaxBytes(side) / 1024} KB limit.`);
      }
      files.push(new File([blob], `${side}.${format === 'webp' ? 'webp' : 'jpg'}`, { type: blob.type }));
    }
    return { format, files };
  } finally {
    bitmap.close();
  }
}

/** Posts the renditions with XMLHttpRequest, which reports upload progress (fetch doesn't). */
function upload(url: string, files: File[], onProgress: (percent: number) => void): Promise<UploadAnswer> {
  const body = new FormData();
  for (const f of files) body.append('rendition', f);
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100)));
    xhr.addEventListener('load', () => {
      const answer = xhr.response as UploadAnswer | null;
      if (answer && typeof answer === 'object' && 'ok' in answer) resolve(answer);
      else resolve({ ok: false, error: `Upload failed (HTTP ${xhr.status}).` });
    });
    xhr.addEventListener('error', () => resolve({ ok: false, error: 'Upload failed: no connection to the server.' }));
    xhr.send(body);
  });
}

export function enhancePhotos(section: HTMLElement | null) {
  const drop = section?.querySelector<HTMLElement>('[data-photo-drop]');
  const input = section?.querySelector<HTMLInputElement>('[data-photo-input]');
  const queue = section?.querySelector<HTMLOListElement>('[data-photo-queue]');
  const list = section?.querySelector<HTMLOListElement>('[data-photo-list]');
  const countEl = section?.querySelector<HTMLElement>('[data-photo-count]');
  const full = section?.querySelector<HTMLElement>('[data-photo-full]');
  const reload = section?.querySelector<HTMLElement>('[data-photo-reload]');
  if (!section || !drop || !input || !queue || !list || !countEl || !full || !reload) return;

  const productId = section.dataset.product!;
  const mediaBase = section.dataset.mediaBase!.replace(/\/+$/, '');
  const url = `/admin/products/${encodeURIComponent(productId)}/photos/`;
  let count = Number(section.dataset.count) || 0;
  const pending: { file: File; row: HTMLLIElement }[] = [];
  let busy = false;

  section.querySelector<HTMLElement>('[data-photo-nojs]')!.hidden = true;
  drop.hidden = false;

  const showCount = () => {
    countEl.textContent = `${count} of ${MAX_PHOTOS}`;
    const isFull = count >= MAX_PHOTOS;
    full.hidden = !isFull;
    input.disabled = isFull;
    drop.classList.toggle('ph-drop--full', isFull);
  };
  showCount();

  const addRow = (file: File) => {
    const row = document.createElement('li');
    row.className = 'ph-queue__row';
    const name = document.createElement('span');
    name.className = 'ph-queue__name';
    name.textContent = file.name;
    const state = document.createElement('span');
    state.className = 'ph-queue__state';
    state.textContent = 'Waiting…';
    row.appendChild(name);
    row.appendChild(state);
    queue.appendChild(row);
    return row;
  };
  const setState = (row: HTMLLIElement, text: string, kind?: 'done' | 'error') => {
    const state = row.querySelector('.ph-queue__state')!;
    state.textContent = text;
    row.classList.toggle('ph-queue__row--done', kind === 'done');
    row.classList.toggle('ph-queue__row--error', kind === 'error');
  };

  // A new photo appears at the end of the list; moving, removing and alt text need a reload.
  const showUploaded = (photo: UploadedPhoto) => {
    const side = [...photo.sizes].reverse().find((s) => s <= 400) ?? photo.sizes[0];
    const size = scaledSize(photo.width, photo.height, side);
    const li = document.createElement('li');
    li.className = 'ph-item ph-item--new';
    const img = document.createElement('img');
    img.className = 'ph-item__img';
    img.src = `${mediaBase}/${photo.key}-${side}.${photo.format === 'webp' ? 'webp' : 'jpg'}`;
    img.width = size.width;
    img.height = size.height;
    img.alt = '';
    const body = document.createElement('div');
    body.className = 'ph-item__body';
    const title = document.createElement('p');
    title.className = 'ph-item__title';
    title.innerHTML = '<strong></strong> <span class="badge">New</span> <span class="muted"></span>';
    title.querySelector('strong')!.textContent = `Photo ${count}`;
    title.querySelector('.muted')!.textContent = `${photo.width} × ${photo.height}${photo.format === 'jpeg' ? ' · JPEG' : ''}`;
    body.appendChild(title);
    li.appendChild(img);
    li.appendChild(body);
    list.appendChild(li);
    reload.hidden = false;
    section.querySelector('[data-photo-warning]')?.remove();
  };

  async function run() {
    if (busy) return;
    busy = true;
    while (pending.length) {
      const { file, row } = pending.shift()!;
      if (count >= MAX_PHOTOS) {
        setState(row, `Not added: this product already has ${MAX_PHOTOS} photos.`, 'error');
        continue;
      }
      try {
        const { files } = await process(file, (s) => setState(row, s));
        setState(row, 'Uploading 0%');
        const answer = await upload(url, files, (p) => setState(row, `Uploading ${p}%`));
        if (!answer.ok) throw new PhotoError(answer.error);
        count++;
        showCount();
        showUploaded(answer.photo);
        setState(row, 'Done', 'done');
      } catch (e) {
        setState(row, e instanceof PhotoError ? e.message : 'Something went wrong with this photo.', 'error');
        if (!(e instanceof PhotoError)) console.error(e);
      }
    }
    busy = false;
  }

  const take = (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) pending.push({ file, row: addRow(file) });
    void run();
  };

  input.addEventListener('change', () => {
    take(input.files);
    input.value = '';
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = count >= MAX_PHOTOS ? 'none' : 'copy';
    drop.classList.add('ph-drop--over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('ph-drop--over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('ph-drop--over');
    if (count < MAX_PHOTOS) take(e.dataTransfer?.files ?? null);
  });
}
