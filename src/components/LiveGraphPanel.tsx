/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 * Modifications (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  Box,
  BoxProps,
  Button,
  HStack,
  Icon,
  Image,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { MdMicOff } from "react-icons/md";
import { ConnectionStatus } from "../connect-status-hooks";
import { useConnectionStage } from "../connection-stage-hooks";
import microbitImage from "../images/stylised-microbit-black.svg";
import { keyboardShortcuts, useShortcut } from "../keyboard-shortcut-hooks";
import { useLogging } from "../logging/logging-hooks";
import { tourElClassname } from "../tours";
import AlertIcon from "./AlertIcon";
import InfoToolTip from "./InfoToolTip";
import LiveGraph from "./LiveGraph";
import PredictedAction from "./PredictedAction";
import { useSettings, useStore } from "../store";

interface LiveGraphPanelProps {
  showPredictedAction?: boolean;
  disconnectedTextId: string;
  noPermissionTextId: string;
}

export const predictedActionDisplayWidth = 180;

const LiveGraphPanel = ({
  showPredictedAction,
  disconnectedTextId,
  noPermissionTextId,
}: LiveGraphPanelProps) => {
  const { actions, status, isConnected } = useConnectionStage();
  const parentPortalRef = useRef(null);
  const logging = useLogging();
  const [{ microphoneUsed }] = useSettings();
  const isReconnecting =
    status === ConnectionStatus.ReconnectingAutomatically ||
    status === ConnectionStatus.ReconnectingExplicitly;

  const isDisconnected =
    !isConnected && !isReconnecting && status !== ConnectionStatus.Connecting;

  const microphonePermission = useStore((s) => s.microphonePermission);
  const microphoneDisabled =
    (isDisconnected && microphoneUsed === "microbit") ||
    (microphonePermission !== "granted" && microphoneUsed === "device");

  const handleConnectOrReconnect = useCallback(() => {
    if (
      status === ConnectionStatus.NotConnected ||
      status === ConnectionStatus.Connecting ||
      status === ConnectionStatus.FailedToConnect ||
      status === ConnectionStatus.FailedToReconnectTwice ||
      status === ConnectionStatus.FailedToSelectBluetoothDevice
    ) {
      actions.startConnect();
    } else {
      logging.event({
        type: "reconnect-user",
      });
      void actions.reconnect();
    }
  }, [status, actions, logging]);
  useShortcut(keyboardShortcuts.connect, handleConnectOrReconnect, {
    enabled: isDisconnected,
  });
  const handleDisconnect = useCallback(() => {
    logging.event({
      type: "disconnect-user",
    });
    void actions.disconnect();
  }, [actions, logging]);
  useShortcut(keyboardShortcuts.disconnect, handleDisconnect, {
    enabled: isConnected,
  });
  const intl = useIntl();
  return (
    <HStack
      role="region"
      aria-label={intl.formatMessage({ id: "data-connection-region" })}
      position="relative"
      h={160}
      width="100%"
      bgColor="white"
      className={tourElClassname.liveGraph}
    >
      {isDisconnected && microphoneUsed === "microbit" && (
        <HStack
          position="absolute"
          w="100%"
          h="100%"
          gap={10}
          justifyContent="center"
          zIndex={1}
        >
          <MicrobitWarningIllustration
            display={{ base: "none", sm: "block" }}
          />
          <VStack gap={3} alignItems="self-start">
            <Text fontWeight="bold">
              <FormattedMessage id="microbit-not-connected" />
            </Text>
            <Text>
              <FormattedMessage id={disconnectedTextId} />
            </Text>
            <Button
              variant="primary"
              onClick={handleConnectOrReconnect}
              aria-label={intl.formatMessage({ id: "connect-action-aria" })}
            >
              <FormattedMessage id="connect-action" />
            </Button>
          </VStack>
        </HStack>
      )}
      {microphonePermission === "denied" && microphoneUsed === "device" && (
        <HStack
          position="absolute"
          w="100%"
          h="100%"
          gap={10}
          justifyContent="center"
          zIndex={1}
        >
          <MutedMicrophoneIllustration display={{ base: "none", sm: "grid" }} />
          <VStack gap={3} alignItems="self-start">
            <Text fontWeight="bold">
              <FormattedMessage id="microphone-access-blocked" />
            </Text>
            <Text>
              <FormattedMessage id={noPermissionTextId} />
            </Text>
          </VStack>
        </HStack>
      )}
      <HStack
        ref={parentPortalRef}
        pointerEvents={microphoneDisabled ? "none" : undefined}
        opacity={microphoneDisabled ? 0 : undefined}
      >
        <Portal containerRef={parentPortalRef}>
          <HStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            px={5}
            py={2.5}
            w={`calc(100% - ${
              showPredictedAction ? `${predictedActionDisplayWidth}px` : "0"
            })`}
          >
            <HStack gap={4}>
              <HStack gap={2}>
                <Text fontWeight="bold">
                  <FormattedMessage id="live-data-graph" />
                </Text>
                <InfoToolTip
                  titleId="live-graph"
                  descriptionId="live-graph-tooltip"
                  isDisabled={microphoneDisabled}
                />
              </HStack>
              {isConnected && microphoneUsed === "microbit" && (
                <Button
                  backgroundColor="white"
                  variant="secondary"
                  size="xs"
                  onClick={handleDisconnect}
                >
                  <FormattedMessage id="disconnect-action" />
                </Button>
              )}
              {isReconnecting && (
                <Text bg="white" fontWeight="bold">
                  <FormattedMessage id="reconnecting" />
                </Text>
              )}
            </HStack>
          </HStack>
        </Portal>
        <HStack position="absolute" width="100%" height="100%" spacing={0}>
          <LiveGraph />
          {showPredictedAction && <PredictedAction />}
        </HStack>
      </HStack>
    </HStack>
  );
};

const MicrobitWarningIllustration = (props: BoxProps) => (
  <HStack position="relative" aria-hidden {...props}>
    <Image src={microbitImage} objectFit="contain" boxSize="120px" bottom={0} />
    <Icon
      as={AlertIcon}
      position="absolute"
      top={-1}
      fill="#ffde21"
      right={-5}
      boxSize="55px"
    />
  </HStack>
);

const MutedMicrophoneIllustration = (props: BoxProps) => (
  <Box boxSize="120px" placeItems="center" {...props}>
    <Icon as={MdMicOff} boxSize="64px" color="#676767" />
  </Box>
);

export default LiveGraphPanel;
