/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  ConnectActions,
  ConnectAndFlashFailResult,
  ConnectResult,
} from "./connect-actions";
import { ConnectionStatus } from "./connect-status-hooks";
import {
  ConnectionFlowStep,
  ConnectionFlowType,
  ConnectionStage,
  ConnectionType,
} from "./connection-stage-hooks";
import { ConnectOptions } from "./store";

type FlowStage = Pick<ConnectionStage, "flowStep" | "flowType">;

export class ConnectionStageActions {
  constructor(
    private actions: ConnectActions,
    private stage: ConnectionStage,
    private setStage: (stage: ConnectionStage) => void,
    private setStatus: (status: ConnectionStatus) => void,
    private dataCollectionMicrobitStartConnect: (
      options?: ConnectOptions
    ) => void,
    private dataCollectionMicrobitConnected: () => void
  ) {}

  startConnect = (options?: ConnectOptions) => {
    this.dataCollectionMicrobitStartConnect(options);
    this.setStatus(ConnectionStatus.NotConnected);
    const { isWebBluetoothSupported, isWebUsbSupported } = this.stage;
    this.setStage({
      ...this.stage,
      hasFailedToReconnectTwice: false,
      flowType:
        !isWebBluetoothSupported ||
        this.stage.flowType !== ConnectionFlowType.ConnectBluetooth
          ? ConnectionFlowType.ConnectRadioRemote
          : ConnectionFlowType.ConnectBluetooth,
      flowStep:
        !isWebBluetoothSupported && !isWebUsbSupported
          ? ConnectionFlowStep.WebUsbBluetoothUnsupported
          : ConnectionFlowStep.Start,
    });
  };

  disconnectInputMicrobit = async () => {
    await this.actions.disconnect();
    this.actions.removeStatusListener();
    this.setStatus(ConnectionStatus.NotConnected);
  };

  setFlowStep = (step: ConnectionFlowStep) => {
    this.setStage({ ...this.stage, flowStep: step });
  };

  connectAndflashMicrobit = async (
    _progressCallback: (progress: number) => void,
    onSuccess: (stage: ConnectionStage) => void
  ) => {
    this.setFlowStep(ConnectionFlowStep.WebUsbChooseMicrobit);

    const { result: usbResult, deviceId } =
      await this.actions.requestUSBConnection();
    if (usbResult !== ConnectResult.Success) {
      return this.handleConnectAndFlashFail(usbResult);
    }
    const newStage: ConnectionStage = {
      ...this.stage,
      connType: "radio",
      flowStep: ConnectionFlowStep.None,
      radioRemoteDeviceId: deviceId,
    };
    onSuccess(newStage);
    this.setStage(newStage);
    this.setStatus(ConnectionStatus.Connected);
    this.onConnected();
  };

  private handleConnectAndFlashFail = (result: ConnectAndFlashFailResult) => {
    switch (result) {
      case ConnectResult.ErrorNoDeviceSelected:
        return this.setFlowStep(
          ConnectionFlowStep.TryAgainWebUsbSelectMicrobit
        );
      case ConnectResult.ErrorUnableToClaimInterface:
        return this.setFlowStep(ConnectionFlowStep.TryAgainCloseTabs);
      default:
        return this.setFlowStep(ConnectionFlowStep.TryAgainReplugMicrobit);
    }
  };

  onChangeMicrobitName = (name: string) => {
    this.setStage({
      ...this.stage,
      connType: "bluetooth",
      // It is not possible to compute device id from micro:bit name
      // so to remove confusion, device id is removed from state
      bluetoothDeviceId: undefined,
      bluetoothMicrobitName: name,
    });
  };

  connectBluetooth = async (clearDevice: boolean = true) => {
    this.setStage(this.getConnectingStage("bluetooth"));
    await this.actions.connectBluetooth(
      this.stage.bluetoothMicrobitName,
      clearDevice
    );
  };

  connectMicrobits = async (partialStage?: Partial<ConnectionStage>) => {
    const newStage = {
      ...this.getConnectingStage("radio"),
      ...(partialStage || {}),
    };
    this.setStage(newStage);
    if (!newStage.radioRemoteDeviceId) {
      throw new Error("Radio bridge device id not set");
    }
    await this.actions.connectMicrobitsSerial(
      newStage.radioRemoteDeviceId,
      newStage.radioRemoteBoardVersion
    );
  };

  private getConnectingStage = (connType: ConnectionType) => {
    return {
      ...this.stage,
      connType,
      flowStep:
        connType === "bluetooth"
          ? ConnectionFlowStep.ConnectingBluetooth
          : ConnectionFlowStep.ConnectingMicrobits,
    };
  };

  private onConnected = () => {
    this.setFlowStep(ConnectionFlowStep.None);
    this.dataCollectionMicrobitConnected();
  };

  disconnect = async () => {
    this.setStatus(ConnectionStatus.Disconnected);
    await this.actions.disconnect();
  };

  handleConnectionStatus = (
    status: ConnectionStatus,
    flowType: ConnectionFlowType
  ) => {
    switch (status) {
      case ConnectionStatus.Connected: {
        return this.onConnected();
      }
      case ConnectionStatus.FailedToSelectBluetoothDevice: {
        return this.setFlowStep(
          ConnectionFlowStep.TryAgainBluetoothSelectMicrobit
        );
      }
      case ConnectionStatus.FailedToConnect: {
        return this.setStage({
          ...this.stage,
          flowType,
          flowStep: ConnectionFlowStep.ConnectFailed,
        });
      }
      case ConnectionStatus.FailedToReconnectTwice: {
        return this.setStage({
          ...this.stage,
          flowType,
          hasFailedToReconnectTwice: true,
          flowStep: ConnectionFlowStep.ReconnectFailedTwice,
        });
      }
      case ConnectionStatus.FailedToReconnect: {
        return this.setFlowStage({
          flowStep: ConnectionFlowStep.ReconnectFailed,
          flowType,
        });
      }
      case ConnectionStatus.ConnectionLost: {
        return this.setFlowStage({
          flowStep: ConnectionFlowStep.ConnectionLost,
          flowType,
        });
      }
      case ConnectionStatus.ReconnectingAutomatically: {
        // Don't show dialogs when reconnecting automatically
        return this.setFlowStep(ConnectionFlowStep.None);
      }
    }
    return;
  };

  reconnect = async () => {
    this.setStatus(ConnectionStatus.ReconnectingExplicitly);
    if (this.stage.connType === "bluetooth") {
      await this.connectBluetooth(false);
    } else {
      await this.connectMicrobits();
    }
  };

  switchFlowType = () => {
    this.setStage({
      ...this.stage,
      flowType: ConnectionFlowType.ConnectRadioRemote,
    });
  };

  onStartBluetoothFlow = () => {
    this.setStage({
      ...this.stage,
      flowStep: ConnectionFlowStep.Start,
      flowType: ConnectionFlowType.ConnectRadioRemote,
    });
  };

  private getStagesOrder = () => {
    const isRestartAgain = this.stage.hasFailedToReconnectTwice;
    return radioFlow({ isRestartAgain });
  };

  private setFlowStage = (flowStage: FlowStage) => {
    this.setStage({ ...this.stage, ...flowStage });
  };

  onNextClick = () => {
    this.setFlowStage(getNextStage(this.stage, 1, this.getStagesOrder()));
  };

  onBackClick = () => {
    this.setFlowStage(getNextStage(this.stage, -1, this.getStagesOrder()));
  };

  onTryAgain = () => {
    this.setFlowStep(
      this.stage.flowStep === ConnectionFlowStep.TryAgainBluetoothSelectMicrobit
        ? ConnectionFlowStep.EnterBluetoothPattern
        : ConnectionFlowStep.ConnectCable
    );
  };
}

const radioFlow = ({ isRestartAgain }: { isRestartAgain: boolean }) => [
  {
    flowStep: isRestartAgain
      ? ConnectionFlowStep.ReconnectFailedTwice
      : ConnectionFlowStep.Start,
    flowType: ConnectionFlowType.ConnectRadioRemote,
  },
  {
    flowStep: ConnectionFlowStep.ConnectCable,
    flowType: ConnectionFlowType.ConnectRadioRemote,
  },
  {
    flowStep: ConnectionFlowStep.WebUsbFlashingTutorial,
    flowType: ConnectionFlowType.ConnectRadioRemote,
  },
];

const getFlowStageIdx = (
  { flowStep, flowType }: FlowStage,
  order: FlowStage[]
) => {
  for (let idx = 0; idx < order.length; idx++) {
    const currStage = order[idx];
    if (currStage.flowStep === flowStep && currStage.flowType === flowType) {
      return idx;
    }
  }
  throw new Error("Should be able to match stage and type again order");
};

const getNextStage = (
  stage: ConnectionStage,
  increment: number,
  stagesOrder: FlowStage[]
): FlowStage => {
  const currIdx = getFlowStageIdx(stage, stagesOrder);
  const newIdx = currIdx + increment;
  if (newIdx === stagesOrder.length || newIdx < 0) {
    throw new Error("Impossible step stage");
  }
  return stagesOrder[newIdx];
};
