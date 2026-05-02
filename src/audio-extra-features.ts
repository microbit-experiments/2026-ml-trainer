import type { XYZData } from "./model";
import { AUDIO_SAMPLE_RATE } from "./audioConfig";

export const rms = (data: number[]): number => {
  if (data.length === 0) return 0;
  const sumSq = data.reduce((sum, v) => sum + v * v, 0);
  return Math.sqrt(sumSq / data.length);
};

const spectralFeatures = (data: number[]): [number, number] => {
  if (data.length <= 1) return [0, 0];
  const power = data.map((v) => v * v);
  const eps = 1e-12;

  const totalPower = power.reduce((sum, v) => sum + v, 0);
  if (totalPower <= eps) return [0, 0];

  const threshold = 0.85 * totalPower;
  let cumulative = 0;
  let rolloff = 1;
  for (let i = 0; i < power.length; i++) {
    cumulative += power[i];
    if (cumulative >= threshold) {
      rolloff = i / (power.length - 1);
      break;
    }
  }

  const arithmeticMean = totalPower / power.length;
  const meanLog =
    power.reduce((sum, v) => sum + Math.log(v + eps), 0) / power.length;
  const flatness = Math.min(1, Math.exp(meanLog) / arithmeticMean);

  return [rolloff, flatness];
};

const pearsonCorrelation = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;

  let sumA = 0,
    sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0,
    varA = 0,
    varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA) * Math.sqrt(varB);
  if (denom < 1e-12) return 0;
  return cov / denom;
};

export const extractAudioExtraFeatures = (data: XYZData): number[] => {
  const axes = [data.x, data.y, data.z];
  const rolloffs: number[] = [];
  const flatnesses: number[] = [];

  for (const axis of axes) {
    const [rolloff, flatness] = spectralFeatures(axis);
    rolloffs.push(rolloff);
    flatnesses.push(flatness);
  }

  return [...rolloffs, ...flatnesses];
};

export const extractCrossAxisFeatures = (data: XYZData): number[] => {
  return [
    pearsonCorrelation(data.x, data.y),
    pearsonCorrelation(data.y, data.z),
    pearsonCorrelation(data.x, data.z),
  ];
};

export const extractEnergyRatioFeatures = (data: XYZData): number[] => {
  const rmsX = rms(data.x);
  const rmsY = rms(data.y);
  const rmsZ = rms(data.z);
  const total = rmsX + rmsY + rmsZ + 1e-12;
  return [rmsX / total, rmsY / total, rmsZ / total];
};

const extractEnvelopeFromAxis = (
  axis: number[]
): { attack: number; decay: number; centroid: number } => {
  if (axis.length === 0) return { attack: 0, decay: 0, centroid: 0 };

  let peakIdx = 0;
  let peakVal = axis[0];
  for (let i = 1; i < axis.length; i++) {
    if (axis[i] > peakVal) {
      peakVal = axis[i];
      peakIdx = i;
    }
  }

  const attack = peakIdx / Math.max(axis.length - 1, 1);

  let decay = 0;
  if (peakIdx < axis.length - 1 && peakVal > 1e-12) {
    const tailLength = axis.length - peakIdx;
    let sumDecay = 0;
    for (let i = peakIdx + 1; i < axis.length; i++) {
      sumDecay += (peakVal - axis[i]) / peakVal;
    }
    decay = sumDecay / Math.max(tailLength - 1, 1);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < axis.length; i++) {
    weightedSum += i * axis[i];
    totalWeight += axis[i];
  }
  const centroid =
    totalWeight > 1e-12
      ? weightedSum / totalWeight / Math.max(axis.length - 1, 1)
      : 0.5;

  return { attack, decay, centroid };
};

export const extractEnvelopeFeatures = (data: XYZData): number[] => {
  const envX = extractEnvelopeFromAxis(data.x);
  const envY = extractEnvelopeFromAxis(data.y);
  const envZ = extractEnvelopeFromAxis(data.z);
  return [
    envX.attack,
    envX.decay,
    envX.centroid,
    envY.attack,
    envY.decay,
    envY.centroid,
    envZ.attack,
    envZ.decay,
    envZ.centroid,
  ];
};

const _nMean = (d: number[]) => d.reduce((a, b) => a + b, 0) / d.length;

const _nStddev = (d: number[]) => {
  const m = _nMean(d);
  return Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
};

const _nPeaks = (data: number[]): number => {
  const lag = 5;
  const threshold = 3.5;
  const influence = 0.5;
  let peaksCounter = 0;
  if (data.length < lag + 2) return 0;
  const filteredY = data.slice(0);
  const leadIn = data.slice(0, lag);
  const avgFilter: number[] = [];
  avgFilter[lag - 1] = _nMean(leadIn);
  const stdFilter: number[] = [];
  stdFilter[lag - 1] = _nMean(leadIn);
  for (let i = lag; i < data.length; i++) {
    if (
      Math.abs(data[i] - avgFilter[i - 1]) > 0.1 &&
      Math.abs(data[i] - avgFilter[i - 1]) > threshold * stdFilter[i - 1]
    ) {
      if (data[i] > avgFilter[i - 1]) {
        if (i - 1 > 0 && (i < 2 || filteredY[i - 1] === data[i - 1])) {
          peaksCounter++;
        }
      }
      filteredY[i] = influence * data[i] + (1 - influence) * filteredY[i - 1];
    } else {
      filteredY[i] = data[i];
    }
    const yLag = filteredY.slice(i - lag, i);
    avgFilter[i] = _nMean(yLag);
    stdFilter[i] = _nStddev(yLag);
  }
  return peaksCounter;
};

const _nAcc = (data: number[], samplesLen: number): number => {
  const totalAcc = data.reduce((a, b) => a + Math.abs(b), 0);
  return (totalAcc / data.length) * samplesLen;
};

export const extractNBandFeatures = (
  bands: number[][],
  deviceSamplesLen: number = AUDIO_SAMPLE_RATE
): number[] => {
  const feats: number[] = [];
  const nBands = bands.length;

  for (const band of bands) {
    feats.push(Math.max(...band));
    feats.push(_nMean(band));
    feats.push(_nStddev(band));
    feats.push(_nPeaks(band));
    feats.push(_nAcc(band, deviceSamplesLen));
    const [rolloff, flatness] = spectralFeatures(band);
    feats.push(rolloff, flatness);
    const env = extractEnvelopeFromAxis(band);
    feats.push(env.attack, env.decay, env.centroid);
  }

  for (let i = 0; i < nBands; i++) {
    for (let j = i + 1; j < nBands; j++) {
      feats.push(pearsonCorrelation(bands[i], bands[j]));
    }
  }

  const bandRms = bands.map((b) => rms(b));
  const totalRms = bandRms.reduce((a, b) => a + b, 0) + 1e-12;
  for (const r of bandRms) {
    feats.push(r / totalRms);
  }

  return feats;
};
