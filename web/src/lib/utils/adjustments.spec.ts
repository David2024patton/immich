import { describe, expect, it } from 'vitest';
import {
  applyAdjustmentsToImageData,
  compactAdjustParameters,
  isAdjustNoop,
  PHOTO_FILTERS,
} from '$lib/utils/adjustments';

const makeImageData = (width: number, height: number, fill: (x: number, y: number) => number[]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
};

const getPixel = (imageData: ImageData, x: number, y: number) => {
  const i = (y * imageData.width + x) * 4;
  return [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]];
};

describe('isAdjustNoop', () => {
  it('should be a noop for empty parameters', () => {
    expect(isAdjustNoop({})).toBe(true);
  });

  it('should not be a noop when an adjustment is set', () => {
    expect(isAdjustNoop({ contrast: 10 })).toBe(false);
    expect(isAdjustNoop({ autoEnhance: true })).toBe(false);
  });
});

describe('compactAdjustParameters', () => {
  it('should return null for noop parameters', () => {
    expect(compactAdjustParameters({})).toBeNull();
    expect(compactAdjustParameters({ contrast: 0, autoEnhance: false })).toBeNull();
  });

  it('should strip zero valued fields', () => {
    expect(compactAdjustParameters({ contrast: 10, brightness: 0 })).toEqual({ contrast: 10 });
  });

  it('should keep auto enhance', () => {
    expect(compactAdjustParameters({ autoEnhance: true })).toEqual({ autoEnhance: true });
  });
});

describe('applyAdjustmentsToImageData', () => {
  it('should desaturate fully with saturation -100', () => {
    const imageData = makeImageData(4, 4, () => [200, 100, 50]);
    applyAdjustmentsToImageData(imageData, { saturation: -100 });
    const [r, g, b] = getPixel(imageData, 0, 0);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(2);
  });

  it('should warm the image with positive warmth', () => {
    const imageData = makeImageData(4, 4, () => [150, 150, 150]);
    applyAdjustmentsToImageData(imageData, { warmth: 100 });
    const [r, , b] = getPixel(imageData, 0, 0);
    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(150);
  });

  it('should darken corners with vignette and keep the center', () => {
    const imageData = makeImageData(9, 9, () => [200, 200, 200]);
    applyAdjustmentsToImageData(imageData, { vignette: 100 });
    const [center] = [getPixel(imageData, 4, 4)];
    const [corner] = [getPixel(imageData, 0, 0)];
    expect(center[0]).toBe(200);
    expect(corner[0]).toBeLessThan(100);
  });

  it('should preserve the alpha channel', () => {
    const imageData = makeImageData(2, 2, () => [200, 100, 50]);
    applyAdjustmentsToImageData(imageData, { contrast: 50 });
    expect(imageData.data[3]).toBe(255);
  });

  it('should apply auto enhance without crashing', () => {
    const imageData = makeImageData(8, 8, (x) => [50 + x * 10, 60 + x * 10, 70 + x * 10]);
    applyAdjustmentsToImageData(imageData, { autoEnhance: true });
    const [r] = getPixel(imageData, 0, 0);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
  });
});

describe('PHOTO_FILTERS', () => {
  it('should define 16 filters with original names', () => {
    expect(PHOTO_FILTERS).toHaveLength(16);
    const names = PHOTO_FILTERS.map((f) => f.name);
    expect(new Set(names).size).toBe(16);
  });

  it('should only use valid adjustment parameters', () => {
    const validKeys = new Set([
      'exposure',
      'brightness',
      'contrast',
      'highlights',
      'shadows',
      'whites',
      'blacks',
      'saturation',
      'vibrance',
      'warmth',
      'tint',
      'sharpness',
      'vignette',
      'autoEnhance',
    ]);
    for (const filter of PHOTO_FILTERS) {
      for (const key of Object.keys(filter.params)) {
        expect(validKeys.has(key)).toBe(true);
      }
      expect(isAdjustNoop(filter.params)).toBe(false);
    }
  });
});
