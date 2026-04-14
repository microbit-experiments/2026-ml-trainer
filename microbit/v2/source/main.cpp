/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */
#include "MicroBit.h"
#include "Timer.h"
#include <cstdio>
#include <cstdint>

namespace {

constexpr int STREAM_SAMPLE_RATE = 8000;
constexpr int SAMPLES_PER_FRAME = 160; // 20 ms chunks at 8 kHz
constexpr int SAMPLE_PERIOD_US = 1000000 / STREAM_SAMPLE_RATE;

int16_t toPcm16(uint16_t rawAdc)
{
    // Convert expected 12-bit-ish ADC range around midpoint to signed PCM.
    int32_t centered = static_cast<int32_t>(rawAdc) - 2048;
    centered <<= 4;

    if (centered > 32767)
        centered = 32767;
    if (centered < -32768)
        centered = -32768;

    return static_cast<int16_t>(centered);
}

}

MicroBit uBit;

int main()
{
    uBit.init();

    // Raise serial throughput for continuous audio transfer over USB.
    uBit.serial.setBaud(1000000);
    uBit.serial.setTxBufferSize(255);

    // Force microphone path on and retune to 8 kHz to match web audio pipeline assumptions.
    uBit.audio.activateMic();
    uBit.audio.mic->enable();
    uBit.audio.mic->setSampleRate(STREAM_SAMPLE_RATE);
    uBit.audio.mic->setGain(7, 0);

    uint16_t sequence = 0;
    char frame[4096];

    while (true)
    {
        int pos = std::snprintf(
            frame,
            sizeof(frame),
            "MBAUDIO,1,%d,%u,%d",
            STREAM_SAMPLE_RATE,
            sequence++,
            SAMPLES_PER_FRAME
        );

        if (pos < 0 || pos >= static_cast<int>(sizeof(frame)))
            continue;

        for (int i = 0; i < SAMPLES_PER_FRAME; ++i)
        {
            uint16_t raw = uBit.audio.mic->getSample();
            int16_t pcm = toPcm16(raw);
            int written = std::snprintf(
                frame + pos,
                sizeof(frame) - pos,
                ",%d",
                static_cast<int>(pcm)
            );
            if (written < 0 || pos + written >= static_cast<int>(sizeof(frame)))
            {
                pos = 0;
                break;
            }
            pos += written;
            system_timer_wait_us(SAMPLE_PERIOD_US);
        }

        if (pos == 0)
            continue;

        frame[pos++] = '\n';
        frame[pos] = '\0';

        // Block until the line is queued so we keep ordering and avoid silent drops.
        uBit.serial.send(reinterpret_cast<uint8_t *>(frame), pos, SYNC_SLEEP);
    }
}
