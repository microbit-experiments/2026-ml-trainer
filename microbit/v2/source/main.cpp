/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */
#include "MicroBit.h"
#include "MicroBitUARTService.h"
#include "MicroBitMicrophoneService.h"
#include "MicroBitIOPinService.h"
#include "MicroBitLEDService.h"
#include "MicroBitButtonService.h"
#include "utilities.h"
#include "smileys.h"
#include "LevelDetectorSPL.h"

#define MICROPHONE_UART_DEBUG 0
#define MICROPHONE_X_SCALE 8

MicroBit uBit;

typedef __uint8_t uint8_t ;

// Services
MicroBitMicrophoneService *microphone;
MicroBitUARTService *uart;
MicroBitLEDService *led;
MicroBitIOPinService *io;
MicroBitButtonService *btn;

// State
int connected = 0;

// Manually increase this build number each build. Used by the application to determine what capabilities the firmware has.
int buildNumber = 1;

/**
 * @brief Sends a message with UART
 * 
 * @param s The message
 */
void sendString(ManagedString s)
{
    if (connected == 0)
        return;

    uart->send(s);
}

/**
 * @brief The event that is fired upon bluetooth connection.
 */
void onConnected(MicroBitEvent)
{
    connected = 1; // Set the connected flag

    uBit.sleep(3000);
    uart->send(ManagedString("id_prop")); // MUST be sent before vi_ message
    uart->send(ManagedString("vi_") + ManagedString(buildNumber));

    printSmiley(GLAD_SMILEY);
}

/**
 * @brief The event that is fired upon bluetooth disconnection.
 */
void onDisconnected(MicroBitEvent)
{
    connected = 0; // Set the connected flag
    
    printSmiley(SAD_SMILEY);

    uBit.sleep(2000);
    printPairPattern();
}

/**
 * @brief Handler for incoming UART messages.
 */
void onDelim(MicroBitEvent)
{
    int beat = 200;
    ManagedString r = uart->readUntil("#");
    ManagedString prefix = r.substring(0,2);
    if (prefix == "s_") { // Will be request to play sound
        ManagedString soundNo = r.substring(2,1);
        playSound(getSound(soundNo), beat);
    }
}

void microphoneDebugLoop()
{
#if MICROPHONE_UART_DEBUG
    if (uBit.audio.levelSPL != NULL)
        uBit.audio.levelSPL->listenerAdded();

    while (1)
    {
        if (uBit.audio.levelSPL != NULL)
        {
            float db = uBit.audio.levelSPL->getValue(LEVEL_DETECTOR_SPL_DB);
            const float dbMin = 35.0f;
            const float dbMax = 100.0f;
            float loudness8 = ((db - dbMin) * 255.0f) / (dbMax - dbMin);

            if (loudness8 < 0.0f)
                loudness8 = 0.0f;

            if (loudness8 > 255.0f)
                loudness8 = 255.0f;

            int scaledX = (int)loudness8 * MICROPHONE_X_SCALE;

            if (scaledX > 32767)
                scaledX = 32767;

            uBit.serial.send(
                ManagedString("dbg_mic db=") + ManagedString((int)db) +
                ManagedString(" x=") + ManagedString(scaledX) +
                ManagedString("\r\n")
            );
        }

        uBit.sleep(1000);
    }
#endif
}

int main()
{
    // Initialise the micro:bit runtime.
    uBit.init();
    
    // Add listeners for events
    uBit.messageBus.listen(MICROBIT_ID_BLE, MICROBIT_BLE_EVT_CONNECTED, onConnected);
    uBit.messageBus.listen(MICROBIT_ID_BLE, MICROBIT_BLE_EVT_DISCONNECTED, onDisconnected);
    uBit.messageBus.listen(MICROBIT_ID_BLE_UART, MICROBIT_UART_S_EVT_DELIM_MATCH, onDelim);

    uBit.bleManager.setTransmitPower(7);

    // Initialise the micro:bit services.
    uart = new MicroBitUARTService(*uBit.ble, 32, 32);
    led = new MicroBitLEDService(*uBit.ble, uBit.display);
    io = new MicroBitIOPinService(*uBit.ble, uBit.io);
    btn = new MicroBitButtonService(*uBit.ble);
    microphone = new MicroBitMicrophoneService(*uBit.ble, uBit.audio);

#if MICROPHONE_UART_DEBUG
    create_fiber(microphoneDebugLoop);
#endif

    uart->eventOn("#");

    printSmiley(GLAD_SMILEY);

    uBit.sleep(400);
    if (!connected) {
        printPairPatternAnimated();
    }
    if (connected) {
        printSmiley(GLAD_SMILEY);
    }
    release_fiber();
}
