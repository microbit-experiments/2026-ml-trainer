/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 * Modifications (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { HStack, usePrevious } from "@chakra-ui/react";
import { useSize } from "@chakra-ui/react-use-size";
import { useEffect, useMemo, useRef, useState } from "react";
import { SmoothieChart, TimeSeries } from "@microbit/smoothie";
import { microphoneReady } from "../microphone-ready";
import { useConnectActions } from "../connect-actions-hooks";
import { ConnectionStatus } from "../connect-status-hooks";
import { useConnectionStage } from "../connection-stage-hooks";
import { useGraphColors } from "../hooks/use-graph-colors";
import { maxAmplitudeScaleForGraphs } from "../mlConfig";
import { useSettings, useStore } from "../store";
import { useGraphLineStyles } from "../hooks/use-graph-line-styles";
import {
  addAudioListener,
  AudioXYZEvent,
  removeAudioListener,
} from "../audio-input";

export const smoothenDataPoint = (curr: number, next: number) => {
  return next * 0.25 + curr * 0.75;
};

const LiveGraph = () => {
  const { status } = useConnectionStage();
  const connectActions = useConnectActions();
  const [{ microphoneUsed, graphColorScheme, graphLineScheme, graphLineWeight }] =
    useSettings();
  const isMicrophoneReady = microphoneReady();

  const colors = useGraphColors(graphColorScheme);
  const lineStyles = useGraphLineStyles(graphLineScheme);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // When we update the chart we re-run the effect that syncs it with the connection state.
  const [chart, setChart] = useState<SmoothieChart | undefined>(undefined);
  const lineWidth = graphLineWeight === "default" ? 2 : 3;

  const liveGraphContainerRef = useRef(null);
  const { width, height } = useSize(liveGraphContainerRef) ?? {
    width: 100,
    height: 100,
  };

  const lineX = useMemo(() => new TimeSeries(), []);
  const lineY = useMemo(() => new TimeSeries(), []);
  const lineZ = useMemo(() => new TimeSeries(), []);
  const recordLines = useMemo(() => new TimeSeries(), []);

  // On mount draw smoothieChart
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    const smoothieChart = new SmoothieChart({
      maxValue: maxAmplitudeScaleForGraphs,
      minValue: 0,
      millisPerPixel: 7,
      grid: {
        fillStyle: "#ffffff00",
        strokeStyle: "rgba(48,48,48,0.20)",
        millisPerLine: 3000,
        borderVisible: false,
      },
      interpolation: "linear",
      enableDpiScaling: false,
    });

    smoothieChart.addTimeSeries(lineX, {
      lineWidth,
      strokeStyle: colors.x,
      lineDash: lineStyles.x,
    });
    smoothieChart.addTimeSeries(lineY, {
      lineWidth,
      strokeStyle: colors.y,
      lineDash: lineStyles.y,
    });
    smoothieChart.addTimeSeries(lineZ, {
      lineWidth,
      strokeStyle: colors.z,
      lineDash: lineStyles.z,
    });

    smoothieChart.addTimeSeries(recordLines, {
      lineWidth: 3,
      strokeStyle: "#4040ff44",
      fillStyle: "#0000ff07",
    });
    setChart(smoothieChart);
    smoothieChart.streamTo(canvasRef.current, 0);
    smoothieChart.render();
    return () => {
      smoothieChart.stop();
    };
  }, [
    colors.x,
    colors.y,
    colors.z,
    lineStyles.x,
    lineStyles.y,
    lineStyles.z,
    lineWidth,
    lineX,
    lineY,
    lineZ,
    recordLines,
  ]);

  useEffect(() => {
    if (isMicrophoneReady || (status === ConnectionStatus.ReconnectingAutomatically && microphoneUsed === "microbit")) {
      chart?.start();
    } else {
      chart?.stop();
    }
  }, [chart, isMicrophoneReady, status, microphoneUsed]);

  // Draw on graph to display that users are recording.
  const isRecording = useStore((s) => s.isRecording);
  const prevIsRecording = usePrevious(isRecording);
  useEffect(() => {
    if (isRecording) {
      // Set the start recording line
      const now = new Date().getTime();
      recordLines.append(now - 1, 0, false);
      recordLines.append(now, maxAmplitudeScaleForGraphs, false);
    } else if (prevIsRecording) {
      // Set the end recording line
      const now = new Date().getTime();
      recordLines.append(now - 1, maxAmplitudeScaleForGraphs, false);
      recordLines.append(now, 0, false);
    }
  }, [isRecording, prevIsRecording, recordLines]);

  const dataRef = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0,
  });

  useEffect(() => {
    lineX.clear();
    lineY.clear();
    lineZ.clear();
    recordLines.clear();
    dataRef.current = { x: 0, y: 0, z: 0 };
  }, [microphoneUsed, lineX, lineY, lineZ, recordLines]);

  useEffect(() => {
    const listener = ({ data }: AudioXYZEvent) => {
      const t = new Date().getTime();
      dataRef.current = {
        x: smoothenDataPoint(dataRef.current.x, data.x),
        y: smoothenDataPoint(dataRef.current.y, data.y),
        z: smoothenDataPoint(dataRef.current.z, data.z),
      };
      lineX.append(t, dataRef.current.x, false);
      lineY.append(t, dataRef.current.y, false);
      lineZ.append(t, dataRef.current.z, false);
    };
    if (isMicrophoneReady) {
      addAudioListener(listener);
    }
    return () => {
      removeAudioListener(listener);
    };
  }, [connectActions, isMicrophoneReady, lineX, lineY, lineZ]);
  
  return (
    <HStack
      ref={liveGraphContainerRef}
      width="100%"
      height="100%"
      overflow="hidden"
    >
      <canvas
        ref={canvasRef}
        height={height}
        id="smoothie-chart"
        width={width - 30}
      />
    </HStack>
  );
};

export default LiveGraph;
