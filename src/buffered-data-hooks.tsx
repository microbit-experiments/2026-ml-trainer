/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 * Modifications (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { BufferedData } from "./buffered-data";
//import { useConnectActions } from "./connect-actions-hooks";
import { ConnectionStatus, useConnectStatus } from "./connect-status-hooks";
import { useSettings, useStore } from "./store";
import {
  addAudioListener,
  removeAudioListener,
  startAudioStream,
  AudioXYZEvent,
} from "./audio-input";
import { useConnectActions } from "./connect-actions-hooks";
import { startMicrobitAudioStreamFromUsbConnection } from "./microbit-audio-input";

const BufferedDataContext = createContext<BufferedData | null>(null);

interface ConnectProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export const BufferedDataProvider = ({
  children,
  enabled = true,
}: ConnectProviderProps) => {
  const bufferedData = useBufferedDataInternal(enabled);
  return (
    <BufferedDataContext.Provider value={bufferedData}>
      {children}
    </BufferedDataContext.Provider>
  );
};

export const useBufferedData = (): BufferedData => {
  const value = useContext(BufferedDataContext);
  if (!value) {
    throw new Error("Missing provider");
  }
  return value;
};

const useBufferedDataInternal = (enabled: boolean): BufferedData => {
  const [connectStatus] = useConnectStatus();
  const [{ microphoneUsed }] = useSettings();
  const microphonePermission = useStore((s) => s.microphonePermission);
  const connection = useConnectActions();
  const dataWindow = useStore((s) => s.dataWindow);
  const bufferRef = useRef<BufferedData>();
  const getBuffer = useCallback(() => {
    if (bufferRef.current) {
      return bufferRef.current;
    }
    bufferRef.current = new BufferedData(dataWindow.minSamples * 2);
    return bufferRef.current;
  }, [dataWindow.minSamples]);
  useEffect(() => {
    if (
      !enabled ||
      (microphoneUsed == "microbit" &&
        connectStatus !== ConnectionStatus.Connected)
    ) {
      return;
    }

    // Subscribe to audio data and add samples to buffer
    const listener = (e: AudioXYZEvent) => {
      const { x, y, z } = e.data;
      getBuffer().addSample({ x, y, z }, Date.now());
    };

    if (microphoneUsed === "device") {
      const cleanup = startAudioStream();
      addAudioListener(listener);
      return () => {
        cleanup();
        removeAudioListener(listener);
      };
    }

    if (microphoneUsed === "microbit") {
      const cleanup = startMicrobitAudioStreamFromUsbConnection(
        connection.getUsbConnection()
      );
      addAudioListener(listener);
      return () => {
        cleanup();
        removeAudioListener(listener);
      };
    }
  }, [
    connectStatus,
    connection,
    enabled,
    getBuffer,
    microphoneUsed,
    microphonePermission,
  ]);
  return getBuffer();
};
