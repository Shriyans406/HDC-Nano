import { Transform } from 'stream';

const PREAMBLE_0 = 0xAA;
const PREAMBLE_1 = 0x55;
const PACKET_SIZE = 23; // 2 preamble + 1 type + 1 class + 2 dist + 16 vector + 1 checksum

const GESTURE_CLASSES = {
    0: 'Circle Gesture',
    1: 'Swipe Left',
    2: 'Swipe Right',
    3: 'Wave',
    255: 'Unclassified / Idle'
};

export class HDCFrameParser extends Transform {
    constructor() {
        super({ objectMode: true });
        this.buffer = Buffer.alloc(2048);
        this.bytesBuffered = 0;
    }

    _transform(chunk, encoding, callback) {
        chunk.copy(this.buffer, this.bytesBuffered);
        this.bytesBuffered += chunk.length;

        let offset = 0;

        while (this.bytesBuffered - offset >= PACKET_SIZE) {
            if (this.buffer[offset] === PREAMBLE_0 && this.buffer[offset + 1] === PREAMBLE_1) {
                const frame = this.buffer.subarray(offset, offset + PACKET_SIZE);

                let computedChecksum = 0;
                for (let i = 2; i < PACKET_SIZE - 1; i++) {
                    computedChecksum ^= frame[i];
                }

                const packetChecksum = frame[PACKET_SIZE - 1];

                if (computedChecksum === packetChecksum) {
                    const packetType = frame[2];
                    const classId = frame[3];
                    const hammingDistance = frame.readUInt16LE(4);
                    const rawHvBytes = frame.subarray(6, 22);

                    const bitArray = [];
                    for (let b = 0; b < 16; b++) {
                        const byteVal = rawHvBytes[b];
                        for (let bit = 7; bit >= 0; bit--) {
                            bitArray.push((byteVal >> bit) & 1);
                        }
                    }

                    const matchScore = Math.max(0, Math.min(100, ((128 - hammingDistance) / 128) * 100)).toFixed(1);

                    this.push({
                        timestamp: Date.now(),
                        packetType,
                        classId,
                        className: GESTURE_CLASSES[classId] || `Class ${classId}`,
                        hammingDistance,
                        matchScore: parseFloat(matchScore),
                        hypervector: bitArray,
                        rawBytesHex: rawHvBytes.toString('hex')
                    });

                    offset += PACKET_SIZE;
                } else {
                    offset += 1;
                }
            } else {
                offset += 1;
            }
        }

        if (offset > 0) {
            this.buffer.copy(this.buffer, 0, offset, this.bytesBuffered);
            this.bytesBuffered -= offset;
        }

        callback();
    }
}