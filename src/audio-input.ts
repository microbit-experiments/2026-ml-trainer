//Emits audio data from the computer microphone

import { splitAudioToXYZ } from "./audio-to-xyz";

const SAMPLE_RATE = 8000;
const DURATION_MS = 990;

let audioListeners: Array<(e: AudioXYZEvent) => void> = [];

export interface AudioXYZEvent {
  data: {
    x: number;
    y: number;
    z: number;
  };
}

export const addAudioListener = (listener: (e: AudioXYZEvent) => void) => {
  audioListeners.push(listener);
};

export const removeAudioListener = (listener: (e: AudioXYZEvent) => void) => {
  audioListeners = audioListeners.filter((l) => l !== listener);
};

export const XYZStream = (x: number, y: number, z: number) => {
  const event: AudioXYZEvent = {
    data: { x, y, z },
  } as AudioXYZEvent;
  audioListeners.forEach((listener) => listener(event));
};

export const startAudioStream = (): (() => void) => {
  let isActive = true;
  let audioStream: MediaStream | null = null;
  let processorNode: AudioWorkletNode | null = null;
  let audioCtx: AudioContext | null = null;
  let analysisInterval: NodeJS.Timeout | null = null;

  const startStream = async () => {
    try {
      // Get microphone access
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Safely create AudioContext
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API not supported");
      }
      audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
      if (!audioCtx) throw new Error("AudioContext initialization failed");
      const actualRate = audioCtx.sampleRate;
      // Resume the context if suspended (required in modern browsers)
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(audioStream);
      await audioCtx.audioWorklet.addModule("audio-worklet-processor.js");
      processorNode = new AudioWorkletNode(audioCtx, "audio-processor");

      const ringBuffer: number[] = [];
      const maxLen = Math.floor((SAMPLE_RATE * DURATION_MS) / 1000); // 7920 samples

      processorNode.port.onmessage = (e) => {
        if (!isActive) return;
        const data = e.data as number[];
        const ratio = actualRate / SAMPLE_RATE;
        // Downsample if needed
        for (let i = 0; i < data.length; i += ratio) {
          ringBuffer.push(data[Math.floor(i)]);
        }
        // Keep ring buffer bounded
        while (ringBuffer.length > maxLen * 2) {
          ringBuffer.shift();
        }
      };

      source.connect(processorNode);
      processorNode.connect(audioCtx.destination);

      // Process audio frames every 20ms for smooth live updates
      analysisInterval = setInterval(() => {
        if (!isActive || ringBuffer.length < maxLen) return;

        try {
          // Take the last maxLen samples
          const samples = ringBuffer.slice(-maxLen);
          const xyz = splitAudioToXYZ(samples, SAMPLE_RATE);

          // Emit only the last frame to listeners
          const last = xyz.x.length - 1;
          XYZStream(xyz.x[last], xyz.y[last], xyz.z[last]);
        } catch (err) {
          console.error("Analysis error:", err);
        }
      }, 20);

      console.log("Audio stream started");
    } catch (error) {
      console.error("Audio stream setup failed:", error);
    }
  };

  void startStream();

  // Cleanup function
  return () => {
    isActive = false;
    if (analysisInterval) clearInterval(analysisInterval);
    if (processorNode) processorNode.disconnect();
    if (audioStream) audioStream.getTracks().forEach((t) => t.stop());
    if (audioCtx && audioCtx.state !== "closed") {
      void audioCtx.close().catch((error) => {
        console.error("Failed to close audio context:", error);
      });
    }
    console.log("Audio stream stopped");
  };
};
