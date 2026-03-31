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

#ifndef MICROBIT_MICROPHONE_SERVICE_H
#define MICROBIT_MICROPHONE_SERVICE_H

#include "MicroBitConfig.h"

#if CONFIG_ENABLED(DEVICE_BLE)

#include "MicroBitBLEManager.h"
#include "MicroBitBLEService.h"
#include "MicroBitAudio.h"

namespace codal
{

/**
  * Class definition for a MicroBit BLE Microphone Service.
  *
  * This intentionally mirrors the accelerometer characteristic shape so existing
  * host applications can treat sound level as an X-axis value (Y and Z are 0).
  */
class MicroBitMicrophoneService : public MicroBitBLEService
{
    public:

    /**
      * Constructor.
      * @param _ble The instance of a BLE device that we're running on.
      * @param _audio An instance of MicroBitAudio.
      */
    MicroBitMicrophoneService(BLEDevice &_ble, MicroBitAudio &_audio);

    private:

    /**
      * Invoked when BLE connects.
      */
    void onConnect(const microbit_ble_evt_t *p_ble_evt);

    /**
      * Invoked when BLE disconnects.
      */
    void onDisconnect(const microbit_ble_evt_t *p_ble_evt);

    /**
      * Callback. Invoked when any of our attributes are written via BLE.
      */
    void onDataWritten(const microbit_ble_evt_write_t *params);

    /**
      * Read loudness and map to X axis while forcing Y/Z to zero.
      */
    void readXYZFromMicrophone();

    /**
      * Start or stop data notifications.
      */
    void listen(bool yes);

    /**
      * Data pump loop running in a fiber.
      */
    static void dataNotifyFiber(void *arg);

    /**
      * Copy the configured period into the characteristic value.
      */
    void syncPeriodCharacteristic();

    MicroBitAudio &audio;

    volatile bool streaming;
    uint16_t updatePeriodMs;

    // Keep the same DATA shape as accelerometer: X,Y,Z (16-bit each).
    uint16_t dataCharacteristicBuffer[3];
    uint16_t periodCharacteristicBuffer;

    typedef enum mbbs_cIdx
    {
        mbbs_cIdxDATA,
        mbbs_cIdxPERIOD,
        mbbs_cIdxCOUNT
    } mbbs_cIdx;

    // Reuse accelerometer UUIDs for plug-and-play compatibility with existing hosts.
    static const uint16_t serviceUUID;
    static const uint16_t charUUID[mbbs_cIdxCOUNT];

    MicroBitBLEChar chars[mbbs_cIdxCOUNT];

    public:

    int characteristicCount() { return mbbs_cIdxCOUNT; }
    MicroBitBLEChar *characteristicPtr(int idx) { return &chars[idx]; }
};

} // namespace codal

#endif // CONFIG_ENABLED(DEVICE_BLE)
#endif // MICROBIT_MICROPHONE_SERVICE_H
