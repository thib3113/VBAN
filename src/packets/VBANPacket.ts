import { ESubProtocol } from './ESubProtocol';
import { IVbanHeaderCommon } from './IVbanHeaderCommon';
import { cleanPacketString, PACKET_IDENTIFICATION } from '../commons';
import { IVBANHeader } from './IVBANHeader';
import { VBAN_DATA_MAX_SIZE } from './VBANSpecs';
import { Buffer } from 'buffer';

//sample rates
export const sampleRates: Record<number, number | null> = {
    0: 6000,
    1: 12000,
    2: 24000,
    3: 48000,
    4: 96000,
    5: 192000,
    6: 384000,
    7: 8000,
    8: 16000,
    9: 32000,
    10: 64000,
    11: 128000,
    12: 256000,
    13: 512000,
    14: 11025,
    15: 22050,
    16: 44100,
    17: 88200,
    18: 176400,
    19: 352800,
    20: 705600,
    21: null,
    22: null,
    23: null,
    24: null,
    25: null,
    26: null,
    27: null,
    28: null,
    29: null,
    30: null,
    31: null
};

export class VBANPacket {
    public subProtocol?: ESubProtocol;

    public streamName: string;
    public sr: number;
    public frameCounter: number;

    public static frameCounters: Map<string, number> = new Map<string, number>();

    public static prepareFromUDPPacket(headersBuffer: Buffer): IVbanHeaderCommon {
        const headers: Partial<IVbanHeaderCommon> = {};

        // SR / Sub protocol (5 + 3 bits)
        const srsp = headersBuffer.readUInt8(PACKET_IDENTIFICATION.length);
        //take last 5 bits for sampleRate
        const srIndex = srsp & 0b00011111; // 5 last Bits

        if (!sampleRates.hasOwnProperty(srIndex) || !sampleRates[srIndex]) {
            throw new Error(`unknown sample rate ${srIndex}`);
        }
        headers.sr = sampleRates[srIndex] as number;
        headers.rawSampleRate = srIndex;

        // Samples per frame (8 bits)
        headers.part1 = headersBuffer.readUInt8(5);

        // Channels (8 bits)
        headers.part2 = headersBuffer.readUInt8(6);

        headers.part3 = headersBuffer.readUInt8(7);

        // Stream Name (16 bytes)
        headers.streamName = cleanPacketString(headersBuffer.toString('ascii', 8, 24));

        // Frame Counter (32 bits)
        headers.frameCounter = headersBuffer.readUInt32LE(24);

        return headers as IVbanHeaderCommon;
    }

    constructor(headers: IVBANHeader) {
        this.sr = headers.sr;
        this.streamName = headers.streamName;
        // Frame Counter (32 bits)
        this.frameCounter = headers.frameCounter;
    }

    protected static convertToUDPPacket(headers: Omit<IVbanHeaderCommon, 'rawSampleRate'>, data: Buffer): Buffer {
        let bufferStart = 0;

        const headersBuffer = Buffer.alloc(28);

        bufferStart += PACKET_IDENTIFICATION.length;
        headersBuffer.fill(PACKET_IDENTIFICATION, bufferStart - PACKET_IDENTIFICATION.length, bufferStart, 'ascii');

        //search sampleRate
        const rate = Object.entries(sampleRates).find(([, sr]) => sr && sr === headers.sr);
        if (!rate) {
            throw new Error(`fail to find index for sample rate ${headers.sr}`);
        }

        headersBuffer.fill((Number(rate[0]) & 0b00011111) | (headers.sp & 0b11100000), bufferStart++);

        headersBuffer.fill(headers.part1, bufferStart++);
        headersBuffer.fill(headers.part2, bufferStart++);
        headersBuffer.fill(headers.part3, bufferStart++);

        headersBuffer.fill(headers.streamName.padEnd(16, '\0'), bufferStart, bufferStart + 16, 'ascii');
        bufferStart += 16;

        headersBuffer.writeInt32LE(headers.frameCounter, bufferStart);

        return Buffer.concat([headersBuffer, data.slice(0, VBAN_DATA_MAX_SIZE)]);
    }

    public static checkFrameCounter(headers: VBANPacket) {
        //check frameCounter
        const frameCounterKey = 'str';
        const frameCounter = this.frameCounters.get(frameCounterKey);

        if (!headers.frameCounter) {
            return;
        }

        if (frameCounter && frameCounter > headers.frameCounter && headers.frameCounter > 0) {
            console.log('frameCounter error');
        } else if (frameCounter && headers.frameCounter > 0) {
            console.log('frame counter', 'old', frameCounter, 'new', headers.frameCounter, 'diff', headers.frameCounter - frameCounter);
        } else if (headers.frameCounter === 0) {
            console.log('frame 0');
        }

        this.frameCounters.set(frameCounterKey, headers.frameCounter);
    }
}
