import { XYZData } from "./model";
import { DataWindow } from "./store";
import { currentDataWindow } from "./store";

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

/**
 * Split a mono audio signal into three frequency bands and return as XYZData:
 *   x = low  band  (0 Hz – lowCutoff)
 *   y = mid  band  (lowCutoff – highCutoff)
 *   z = high band  (highCutoff – Nyquist)
 *
 * Default band edges: 300 Hz and 2000 Hz
 */
export const splitAudioToXYZ = (
  samples: number[],
  sampleRate: number,
  lowCutoff: number = 300,
  highCutoff: number = 2000,
): XYZData => {
  const low = applyBiquad(samples, lowPassCoeffs(lowCutoff, sampleRate));
  const high = applyBiquad(samples, highPassCoeffs(highCutoff, sampleRate));
  // Mid = original - low - high
  const mid = samples.map((s, i) => s - low[i] - high[i]);
  return { x: low, y: mid, z: high };
};

export const AUDIO_SAMPLE_RATE = 8000; // 8 kHz — enough for speech

export const audioDataWindow: DataWindow = {
  duration: currentDataWindow.duration,
  minSamples: Math.floor(
    (AUDIO_SAMPLE_RATE * currentDataWindow.duration) / 1000,
  ),
  deviceSamplesPeriod: Math.round(1000 / AUDIO_SAMPLE_RATE),
  deviceSamplesLength: AUDIO_SAMPLE_RATE,
};
