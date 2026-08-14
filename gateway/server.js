import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { WebSocketServer } from 'ws';

// Set your default Windows COM port here (e.g. 'COM3' or 'COM4')
const SERIAL_PATH = process.env.SERIAL_PORT || 'COM5';
const BAUD_RATE = 115200;
const WS_PORT = 8080;

const GESTURE_CLASSES = {
    0: 'Circle Gesture',
    1: 'Swipe Left',
    2: 'Swipe Right',
    3: 'Wave',
    255: 'Unclassified / Idle'
};

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[HDC Gateway] WebSocket Server live on ws://localhost:${WS_PORT}`);

let activeClients = 0;

wss.on('connection', (ws) => {
    activeClients++;
    console.log(`[HDC Gateway] Dashboard connected. Active clients: ${activeClients}`);

    ws.on('close', () => {
        activeClients--;
        console.log(`[HDC Gateway] Dashboard disconnected. Active clients: ${activeClients}`);
    });
});

function broadcastPacket(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(payload);
        }
    });
}

console.log(`[HDC Gateway] Opening serial port: ${SERIAL_PATH}`);

const port = new SerialPort({
    path: SERIAL_PATH,
    baudRate: BAUD_RATE,
    autoOpen: false
});

// Create line-delimited parser matching RP2040 Serial.println()
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

port.open((err) => {
    if (err) {
        console.error(`[HDC Gateway] Serial port error on ${SERIAL_PATH}: ${err.message}`);
        console.log(`\n[FIX HINT] Check Device Manager -> Ports (COM & LPT).`);
        console.log(`Run command with your COM port:`);
        console.log(`$env:SERIAL_PORT="COM5"; npm start\n`);
        return;
    }
    console.log(`[HDC Gateway] Connected to RP2040 on ${SERIAL_PATH}`);
});

parser.on('data', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
        const mcuData = JSON.parse(trimmed);

        // Handle FPGA Result Telemetry
        if (mcuData.status === 'result') {
            const hexStr = mcuData.hex || '00000000000000000000000000000000';

            // Expand 32-character hex string into 128-bit array
            const bitArray = [];
            for (let i = 0; i < hexStr.length; i++) {
                const nibble = parseInt(hexStr[i], 16);
                for (let b = 3; b >= 0; b--) {
                    bitArray.push((nibble >> b) & 1);
                }
            }

            const predictedClass = mcuData.predictedClass ?? 255;

            const packet = {
                timestamp: Date.now(),
                packetType: 1,
                classId: predictedClass,
                className: GESTURE_CLASSES[predictedClass] || `Class ${predictedClass}`,
                hammingDistance: mcuData.raw ?? 0,
                matchScore: parseFloat((((128 - (mcuData.raw ?? 0)) / 128) * 100).toFixed(1)),
                hypervector: bitArray,
                rawBytesHex: hexStr
            };

            broadcastPacket(packet);
        } else {
            // Print boot/flash status messages from RP2040
            console.log(`[MCU Log]`, mcuData);
        }
    } catch (e) {
        console.log(`[Raw MCU Serial Output]: ${trimmed}`);
    }
});

port.on('error', (err) => {
    console.error(`[HDC Serial Error] ${err.message}`);
});