import { SerialPort } from 'serialport';
import { WebSocketServer } from 'ws';
import { HDCFrameParser } from './parser.js';

const SERIAL_PATH = process.env.SERIAL_PORT || '/dev/ttyACM0';
const BAUD_RATE = 115200;
const WS_PORT = 8080;

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

const parser = new HDCFrameParser();

port.open((err) => {
    if (err) {
        console.error(`[HDC Gateway] Serial port error: ${err.message}`);
        console.log(`[HDC Gateway Hint] Hardware disconnected? Run "npm run mock" to test with simulated data.`);
        return;
    }
    console.log(`[HDC Gateway] Serial connected on ${SERIAL_PATH}`);
});

port.pipe(parser);

parser.on('data', (hdcPacket) => {
    broadcastPacket(hdcPacket);
});

port.on('error', (err) => {
    console.error(`[HDC Serial Error] ${err.message}`);
});