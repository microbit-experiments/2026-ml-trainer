import { useMemo } from "react";
import { useSettings, useStore } from "./store";
import { useConnectionStage } from "./connection-stage-hooks";

export const useMicrophoneReady = (): boolean => {
  const [{ microphoneUsed }] = useSettings();
  const { isConnected } = useConnectionStage();
  const hasMicrophonePermission = useStore((s) => s.microphonePermission) === "granted";
  return useMemo(() => {
    if (microphoneUsed === "microbit") {
      return isConnected;
    }
    return hasMicrophonePermission;
  }, [microphoneUsed, isConnected, hasMicrophonePermission]);
};
