import {
  AUDIO_SAMPLE_RATE,
  AUDIO_PRE_EMPHASIS_ALPHA,
  MFCC_NUM_COEFFS,
  MFCC_NUM_FILTERS,
  MFCC_FFT_SIZE,
  MFCC_FRAME_MS,
  MFCC_HOP_MS,
  MFCC_LOW_HZ,
  MFCC_LIFTER,
  MFCC_CMN,
  MFCC_TEMPORAL_SEGMENTS,
} from "./audioConfig";

const fft = (real: Float64Array, imag: Float64Array): void => {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tR = curR * real[b] - curI * imag[b];
        const tI = curR * imag[b] + curI * real[b];
        real[b] = real[a] - tR;
        imag[b] = imag[a] - tI;
        real[a] += tR;
        imag[a] += tI;
        const newCurR = curR * wR - curI * wI;
        curI = curR * wI + curI * wR;
        curR = newCurR;
      }
    }
  }
};

const powerSpectrum = (frame: Float64Array, fftSize: number): Float64Array => {
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  real.set(frame.subarray(0, Math.min(frame.length, fftSize)));
  fft(real, imag);
  const numBins = (fftSize >> 1) + 1;
  const power = new Float64Array(numBins);
  for (let i = 0; i < numBins; i++) {
    power[i] = real[i] * real[i] + imag[i] * imag[i];
  }
  return power;
};

const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);

const melFilterbank = (
  numFilters: number,
  fftSize: number,
  sampleRate: number,
  lowHz: number = 0,
  highHz: number = sampleRate / 2
): Float64Array[] => {
  const numBins = (fftSize >> 1) + 1;
  const lowMel = hzToMel(lowHz);
  const highMel = hzToMel(highHz);
  const melPoints = new Float64Array(numFilters + 2);
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = lowMel + ((highMel - lowMel) * i) / (numFilters + 1);
  }

  const binPoints = melPoints.map((m) =>
    Math.floor(((fftSize + 1) * melToHz(m)) / sampleRate)
  );

  const filters: Float64Array[] = [];
  for (let i = 0; i < numFilters; i++) {
    const filter = new Float64Array(numBins);
    const left = binPoints[i];
    const center = binPoints[i + 1];
    const right = binPoints[i + 2];

    for (let j = left; j < center && j < numBins; j++) {
      filter[j] = (j - left) / Math.max(center - left, 1);
    }
    for (let j = center; j <= right && j < numBins; j++) {
      filter[j] = (right - j) / Math.max(right - center, 1);
    }
    filters.push(filter);
  }
  return filters;
};

const dctII = (input: Float64Array, numOutput: number): Float64Array => {
  const n = input.length;
  const out = new Float64Array(numOutput);
  for (let k = 0; k < numOutput; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * k * (i + 0.5)) / n);
    }
    out[k] = sum;
  }
  return out;
};

export interface MfccOptions {
  sampleRate?: number;
  numCoeffs?: number; // number of MFCCs to keep (default: 13)
  numFilters?: number; // mel filterbank size (default: 26)
  fftSize?: number; // FFT window size in samples (default: 256 for 8kHz)
  frameMs?: number; // frame length in ms (default: 25)
  hopMs?: number; // hop length in ms (default: 10)
  preEmphasis?: number; // pre-emphasis coefficient (default: 0.97)
  lowHz?: number; // lowest frequency for mel bank (default: 0)
  highHz?: number; // highest frequency for mel bank (default: sampleRate/2)
  lifter?: number; // sinusoidal lifter coefficient (default: 22, 0 to disable)
  cmn?: boolean; // cepstral mean normalization (default: MFCC_CMN)
  temporalSegments?: number; // number of time segments for summaryTemporal (default: MFCC_TEMPORAL_SEGMENTS)
}

export interface MfccResult {
  frames: Float64Array[];
  summary: number[];
  summaryExtended: number[];
  summaryWithDeltas: number[];
  summaryTemporal: number[];
}

export const extractMfcc = (
  samples: number[],
  opts: MfccOptions = {}
): MfccResult => {
  const {
    sampleRate = AUDIO_SAMPLE_RATE,
    numCoeffs = MFCC_NUM_COEFFS,
    numFilters = MFCC_NUM_FILTERS,
    fftSize = MFCC_FFT_SIZE,
    frameMs = MFCC_FRAME_MS,
    hopMs = MFCC_HOP_MS,
    preEmphasis = AUDIO_PRE_EMPHASIS_ALPHA,
    lowHz = MFCC_LOW_HZ,
    highHz = sampleRate / 2,
    lifter = MFCC_LIFTER,
    cmn = MFCC_CMN,
    temporalSegments = MFCC_TEMPORAL_SEGMENTS,
  } = opts;

  const emphasized = new Float64Array(samples.length);
  emphasized[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    emphasized[i] = samples[i] - preEmphasis * samples[i - 1];
  }

  const frameLen = Math.round((frameMs / 1000) * sampleRate);
  const hopLen = Math.round((hopMs / 1000) * sampleRate);
  const window = new Float64Array(frameLen);
  for (let i = 0; i < frameLen; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameLen - 1)));
  }

  const filters = melFilterbank(numFilters, fftSize, sampleRate, lowHz, highHz);
  const lifterCoeffs = new Float64Array(numCoeffs);
  for (let i = 0; i < numCoeffs; i++) {
    lifterCoeffs[i] =
      lifter > 0 ? 1 + (lifter / 2) * Math.sin((Math.PI * i) / lifter) : 1;
  }

  const mfccFrames: Float64Array[] = [];
  for (let start = 0; start + frameLen <= emphasized.length; start += hopLen) {
    const windowed = new Float64Array(frameLen);
    for (let i = 0; i < frameLen; i++) {
      windowed[i] = emphasized[start + i] * window[i];
    }
    const power = powerSpectrum(windowed, fftSize);
    const melEnergies = new Float64Array(numFilters);
    for (let f = 0; f < numFilters; f++) {
      let sum = 0;
      for (let j = 0; j < power.length; j++) {
        sum += power[j] * filters[f][j];
      }
      melEnergies[f] = Math.log(Math.max(sum, 1e-22));
    }
    const mfcc = dctII(melEnergies, numCoeffs);
    for (let i = 0; i < numCoeffs; i++) {
      mfcc[i] *= lifterCoeffs[i];
    }
    mfccFrames.push(mfcc);
  }

  if (mfccFrames.length === 0) {
    const zeros = new Array<number>(numCoeffs).fill(0);
    const nSeg = Math.max(1, temporalSegments);
    const temporalZeros = new Array<number>(2 * numCoeffs * nSeg).fill(0);
    return {
      frames: [],
      summary: [...zeros, ...zeros],
      summaryExtended: [
        ...zeros,
        ...zeros,
        ...zeros,
        ...zeros,
        ...zeros,
        ...zeros,
      ],
      summaryWithDeltas: [...zeros, ...zeros, ...zeros, ...zeros],
      summaryTemporal: temporalZeros,
    };
  }

  if (cmn) {
    const cmnMeans = new Float64Array(numCoeffs);
    for (let c = 0; c < numCoeffs; c++) {
      let sum = 0;
      for (let f = 0; f < mfccFrames.length; f++) sum += mfccFrames[f][c];
      cmnMeans[c] = sum / mfccFrames.length;
    }
    for (const frame of mfccFrames) {
      for (let c = 0; c < numCoeffs; c++) {
        frame[c] -= cmnMeans[c];
      }
    }
  }

  const means = new Float64Array(numCoeffs);
  const stds = new Float64Array(numCoeffs);
  const nFrames = mfccFrames.length;

  for (let c = 0; c < numCoeffs; c++) {
    let sum = 0;
    for (let f = 0; f < nFrames; f++) sum += mfccFrames[f][c];
    means[c] = sum / nFrames;
  }
  for (let c = 0; c < numCoeffs; c++) {
    let sumSq = 0;
    for (let f = 0; f < nFrames; f++) {
      const d = mfccFrames[f][c] - means[c];
      sumSq += d * d;
    }
    stds[c] = Math.sqrt(sumSq / nFrames);
  }

  const summary = [...Array.from(means), ...Array.from(stds)];

  const mins = new Float64Array(numCoeffs).fill(Infinity);
  const maxs = new Float64Array(numCoeffs).fill(-Infinity);
  for (let c = 0; c < numCoeffs; c++) {
    for (let f = 0; f < nFrames; f++) {
      const v = mfccFrames[f][c];
      if (v < mins[c]) mins[c] = v;
      if (v > maxs[c]) maxs[c] = v;
    }
  }
  const skews = new Float64Array(numCoeffs);
  const kurts = new Float64Array(numCoeffs);
  for (let c = 0; c < numCoeffs; c++) {
    const s = stds[c] || 1;
    let m3 = 0,
      m4 = 0;
    for (let f = 0; f < nFrames; f++) {
      const z = (mfccFrames[f][c] - means[c]) / s;
      m3 += z * z * z;
      m4 += z * z * z * z;
    }
    skews[c] = m3 / nFrames;
    kurts[c] = m4 / nFrames - 3; // excess kurtosis
  }
  const summaryExtended = [
    ...Array.from(means),
    ...Array.from(stds),
    ...Array.from(mins),
    ...Array.from(maxs),
    ...Array.from(skews),
    ...Array.from(kurts),
  ];

  const deltaFrames: Float64Array[] = [];
  for (let f = 1; f < nFrames; f++) {
    const delta = new Float64Array(numCoeffs);
    for (let c = 0; c < numCoeffs; c++) {
      delta[c] = mfccFrames[f][c] - mfccFrames[f - 1][c];
    }
    deltaFrames.push(delta);
  }

  const deltaMeans = new Float64Array(numCoeffs);
  const deltaStds = new Float64Array(numCoeffs);
  if (deltaFrames.length > 0) {
    for (let c = 0; c < numCoeffs; c++) {
      let sum = 0;
      for (let f = 0; f < deltaFrames.length; f++) sum += deltaFrames[f][c];
      deltaMeans[c] = sum / deltaFrames.length;
    }
    for (let c = 0; c < numCoeffs; c++) {
      let sumSq = 0;
      for (let f = 0; f < deltaFrames.length; f++) {
        const d = deltaFrames[f][c] - deltaMeans[c];
        sumSq += d * d;
      }
      deltaStds[c] = Math.sqrt(sumSq / deltaFrames.length);
    }
  }

  const summaryWithDeltas = [
    ...summary,
    ...Array.from(deltaMeans),
    ...Array.from(deltaStds),
  ];

  const nSeg = Math.max(1, temporalSegments);
  const summaryTemporal: number[] = [];
  const segLen = Math.ceil(nFrames / nSeg);
  for (let seg = 0; seg < nSeg; seg++) {
    const segStart = seg * segLen;
    const segEnd = Math.min(segStart + segLen, nFrames);
    const segN = segEnd - segStart;
    const segMeans = new Float64Array(numCoeffs);
    const segStds = new Float64Array(numCoeffs);
    if (segN > 0) {
      for (let c = 0; c < numCoeffs; c++) {
        let s = 0;
        for (let f = segStart; f < segEnd; f++) s += mfccFrames[f][c];
        segMeans[c] = s / segN;
      }
      for (let c = 0; c < numCoeffs; c++) {
        let sq = 0;
        for (let f = segStart; f < segEnd; f++) {
          const d = mfccFrames[f][c] - segMeans[c];
          sq += d * d;
        }
        segStds[c] = Math.sqrt(sq / segN);
      }
    }
    summaryTemporal.push(...Array.from(segMeans), ...Array.from(segStds));
  }

  return {
    frames: mfccFrames,
    summary,
    summaryExtended,
    summaryWithDeltas,
    summaryTemporal,
  };
};
