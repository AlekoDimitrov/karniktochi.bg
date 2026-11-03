import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { webpInfo } from '../src/lib/webp';
import { fakeWebp } from './photo-fixtures';

// The fixtures were made with Pillow: a lossy (VP8), a lossless (VP8L) and an extended file (VP8X, lossy with
// alpha), and a PNG and a JPEG for the refusals.
const file = (name: string) => new Uint8Array(readFileSync(`test/fixtures/${name}`));

describe('webpInfo', () => {
  it('reads the dimensions of real VP8, VP8L and VP8X files', () => {
    expect(webpInfo(file('vp8-40x30.webp'))).toEqual({ width: 40, height: 30 });
    expect(webpInfo(file('vp8l-41x29.webp'))).toEqual({ width: 41, height: 29 });
    expect(webpInfo(file('vp8x-300x2.webp'))).toEqual({ width: 300, height: 2 });
  });

  it('reads large dimensions from the header', () => {
    expect(webpInfo(fakeWebp(1800, 900))).toEqual({ width: 1800, height: 900 });
    expect(webpInfo(fakeWebp(1, 16384))).toEqual({ width: 1, height: 16384 });
  });

  it('refuses a PNG or a JPEG, even when named .webp', () => {
    expect(webpInfo(file('png-20x10.png'))).toBeNull();
    expect(webpInfo(file('jpeg-20x10.jpg'))).toBeNull();
  });

  it('refuses a truncated file and one with bytes after its end', () => {
    const whole = file('vp8-40x30.webp');
    expect(webpInfo(whole.subarray(0, whole.length - 1))).toBeNull();
    expect(webpInfo(whole.subarray(0, 20))).toBeNull();
    const longer = new Uint8Array(whole.length + 2);
    longer.set(whole);
    expect(webpInfo(longer)).toBeNull();
  });

  it('refuses RIFF files that are not WebP, and unknown or broken chunks', () => {
    const wave = file('vp8-40x30.webp');
    wave.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
    expect(webpInfo(wave)).toBeNull();

    const unknown = file('vp8-40x30.webp');
    unknown.set([...'ALPH'].map((c) => c.charCodeAt(0)), 12);
    expect(webpInfo(unknown)).toBeNull();

    const noStartCode = file('vp8-40x30.webp');
    noStartCode[23] = 0;
    expect(webpInfo(noStartCode)).toBeNull();

    const badSignature = file('vp8l-41x29.webp');
    badSignature[20] = 0;
    expect(webpInfo(badSignature)).toBeNull();

    // A chunk that claims to be longer than the file.
    const longChunk = file('vp8l-41x29.webp');
    new DataView(longChunk.buffer).setUint32(16, 1000, true);
    expect(webpInfo(longChunk)).toBeNull();
  });
});
