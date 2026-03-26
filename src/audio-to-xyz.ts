import { XYZData } from "./model";
import { AUDIO_LOW_CUTOFF, AUDIO_HIGH_CUTOFF } from "./audioConfig";
import { rms } from "./audio-extra-features";

/**
 * Second-order biquad filter applied to an array of samples.
 * Coefficients follow the form below:
 *   y[n] = (b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]) / a0
 */
interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

const applyBiquad = (samples: number[], c: BiquadCoeffs): number[] => {
  const out = new Array<number>(samples.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 =
      (c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2) / c.a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
};

/**
 * Compute biquad coefficients for a second-order Butterworth low-pass and high-pass filters.
 * formulas from: https://www.musicdsp.org/en/latest/Filters/197-rbj-audio-eq-cookbook.html
 */
const lowPassCoeffs = (cutoffHz: number, sampleRate: number): BiquadCoeffs => {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT2); // Q = 1/sqrt(2) for Butterworth
  const cosW0 = Math.cos(w0);
  return {
    b0: (1 - cosW0) / 2,
    b1: 1 - cosW0,
    b2: (1 - cosW0) / 2,
    a0: 1 + alpha,
    a1: -2 * cosW0,
    a2: 1 - alpha,
  };
};

const highPassCoeffs = (cutoffHz: number, sampleRate: number): BiquadCoeffs => {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT2);
  const cosW0 = Math.cos(w0);
  return {
    b0: (1 + cosW0) / 2,
    b1: -(1 + cosW0),
    b2: (1 + cosW0) / 2,
    a0: 1 + alpha,
    a1: -2 * cosW0,
    a2: 1 - alpha,
  };
};

// Speech pre-emphasis to boost high-frequency consonant content.
const preEmphasize = (samples: number[], alpha: number = 0.97): number[] => {
  if (samples.length === 0) return samples;
  const out = new Array<number>(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = samples[i] - alpha * samples[i - 1];
  }
  return out;
};

// Convert a waveform into a short-time RMS envelope
const frameRms = (
  samples: number[],
  sampleRate: number,
  frameMs: number,
  hopMs: number
): number[] => {
  const frameLen = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const hopLen = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const out: number[] = [];
  for (let start = 0; start < samples.length; start += hopLen) {
    const end = Math.min(start + frameLen, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / Math.max(end - start, 1)));
    if (end === samples.length) break;
  }
  return out;
};

// Normalise a clip to a consistent RMS
// so quiet and loud recordings produce similar features.
export const normalizeClip = (
  samples: number[],
  targetRms: number = 0.1
): number[] => {
  if (samples.length === 0) return samples;
  const r = rms(samples);
  if (r < 1e-6) return samples;
  const gain = targetRms / r;
  return samples.map((s) => s * gain);
};

//  Trim leading/trailing silence from a recorded clip and re-centre the sound
export const trimAndCenter = (
  samples: number[],
  sampleRate: number,
  threshold: number = 0.01,
  windowMs: number = 25,
  hangoverMs: number = 100
): number[] => {
  if (samples.length === 0) return samples;
  const winLen = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const hangover = Math.round((hangoverMs / 1000) * sampleRate);

  const windowRms = (start: number): number => {
    let sum = 0;
    const end = Math.min(start + winLen, samples.length);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / Math.max(end - start, 1));
  };

  let start = samples.length; // fallback: no sound
  for (let i = 0; i + winLen <= samples.length; i += winLen) {
    if (windowRms(i) > threshold) {
      start = Math.max(0, i - winLen); // keep one window of pre-roll
      break;
    }
  }

  let end = 0; // fallback: no sound
  for (let i = samples.length - winLen; i >= 0; i -= winLen) {
    if (windowRms(i) > threshold) {
      end = Math.min(samples.length, i + winLen + hangover);
      break;
    }
  }

  if (start >= end) return samples; // no sound detected — return unchanged

  const content = samples.slice(start, end);
  if (content.length >= samples.length) return samples; // nothing to trim

  const padTotal = samples.length - content.length;
  const padLeft = Math.floor(padTotal / 2);
  return [
    ...new Array<number>(padLeft).fill(0),
    ...content,
    ...new Array<number>(padTotal - padLeft).fill(0),
  ];
};

export const augmentClip = (
  samples: number[],
  sampleRate: number,
  gainRange: number = 0.1,
  shiftMs: number = 20
): number[] => {
  const gain = 1 + (Math.random() * 2 - 1) * gainRange;
  const out = samples.map((s) => s * gain);
  const maxShift = Math.round((shiftMs / 1000) * sampleRate);
  const shift = Math.round((Math.random() * 2 - 1) * maxShift);
  if (shift === 0) return out;
  if (shift > 0)
    return [
      ...new Array<number>(shift).fill(0),
      ...out.slice(0, out.length - shift),
    ];
  return [...out.slice(-shift), ...new Array<number>(-shift).fill(0)];
};

export interface AudioPreprocessOptions {
  // Normalise clip RMS before band-splitting (default: true)
  normalize?: boolean;
  // Trim leading/trailing silence and re-centre in the window (default: false)
  trim?: boolean;
  // Apply speech pre-emphasis before band-splitting (default: true)
  preEmphasis?: boolean;
  // Convert each band to a short-time RMS sequence (default: true)
  temporalFraming?: boolean;
  // Frame length for temporal RMS sequence (default: 25 ms)
  frameMs?: number;
  // Hop length for temporal RMS sequence (default: 10 ms)
  hopMs?: number;
}

/**
 * Split a mono audio signal into three frequency bands and return as XYZData:
 *   x = low  band  (0 Hz – lowCutoff)
 *   y = mid  band  (lowCutoff – highCutoff)
 *   z = high band  (highCutoff – Nyquist)
 *
 * Default band edges: 300 Hz and 2000 Hz. Clips are RMS-normalised by default
 * so amplitude differences across speakers do not dominate the features.
 * Pass { trim: true } when processing discrete recorded clips (not live streams).
 */
export const splitAudioToXYZ = (
  samples: number[],
  sampleRate: number,
  lowCutoff: number = AUDIO_LOW_CUTOFF,
  highCutoff: number = AUDIO_HIGH_CUTOFF,
  opts: AudioPreprocessOptions = {}
): XYZData => {
  const {
    normalize = true,
    trim = false,
    preEmphasis = true,
    temporalFraming = true,
    frameMs = 25,
    hopMs = 10,
  } = opts;
  let processed = samples;
  if (trim) processed = trimAndCenter(processed, sampleRate);
  if (normalize) processed = normalizeClip(processed);
  if (preEmphasis) processed = preEmphasize(processed);
  const low = applyBiquad(processed, lowPassCoeffs(lowCutoff, sampleRate));
  const high = applyBiquad(processed, highPassCoeffs(highCutoff, sampleRate));
  // Mid-band via band-pass (high-pass at lowCutoff, then low-pass at highCutoff).
  const mid = applyBiquad(
    applyBiquad(processed, highPassCoeffs(lowCutoff, sampleRate)),
    lowPassCoeffs(highCutoff, sampleRate)
  );
  if (!temporalFraming) {
    return { x: low, y: mid, z: high };
  }
  return {
    x: frameRms(low, sampleRate, frameMs, hopMs),
    y: frameRms(mid, sampleRate, frameMs, hopMs),
    z: frameRms(high, sampleRate, frameMs, hopMs),
  };
};
