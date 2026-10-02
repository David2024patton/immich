import type { Bitmap } from 'src/types.js';
import { applyAdjustments, isAdjustNoop } from 'src/utils/adjustments.js';

const makeBitmap = (width: number, height: number, channels: 3 | 4, fill: (x: number, y: number) => number[]) => {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = fill(x, y);
      for (let c = 0; c < channels; c++) {
        data[(y * width + x) * channels + c] = pixel[c];
      }
    }
  }
  return { data, info: { width, height, channels } };
};

const getPixel = (bitmap: Bitmap, x: number, y: number) => {
  const { data, info } = bitmap;
  const base = (y * info.width + x) * info.channels;
  return [data[base], data[base + 1], data[base + 2]];
};

describe('isAdjustNoop', () => {
  it('should be a noop for empty parameters', () => {
    expect(isAdjustNoop({})).toBe(true);
  });

  it('should be a noop for all zero parameters', () => {
    expect(isAdjustNoop({ contrast: 0, saturation: 0, vignette: 0 })).toBe(true);
  });

  it('should not be a noop when any adjustment is set', () => {
    expect(isAdjustNoop({ contrast: 10 })).toBe(false);
    expect(isAdjustNoop({ exposure: -0.5 })).toBe(false);
  });

  it('should not be a noop when auto enhance is enabled', () => {
    expect(isAdjustNoop({ autoEnhance: true })).toBe(false);
  });
});

describe('applyAdjustments', () => {
  it('should leave the image unchanged for noop parameters', () => {
    const bitmap = makeBitmap(4, 4, 3, () => [200, 100, 50]);
    const before = Buffer.from(bitmap.data);
    applyAdjustments(bitmap, {});
    expect(bitmap.data.equals(before)).toBe(true);
  });

  it('should desaturate fully with saturation -100', () => {
    const bitmap = makeBitmap(2, 2, 3, () => [200, 100, 50]);
    applyAdjustments(bitmap, { saturation: -100 });
    const [r, g, b] = getPixel(bitmap, 0, 0);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(2);
  });

  it('should double brightness with exposure +1', () => {
    const bitmap = makeBitmap(2, 2, 3, () => [100, 100, 100]);
    applyAdjustments(bitmap, { exposure: 1 });
    const [r, g, b] = getPixel(bitmap, 0, 0);
    expect(r).toBeGreaterThan(190);
    expect(r).toBeLessThanOrEqual(210);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it('should lift shadows without clipping highlights', () => {
    const bitmap = makeBitmap(4, 1, 3, (x) => (x < 2 ? [10, 10, 10] : [250, 250, 250]));
    applyAdjustments(bitmap, { shadows: 100 });
    const [dark] = [getPixel(bitmap, 0, 0)];
    const [bright] = [getPixel(bitmap, 3, 0)];
    expect(dark[0]).toBeGreaterThan(10);
    expect(bright[0]).toBe(250);
  });

  it('should warm the image with positive warmth', () => {
    const bitmap = makeBitmap(2, 2, 3, () => [150, 150, 150]);
    applyAdjustments(bitmap, { warmth: 100 });
    const [r, g, b] = getPixel(bitmap, 0, 0);
    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(150);
    expect(g).toBe(150);
  });

  it('should darken corners with vignette and keep the center', () => {
    const bitmap = makeBitmap(9, 9, 3, () => [200, 200, 200]);
    applyAdjustments(bitmap, { vignette: 100 });
    const [center] = [getPixel(bitmap, 4, 4)];
    const [corner] = [getPixel(bitmap, 0, 0)];
    expect(center[0]).toBe(200);
    expect(corner[0]).toBeLessThan(100);
  });

  it('should preserve the alpha channel', () => {
    const bitmap = makeBitmap(2, 2, 4, () => [200, 100, 50, 123]);
    applyAdjustments(bitmap, { contrast: 50, saturation: 50 });
    expect(bitmap.data[3]).toBe(123);
    expect(bitmap.data[7]).toBe(123);
  });

  it('should clamp values to the valid range', () => {
    const bitmap = makeBitmap(2, 2, 3, () => [250, 250, 250]);
    applyAdjustments(bitmap, { exposure: 3, brightness: 100 });
    const [r, g, b] = getPixel(bitmap, 0, 0);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });
});
