// Central audio-pipeline configuration. Keep public/*.html prototypes in sync manually.
import type { DataWindow } from "./store";
import { Filter, mlSettings } from "./mlConfig";

// ---- Sampling & timing --------------------------------------------------

export const AUDIO_SAMPLE_RATE = 8000; // 8 kHz — enough for speech
export const AUDIO_DURATION_MS = 990;
export const AUDIO_DEVICE_SAMPLE_PERIOD_MS = Math.round(
  1000 / AUDIO_SAMPLE_RATE
);

// ---- Band-split cutoffs -------------------------------------------------

export const AUDIO_LOW_CUTOFF = 400; // Hz — low/mid band boundary (3-band path)
export const AUDIO_HIGH_CUTOFF = 1500; // Hz — mid/high band boundary (3-band path)

// N cutoffs → N+1 bands: [0,c0], [c0,c1], ..., [c(n-1), Nyquist]
export const AUDIO_BAND_CUTOFFS: number[] = [400, 800, 1500, 2500];

// ---- Loudness normalisation ---------------------------------------------

export const AUDIO_TARGET_RMS = 0.1;
// Cap gain so silence/noise floor isn't amplified to the same level as speech.
export const AUDIO_MAX_NORMALIZE_GAIN = 20;

// ---- Pre-emphasis -------------------------------------------------------

// Boosts high-frequency consonants. Set to 0 to disable.
export const AUDIO_PRE_EMPHASIS_ALPHA = 0.97;

// ---- Band-split temporal framing ----------------------------------------

export const BAND_FRAME_MS = 25; // ms — frame length for band RMS envelope
export const BAND_HOP_MS = 10; // ms — hop length (controls time resolution)

// ---- Silence trimming ---------------------------------------------------

export const TRIM_THRESHOLD = 0.01; // RMS level below which a frame is "silent"
export const TRIM_WINDOW_MS = 25; // ms — analysis window for onset/offset detection
export const TRIM_HANGOVER_MS = 100; // ms — silence after last active frame before trim

// ---- Statistical filters (band-split pipeline) --------------------------

// MIN, ZCR, RMS excluded — benchmarks showed no accuracy improvement.

mlSettings.includedFilters.delete(Filter.MIN);
mlSettings.includedFilters.delete(Filter.ZCR);
mlSettings.includedFilters.delete(Filter.RMS);

// ---- MFCC (Mel-Frequency Cepstral Coefficients) -------------------------

// 10 coeffs beats higher values — fewer dims reduce CoD with only 6 training samples.
export const MFCC_NUM_COEFFS = 10; // cepstral coefficients to keep
export const MFCC_NUM_FILTERS = 26; // mel filterbank size
export const MFCC_FFT_SIZE = 256; // FFT window in samples (power of 2; 256 ≈ 32ms at 8kHz)
export const MFCC_FRAME_MS = 25; // ms — analysis frame length
export const MFCC_HOP_MS = 10; // ms — frame hop (controls time resolution)
export const MFCC_LOW_HZ = 0; // Hz — lower bound of mel filterbank
export const MFCC_LIFTER = 22; // sinusoidal lifter coefficient (0 to disable)
// Hurts accuracy with few training samples — extra dims add noise faster than signal.
export const MFCC_USE_DELTAS = false;
export const MFCC_EXTENDED_STATS = false;
export const MFCC_CMN = false;

// 2 segments = 40 features, best in benchmarks. 0 or 1 = global summary only.
export const MFCC_TEMPORAL_SEGMENTS = 2;

// ---- Classifier ---------------------------------------------------------

// Centroid beats kNN with very few samples. Cosine beats manhattan — z-norm handles scale.
export const CLASSIFIER_TYPE: "centroid" | "knn" = "centroid";
export const CLASSIFIER_KNN_K = 3; // k for kNN (only used when CLASSIFIER_TYPE = "knn")
export const CLASSIFIER_DISTANCE: "cosine" | "manhattan" | "euclidean" =
  "cosine";
export const CLASSIFIER_KNN_WEIGHTING: "gaussian" | "uniform" | "inverse" =
  "gaussian";
export const CLASSIFIER_NUM_PROTOTYPES = 1;

// ---- Feature set --------------------------------------------------------

// "combined" = band-split (65) + temporal MFCC (40) = 105 features — best in benchmarks.
export const FEATURE_SET: "combined" | "bandsplit" | "mfcc" = "combined";

// ---- Augmentation -------------------------------------------------------

// Naive augmentation (both LDA + centroids) hurts accuracy — use LDA_AUG_PER_SAMPLE instead.
export const AUGMENT_GAIN_RANGE = 0.1; // ± fraction of original gain (0.1 = ±10%)
export const AUGMENT_SHIFT_MS = 20; // max time shift in either direction (ms)
export const AUGMENT_SPEED_FACTORS: number[] = [];

// ---- Dimensionality reduction -----------------------------------------------

export const PCA_COMPONENTS = 0;

// ---- LDA (Linear Discriminant Analysis) -------------------------------------

// Max useful value is C-1 (classes minus one). 0 = disabled.
export const LDA_COMPONENTS: number = 7;

// Pre-projection before LDA scatter computation; avoids singular within-class scatter. 0 = skip.
export const LDA_PRE_PCA_DIM = 90;

export const LDA_LAMBDA = 0.3;

// Augmented clips used only for LDA scatter — not centroids — to avoid centroid pollution.
export const LDA_AUG_PER_SAMPLE = 10;

// ---- DataWindow for the store / UI --------------------------------------

export const audioDataWindow: DataWindow = {
  duration: AUDIO_DURATION_MS,
  minSamples: Math.floor((AUDIO_SAMPLE_RATE * AUDIO_DURATION_MS) / 1000),
  deviceSamplesPeriod: AUDIO_DEVICE_SAMPLE_PERIOD_MS,
  deviceSamplesLength: AUDIO_SAMPLE_RATE,
};
