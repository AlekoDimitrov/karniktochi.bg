import { describe, expect, it } from 'vitest';
import { renditionMaxBytes, renditionSides, scaledSize } from '../src/lib/photo-sizes';

describe('renditionSides', () => {
  it('never upscales and refuses photos under 400 px', () => {
    expect(renditionSides(300)).toBeNull();
    expect(renditionSides(399)).toBeNull();
    expect(renditionSides(400)).toEqual([400]);
    expect(renditionSides(900)).toEqual([400, 900]);
    expect(renditionSides(1200)).toEqual([400, 900, 1200]);
    expect(renditionSides(1800)).toEqual([400, 900, 1800]);
    expect(renditionSides(4000)).toEqual([400, 900, 1800]);
  });
});

describe('scaledSize', () => {
  it('scales the long side to the given side and rounds the other', () => {
    expect(scaledSize(4032, 3024, 1800)).toEqual({ width: 1800, height: 1350 });
    expect(scaledSize(3024, 4032, 400)).toEqual({ width: 300, height: 400 });
    expect(scaledSize(5000, 700, 400)).toEqual({ width: 400, height: 56 });
    expect(scaledSize(1000, 1000, 900)).toEqual({ width: 900, height: 900 });
    // Never zero.
    expect(scaledSize(10000, 1, 400)).toEqual({ width: 400, height: 1 });
  });
});

describe('renditionMaxBytes', () => {
  it('is 200 KB up to 400 px, 600 KB up to 900 px, and 1.5 MB above', () => {
    expect(renditionMaxBytes(400)).toBe(200 * 1024);
    expect(renditionMaxBytes(450)).toBe(600 * 1024);
    expect(renditionMaxBytes(900)).toBe(600 * 1024);
    expect(renditionMaxBytes(1200)).toBe(1536 * 1024);
    expect(renditionMaxBytes(1800)).toBe(1536 * 1024);
  });
});
