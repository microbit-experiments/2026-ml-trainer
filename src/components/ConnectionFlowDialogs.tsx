/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useState } from "react";
import {
  ConnectionFlowStep,
  ConnectionFlowType,
  ConnectionStage,
  useConnectionStage,
} from "../connection-stage-hooks";
import { useLogging } from "../logging/logging-hooks";
import BrokenFirmwareDialog from "./BrokenFirmwareDialog";
import ConnectBatteryDialog from "./ConnectBatteryDialog";
import ConnectCableDialog, {
  getConnectionCableDialogConfig,
} from "./ConnectCableDialog";
import ConnectErrorDialog from "./ConnectErrorDialog";
import EnterBluetoothPatternDialog from "./EnterBluetoothPatternDialog";
import LoadingDialog from "./LoadingDialog";
import SelectMicrobitBluetoothDialog from "./SelectMicrobitBluetoothDialog";
import SelectMicrobitUsbDialog, {
  getHeadingId as getSelectMicrobitUsbHeadingId,
} from "./SelectMicrobitUsbDialog";
import TryAgainDialog from "./TryAgainDialog";
import UnsupportedMicrobitDialog from "./UnsupportedMicrobitDialog";
import WebUsbBluetoothUnsupportedDialog from "./WebUsbBluetoothUnsupportedDialog";
import WhatYouWillNeedDialog from "./WhatYouWillNeedDialog";
import ChooseDeviceOverlay from "./ChooseDeviceOverlay";

const ConnectionDialogs = () => {
  const { stage, actions } = useConnectionStage();
  const logging = useLogging();
  const [microbitName, setMicrobitName] = useState<string | undefined>(
    stage.bluetoothMicrobitName
  );
  const onClose = useCallback(() => {
    actions.setFlowStep(ConnectionFlowStep.None);
  }, [actions]);

  const isOpen = stage.flowStep !== ConnectionFlowStep.None;
  const skipBatteryStep =
    stage.flowStep === ConnectionFlowStep.ConnectBattery &&
    stage.flowType === ConnectionFlowType.ConnectRadioRemote;

  useEffect(() => {
    if (skipBatteryStep) {
      actions.setFlowStep(ConnectionFlowStep.None);
    }
  }, [actions, skipBatteryStep]);

  const dialogCommonProps = { isOpen, onClose };

  switch (stage.flowStep) {
    case ConnectionFlowStep.ReconnectFailedTwice:
    case ConnectionFlowStep.Start: {
      return (
        <WhatYouWillNeedDialog
          type={
            stage.flowType === ConnectionFlowType.ConnectBluetooth
              ? "bluetooth"
              : "radio"
          }
          {...dialogCommonProps}
          onNextClick={actions.onNextClick}
          reconnect={stage.flowStep === ConnectionFlowStep.ReconnectFailedTwice}
        />
      );
    }
    case ConnectionFlowStep.ConnectCable: {
      const config = getConnectionCableDialogConfig(
        stage.flowType,
        stage.isWebBluetoothSupported
      );
      return (
        <ConnectCableDialog
          {...dialogCommonProps}
          onBackClick={actions.onBackClick}
          onNextClick={actions.onNextClick}
          config={config}
          onSkip={() => actions.setFlowStep(ConnectionFlowStep.ConnectBattery)}
          onSwitch={actions.switchFlowType}
        />
      );
    }
    case ConnectionFlowStep.WebUsbFlashingTutorial: {
      const connectAndFlash = async () => {
        const onFlashSuccess = (newStage: ConnectionStage) => {
          // Inferring microbit name saves the user from entering the pattern
          // for bluetooth connection flow
          if (newStage.bluetoothMicrobitName) {
            setMicrobitName(newStage.bluetoothMicrobitName);
          }
        };

        if (stage.flowType === ConnectionFlowType.ConnectRadioBridge) {
          logging.event({
            type: "connect-user",
            message: "radio-bridge",
          });
        }
        await actions.connectAndflashMicrobit(() => {}, onFlashSuccess);
      };
      return (
        <SelectMicrobitUsbDialog
          headingId={getSelectMicrobitUsbHeadingId(stage.flowType)}
          {...dialogCommonProps}
          onBackClick={actions.onBackClick}
          onNextClick={connectAndFlash}
        />
      );
    }
    case ConnectionFlowStep.ConnectBattery: {
      if (stage.flowType === ConnectionFlowType.ConnectRadioRemote) {
        return null;
      }
      return (
        <ConnectBatteryDialog
          {...dialogCommonProps}
          onBackClick={actions.onBackClick}
          onNextClick={actions.onNextClick}
        />
      );
    }
    case ConnectionFlowStep.EnterBluetoothPattern: {
      return (
        <EnterBluetoothPatternDialog
          {...dialogCommonProps}
          onBackClick={actions.onBackClick}
          onNextClick={actions.onNextClick}
          microbitName={microbitName}
          onChangeMicrobitName={(name: string) => {
            actions.onChangeMicrobitName(name);
            setMicrobitName(name);
          }}
        />
      );
    }
    case ConnectionFlowStep.ConnectBluetoothTutorial: {
      const handleConnectBluetooth = () => {
        logging.event({
          type: "connect-user",
          message: "bluetooth",
        });
        void actions.connectBluetooth();
      };
      return (
        <SelectMicrobitBluetoothDialog
          {...dialogCommonProps}
          onBackClick={actions.onBackClick}
          onNextClick={handleConnectBluetooth}
        />
      );
    }
    case ConnectionFlowStep.WebUsbChooseMicrobit: {
      // Browser dialog is shown, no custom dialog shown at the same time
      return <ChooseDeviceOverlay />;
    }
    case ConnectionFlowStep.ConnectingBluetooth: {
      return (
        <LoadingDialog isOpen={isOpen} headingId="connect-bluetooth-heading" />
      );
    }
    case ConnectionFlowStep.ConnectingMicrobits: {
      return (
        <LoadingDialog isOpen={isOpen} headingId="connect-radio-heading" />
      );
    }
    case ConnectionFlowStep.TryAgainBluetoothSelectMicrobit:
    case ConnectionFlowStep.TryAgainReplugMicrobit:
    case ConnectionFlowStep.TryAgainWebUsbSelectMicrobit:
    case ConnectionFlowStep.TryAgainCloseTabs: {
      return (
        <TryAgainDialog
          {...dialogCommonProps}
          onTryAgain={actions.onTryAgain}
          type={stage.flowStep}
        />
      );
    }
    case ConnectionFlowStep.BadFirmware: {
      return (
        <BrokenFirmwareDialog
          {...dialogCommonProps}
          onTryAgain={actions.onTryAgain}
        />
      );
    }
    case ConnectionFlowStep.MicrobitUnsupported: {
      return (
        <UnsupportedMicrobitDialog
          {...dialogCommonProps}
          onStartBluetoothClick={actions.onStartBluetoothFlow}
          isBluetoothSupported={stage.isWebBluetoothSupported}
        />
      );
    }
    case ConnectionFlowStep.WebUsbBluetoothUnsupported: {
      return <WebUsbBluetoothUnsupportedDialog {...dialogCommonProps} />;
    }
    case ConnectionFlowStep.ConnectFailed:
    case ConnectionFlowStep.ReconnectFailed:
    case ConnectionFlowStep.ConnectionLost: {
      return (
        <ConnectErrorDialog
          {...dialogCommonProps}
          onConnect={actions.reconnect}
          flowType={stage.flowType}
          errorStep={stage.flowStep}
        />
      );
    }
  }
};

export default ConnectionDialogs;
