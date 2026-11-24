import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageInfo } from '../src/lib/image-info';
import { jpegInfo } from '../src/lib/jpeg';
import { fakeJpeg, fakeWebp } from './photo-fixtures';

const file = (name: string) => new Uint8Array(readFileSync(`test/fixtures/${name}`));

/** `jpeg` with an APP1 Exif segment inserted right after SOI, as a camera writes it. */
function withExif(jpeg: Uint8Array): Uint8Array {
  const payload = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat([0x4d, 0x4d, 0, 0x2a]);
  const app1 = [0xff, 0xe1, 0, payload.length + 2, ...payload];
  return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]);
}

describe('jpegInfo', () => {
  it('reads the dimensions of a real JPEG (Pillow) and of a large one', () => {
    expect(jpegInfo(file('jpeg-20x10.jpg'))).toEqual({ width: 20, height: 10, exif: false });
    expect(jpegInfo(fakeJpeg(1800, 900))).toEqual({ width: 1800, height: 900, exif: false });
  });

  it('notices an Exif segment', () => {
    expect(jpegInfo(withExif(file('jpeg-20x10.jpg')))).toEqual({ width: 20, height: 10, exif: true });
  });

  it('refuses a PNG, a WebP, a truncated JPEG and broken segments', () => {
    expect(jpegInfo(file('png-20x10.png'))).toBeNull();
    expect(jpegInfo(file('vp8-40x30.webp'))).toBeNull();
    const whole = file('jpeg-20x10.jpg');
    expect(jpegInfo(whole.subarray(0, whole.length - 1))).toBeNull();
    expect(jpegInfo(whole.subarray(0, 40))).toBeNull();
    // A segment length running past the end.
    const long = fakeJpeg(800, 600);
    long[5] = 0xff;
    long[4] = 0xff;
    expect(jpegInfo(long)).toBeNull();
    // Image data (SOS) before any frame header.
    expect(jpegInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 0, 0, 0xff, 0xd9]))).toBeNull();
  });
});

describe('imageInfo', () => {
  it('tells WebP and JPEG apart by their bytes', () => {
    expect(imageInfo(fakeWebp(1800, 900))).toEqual({ format: 'webp', width: 1800, height: 900, exif: false });
    expect(imageInfo(fakeJpeg(900, 450))).toEqual({ format: 'jpeg', width: 900, height: 450, exif: false });
    expect(imageInfo(file('png-20x10.png'))).toBeNull();
  });

  it('notices EXIF in a JPEG and in an extended WebP', () => {
    expect(imageInfo(withExif(file('jpeg-20x10.jpg')))?.exif).toBe(true);
    const vp8x = file('vp8x-300x2.webp');
    expect(imageInfo(vp8x)?.exif).toBe(false);
    vp8x[20] |= 0x08;
    expect(imageInfo(vp8x)).toEqual({ format: 'webp', width: 300, height: 2, exif: true });
  });
});
