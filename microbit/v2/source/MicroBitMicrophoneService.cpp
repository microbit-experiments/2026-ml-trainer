/*
The MIT License (MIT)

Copyright (c) 2026.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

#include "MicroBitConfig.h"

#if CONFIG_ENABLED(DEVICE_BLE)

#include "MicroBitMicrophoneService.h"
#include "CodalFiber.h"
#include "LevelDetectorSPL.h"
#include <string.h>

using namespace codal;

#define MICROPHONE_X_SCALE 8

// Intentionally reuse accelerometer UUIDs so existing clients can connect unchanged.
const uint16_t MicroBitMicrophoneService::serviceUUID = 0x0753;
const uint16_t MicroBitMicrophoneService::charUUID[mbbs_cIdxCOUNT] = {0xca4b, 0xfb24};

MicroBitMicrophoneService::MicroBitMicrophoneService(BLEDevice &_ble, MicroBitAudio &_audio) :
    audio(_audio),
    streaming(false),
    splListenerActive(false),
    updatePeriodMs(20)
{
    dataCharacteristicBuffer[0] = 0;
    dataCharacteristicBuffer[1] = 0;
    dataCharacteristicBuffer[2] = 0;
    periodCharacteristicBuffer = 0;

    RegisterBaseUUID(bs_base_uuid);
    CreateService(serviceUUID);

    CreateCharacteristic(mbbs_cIdxDATA, charUUID[mbbs_cIdxDATA],
                         (uint8_t *)dataCharacteristicBuffer,
                         sizeof(dataCharacteristicBuffer),
                         sizeof(dataCharacteristicBuffer),
                         microbit_propREAD | microbit_propNOTIFY);

    CreateCharacteristic(mbbs_cIdxPERIOD, charUUID[mbbs_cIdxPERIOD],
                         (uint8_t *)&periodCharacteristicBuffer,
                         sizeof(periodCharacteristicBuffer),
                         sizeof(periodCharacteristicBuffer),
                         microbit_propREAD | microbit_propWRITE);

    syncPeriodCharacteristic();

    if (getConnected())
        listen(true);
}

void MicroBitMicrophoneService::readXYZFromMicrophone()
{
    int loudness = 0;

    if (audio.levelSPL)
    {
        // Request dB to avoid the SPL 8-bit path blocking while ambient level maps to zero.
        float db = audio.levelSPL->getValue(LEVEL_DETECTOR_SPL_DB);

        // Explicit map: 35..100 dB -> 0..255.
        const float dbMin = 35.0f;
        const float dbMax = 100.0f;
        float loudness8 = ((db - dbMin) * 255.0f) / (dbMax - dbMin);

        if (loudness8 < 0.0f)
            loudness8 = 0.0f;

        if (loudness8 > 255.0f)
            loudness8 = 255.0f;

        loudness = (int)loudness8;
    }

    int scaledX = loudness * MICROPHONE_X_SCALE;

    if (scaledX > 32767)
        scaledX = 32767;

    // Plug-and-play mapping: X=loudness, Y=0, Z=0.
    dataCharacteristicBuffer[0] = (uint16_t)scaledX;
    dataCharacteristicBuffer[1] = 0;
    dataCharacteristicBuffer[2] = 0;
}

void MicroBitMicrophoneService::syncPeriodCharacteristic()
{
    periodCharacteristicBuffer = updatePeriodMs;
    setChrValue(mbbs_cIdxPERIOD, (const uint8_t *)&periodCharacteristicBuffer, sizeof(periodCharacteristicBuffer));
}

void MicroBitMicrophoneService::listen(bool yes)
{
    if (yes)
    {
        if (streaming)
            return;

        // Guard: only add listener once
        if (audio.levelSPL && !splListenerActive)
        {
            audio.levelSPL->listenerAdded();
            splListenerActive = true;
        }

        readXYZFromMicrophone();
        syncPeriodCharacteristic();

        streaming = true;
        create_fiber(MicroBitMicrophoneService::dataNotifyFiber, this);
    }
    else
    {
        if (!streaming)
            return;

        streaming = false;

        // Guard: only remove listener if we own it
        if (audio.levelSPL && splListenerActive)
        {
            audio.levelSPL->listenerRemoved();
            splListenerActive = false;
        }
    }
}

void MicroBitMicrophoneService::dataNotifyFiber(void *arg)
{
    MicroBitMicrophoneService *self = (MicroBitMicrophoneService *)arg;

    while (self->streaming)
    {
        if (self->getConnected())
        {
            self->readXYZFromMicrophone();
            self->notifyChrValue(mbbs_cIdxDATA, (uint8_t *)self->dataCharacteristicBuffer, sizeof(self->dataCharacteristicBuffer));
        }

        fiber_sleep(self->updatePeriodMs);
    }

    release_fiber();
}

void MicroBitMicrophoneService::onConnect(const microbit_ble_evt_t *p_ble_evt)
{
    (void)p_ble_evt;
    listen(true);
}

void MicroBitMicrophoneService::onDisconnect(const microbit_ble_evt_t *p_ble_evt)
{
    (void)p_ble_evt;
    listen(false);
}

void MicroBitMicrophoneService::onDataWritten(const microbit_ble_evt_write_t *params)
{
    if (params->handle == valueHandle(mbbs_cIdxPERIOD) && params->len >= sizeof(periodCharacteristicBuffer))
    {
        memcpy(&periodCharacteristicBuffer, params->data, sizeof(periodCharacteristicBuffer));

        // Keep BLE traffic bounded and avoid pathological values.
        if (periodCharacteristicBuffer < 5)
            periodCharacteristicBuffer = 5;

        if (periodCharacteristicBuffer > 1000)
            periodCharacteristicBuffer = 1000;

        updatePeriodMs = periodCharacteristicBuffer;
        syncPeriodCharacteristic();
    }
}

#endif
