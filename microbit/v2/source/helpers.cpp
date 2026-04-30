/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

#include "MicroBit.h" 
#include "codebook.h"
#include "utilities.h"
#include "MicroBitMicrophoneService.h"

extern MicroBit uBit;
extern codal::MicroBitMicrophoneService *microphone;
extern int connected;
typedef __uint8_t uint8_t ;

/**
 * @brief Blinks the display for 150 milliseconds.
 */
void blink() {
    MicroBitImage img = uBit.display.image.clone();
    uBit.display.clear();
    uBit.sleep(150);
    uBit.display.image.paste(img);
    uBit.sleep(100);
}

/**
 * @brief Prints a smiley found in smileys.h
 * 
 * @param smiley an array of integers that represents the brightness levels of each LED.
 */
void printSmiley(const char * smiley) {
    MicroBitImage outputImage(smiley);
    uBit.display.print(outputImage);
}

/**
 * @brief Prints the pairing pattern on the LED display instantly.
 */
void printPairPattern() {
    ManagedString name = ManagedString(microbit_friendly_name());
    MicroBitImage image(5,5);
    for (int i = 0; i < MICROBIT_NAME_LENGTH; i++) {
        for (int j = 0; j < MICROBIT_NAME_CODE_LETTERS; j++) {
            if (name.charAt(i) == CODEBOOK[i][j]) {
                for (int k = 0; k < j+1; k++) {
                    // Adding the sleep command sort of animates the display
                    image.setPixelValue(i, 4-k, 100);
                }
            }
        }
    }
    uBit.display.image.paste(image);
}

/**
 * @brief Prints the pairing pattern on the LED display in an animated fashion.
 */
void printPairPatternAnimated() {
    const uint8_t levels[] = {10, 40, 100}; // brightness levels over each iteration
    const uint8_t intervals[] = {80, 30, 30}; // sleep intervals between each LED change
    ManagedString name = ManagedString(microbit_friendly_name());
    MicroBitImage image(5,5);

    for (int i = 0; i < sizeof(levels); i++) {
        uint8_t brightnessLevel = levels[i];
        uint8_t sleep = intervals[i];
        for (int i = 0; i < MICROBIT_NAME_LENGTH; i++) {
            for (int j = 0; j < MICROBIT_NAME_CODE_LETTERS; j++) {
                if (name.charAt(i) == CODEBOOK[i][j]) {
                    for (int k = 0; k < j+1; k++) {
                        // Adding the sleep command sort of animates the display
                        image.setPixelValue(i, 4-k, brightnessLevel);
                        uBit.sleep(sleep);
                        uBit.display.image.paste(image);
                    }
                }
            }
        }
    }
    uBit.sleep(200);
    blink(); blink();
}

/**
 * @brief Displays debug information on LEDs based on microphone status.
 * Top row: Scaled microphone X value (-2048 to 2047 mapped to 0-4 LEDs)
 * Middle row: Flashes when readXYZ() is called (within 100ms window)
 * Bottom row: Connection status (lit if connected, off if not)
 */
void printDebugDisplay() {
    MicroBitImage image(5, 5);
    
    if (!microphone) {
        // If microphone service not initialized, display error
        image.setPixelValue(2, 2, 255);  // Center pixel
        uBit.display.print(image);
        return;
    }
    
    // TOP ROW: Scale microphone X value to 5 LEDs
    // microphoneDataCharacteristicBuffer[0] is int16 from -2048 to 2047
    // Map to 0-4 range (5 LEDs)
    int16_t micValue = microphone->getMicrophoneX();
    int ledIndex = 0;
    
    // Scale from [-2048, 2047] to [0, 4]
    // First, shift to positive: add 2048 to get [0, 4095]
    // Then divide by 819 to get [0, 5)
    int scaledValue = (micValue + 2048) / 819;
    if (scaledValue < 0) scaledValue = 0;
    if (scaledValue > 4) scaledValue = 4;
    
    // Light up LEDs from left based on the scaled value
    for (int x = 0; x <= scaledValue; x++) {
        image.setPixelValue(x, 0, 255);  // Top row, brightness 255
    }
    
    // MIDDLE ROW: Flash when readXYZ is called
    // Check if readXYZ was called within the last 100ms
    uint32_t timeSinceLastRead = system_timer_current_time() - microphone->getLastReadTimestamp();
    if (timeSinceLastRead < 100) {
        // Flash all LEDs in middle row
        for (int x = 0; x < 5; x++) {
            image.setPixelValue(x, 2, 255);  // Middle row
        }
    }
    
    // BOTTOM ROW: Connection status
    if (connected) {
        // All LEDs lit if connected
        for (int x = 0; x < 5; x++) {
            image.setPixelValue(x, 4, 255);  // Bottom row
        }
    }
    // If not connected, bottom row stays dark
    
    uBit.display.print(image);
}