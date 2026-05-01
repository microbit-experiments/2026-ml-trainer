import {
  AUDIO_SAMPLE_RATE,
  AUDIO_BAND_CUTOFFS,
  AUDIO_TARGET_RMS,
  AUDIO_MAX_NORMALIZE_GAIN,
  CLASSIFIER_TYPE,
  CLASSIFIER_KNN_K,
  CLASSIFIER_KNN_WEIGHTING,
  CLASSIFIER_DISTANCE,
  CLASSIFIER_NUM_PROTOTYPES,
  FEATURE_SET,
  MFCC_USE_DELTAS,
  MFCC_EXTENDED_STATS,
  MFCC_TEMPORAL_SEGMENTS,
  LDA_COMPONENTS,
  LDA_PRE_PCA_DIM,
  LDA_LAMBDA,
  LDA_AUG_PER_SAMPLE,
} from "./audioConfig";
import {
  splitAudioToBands,
  normalizeClip,
  trimAndCenter,
  computeActiveRms,
  seededAugmentClip,
} from "./audio-to-xyz";
import { extractNBandFeatures } from "./audio-extra-features";
import { extractMfcc } from "./audio-mfcc";

/** Deterministic 32-bit PRNG (Mulberry32). */
const mulberry32 = (seed: number) => {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const extractExistingAudioFeatures = (
  samples: number[],
  sampleRate: number = AUDIO_SAMPLE_RATE
): number[] => {
  const bands = splitAudioToBands(samples, sampleRate, AUDIO_BAND_CUTOFFS, {
    trim: true,
  });
  return extractNBandFeatures(bands);
};

export const extractMfccFeatures = (
  samples: number[],
  sampleRate: number = AUDIO_SAMPLE_RATE
): number[] => {
  const refRms = computeActiveRms(samples, sampleRate);
  const trimmed = trimAndCenter(samples, sampleRate);
  const normalized = normalizeClip(trimmed, AUDIO_TARGET_RMS, AUDIO_MAX_NORMALIZE_GAIN, refRms);
  const result = extractMfcc(normalized, { sampleRate });
  if (MFCC_TEMPORAL_SEGMENTS > 1) return result.summaryTemporal;
  if (MFCC_EXTENDED_STATS) return result.summaryExtended;
  return MFCC_USE_DELTAS ? result.summaryWithDeltas : result.summary;
};

export const extractCombinedAudioFeatures = (
  samples: number[],
  sampleRate: number = AUDIO_SAMPLE_RATE
): number[] => {
  const existing = extractExistingAudioFeatures(samples, sampleRate);
  const mfcc = extractMfccFeatures(samples, sampleRate);
  return [...existing, ...mfcc];
};
export const extractAudioFeatures = (
  samples: number[],
  sampleRate: number = AUDIO_SAMPLE_RATE
): number[] => {
  if (FEATURE_SET === "bandsplit")
    return extractExistingAudioFeatures(samples, sampleRate);
  if (FEATURE_SET === "mfcc") return extractMfccFeatures(samples, sampleRate);
  return extractCombinedAudioFeatures(samples, sampleRate);
};
export interface ZNormStats {
  means: number[];
  stds: number[];
}

export const computeZNormStats = (features: number[][]): ZNormStats => {
  if (features.length === 0) {
    return { means: [], stds: [] };
  }
  const dim = features[0].length;
  const means = new Array<number>(dim).fill(0);
  const stds = new Array<number>(dim).fill(0);
  const n = features.length;

  for (let d = 0; d < dim; d++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += features[i][d];
    means[d] = sum / n;
  }
  for (let d = 0; d < dim; d++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const diff = features[i][d] - means[d];
      sumSq += diff * diff;
    }
    stds[d] = Math.sqrt(sumSq / n);
  }
  return { means, stds };
};

export const applyZNorm = (features: number[], stats: ZNormStats): number[] => {
  return features.map((v, i) =>
    stats.stds[i] > 1e-12 ? (v - stats.means[i]) / stats.stds[i] : 0
  );
};

export const manhattanDistance = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
};

export const euclideanDistance = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

/** Cosine distance (1 - cosine similarity). */
export const cosineDistance = (a: number[], b: number[]): number => {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 1;
  return 1 - dot / denom;
};

export const getDistanceFn = (): ((a: number[], b: number[]) => number) => {
  if (CLASSIFIER_DISTANCE === "manhattan") return manhattanDistance;
  if (CLASSIFIER_DISTANCE === "euclidean") return euclideanDistance;
  return cosineDistance;
};

const vecMean = (vecs: number[][]): number[] => {
  const dim = vecs[0].length;
  const result = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let d = 0; d < dim; d++) result[d] += v[d];
  }
  for (let d = 0; d < dim; d++) result[d] /= vecs.length;
  return result;
};

const kMeans = (
  data: number[][],
  k: number,
  maxIter: number = 20
): number[][] => {
  const dim = data[0].length;
  const n = data.length;

  const centroids: number[][] = [data[Math.floor(Math.random() * n)].slice()];
  for (let c = 1; c < k; c++) {
    const dists = data.map((p) => {
      let minD = Infinity;
      for (const cen of centroids) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += (p[i] - cen[i]) ** 2;
        if (d < minD) minD = d;
      }
      return minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push(data[idx].slice());
  }

  const assignments = new Int32Array(n);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) d += (data[i][j] - centroids[c][j]) ** 2;
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }
    if (!changed) break;

    const counts = new Array(k).fill(0);
    for (let c = 0; c < k; c++) {
      for (let d = 0; d < dim; d++) centroids[c][d] = 0;
    }
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) centroids[c][d] += data[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) centroids[c][d] /= counts[c];
      }
    }
  }
  return centroids;
};

export interface PcaTransform {
  mean: number[];
  components: number[][]; // top-k eigenvectors (each length = original dim)
  nComponents: number;
}

export const fitPca = (
  features: number[][],
  nComponents: number
): PcaTransform => {
  const n = features.length;
  const dim = features[0].length;

  const mean = new Array<number>(dim).fill(0);
  for (const f of features) {
    for (let d = 0; d < dim; d++) mean[d] += f[d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= n;

  const centered = features.map((f) => f.map((v, d) => v - mean[d]));

  // Power iteration with deflation to extract top eigenvectors.
  const components: number[][] = [];
  const deflated = centered.map((r) => r.slice());

  for (let comp = 0; comp < nComponents; comp++) {
    let vec = new Array<number>(dim);
    for (let d = 0; d < dim; d++) vec[d] = Math.random() - 0.5;

    for (let iter = 0; iter < 100; iter++) {
      const projected = deflated.map((row) => {
        let s = 0;
        for (let d = 0; d < dim; d++) s += row[d] * vec[d];
        return s;
      });
      const newVec = new Array<number>(dim).fill(0);
      for (let i = 0; i < n; i++) {
        for (let d = 0; d < dim; d++)
          newVec[d] += deflated[i][d] * projected[i];
      }

      let norm = 0;
      for (let d = 0; d < dim; d++) norm += newVec[d] * newVec[d];
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dim; d++) newVec[d] /= norm;

      let dot = 0;
      for (let d = 0; d < dim; d++) dot += vec[d] * newVec[d];
      vec = newVec;
      if (Math.abs(dot) > 1 - 1e-10) break;
    }

    components.push(vec);

    for (let i = 0; i < n; i++) {
      let proj = 0;
      for (let d = 0; d < dim; d++) proj += deflated[i][d] * vec[d];
      for (let d = 0; d < dim; d++) deflated[i][d] -= proj * vec[d];
    }
  }

  return { mean, components, nComponents };
};

export const applyPca = (features: number[], pca: PcaTransform): number[] => {
  const centered = features.map((v, d) => v - pca.mean[d]);
  return pca.components.map((comp) => {
    let s = 0;
    for (let d = 0; d < comp.length; d++) s += centered[d] * comp[d];
    return s;
  });
};

export interface LdaTransform {
  prePca: PcaTransform | null;
  mean: number[];
  components: number[][];
}

/** Gauss-Jordan matrix inverse. Returns identity if matrix is (near-)singular. */
const invertMatrix = (A: number[][]): number[][] => {
  const n = A.length;
  const aug = A.map((row, i) =>
    row.slice().concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  );
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivotRow][col]))
        pivotRow = row;
    }
    if (Math.abs(aug[pivotRow][col]) < 1e-12) {
      return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
      );
    }
    [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
    const scale = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
};

export const fitLda = (
  features: number[][],
  labels: number[],
  rawAudioClips?: number[][]
): LdaTransform | null => {
  if (LDA_COMPONENTS === 0) return null;

  let fitFeatures = features;
  let fitLabels = labels;

  if (
    LDA_AUG_PER_SAMPLE > 0 &&
    rawAudioClips &&
    rawAudioClips.length === features.length
  ) {
    const augF: number[][] = [];
    const augL: number[] = [];
    for (let i = 0; i < rawAudioClips.length; i++) {
      for (let a = 0; a < LDA_AUG_PER_SAMPLE; a++) {
        const rng = mulberry32(42 + i * 7919 + a * 1009);
        const augClip = seededAugmentClip(
          rawAudioClips[i],
          AUDIO_SAMPLE_RATE,
          rng
        );
        augF.push(extractAudioFeatures(augClip));
        augL.push(labels[i]);
      }
    }
    fitFeatures = [...features, ...augF];
    fitLabels = [...labels, ...augL];
  }

  let feats = fitFeatures;
  let prePca: PcaTransform | null = null;
  if (LDA_PRE_PCA_DIM > 0 && LDA_PRE_PCA_DIM < fitFeatures[0].length) {
    prePca = fitPca(fitFeatures, LDA_PRE_PCA_DIM);
    feats = fitFeatures.map((f) => applyPca(f, prePca!));
  }

  const n = feats.length;
  const d = feats[0].length;
  const classSet = [...new Set(fitLabels)].sort((a, b) => a - b);
  const C = classSet.length;
  const k = Math.min(LDA_COMPONENTS, C - 1);
  if (k <= 0) return { prePca, mean: new Array(d).fill(0), components: [] };

  const globalMean = new Array<number>(d).fill(0);
  for (const f of feats) for (let i = 0; i < d; i++) globalMean[i] += f[i];
  for (let i = 0; i < d; i++) globalMean[i] /= n;

  const classMeans: number[][] = [];
  const classCounts: number[] = [];
  for (const c of classSet) {
    const cm = new Array<number>(d).fill(0);
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (fitLabels[i] === c) {
        for (let j = 0; j < d; j++) cm[j] += feats[i][j];
        count++;
      }
    }
    for (let j = 0; j < d; j++) cm[j] /= count;
    classMeans.push(cm);
    classCounts.push(count);
  }

  const Sw = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < n; i++) {
    const ci = classSet.indexOf(fitLabels[i]);
    for (let r = 0; r < d; r++) {
      const dr = feats[i][r] - classMeans[ci][r];
      for (let c = 0; c < d; c++) {
        Sw[r][c] += dr * (feats[i][c] - classMeans[ci][c]);
      }
    }
  }

  if (LDA_LAMBDA > 0) {
    let trace = 0;
    for (let i = 0; i < d; i++) trace += Sw[i][i];
    const reg = (LDA_LAMBDA * trace) / d;
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) Sw[i][j] *= 1 - LDA_LAMBDA;
      Sw[i][i] += reg;
    }
  }

  const SwInv = invertMatrix(Sw);

  const components: number[][] = [];
  for (let comp = 0; comp < k; comp++) {
    let vec = Array.from({ length: d }, () => Math.random() - 0.5);
    for (let iter = 0; iter < 150; iter++) {
      const Sbv = new Array<number>(d).fill(0);
      for (let ci = 0; ci < C; ci++) {
        let dot = 0;
        for (let j = 0; j < d; j++)
          dot += (classMeans[ci][j] - globalMean[j]) * vec[j];
        for (let j = 0; j < d; j++)
          Sbv[j] += classCounts[ci] * dot * (classMeans[ci][j] - globalMean[j]);
      }
      const nv = new Array<number>(d).fill(0);
      for (let r = 0; r < d; r++)
        for (let c = 0; c < d; c++) nv[r] += SwInv[r][c] * Sbv[c];
      for (const prev of components) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += nv[j] * prev[j];
        for (let j = 0; j < d; j++) nv[j] -= dot * prev[j];
      }
      let norm = 0;
      for (let j = 0; j < d; j++) norm += nv[j] * nv[j];
      norm = Math.sqrt(norm) || 1;
      let dotConv = 0;
      for (let j = 0; j < d; j++) dotConv += (nv[j] / norm) * vec[j];
      vec = nv.map((v) => v / norm);
      if (Math.abs(dotConv) > 1 - 1e-8) break;
    }
    components.push(vec);
  }

  return { prePca, mean: globalMean, components };
};

export const applyLda = (features: number[], lda: LdaTransform): number[] => {
  const v = lda.prePca ? applyPca(features, lda.prePca) : features;
  return lda.components.map((comp) => {
    let s = 0;
    for (let i = 0; i < comp.length; i++) s += (v[i] - lda.mean[i]) * comp[i];
    return s;
  });
};

export const speedPerturb = (samples: number[], factor: number): number[] => {
  const outLen = Math.round(samples.length / factor);
  const out = new Array<number>(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * factor;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcIdx - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
};

export const centroidPredict = (
  trainFeatures: number[][],
  trainLabels: number[],
  query: number[],
  distanceFn: (a: number[], b: number[]) => number = cosineDistance,
  numPrototypes: number = CLASSIFIER_NUM_PROTOTYPES
): number => {
  const groups: Record<number, number[][]> = {};
  for (let i = 0; i < trainFeatures.length; i++) {
    (groups[trainLabels[i]] ??= []).push(trainFeatures[i]);
  }
  let bestLabel = 0;
  let bestDist = Infinity;
  for (const [label, feats] of Object.entries(groups)) {
    const centroids =
      numPrototypes <= 1 || feats.length <= numPrototypes
        ? [vecMean(feats)]
        : kMeans(feats, numPrototypes);
    for (const centroid of centroids) {
      const dist = distanceFn(centroid, query);
      if (dist < bestDist) {
        bestDist = dist;
        bestLabel = Number(label);
      }
    }
  }
  return bestLabel;
};

export const knnPredict = (
  trainFeatures: number[][],
  trainLabels: number[],
  query: number[],
  k: number,
  distanceFn: (a: number[], b: number[]) => number = cosineDistance
): number => {
  const distances = trainFeatures.map((f, i) => ({
    label: trainLabels[i],
    dist: distanceFn(f, query),
  }));
  distances.sort((a, b) => a.dist - b.dist);
  const topK = distances.slice(0, k);

  const weighting = CLASSIFIER_KNN_WEIGHTING;
  const sigma = topK[topK.length - 1].dist || 1;
  const votes: Record<number, number> = {};
  for (const { label, dist } of topK) {
    let weight: number;
    if (weighting === "uniform") {
      weight = 1;
    } else if (weighting === "inverse") {
      weight = 1 / (dist + 1e-6);
    } else {
      weight = Math.exp((-dist * dist) / (2 * sigma * sigma));
    }
    votes[label] = (votes[label] ?? 0) + weight;
  }

  let bestLabel = topK[0].label;
  let bestWeight = -1;
  for (const [label, weight] of Object.entries(votes)) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestLabel = Number(label);
    }
  }
  return bestLabel;
};

export const classify = (
  trainFeatures: number[][],
  trainLabels: number[],
  query: number[]
): number => {
  const distFn = getDistanceFn();
  if (CLASSIFIER_TYPE === "centroid") {
    return centroidPredict(trainFeatures, trainLabels, query, distFn);
  }
  return knnPredict(
    trainFeatures,
    trainLabels,
    query,
    CLASSIFIER_KNN_K,
    distFn
  );
};
