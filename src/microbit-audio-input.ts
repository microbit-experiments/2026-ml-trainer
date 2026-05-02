import { splitAudioToXYZ } from "./audio-to-xyz";
import {
  MicrobitWebUSBConnection,
  SerialDataEvent,
} from "@microbit/microbit-connection";
import { XYZStream } from "./audio-input";

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
}

type NavigatorWithSerial = {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
  };
};

const SAMPLE_RATE_FALLBACK = 8000;
const DURATION_MS = 990;
const ANALYSIS_INTERVAL_MS = 20;
const DEBUG_SAMPLE_INTERVALS = 1000 / ANALYSIS_INTERVAL_MS;

const FRAME_PREFIX = "MBAUDIO";
const DEBUG_AUDIO_STREAM = true;

const debugAudio = (...args: unknown[]) => {
  if (DEBUG_AUDIO_STREAM) {
    console.debug("[microbit-audio]", ...args);
  }
};

let listeners: Array<(event: AudioXYZEvent) => void> = [];

export interface AudioXYZEvent {
  data: {
    x: number;
    y: number;
    z: number;
  };
}

interface ParsedFrame {
  sampleRate: number;
  samples: number[];
}

export interface StartMicrobitAudioStreamOptions {
  port?: SerialPortLike;
  baudRate?: number;
}

export const addMicrobitAudioListener = (
  listener: (event: AudioXYZEvent) => void
) => {
  listeners.push(listener);
};

export const removeMicrobitAudioListener = (
  listener: (event: AudioXYZEvent) => void
) => {
  listeners = listeners.filter(
    (currentListener) => currentListener !== listener
  );
};

const emitXYZ = (x: number, y: number, z: number) => {
  XYZStream(x, y, z);
  const event: AudioXYZEvent = { data: { x, y, z } };
  listeners.forEach((listener) => listener(event));
};

const debugSnapshot = (label: string, details: Record<string, unknown>) => {
  debugAudio(label, details);
};

const debugPreview = (value: string, maxLength: number = 120) => {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
};

const previewTextBytes = (value: string, maxLength: number = 24) => {
  const bytes = Array.from(value.slice(0, maxLength), (character) =>
    character.charCodeAt(0)
  );
  const ascii = bytes
    .map((byte) =>
      byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
    )
    .join("");
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  return { ascii, hex, length: value.length };
};

const previewBinaryBytes = (value: Uint8Array, maxLength: number = 24) => {
  const bytes = Array.from(value.slice(0, maxLength));
  const ascii = bytes
    .map((byte) =>
      byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
    )
    .join("");
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  return { ascii, hex, length: value.length };
};

export const requestMicrobitSerialPort = async (): Promise<SerialPortLike> => {
  const serialNavigator = navigator as NavigatorWithSerial;
  if (!serialNavigator.serial) {
    throw new Error("Web Serial API is not supported in this browser");
  }
  return serialNavigator.serial.requestPort();
};

const parseFrames = (
  pending: string
): { frames: ParsedFrame[]; remaining: string } => {
  const frames: ParsedFrame[] = [];
  const lines = pending.split("\n");
  const remaining = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split(",");
    if (parts.length < 5 || parts[0] !== FRAME_PREFIX) {
      continue;
    }

    const version = Number(parts[1]);
    const sampleRate = Number(parts[2]);
    const sampleCount = Number(parts[4]);
    if (
      !Number.isFinite(version) ||
      !Number.isFinite(sampleRate) ||
      !Number.isFinite(sampleCount) ||
      version !== 1 ||
      sampleCount <= 0 ||
      parts.length < 5 + sampleCount
    ) {
      continue;
    }

    const samples = new Array<number>(sampleCount);
    let isValid = true;
    for (let i = 0; i < sampleCount; i++) {
      const value = Number(parts[5 + i]);
      if (!Number.isFinite(value)) {
        isValid = false;
        break;
      }
      samples[i] = value / 32768;
    }
    if (!isValid) {
      continue;
    }

    frames.push({
      sampleRate: sampleRate || SAMPLE_RATE_FALLBACK,
      samples,
    });
  }

  return { frames, remaining };
};

export const startMicrobitAudioStream = async (
  options: StartMicrobitAudioStreamOptions = {}
): Promise<() => Promise<void>> => {
  const baudRate = options.baudRate ?? 1000000;
  const port = options.port ?? (await requestMicrobitSerialPort());
  debugAudio("starting serial audio stream", { baudRate });

  if (!port.readable) {
    await port.open({ baudRate });
  }

  const reader = port.readable?.getReader();
  if (!reader) {
    throw new Error("Unable to read from serial port");
  }

  let active = true;
  let pending = "";
  let sampleRate = SAMPLE_RATE_FALLBACK;
  const ringBuffer: number[] = [];
  let debugTick = 0;
  let receivedBytes = 0;
  let receivedChunks = 0;
  const decoder = new TextDecoder();

  const readLoop = async () => {
    while (active) {
      const result: { value?: Uint8Array; done: boolean } = await reader.read();
      const value = result.value;
      const done = result.done;
      if (done || !value) {
        break;
      }

      debugAudio("serial chunk preview", previewBinaryBytes(value));

      receivedChunks += 1;
      receivedBytes += value.length;
      pending += decoder.decode(value, { stream: true });
      const parsed = parseFrames(pending);
      pending = parsed.remaining;

      for (const frame of parsed.frames) {
        sampleRate = frame.sampleRate;
        ringBuffer.push(...frame.samples);
      }

      const maxLen = Math.floor((sampleRate * DURATION_MS) / 1000);
      while (ringBuffer.length > maxLen * 2) {
        ringBuffer.shift();
      }
    }
  };

  const analysisInterval = setInterval(() => {
    if (!active) {
      return;
    }

    debugTick += 1;
    const maxLen = Math.floor((sampleRate * DURATION_MS) / 1000);
    if (ringBuffer.length < maxLen) {
      if (debugTick % DEBUG_SAMPLE_INTERVALS === 0) {
        debugSnapshot("waiting for audio data", {
          sampleRate,
          pendingBytes: pending.length,
          ringBufferLength: ringBuffer.length,
          receivedChunks,
          receivedBytes,
          pendingPreview: debugPreview(pending),
        });
      }
      return;
    }

    const samples = ringBuffer.slice(-maxLen);
    const xyz = splitAudioToXYZ(samples, sampleRate);
    const last = xyz.x.length - 1;
    if (last >= 0) {
      if (debugTick % DEBUG_SAMPLE_INTERVALS === 0) {
        debugSnapshot("audio sample snapshot", {
          sampleRate,
          ringBufferLength: ringBuffer.length,
          sampleCount: samples.length,
          xyz: {
            x: xyz.x[last],
            y: xyz.y[last],
            z: xyz.z[last],
          },
        });
      }
      emitXYZ(xyz.x[last], xyz.y[last], xyz.z[last]);
    }
  }, ANALYSIS_INTERVAL_MS);

  void readLoop().catch((error) => {
    console.error("Micro:bit serial read failed", error);
  });

  return async () => {
    active = false;
    clearInterval(analysisInterval);
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation errors during teardown.
    }
    reader.releaseLock();
  };
};

export const startMicrobitAudioStreamFromUsbConnection = (
  usbConnection: MicrobitWebUSBConnection
): (() => void) => {
  let active = true;
  let pending = "";
  let sampleRate = SAMPLE_RATE_FALLBACK;
  const ringBuffer: number[] = [];
  let debugTick = 0;
  let receivedBytes = 0;
  let receivedChunks = 0;

  debugAudio("starting USB connection audio stream");

  const onSerialData = (event: SerialDataEvent) => {
    if (!active) {
      return;
    }

    debugAudio("usb serial chunk preview", previewTextBytes(event.data));

    receivedChunks += 1;
    receivedBytes += event.data.length;
    pending += event.data;
    const parsed = parseFrames(pending);
    pending = parsed.remaining;

    for (const frame of parsed.frames) {
      sampleRate = frame.sampleRate;
      ringBuffer.push(...frame.samples);
    }

    const maxLen = Math.floor((sampleRate * DURATION_MS) / 1000);
    while (ringBuffer.length > maxLen * 2) {
      ringBuffer.shift();
    }
  };

  const analysisInterval = setInterval(() => {
    if (!active) {
      return;
    }

    debugTick += 1;
    const maxLen = Math.floor((sampleRate * DURATION_MS) / 1000);
    if (ringBuffer.length < maxLen) {
      if (debugTick % DEBUG_SAMPLE_INTERVALS === 0) {
        debugSnapshot("waiting for USB audio data", {
          sampleRate,
          pendingBytes: pending.length,
          ringBufferLength: ringBuffer.length,
          receivedChunks,
          receivedBytes,
          pendingPreview: debugPreview(pending),
        });
      }
      return;
    }

    const samples = ringBuffer.slice(-maxLen);
    const xyz = splitAudioToXYZ(samples, sampleRate);
    const last = xyz.x.length - 1;
    if (last >= 0) {
      if (debugTick % DEBUG_SAMPLE_INTERVALS === 0) {
        debugSnapshot("USB audio sample snapshot", {
          sampleRate,
          ringBufferLength: ringBuffer.length,
          sampleCount: samples.length,
          xyz: {
            x: xyz.x[last],
            y: xyz.y[last],
            z: xyz.z[last],
          },
        });
      }
      emitXYZ(xyz.x[last], xyz.y[last], xyz.z[last]);
    }
  }, ANALYSIS_INTERVAL_MS);

  usbConnection.addEventListener("serialdata", onSerialData);

  return () => {
    active = false;
    clearInterval(analysisInterval);
    usbConnection.removeEventListener("serialdata", onSerialData);
  };
};
