/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { ComponentProps, useCallback, useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { ConnectionStatus } from "../connect-status-hooks";
import { useConnectionStage } from "../connection-stage-hooks";

interface AllowMicrophoneAccessDialogProps
  extends Omit<ComponentProps<typeof Modal>, "children"> {
  explanationTextId: string;
}

const AllowMicrophoneAccessDialog = ({
  explanationTextId,
  onClose,
  isOpen,
  ...rest
}: AllowMicrophoneAccessDialogProps) => {
  const { status: connStatus, isDialogOpen: isConnectionDialogOpen } =
    useConnectionStage();
  const [isWaiting, setIsWaiting] = useState<boolean>(false);

  const handleOnClose = useCallback(() => {
    setIsWaiting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (
      isOpen &&
      (isConnectionDialogOpen ||
        (isWaiting && connStatus === ConnectionStatus.Connected))
    ) {
      // Close dialog if connection dialog is opened, or
      // once connected after waiting.
      handleOnClose();
      return;
    }
  }, [
    connStatus,
    handleOnClose,
    isConnectionDialogOpen,
    isOpen,
    isWaiting,
    onClose,
  ]);

  return (
    <Modal
      closeOnOverlayClick={false}
      motionPreset="none"
      size="md"
      isCentered
      onClose={handleOnClose}
      isOpen={isOpen}
      {...rest}
    >
      <ModalOverlay>
        <ModalContent>
          <ModalHeader>
            <FormattedMessage id="microphone-access-blocked" />
          </ModalHeader>
          <ModalBody>
            <ModalCloseButton />
            <Text>
              <FormattedMessage id={explanationTextId} />
            </Text>
          </ModalBody>
          <ModalFooter justifyContent="flex-end"></ModalFooter>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
};

export default AllowMicrophoneAccessDialog;
