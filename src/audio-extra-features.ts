import type { XYZData } from "./model";

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

  // Rolloff: index where cumulative power reaches 85%
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

  // Flatness: geometric mean / arithmetic mean of power spectrum
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

// Returns [rolloff_x, rolloff_y, rolloff_z, flatness_x, flatness_y, flatness_z]
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

  // Attack time: index of peak in [0, 1]
  const attack = peakIdx / Math.max(axis.length - 1, 1);

  // Decay rate: slope from peak to end (normalized)
  let decay = 0;
  if (peakIdx < axis.length - 1 && peakVal > 1e-12) {
    const tailLength = axis.length - peakIdx;
    let sumDecay = 0;
    for (let i = peakIdx + 1; i < axis.length; i++) {
      sumDecay += (peakVal - axis[i]) / peakVal;
    }
    decay = sumDecay / Math.max(tailLength - 1, 1);
  }

  // Temporal centroid: weighted center of mass in time
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
