/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  createWebUSBConnection,
  ConnectionStatus as UsbConnectionStatus,
} from "@microbit/microbit-connection";
import { useMemo } from "react";
import {
  ConnectActions,
  ConnectResult,
  ConnectionAndFlashOptions,
} from "../connect-actions";
import { useConnectActions } from "../connect-actions-hooks";
import { ConnectionStatus } from "../connect-status-hooks";
import { ConnectionStageActions } from "../connection-stage-actions";
import { ConnectionStage, useConnectionStage } from "../connection-stage-hooks";
import {
  DownloadState,
  DownloadStep,
  HexData,
  MicrobitToFlash,
} from "../model";
import { Settings } from "../settings";
import { useSettings, useStore } from "../store";
import { downloadHex } from "../utils/fs-util";

export class DownloadProjectActions {
  private flashingProgressCallback: (value: number) => void;
  constructor(
    private state: DownloadState,
    private setState: (stage: DownloadState) => void,
    private settings: Settings,
    private setSettings: (settings: Partial<Settings>) => void,
    private connectActions: ConnectActions,
    private connectionStage: ConnectionStage,
    private connectionStageActions: ConnectionStageActions,
    private connectionStatus: ConnectionStatus,
    flashingProgressCallback: (value: number) => void
  ) {
    this.flashingProgressCallback = (value: number) => {
      if (state.step !== DownloadStep.FlashingInProgress) {
        setState({ ...state, step: DownloadStep.FlashingInProgress });
      }
      flashingProgressCallback(value);
    };
  }

  clearMakeCodeUsbDevice = () => {
    this.setState({ ...this.state, usbDevice: undefined });
  };

  start = async (download: HexData) => {
    downloadHex(download);
    this.setState({
      ...this.state,
      step: DownloadStep.None,
      hex: download,
      microbitToFlash: MicrobitToFlash.Default,
      usbDevice: undefined,
    });
  };

  onHelpNext = async (isSkipNextTime: boolean, state?: DownloadState) => {
    this.setSettings({ showPreDownloadHelp: !isSkipNextTime });

    if (this.connectionStage.connType === "radio") {
      // Disconnect input micro:bit to not trigger radio connection lost warning.
      await this.connectionStageActions.disconnectInputMicrobit();
      this.updateStage({
        ...(state ?? {}),
        step: DownloadStep.UnplugRadioBridgeMicrobit,
      });
    } else if (this.connectionStatus !== ConnectionStatus.NotConnected) {
      // If we've bluetooth connected to a micro:bit in the session,
      // we make the user choose a device even if the connection has been lost since.
      // This makes reconnect easier if the user has two micro:bits.
      this.updateStage({
        ...(state ?? {}),
        step: DownloadStep.ChooseSameOrDifferentMicrobit,
        microbitToFlash: MicrobitToFlash.Default,
      });
    } else {
      this.updateStage({
        ...(state ?? {}),
        step: DownloadStep.ConnectCable,
      });
    }
  };

  onSkipIntro = (skipIntro: boolean) =>
    this.setSettings({ showPreDownloadHelp: !skipIntro });

  onBackToIntro = () => this.setStep(DownloadStep.Help);

  onChosenSameMicrobit = async () => {
    if (this.connectActions.isUsbDeviceConnected()) {
      const newStage = { ...this.state, microbitToFlash: MicrobitToFlash.Same };
      const usbConnection = this.connectActions.getUsbConnection();
      if (usbConnection.getBoardVersion() === "V1") {
        this.updateStage({
          ...newStage,
          step: DownloadStep.IncompatibleDevice,
        });
        return;
      }
      this.updateStage(newStage);
      // Can flash directly without choosing device.
      return this.connectAndFlashMicrobit(newStage);
    }
    this.updateStage({
      step: DownloadStep.ConnectCable,
      microbitToFlash: MicrobitToFlash.Same,
    });
  };

  onChosenDifferentMicrobit = () => {
    this.updateStage({
      step: DownloadStep.ConnectCable,
      microbitToFlash: MicrobitToFlash.Different,
    });
  };

  connectAndFlashMicrobit = async (stage: DownloadState) => {
    if (!stage.hex) {
      throw new Error("Project hex/name is not set!");
    }
    downloadHex(stage.hex);
    this.updateStage({
      step: DownloadStep.None,
      flashProgress: 0,
      usbDevice: undefined,
    });
  };

  private flashMicrobit = async (
    stage: DownloadState,
    connectionAndFlashOptions?: ConnectionAndFlashOptions
  ) => {
    if (!stage.hex) {
      throw new Error("Project hex/name is not set!");
    }
    void connectionAndFlashOptions;
    downloadHex(stage.hex);
    this.updateStage({
      step: DownloadStep.None,
      flashProgress: 0,
      usbDevice: undefined,
    });
  };

  getOnNext = () => {
    const nextStep = this.getNextStep();
    return nextStep ? () => this.setStep(nextStep) : undefined;
  };

  getOnBack = () => {
    const prevStep = this.getPrevStep();
    return prevStep ? () => this.setStep(prevStep) : undefined;
  };

  private getNextStep = (): DownloadStep | undefined => {
    switch (this.state.step) {
      case DownloadStep.UnplugRadioBridgeMicrobit:
        return DownloadStep.ConnectRadioRemoteMicrobit;
      case DownloadStep.ConnectCable:
      case DownloadStep.ConnectRadioRemoteMicrobit:
        return DownloadStep.WebUsbFlashingTutorial;
      default:
        throw new Error(`Next step not accounted for: ${this.state.step}`);
    }
  };

  private getPrevStep = (): DownloadStep | undefined => {
    switch (this.state.step) {
      case DownloadStep.UnplugRadioBridgeMicrobit:
      case DownloadStep.ChooseSameOrDifferentMicrobit: {
        return this.settings.showPreDownloadHelp
          ? DownloadStep.Help
          : undefined;
      }
      case DownloadStep.ConnectRadioRemoteMicrobit:
        return DownloadStep.UnplugRadioBridgeMicrobit;
      case DownloadStep.ConnectCable: {
        if (this.state.microbitToFlash !== MicrobitToFlash.Default) {
          return DownloadStep.ChooseSameOrDifferentMicrobit;
        }
        if (this.settings.showPreDownloadHelp) {
          return DownloadStep.Help;
        }
        return undefined;
      }
      case DownloadStep.ManualFlashingTutorial:
      case DownloadStep.WebUsbFlashingTutorial: {
        return this.connectionStage.connType === "radio"
          ? DownloadStep.ConnectRadioRemoteMicrobit
          : DownloadStep.ConnectCable;
      }
      case DownloadStep.IncompatibleDevice:
        return DownloadStep.ChooseSameOrDifferentMicrobit;
      default:
        throw new Error(`Prev step not accounted for: ${this.state.step}`);
    }
  };

  close = () => this.setStep(DownloadStep.None);

  private updateStage = (partialStage: Partial<DownloadState>) => {
    this.setState({ ...this.state, ...partialStage } as DownloadState);
  };

  private setStep = (step: DownloadStep) =>
    this.setState({ ...this.state, step });
}

export const useDownloadActions = (): DownloadProjectActions => {
  const stage = useStore((s) => s.download);
  const setDownloadFlashingProgress = useStore(
    (s) => s.setDownloadFlashingProgress
  );
  const setStage = useStore((s) => s.setDownload);
  const [settings, setSettings] = useSettings();
  const connectActions = useConnectActions();
  const {
    actions: connectionStageActions,
    status: connectionStatus,
    stage: connectionStage,
  } = useConnectionStage();
  return useMemo(
    () =>
      new DownloadProjectActions(
        stage,
        setStage,
        settings,
        setSettings,
        connectActions,
        connectionStage,
        connectionStageActions,
        connectionStatus,
        setDownloadFlashingProgress
      ),
    [
      connectActions,
      connectionStage,
      connectionStageActions,
      connectionStatus,
      setDownloadFlashingProgress,
      setSettings,
      setStage,
      settings,
      stage,
    ]
  );
};
