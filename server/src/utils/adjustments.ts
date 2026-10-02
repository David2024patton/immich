import type { AdjustParameters } from 'src/dtos/editing.dto.js';
import type { Bitmap } from 'src/types.js';

/**
 * Pixel math for the `adjust` edit action. Operates on the decoded raw buffer in
 * the 0..1 range, matching how the web client previews the same parameters on a
 * canvas, so the saved result looks like the preview. All adjustments are
 * approximations of the controls found in Google Photos and Apple Photos.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : Math.min(v, 1));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Fixed recipe applied on top of `normalize()` when autoEnhance is enabled. */
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
  // merge the auto enhance recipe with the manual values, clamped to the schema ranges
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

/**
 * Applies light, color and vignette adjustments to a raw bitmap in place and
 * returns it. Sharpness and the normalize step of auto enhance are applied in
 * the sharp pipeline instead (see MediaRepository). Supports 8 and 16 bit
 * samples; the alpha channel, when present, is left untouched.
 */
export const applyAdjustments = (bitmap: Bitmap, params: AdjustParameters): Bitmap => {
  const { data, info } = bitmap;
  const { width, height, channels } = info;
  const bytesPerSample = data.length / (width * height * channels);
  const maxValue = bytesPerSample === 2 ? 65_535 : 255;
  const adjust = resolveAdjust(params);

  const readSample = (offset: number) => (bytesPerSample === 2 ? data.readUInt16LE(offset) : data[offset]) / maxValue;
  const writeSample = (offset: number, value: number) => {
    const quantized = Math.round(clamp01(value) * maxValue);
    if (bytesPerSample === 2) {
      data.writeUInt16LE(quantized, offset);
    } else {
      data[offset] = quantized;
    }
  };

  const pixelStride = channels * bytesPerSample;
  const rowStride = width * pixelStride;

  for (let y = 0; y < height; y++) {
    // normalized distance from the image center, 0 at center and ~1 at the corners
    const dy = (y / Math.max(1, height - 1) - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const dx = (x / Math.max(1, width - 1) - 0.5) * 2;
      const base = y * rowStride + x * pixelStride;

      let r = readSample(base);
      let g = readSample(base + bytesPerSample);
      let b = readSample(base + 2 * bytesPerSample);

      // exposure and brightness
      r *= adjust.exposureGain;
      g *= adjust.exposureGain;
      b *= adjust.exposureGain;
      r += adjust.brightnessOffset;
      g += adjust.brightnessOffset;
      b += adjust.brightnessOffset;

      // contrast around the midpoint
      r = (r - 0.5) * adjust.contrastFactor + 0.5;
      g = (g - 0.5) * adjust.contrastFactor + 0.5;
      b = (b - 0.5) * adjust.contrastFactor + 0.5;

      // selective tonal adjustments, weighted by approximate luminance
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const highlightWeight = smoothstep(0.5, 1, luma);
      const shadowWeight = 1 - smoothstep(0, 0.5, luma);
      const whiteWeight = smoothstep(0.6, 1, luma);
      const blackWeight = 1 - smoothstep(0, 0.4, luma);
      const tone =
        adjust.highlights * highlightWeight +
        adjust.shadows * shadowWeight +
        adjust.whites * whiteWeight +
        adjust.blacks * blackWeight;
      r += tone;
      g += tone;
      b += tone;

      // saturation, then vibrance (saturation weighted toward less saturated pixels)
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

      // white balance style warmth and tint
      r *= adjust.warmthR;
      b *= adjust.warmthB;
      g *= adjust.tintG;

      // vignette darkens toward the corners
      if (adjust.vignette !== 0) {
        const distance = Math.hypot(dx, dy) / Math.SQRT2;
        const factor = 1 - adjust.vignette * smoothstep(0.25, 1, distance);
        r *= factor;
        g *= factor;
        b *= factor;
      }

      writeSample(base, r);
      writeSample(base + bytesPerSample, g);
      writeSample(base + 2 * bytesPerSample, b);
    }
  }

  return bitmap;
};
