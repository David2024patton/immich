import type { AdjustParameters } from '@immich/sdk';

/**
 * Canvas preview math for the adjust tool. Mirrors the server pixel pipeline in
 * `server/src/utils/adjustments.ts` so the preview matches the saved result.
 * Operates on 8 bit ImageData in the gamma encoded domain, same as the server.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Fixed recipe applied on top of the adaptive stretch when autoEnhance is enabled. */
const AUTO_ENHANCE_RECIPE = {
  contrast: 12,
  saturation: 10,
  vibrance: 8,
  shadows: 10,
} as const;

const isZero = (v?: number) => v === undefined || v === 0;

export const isAdjustNoop = (params: AdjustParameters): boolean =>
  !params.autoEnhance &&
  isZero(params.exposure) &&
  isZero(params.brightness) &&
  isZero(params.contrast) &&
  isZero(params.highlights) &&
  isZero(params.shadows) &&
  isZero(params.whites) &&
  isZero(params.blacks) &&
  isZero(params.saturation) &&
  isZero(params.vibrance) &&
  isZero(params.warmth) &&
  isZero(params.tint) &&
  isZero(params.sharpness) &&
  isZero(params.vignette);

/** Strips zero valued and undefined fields so stored edits stay compact. */
export const compactAdjustParameters = (params: AdjustParameters): AdjustParameters | null => {
  const compacted: AdjustParameters = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== 0 && value !== false) {
      (compacted as Record<string, unknown>)[key] = value;
    }
  }
  return isAdjustNoop(compacted) ? null : compacted;
};

type ResolvedAdjust = {
  exposureGain: number;
  brightnessOffset: number;
  contrastFactor: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturationFactor: number;
  vibrance: number;
  warmthR: number;
  warmthB: number;
  tintG: number;
  vignette: number;
};

const resolveAdjust = (params: AdjustParameters): ResolvedAdjust => {
  const get = (key: keyof typeof AUTO_ENHANCE_RECIPE, manual?: number) => {
    const base = params.autoEnhance ? AUTO_ENHANCE_RECIPE[key] : 0;
    return Math.max(-100, Math.min(100, base + (manual ?? 0)));
  };
  const contrast = get('contrast', params.contrast);
  const saturation = get('saturation', params.saturation);
  const vibrance = get('vibrance', params.vibrance);
  const shadows = get('shadows', params.shadows);
  const warmth = (params.warmth ?? 0) / 100;
  const tint = (params.tint ?? 0) / 100;

  return {
    exposureGain: Math.pow(2, params.exposure ?? 0),
    brightnessOffset: (params.brightness ?? 0) / 100,
    contrastFactor: 1 + contrast / 100,
    highlights: (params.highlights ?? 0) / 100,
    shadows: shadows / 100,
    whites: (params.whites ?? 0) / 100,
    blacks: (params.blacks ?? 0) / 100,
    saturationFactor: 1 + saturation / 100,
    vibrance: vibrance / 100,
    warmthR: 1 + warmth * 0.35,
    warmthB: 1 - warmth * 0.35,
    tintG: 1 + tint * 0.25,
    vignette: (params.vignette ?? 0) / 100,
  };
};

const applyPixelAdjustments = (data: Uint8ClampedArray, width: number, height: number, params: AdjustParameters) => {
  const adjust = resolveAdjust(params);

  for (let y = 0; y < height; y++) {
    const dy = (y / Math.max(1, height - 1) - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const dx = (x / Math.max(1, width - 1) - 0.5) * 2;
      const i = (y * width + x) * 4;

      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      r *= adjust.exposureGain;
      g *= adjust.exposureGain;
      b *= adjust.exposureGain;
      r += adjust.brightnessOffset;
      g += adjust.brightnessOffset;
      b += adjust.brightnessOffset;

      r = (r - 0.5) * adjust.contrastFactor + 0.5;
      g = (g - 0.5) * adjust.contrastFactor + 0.5;
      b = (b - 0.5) * adjust.contrastFactor + 0.5;

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const tone =
        adjust.highlights * smoothstep(0.5, 1, luma) +
        adjust.shadows * (1 - smoothstep(0, 0.5, luma)) +
        adjust.whites * smoothstep(0.6, 1, luma) +
        adjust.blacks * (1 - smoothstep(0, 0.4, luma));
      r += tone;
      g += tone;
      b += tone;

      const luma2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma2 + (r - luma2) * adjust.saturationFactor;
      g = luma2 + (g - luma2) * adjust.saturationFactor;
      b = luma2 + (b - luma2) * adjust.saturationFactor;
      if (adjust.vibrance !== 0) {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const pixelSaturation = (mx - mn) / (mx + 1e-4);
        const vibranceFactor = 1 + adjust.vibrance * (1 - pixelSaturation);
        const luma3 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma3 + (r - luma3) * vibranceFactor;
        g = luma3 + (g - luma3) * vibranceFactor;
        b = luma3 + (b - luma3) * vibranceFactor;
      }

      r *= adjust.warmthR;
      b *= adjust.warmthB;
      g *= adjust.tintG;

      if (adjust.vignette !== 0) {
        const distance = Math.hypot(dx, dy) / Math.SQRT2;
        const factor = 1 - adjust.vignette * smoothstep(0.25, 1, distance);
        r *= factor;
        g *= factor;
        b *= factor;
      }

      data[i] = clamp01(r) * 255;
      data[i + 1] = clamp01(g) * 255;
      data[i + 2] = clamp01(b) * 255;
    }
  }
};

/**
 * Per channel histogram stretch, matching sharp's normalize() used by the
 * server for auto enhance.
 */
const normalizeImageData = (data: Uint8ClampedArray) => {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      if (v < min[c]) {
        min[c] = v;
      }
      if (v > max[c]) {
        max[c] = v;
      }
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const range = max[c] - min[c];
      data[i + c] = range === 0 ? data[i + c] : ((data[i + c] - min[c]) / range) * 255;
    }
  }
};

/** Simple unsharp mask preview of the server side sharpen step. */
const applySharpness = (data: Uint8ClampedArray, width: number, height: number, sharpness: number) => {
  if (sharpness <= 0) {
    return;
  }
  const amount = (sharpness / 100) * 1.2;
  const blurred = new Float32Array(data.length);
  const radius = 1;
  // separable box blur on each channel
  const temp = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[(y * width + xx) * 4 + c];
          count++;
        }
        temp[(y * width + x) * 4 + c] = sum / count;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[(yy * width + x) * 4 + c];
          count++;
        }
        blurred[(y * width + x) * 4 + c] = sum / count;
      }
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = data[i + c] + amount * (data[i + c] - blurred[i + c]);
    }
  }
};

/**
 * Applies the full adjust pipeline to canvas ImageData: adaptive normalize
 * for auto enhance, unsharp mask for sharpness, then the pixel adjustments.
 */
export const applyAdjustmentsToImageData = (imageData: ImageData, params: AdjustParameters) => {
  const { data, width, height } = imageData;
  if (params.autoEnhance) {
    normalizeImageData(data);
  }
  applySharpness(data, width, height, params.sharpness ?? 0);
  applyPixelAdjustments(data, width, height, params);
};

export interface PhotoFilter {
  /** Original name in the spirit of classic filtered photo looks. */
  name: string;
  /** Approximation of the look, mapped onto the adjustment parameter set. */
  params: AdjustParameters;
}

/**
 * Named filter presets. Each is an approximation of a classic filtered photo
 * look, expressed with the same parameters as the manual sliders so a preset
 * can be applied and then fine tuned. Names are original, not copied from any
 * existing product.
 */
export const PHOTO_FILTERS: PhotoFilter[] = [
  { name: 'Punch', params: { contrast: 30, saturation: 25, vibrance: 15, sharpness: 20 } },
  {
    name: 'Faded Glory',
    params: { contrast: -35, blacks: 25, whites: -10, saturation: -20, warmth: 10, vignette: 15 },
  },
  { name: 'Golden Hour', params: { warmth: 45, saturation: 15, highlights: -10, shadows: 10, tint: -5 } },
  { name: 'Arctic Drift', params: { warmth: -40, saturation: -25, contrast: 10, tint: -10, vignette: 20 } },
  { name: 'Noir', params: { saturation: -100, contrast: 35, blacks: -10 } },
  { name: 'Silver Gelatin', params: { saturation: -100, contrast: -10, blacks: 30, whites: -15, vignette: 25 } },
  { name: 'Ember', params: { warmth: 55, saturation: 20, tint: -10, highlights: -15, vignette: 15 } },
  { name: 'Lagoon', params: { warmth: -20, tint: 25, saturation: 15, contrast: 15, shadows: -10 } },
  {
    name: 'Pastel Daydream',
    params: { contrast: -25, saturation: -10, vibrance: 20, blacks: 15, warmth: 10, tint: 5 },
  },
  { name: 'Drama', params: { contrast: 40, blacks: -25, saturation: -30, shadows: -20, vignette: 40 } },
  {
    name: 'Sunbleached',
    params: { brightness: 15, contrast: -20, blacks: 30, warmth: 25, saturation: -10, highlights: 15 },
  },
  { name: 'Forest Floor', params: { tint: 30, warmth: -5, saturation: 10, shadows: 10, contrast: 10 } },
  { name: 'Rosewater', params: { warmth: 15, tint: -20, saturation: 10, blacks: 10, contrast: -10 } },
  { name: 'Graphite', params: { saturation: -100, contrast: 20, warmth: -15, sharpness: 10 } },
  { name: 'Amber Dusk', params: { warmth: 40, saturation: 25, contrast: 20, highlights: -20, vignette: 25, tint: -5 } },
  { name: 'Frostbite', params: { warmth: -50, contrast: 25, saturation: -10, sharpness: 15, blacks: -10 } },
];
