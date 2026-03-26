/**
 * Central audio-pipeline configuration.
 *
 * All audio-specific constants live here so they can be tuned in one place.
 * The public/*.html prototypes duplicate a few of these values inline because
 * they are standalone pages — keep them in sync manually.
 */
import type { DataWindow } from "./store";
import { Filter, mlSettings } from "./mlConfig";

// ---- Sampling & timing --------------------------------------------------

export const AUDIO_SAMPLE_RATE = 8000; // 8 kHz — enough for speech
export const AUDIO_DURATION_MS = 990;
export const AUDIO_DEVICE_SAMPLE_PERIOD_MS = Math.round(
  1000 / AUDIO_SAMPLE_RATE
);

// ---- Band-split cutoffs -------------------------------------------------

export const AUDIO_LOW_CUTOFF = 300; // Hz
export const AUDIO_HIGH_CUTOFF = 2000; // Hz

// ---- DataWindow for the store / UI --------------------------------------

export const audioDataWindow: DataWindow = {
  duration: AUDIO_DURATION_MS,
  minSamples: Math.floor((AUDIO_SAMPLE_RATE * AUDIO_DURATION_MS) / 1000),
  deviceSamplesPeriod: AUDIO_DEVICE_SAMPLE_PERIOD_MS,
  deviceSamplesLength: AUDIO_SAMPLE_RATE,
};

// min and zcr don't help on audio benchmark, so exclude by default

mlSettings.includedFilters.delete(Filter.MIN);
mlSettings.includedFilters.delete(Filter.ZCR);
