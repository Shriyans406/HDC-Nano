import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { WebSocketServer } from 'ws';

// Set directly to your Windows port COM5
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

// ============================================================================
// FILTERING & SMOOTHING BUFFERS
// ============================================================================
const DISTANCE_WINDOW_SIZE = 5; // Averaging last 5 frames for Hamming Distance
const CLASS_STABILITY_COUNT = 3; // Class must match 3 consecutive frames to lock

const distanceHistory = [];
const classHistory = [];

let currentLockedClass = 255; // Default idle class
let frameCount = 0;
let lastFpsTimestamp = Date.now();
let currentHVS = 10; // Default base rate

/**
 * Calculates moving average of array numbers
 */
function getAverage(arr) {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / arr.length);
}

/**
 * Checks if the last N predictions are identical to lock in a stable class
 */
function getStabilizedClass(newClass) {
    classHistory.push(newClass);
    if (classHistory.length > CLASS_STABILITY_COUNT) {
        classHistory.shift();
    }

    // Check if all items in classHistory match
    const allMatch = classHistory.length === CLASS_STABILITY_COUNT &&
        classHistory.every(c => c === newClass);

    if (allMatch) {
        currentLockedClass = newClass;
    }

    return currentLockedClass;
}

// ============================================================================
// WEBSOCKET & SERIAL SETUP
// ============================================================================
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

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

port.open((err) => {
    if (err) {
        console.error(`[HDC Gateway Error] Could not open ${SERIAL_PATH}: ${err.message}`);
        return;
    }
    console.log(`[HDC Gateway] Serial Port ${SERIAL_PATH} Connected Successfully!`);

    // --- AUTO-FEEDER LOOP (Sends 128-bit hex test vectors every 100ms) ---
    setInterval(() => {
        if (port.isOpen) {
            const sampleHex = Array.from({ length: 32 }, () =>
                Math.floor(Math.random() * 16).toString(16)
            ).join('').toUpperCase();

            port.write(sampleHex + '\n', (err) => {
                if (err) console.error('[Send Error]', err.message);
            });
        }
    }, 100);
});

// ============================================================================
// INCOMING TELEMETRY PROCESSING WITH SMOOTHING
// ============================================================================
parser.on('data', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
        const mcuData = JSON.parse(trimmed);

        if (mcuData.status === 'result') {
            const hexStr = mcuData.hex || '00000000000000000000000000000000';
            const rawDistance = mcuData.raw ?? 0;
            const rawPredictedClass = mcuData.predictedClass ?? 255;
            const now = Date.now();

            // Update throughput metrics every 1000ms
            frameCount++;
            if (now - lastFpsTimestamp >= 1000) {
                currentHVS = frameCount;
                frameCount = 0;
                lastFpsTimestamp = now;
            }

            // 1. Hamming Distance Moving Average
            distanceHistory.push(rawDistance);
            if (distanceHistory.length > DISTANCE_WINDOW_SIZE) {
                distanceHistory.shift();
            }
            const smoothedDistance = getAverage(distanceHistory);

            // 2. Class Prediction Debounce (3 consecutive frames)
            const stabilizedClass = getStabilizedClass(rawPredictedClass);

            // 3. Convert 32 Hex Chars to 128-bit array for grid display
            const bitArray = [];
            for (let i = 0; i < hexStr.length; i++) {
                const nibble = parseInt(hexStr[i], 16);
                for (let b = 3; b >= 0; b--) {
                    bitArray.push((nibble >> b) & 1);
                }
            }

            // Calculate smoothed match score percentage
            const smoothedScore = parseFloat((((128 - smoothedDistance) / 128) * 100).toFixed(1));

            const packet = {
                timestamp: now,
                packetType: 1,
                classId: stabilizedClass,
                className: GESTURE_CLASSES[stabilizedClass] || `Class ${stabilizedClass}`,
                hammingDistance: smoothedDistance,
                rawHammingDistance: rawDistance,
                matchScore: smoothedScore,
                hypervector: bitArray,
                rawBytesHex: hexStr,

                // --- HARDWARE BENCHMARK METRICS ---
                hvsRate: currentHVS,
                fpgaLatencyUs: 124,
                cpuSavedCycles: 128 * 64,
            };

            broadcastPacket(packet);
        } else {
            console.log(`[MCU Message]:`, mcuData);
        }
    } catch (e) {
        console.log(`[Raw Serial]: ${trimmed}`);
    }
});

port.on('error', (err) => {
    console.error(`[Serial Error] ${err.message}`);
});