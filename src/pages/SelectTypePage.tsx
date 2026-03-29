import {
  Container,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useNavigate } from "react-router";
import DefaultPageLayout, {
  HomeMenuItem,
  HomeToolbarItem,
} from "../components/DefaultPageLayout";
import LoadProjectInput, {
  LoadProjectInputRef,
} from "../components/LoadProjectInput";
import NewPageChoice from "../components/NewPageChoice";
import { useLogging } from "../logging/logging-hooks";
import { useStore } from "../store";
import { createDataSamplesPageUrl, createDataSamplesAudioPageUrl } from "../urls";
import { MdWavingHand } from "react-icons/md";
import { IoMdMicrophone } from "react-icons/io";

const SelectTypePage = () => {
  const newSession = useStore((s) => s.newSession);
  const navigate = useNavigate();
  const logging = useLogging();

  const loadProjectRef = useRef<LoadProjectInputRef>(null);

  const handleStartMotionSession = useCallback(() => {
    logging.event({
      type: "session-open-new-motion",
    });
    newSession();
    navigate(createDataSamplesPageUrl());
  }, [logging, newSession, navigate]);

  const handleStartAudioSession = useCallback(() => {
    logging.event({
      type: "session-open-new-audio",
    });
    newSession();
    navigate(createDataSamplesAudioPageUrl());
  }, [logging, newSession, navigate]);

  const intl = useIntl();
  const MotionTitle = intl.formatMessage({
    id: "select-type-motion-title",
  });
  const AudioTitle = intl.formatMessage({
    id: "select-type-audio-title",
  });

  return (
    <DefaultPageLayout
      toolbarItemsRight={<HomeToolbarItem />}
      menuItems={<HomeMenuItem />}
    >
      <LoadProjectInput ref={loadProjectRef} accept=".json,.hex" />
      <VStack as="main" alignItems="center">
        <Container maxW="1180px" alignItems="stretch" p={4} mt={8}>
          <VStack alignItems="stretch" w="100%">
            <Heading as="h1" fontSize="4xl" fontWeight="bold">
              <FormattedMessage id="newpage-title" />
            </Heading>
            <Heading as="h2" fontSize="2xl" mt={20} mb={4}>
              <FormattedMessage id="select-type-title" />
            </Heading>
            <HStack
              w="100%"
              gap={8}
              alignItems="stretch"
              mt={3}
              flexDir={{ base: "column", lg: "row" }}
            >
              <NewPageChoice
                onClick={handleStartMotionSession}
                label={MotionTitle}
                disabled={false}
                icon={<Icon as={MdWavingHand} h={20} w={20} />}
              >
                <Text>
                  <FormattedMessage id="select-type-motion-subtitle" />
                </Text>
              </NewPageChoice>
              <NewPageChoice
                onClick={handleStartAudioSession}
                label={AudioTitle}
                disabled={false}
                icon={<Icon as={IoMdMicrophone} h={20} w={20} />}
              >
                <Text>
                  <FormattedMessage id="select-type-audio-subtitle" />
                </Text>
              </NewPageChoice>
            </HStack>
          </VStack>
        </Container>
      </VStack>
    </DefaultPageLayout>
  );
};

export default SelectTypePage;
